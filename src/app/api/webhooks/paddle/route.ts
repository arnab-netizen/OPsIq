/**
 * Paddle webhook receiver (public, signature-authenticated, fail closed).
 * POST /api/webhooks/paddle
 *
 * Order of operations — nothing is parsed or acted on before the signature is verified:
 *  1. Verify Paddle-Signature (HMAC-SHA256 over `${ts}:${rawBody}`, constant time, timestamp tolerance)
 *     → 401 on any failure, including an unset secret.
 *  2. Validate the envelope (Zod) → 400.
 *  3. Idempotency/retry state machine on webhook_events keyed `paddle:<event_id>`:
 *     processed → 200 duplicate; processing → 409 (provider retries); dead_letter → 400.
 *  4. Apply synchronously (response only after the DB commit) → 200; transient failure → 500 so
 *     Paddle retries; permanently unacceptable signed events (cross-tenant, unknown price/tenant)
 *     are audited and acknowledged 200 so they are not retried forever, and grant nothing.
 *     Settling the claim (processing → processed) commits in the SAME transaction as the mutation
 *     and its audit rows (applied or rejected), so a failure can neither re-apply an applied event
 *     nor strand an applied one; any failure marks the event failed for the provider's retry.
 */
import { NextResponse } from "next/server";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  PADDLE_EVENT_KEY_PREFIX,
  paddleEnvelopeSchema,
} from "@/domain/billing/paddle";
import { verifyPaddleSignature } from "@/services/billing/paddle-signature";
import {
  PaddleEventRejectedError,
  processClaimedPaddleEvent,
  recordRejectedPaddleEvent,
} from "@/services/billing/paddle-webhook.service";
import { getOrCreateWebhookEvent, markWebhookEventFailed } from "@/services/webhook.service";

export async function POST(request: Request) {
  const rawBody = await request.text();

  let ts: number;
  try {
    ({ ts } = verifyPaddleSignature({
      rawBody,
      header: request.headers.get("paddle-signature"),
      secret: process.env.PADDLE_WEBHOOK_SECRET,
    }));
  } catch (error) {
    logger.warn("Paddle webhook signature rejected", {
      reason: classifyOperatorError(error, { context: "load" }).operatorMessage,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = paddleEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event structure" }, { status: 400 });
  }
  const envelope = parsed.data;
  const eventKey = `${PADDLE_EVENT_KEY_PREFIX}${envelope.event_id}`;

  let state;
  try {
    state = await getOrCreateWebhookEvent(eventKey, envelope.event_type, ts);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  if (state.isDeadLetter) return NextResponse.json({ error: "Event exceeded max retries" }, { status: 400 });
  if (!state.shouldProcess) {
    if (state.event.status === "processed") {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ error: "Processing in progress, retry later" }, { status: 409 });
  }

  try {
    const outcome = await processClaimedPaddleEvent(eventKey, envelope);
    return NextResponse.json({ received: true, outcome }, { status: 200 });
  } catch (error) {
    if (error instanceof PaddleEventRejectedError) {
      try {
        await recordRejectedPaddleEvent(eventKey, envelope, error);
      } catch (innerError) {
        logger.error("Failed to record rejected Paddle event", {
          eventId: envelope.event_id,
          error: classifyOperatorError(innerError, { context: "load" }).operatorMessage,
        });
        return failAndRetry(eventKey, innerError);
      }
      return NextResponse.json({ received: true, rejected: error.reason }, { status: 200 });
    }
    logger.error("Paddle webhook processing failed", {
      eventId: envelope.event_id,
      error: classifyOperatorError(error, { context: "load" }).operatorMessage,
    });
    return failAndRetry(eventKey, error);
  }
}

/** Nothing was committed for this delivery: release the claim as failed so the provider retries. */
async function failAndRetry(eventKey: string, error: unknown) {
  try {
    await markWebhookEventFailed(eventKey, error instanceof Error ? error : new Error(String(error)));
  } catch {
    // failure already logged by markWebhookEventFailed; provider retry re-enters the state machine
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

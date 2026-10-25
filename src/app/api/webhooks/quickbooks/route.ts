/**
 * QuickBooks Online webhook receiver (public, signature-authenticated, fail closed).
 * POST /api/webhooks/quickbooks
 *
 * Order of operations — nothing is parsed or acted on before the signature is verified:
 *  1. Bound the body (1 MiB) and verify `intuit-signature` (HMAC-SHA256 over the raw body, constant time; unset verifier
 *     token => 401).
 *  2. Parse the payload for company ids ONLY (legacy and CloudEvents shapes). Unparseable-but-signed => 200, ignored
 *     (a retry cannot fix Intuit's payload).
 *  3. Request a coalesced read-only re-sync for live connections of those companies (two small DB writes each) and answer 200.
 *     Unknown companies are indistinguishable from known ones. A transient DB failure answers 500 so Intuit redelivers.
 * Webhook content is never used as financial data — it is a trigger (see src/domain/quickbooks/qbo-webhook.ts).
 */
import { NextResponse } from "next/server";
import { logger } from "@/infra/logger";
import {
  QBO_WEBHOOK_MAX_BODY_BYTES, QBO_WEBHOOK_SIGNATURE_HEADER, QBO_WEBHOOK_VERIFIER_ENV_KEY, parseQboWebhookPayload, verifyIntuitSignature,
} from "@/domain/quickbooks/qbo-webhook";
import { reactToQboWebhook } from "@/services/quickbooks/qbo-webhook.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACK = { received: true } as const;

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > QBO_WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > QBO_WEBHOOK_MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const valid = verifyIntuitSignature({
    rawBody,
    signature: request.headers.get(QBO_WEBHOOK_SIGNATURE_HEADER),
    verifierToken: process.env[QBO_WEBHOOK_VERIFIER_ENV_KEY],
  });
  if (!valid) {
    logger.warn("QuickBooks webhook signature rejected", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ...ACK, ignored: "UNPARSEABLE" }, { status: 200 });
  }
  const parsed = parseQboWebhookPayload(json);
  if (!parsed.ok) return NextResponse.json({ ...ACK, ignored: "UNRECOGNISED" }, { status: 200 });

  try {
    const r = await reactToQboWebhook({ realmIds: parsed.realmIds }, { env: process.env });
    logger.info("QuickBooks webhook accepted", { events: parsed.eventCount, realms: r.realmsReceived, triggered: r.connectionsTriggered });
    return NextResponse.json(ACK, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

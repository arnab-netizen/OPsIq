import type Stripe from "stripe";
import { z } from "zod";
import type { Prisma, Subscription, WebhookEvent } from "@/generated/prisma/client";
import {
  ACQUISITION_QUEUE_WAIT_MS,
  CLIENT_SIDE_BACKSTOP_MARGIN_MS,
  TRANSACTION_ACQUIRE_MAX_WAIT_MS,
  db,
  withStatementTimeout,
} from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/** Per-statement bound (SET LOCAL statement_timeout) inside the processing transaction. */
const WEBHOOK_STATEMENT_TIMEOUT_MS = 10_000;
/**
 * Outer JS-side processing backstop. Derived from withStatementTimeout()'s documented worst case
 * (queue wait + acquire maxWait + its transaction timeout) plus the repo's client-side margin, so
 * it can never fire while the transaction could still legitimately commit (src/lib/db.ts).
 */
export const PROCESSING_TIMEOUT_MS =
  ACQUISITION_QUEUE_WAIT_MS +
  TRANSACTION_ACQUIRE_MAX_WAIT_MS +
  Math.max(WEBHOOK_STATEMENT_TIMEOUT_MS + 2_000, 5_000) +
  CLIENT_SIDE_BACKSTOP_MARGIN_MS;
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_ALERT_THRESHOLD = 3; // Alert when attempts >= 3
const MAX_ATTEMPTS = 5; // Move to dead-letter after 5 attempts
const SIGNATURE_TIMESTAMP_TOLERANCE_S = 300; // 5 minutes
/**
 * Maximum forward clock skew accepted for a signature timestamp. Stripe stamps `t=` with its own
 * clock at signing time, so a receiver whose clock lags Stripe's by a few seconds sees a slightly
 * "future" timestamp on every legitimate delivery; rejecting any future value would 401 (and so
 * stall) all deliveries during ordinary NTP drift. Bounded by the same window as the past side.
 */
const SIGNATURE_MAX_FUTURE_SKEW_S = SIGNATURE_TIMESTAMP_TOLERANCE_S;

/**
 * Runtime schemas for the `data.object` payloads this service acts on. The signature proves the
 * bytes came from Stripe; these schemas prove the fields a handler reads have the shape it relies
 * on (no unchecked casts). Unknown fields pass through untouched. A payload that fails its schema
 * throws, so the event is marked failed and Stripe retries it, exactly like any other handler error.
 */
const StripeCheckoutSessionObjectSchema = z
  .object({
    id: z.string().min(1),
    customer: z.string().nullish(),
    subscription: z.string().nullish(),
  })
  .passthrough();

/** customer.subscription.created / .updated: the period bounds are written to the subscription. */
const StripeSubscriptionObjectSchema = z
  .object({
    id: z.string().min(1),
    customer: z.string().min(1),
    status: z.string().min(1),
    current_period_start: z.number().int(),
    current_period_end: z.number().int(),
    trial_end: z.number().int().nullish(),
    canceled_at: z.number().int().nullish(),
    cancel_reason: z.string().nullish(),
  })
  .passthrough();

/** customer.subscription.deleted only needs the customer to locate the subscription. */
const StripeSubscriptionDeletedObjectSchema = z
  .object({
    id: z.string().nullish(),
    customer: z.string().min(1),
  })
  .passthrough();

/** `data` of a Stripe event envelope; `object` is validated per event type before use. */
const StripeEventDataSchema = z.object({ object: z.unknown() }).passthrough();

export type StripeSubscriptionEvent = z.infer<typeof StripeSubscriptionObjectSchema>;
export type StripeCheckoutSessionEvent = z.infer<typeof StripeCheckoutSessionObjectSchema>;

/** The signature-verified, envelope-validated event the route hands to handleWebhookEvent. */
export interface StripeWebhookEventInput {
  id: string;
  type: string;
  data?: unknown;
}

type BillingAccountWithSubscription = Prisma.BillingAccountGetPayload<{
  include: { subscription: true };
}>;

/**
 * Resolve the Stripe secret key from the environment.
 *
 * Canonical name: STRIPE_SECRET_KEY (matches Stripe's own convention and the
 * documented env contract). STRIPE_API_KEY is accepted as a legacy alias for
 * backward compatibility. Returns null when neither is configured so that paid
 * Stripe operations fail lazily at call time — never at startup/import.
 */
export function resolveStripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? null;
}

/**
 * Extract the signed timestamp from a `stripe-signature` header (`t=<unix>,v1=<hmac>[,...]`).
 *
 * Mirrors the SDK's own header parsing (elements split on ",", key/value on "=", key exactly "t"),
 * which is the value the SDK feeds into the HMAC (`${t}.${payload}`), so once constructEvent has
 * accepted the header this IS the authenticated signing time. Stricter than the SDK, fail closed:
 * exactly one `t=` element made only of digits; anything else throws.
 */
function parseSignedTimestamp(signatureHeader: string): number {
  const values = signatureHeader
    .split(",")
    .map((element) => element.split("="))
    .filter(([key]) => key === "t")
    .map(([, value]) => value ?? "");

  if (values.length !== 1 || !/^\d+$/.test(values[0])) {
    throw new Error("stripe-signature header must carry exactly one numeric t= timestamp");
  }

  const timestamp = Number(values[0]);
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error("stripe-signature t= timestamp is out of range");
  }
  return timestamp;
}

/**
 * Verify webhook signature using Stripe.webhooks.constructEvent
 * Returns the verified event + the SIGNED timestamp (t=) for replay protection
 * Fails closed: throws on any verification error
 *
 * Verification is an offline HMAC over the raw body with STRIPE_WEBHOOK_SECRET. It never calls
 * the Stripe API, so it uses the SDK's static `Stripe.webhooks` helper and does not require
 * STRIPE_SECRET_KEY: a deployment missing the API key must not 401 every genuine webhook.
 * The SDK is given the same tolerance as checkSignatureTimestamp, so both controls agree.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<{ event: Stripe.Event; timestamp: number }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }

  try {
    const { default: StripeSdk } = await import("stripe");
    const event: Stripe.Event = StripeSdk.webhooks.constructEvent(
      body,
      signature,
      secret,
      SIGNATURE_TIMESTAMP_TOLERANCE_S
    );

    // The authenticated signing time (t=), not the receive time: checkSignatureTimestamp and the
    // recorded stripeTimestamp both depend on it being the value the HMAC covered.
    const timestamp = parseSignedTimestamp(signature);

    return { event, timestamp };
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Webhook signature verification failed", {
      error: governed.operatorMessage,
    });
    throw new Error("Webhook signature verification failed");
  }
}

/**
 * Check signature timestamp tolerance (replay protection)
 * Fails closed: rejects a non-integer timestamp, one > 5 minutes old, or one more than
 * SIGNATURE_MAX_FUTURE_SKEW_S in the future.
 */
export function checkSignatureTimestamp(eventTimestamp: number): void {
  if (!Number.isSafeInteger(eventTimestamp)) {
    throw new Error("Webhook timestamp is not a valid integer");
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - eventTimestamp;

  if (age < -SIGNATURE_MAX_FUTURE_SKEW_S) {
    throw new Error(
      `Webhook timestamp is in the future beyond ${SIGNATURE_MAX_FUTURE_SKEW_S}s clock-skew tolerance`
    );
  }

  if (age > SIGNATURE_TIMESTAMP_TOLERANCE_S) {
    throw new Error(
      `Webhook timestamp too old: ${age}s > ${SIGNATURE_TIMESTAMP_TOLERANCE_S}s tolerance`
    );
  }
}

/** Narrowing guard for untyped error/driver payloads (no assertion). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Unique-constraint violation on insert: Prisma P2002, or the raw Postgres 23505 surfaced through
 * the pg driver adapter (both shapes occur depending on the Prisma/adapter path).
 */
function isUniqueViolation(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === "P2002") return true;
  const cause = error.cause;
  if (isRecord(cause) && (cause.code === "23505" || cause.originalCode === "23505")) return true;
  const meta = error.meta;
  const adapterError = isRecord(meta) ? meta.driverAdapterError : undefined;
  const adapterCause = isRecord(adapterError) ? adapterError.cause : undefined;
  return (
    isRecord(adapterCause) &&
    (adapterCause.originalCode === "23505" || adapterCause.kind === "UniqueConstraintViolation")
  );
}

/**
 * A `processing` row is stale when it was last claimed (updatedAt) more than the threshold ago.
 * updatedAt is (re)stamped on every claim, so a retry of an event CREATED long ago is not swept
 * while it is actually in flight. Legacy rows with no updatedAt fall back to createdAt.
 */
function staleProcessingWhere(staleThreshold: Date) {
  return {
    status: "processing",
    OR: [
      { updatedAt: { lt: staleThreshold } },
      { updatedAt: null, createdAt: { lt: staleThreshold } },
    ],
  };
}

/**
 * Recover from stale processing events
 * Marks events stuck in processing state for > STALE_PROCESSING_THRESHOLD_MS (since their last
 * claim) as failed. Each transition is conditional on the row STILL being processing and stale,
 * so a delivery that finishes (or is re-claimed) between the scan and the update is never
 * overwritten.
 */
export async function recoverStaleProcessingEvents(): Promise<void> {
  try {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);

    const staleEvents: WebhookEvent[] = await db.webhookEvent.findMany({
      where: staleProcessingWhere(staleThreshold),
    });

    if (staleEvents.length === 0) {
      return;
    }

    logger.warn("Found stale processing events, recovering", { count: staleEvents.length });

    for (const event of staleEvents) {
      try {
        const recovered: { count: number } = await db.webhookEvent.updateMany({
          where: { id: event.id, ...staleProcessingWhere(staleThreshold) },
          data: {
            status: "failed",
            lastError: "Processing timeout (stuck > 5 minutes)",
            attempts: {
              increment: 1,
            },
            updatedAt: new Date(),
          },
        });

        if (recovered.count === 1) {
          logger.warn("Marked stale event as failed", {
            stripeEventId: event.stripeEventId,
            createdAt: event.createdAt,
          });
        }
      } catch (error) {
        const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
        logger.error("Failed to recover stale event", {
          stripeEventId: event.stripeEventId,
          error: governed.operatorMessage,
        });
      }
    }
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Stale processing recovery failed", {
      error: governed.operatorMessage,
    });
  }
}

/**
 * What the caller must do with a delivery:
 *   process     -> this caller exclusively claimed the event (new, or a failed retry): process it
 *   duplicate   -> already processed: acknowledge 200 { duplicate: true }
 *   in_progress -> another delivery holds the claim: 409, the provider retries later
 *   dead_letter -> max attempts exceeded: 400, no more retries
 */
export type WebhookEventDisposition = "process" | "duplicate" | "in_progress" | "dead_letter";

export interface WebhookEventClaim {
  event: WebhookEvent;
  disposition: WebhookEventDisposition;
  isNew: boolean;
  shouldProcess: boolean;
  shouldRetry: boolean;
  isDeadLetter: boolean;
}

/** Bound on re-read rounds when a claim loses a race; contention past it answers "in_progress". */
const CLAIM_MAX_ROUNDS = 3;

function claimOf(
  event: WebhookEvent,
  disposition: WebhookEventDisposition,
  flags: { isNew?: boolean; shouldRetry?: boolean } = {}
): WebhookEventClaim {
  return {
    event,
    disposition,
    isNew: flags.isNew ?? false,
    shouldProcess: disposition === "process",
    shouldRetry: flags.shouldRetry ?? false,
    isDeadLetter: disposition === "dead_letter",
  };
}

/**
 * Get or create webhook event record with state machine
 * Also recovers stale processing events on inline pre-check
 *
 * Concurrency: at most one delivery of an event ever gets disposition "process" per claim.
 *  - New event: the unique stripe_event_id insert is the claim. A delivery that loses the insert
 *    race (unique violation) re-reads the winner's row and answers from its state (in_progress /
 *    duplicate) instead of surfacing a 500.
 *  - Failed event: the retry claim is a compare-and-set failed -> processing on (id, status,
 *    attempts); concurrent redeliveries that lose it re-read and answer in_progress / duplicate.
 *  - Dead-letter move is the same compare-and-set, so it happens once.
 */
export async function getOrCreateWebhookEvent(
  stripeEventId: string,
  type: string,
  timestamp: number
): Promise<WebhookEventClaim> {
  try {
    // Inline pre-check: recover stale events first
    await recoverStaleProcessingEvents();

    let lastSeen: WebhookEvent | null = null;

    for (let round = 0; round < CLAIM_MAX_ROUNDS; round++) {
      const existingEvent: WebhookEvent | null = await db.webhookEvent.findUnique({
        where: { stripeEventId },
      });

      if (!existingEvent) {
        // No existing event - the unique insert (status=processing) is the claim.
        try {
          const now = new Date();
          const newEvent: WebhookEvent = await db.webhookEvent.create({
            data: {
              stripeEventId,
              type,
              status: "processing",
              attempts: 0,
              stripeTimestamp: timestamp,
              updatedAt: now,
            },
          });
          return claimOf(newEvent, "process", { isNew: true });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // A concurrent delivery inserted it first: re-read its row and answer from its state.
          logger.info("Webhook event insert lost a concurrent-delivery race; re-reading", {
            stripeEventId,
          });
          continue;
        }
      }

      lastSeen = existingEvent;

      if (existingEvent.status === "dead_letter") {
        // Event moved to dead-letter (max retries exceeded)
        logger.warn("Webhook event in dead-letter state (max retries exceeded)", {
          stripeEventId,
          attempts: existingEvent.attempts,
          maxAttempts: MAX_ATTEMPTS,
        });
        return claimOf(existingEvent, "dead_letter");
      }

      if (existingEvent.status === "processed") {
        // Already successfully processed - ignore duplicate
        return claimOf(existingEvent, "duplicate");
      }

      if (existingEvent.status === "processing") {
        // Currently processing - retry later (409 conflict)
        return claimOf(existingEvent, "in_progress");
      }

      if (existingEvent.status !== "failed") {
        // Unknown state: never process it (fail closed; surfaces as a record error).
        throw new Error(`Webhook event ${stripeEventId} is in unknown state "${existingEvent.status}"`);
      }

      // Previously failed - check if max retries exceeded
      const nextAttempt = existingEvent.attempts + 1;
      const casWhere = { id: existingEvent.id, status: "failed", attempts: existingEvent.attempts };
      const now = new Date();

      if (nextAttempt > MAX_ATTEMPTS) {
        // Move to dead-letter (exactly once: compare-and-set on the observed state)
        const moved: { count: number } = await db.webhookEvent.updateMany({
          where: casWhere,
          data: {
            status: "dead_letter",
            lastError: `Exceeded max attempts (${MAX_ATTEMPTS})`,
            attempts: nextAttempt,
            updatedAt: now,
          },
        });
        if (moved.count !== 1) continue;

        logger.error("Webhook event moved to dead-letter", {
          stripeEventId,
          attempts: nextAttempt,
          maxAttempts: MAX_ATTEMPTS,
        });

        return claimOf(
          { ...existingEvent, status: "dead_letter", attempts: nextAttempt, updatedAt: now },
          "dead_letter"
        );
      }

      // Can retry: claim it exclusively (failed -> processing)
      const claimed: { count: number } = await db.webhookEvent.updateMany({
        where: casWhere,
        data: { status: "processing", updatedAt: now },
      });
      if (claimed.count !== 1) continue;

      return claimOf({ ...existingEvent, status: "processing", updatedAt: now }, "process", {
        shouldRetry: true,
      });
    }

    // Persistent contention: another delivery keeps changing the row. Never process here.
    if (!lastSeen) {
      throw new Error(`Webhook event ${stripeEventId} could not be read or created`);
    }
    logger.warn("Webhook event claim contended; asking the provider to retry", { stripeEventId });
    return claimOf(lastSeen, "in_progress");
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to get or create webhook event", {
      stripeEventId,
      error: governed.operatorMessage,
    });
    throw error;
  }
}

/**
 * Transaction client every billing mutation below runs on. All reads/writes inside one webhook's
 * application go through the SAME tx (never `db`): the pool has a single connection, so a `db`
 * call inside the callback would wait on the connection the transaction itself holds.
 */
type WebhookTx = Prisma.TransactionClient;

/**
 * Validate and get billing account by stripeCustomerId
 * Fails closed: throws if customer not unique or not found
 */
async function getBillingAccountByStripeCustomer(
  tx: WebhookTx,
  stripeCustomerId: string
): Promise<BillingAccountWithSubscription> {
  const billingAccount = await tx.billingAccount.findUnique({
    where: { stripeCustomerId },
    include: { subscription: true },
  });

  if (!billingAccount) {
    throw new Error(`Billing account not found for Stripe customer: ${stripeCustomerId}`);
  }

  return billingAccount;
}

/**
 * Validate plan and get stripePriceId
 * Fails closed: throws if plan not found or missing stripePriceId
 */
async function validatePlanAndGetPriceId(tx: WebhookTx, planId: string): Promise<string> {
  const plan = await tx.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  if (!plan.stripePriceId) {
    throw new Error(`Plan missing stripePriceId: ${planId}`);
  }

  return plan.stripePriceId;
}

/**
 * Sync entitlements for subscription inside the caller's transaction
 * Emits the activation audit event on the same tx, so the subscription update, the audit row and
 * the webhook event's processed state commit or roll back together.
 */
async function syncEntitlementsForSubscription(
  tx: WebhookTx,
  stripeEventId: string,
  workspaceId: string,
  subscription: Subscription
): Promise<void> {
  if (subscription.status !== "active") {
    logger.debug("Subscription not active, skipping entitlement sync", {
      workspaceId,
      status: subscription.status,
    });
    return;
  }

  logger.info("Syncing entitlements for activated subscription", {
    workspaceId,
    subscriptionId: subscription.id,
  });

  // Emit audit event for entitlement activation (same transaction as the mutation)
  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.SUBSCRIPTION_ACTIVATED,
      // Canonical system-actor contract (F-AUDIT-CRON-ACTOR): actorId
      // omitted (NULL, FK-exempt) — the former literal "webhook-system"
      // string always violated AuditEvent.actorId's real FK to users.id,
      // making this emitAuditEvent call throw on every invocation and
      // propagate out of syncEntitlementsForSubscription as a false failure
      // of the whole entitlement sync, not just a lost audit record.
      actorType: "system",
      entityType: "Subscription",
      entityId: subscription.id,
      correlationId: stripeEventId,
      payload: {
        workspaceId,
        planId: subscription.planId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      visibility: "internal",
    },
    tx
  );
}

/** Audit a webhook-driven subscription state change on the caller's transaction. */
async function auditSubscriptionSynced(
  tx: WebhookTx,
  input: {
    stripeEventId: string;
    eventType: string;
    workspaceId: string;
    subscriptionId: string;
    status: string;
  }
): Promise<void> {
  await emitAuditEvent(
    {
      eventName: AUDIT_EVENTS.BILLING_SUBSCRIPTION_SYNCED,
      // Canonical system-actor contract (F-AUDIT-CRON-ACTOR): see syncEntitlementsForSubscription.
      actorType: "system",
      entityType: "Subscription",
      entityId: input.subscriptionId,
      correlationId: input.stripeEventId,
      payload: {
        provider: "stripe",
        eventType: input.eventType,
        workspaceId: input.workspaceId,
        status: input.status,
      },
      visibility: "internal",
    },
    tx
  );
}

/**
 * Check event ordering: warn if a previous subscription lifecycle event has not been processed.
 * Log-only and best-effort; runs on `db` BEFORE the processing transaction opens. Only rows that
 * could trigger a warning (not yet processed / dead-lettered) plus the current event are read.
 */
async function checkEventOrdering(stripeEventId: string): Promise<void> {
  try {
    const customerEvents: WebhookEvent[] = await db.webhookEvent.findMany({
      where: {
        type: {
          in: ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"],
        },
        OR: [{ status: { notIn: ["processed", "dead_letter"] } }, { stripeEventId }],
      },
      orderBy: { createdAt: "asc" },
    });

    // Find current event in list
    const currentIndex = customerEvents.findIndex((e) => e.stripeEventId === stripeEventId);
    if (currentIndex === -1) {
      return; // Event not found (new event, proceed)
    }

    // Check if any previous events are not processed
    for (let i = 0; i < currentIndex; i++) {
      const prevEvent = customerEvents[i];
      if (prevEvent.status !== "processed" && prevEvent.status !== "dead_letter") {
        logger.warn("Event ordering violation: previous event not processed", {
          currentEventId: stripeEventId,
          previousEventId: prevEvent.stripeEventId,
          previousStatus: prevEvent.status,
        });
      }
    }
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Event ordering check failed", {
      stripeEventId,
      error: governed.operatorMessage,
    });
  }
}

/**
 * Check retry threshold and emit alert if needed
 */
async function checkRetryThreshold(stripeEventId: string, attempts: number, type: string): Promise<void> {
  try {
    if (attempts >= RETRY_ALERT_THRESHOLD) {
      logger.warn("Webhook event exceeded retry threshold", {
        stripeEventId,
        type,
        attempts,
        threshold: RETRY_ALERT_THRESHOLD,
        maxAttempts: MAX_ATTEMPTS,
      });

      // Emit audit event for alerting
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.WEBHOOK_RETRY_THRESHOLD_EXCEEDED,
        // Canonical system-actor contract (F-AUDIT-CRON-ACTOR): see the
        // identical fix in syncEntitlementsForSubscription above.
        actorType: "system",
        entityType: "WebhookEvent",
        entityId: stripeEventId,
        payload: {
          type,
          attempts,
          threshold: RETRY_ALERT_THRESHOLD,
          maxAttempts: MAX_ATTEMPTS,
        },
        visibility: "internal",
      });
    }
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Retry threshold check failed", {
      stripeEventId,
      error: governed.operatorMessage,
    });
  }
}

/**
 * Mark webhook event as successfully processed
 * Only called after successful event handling
 *
 * Conditional transition processing -> processed. Idempotent when the row is already processed;
 * throws for any other state (e.g. the claim was swept as stale and re-claimed elsewhere), so a
 * caller can never silently overwrite a state it no longer owns.
 */
export async function markWebhookEventProcessed(stripeEventId: string): Promise<void> {
  try {
    const now = new Date();
    const marked: { count: number } = await db.webhookEvent.updateMany({
      where: { stripeEventId, status: "processing" },
      data: {
        status: "processed",
        processedAt: now,
        updatedAt: now,
      },
    });

    if (marked.count !== 1) {
      const current: WebhookEvent | null = await db.webhookEvent.findUnique({ where: { stripeEventId } });
      if (current?.status === "processed") {
        logger.info("Webhook event already marked as processed", { stripeEventId });
        return;
      }
      throw new Error(
        `Cannot mark webhook event ${stripeEventId} processed from state "${current?.status ?? "missing"}"`
      );
    }

    logger.info("Webhook event marked as processed", { stripeEventId });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to mark webhook event as processed", {
      stripeEventId,
      error: governed.operatorMessage,
    });
    throw error;
  }
}

/**
 * Mark webhook event as failed and record error
 * Called after processing fails
 */
export async function markWebhookEventFailed(
  stripeEventId: string,
  error: Error
): Promise<void> {
  const governedError = classifyOperatorError(error, { context: "load" });
  try {
    // Conditional transition processing -> failed: a failure report for a claim that has already
    // settled (processed, or swept/re-claimed) must not overwrite that state.
    const marked: { count: number } = await db.webhookEvent.updateMany({
      where: { stripeEventId, status: "processing" },
      data: {
        status: "failed",
        lastError: governedError.operatorMessage,
        attempts: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });

    const result: WebhookEvent | null = await db.webhookEvent.findUnique({ where: { stripeEventId } });
    if (!result) {
      throw new Error(`Webhook event ${stripeEventId} not found while recording failure`);
    }
    if (marked.count !== 1) {
      logger.warn("Webhook event failure not recorded: event no longer in processing", {
        stripeEventId,
        status: result.status,
        error: governedError.operatorMessage,
      });
      return;
    }

    // Check threshold after update
    await checkRetryThreshold(stripeEventId, result.attempts, result.type);

    logger.warn("Webhook event marked as failed", {
      stripeEventId,
      error: governedError.operatorMessage,
      attempts: result.attempts,
      maxAttempts: MAX_ATTEMPTS,
    });
  } catch (dbError) {
    const governed = classifyOperatorError(dbError instanceof Error ? dbError : new Error(String(dbError)), { context: "load" });
    logger.error("Failed to mark webhook event as failed", {
      stripeEventId,
      originalError: governedError.operatorMessage,
      dbError: governed.operatorMessage,
    });
    throw dbError;
  }
}

/**
 * Handle checkout.session.completed inside the processing transaction
 * Validates price ID, activates the subscription, emits the activation audit event
 */
async function handleCheckoutSessionCompleted(
  tx: WebhookTx,
  stripeEventId: string,
  event: StripeCheckoutSessionEvent
): Promise<void> {
  if (!event.customer || !event.subscription) {
    throw new Error("checkout.session.completed missing customer or subscription");
  }

  // Get account and validate
  const billingAccount = await getBillingAccountByStripeCustomer(tx, event.customer);

  if (!billingAccount.subscription) {
    throw new Error("Subscription not found for billing account");
  }

  // Validate plan and price ID
  await validatePlanAndGetPriceId(tx, billingAccount.subscription.planId);

  const updatedSubscription = await tx.subscription.update({
    where: { id: billingAccount.subscription.id },
    data: {
      stripeSubscriptionId: event.subscription,
      status: "active",
      lastEventTimestamp: new Date(),
    },
  });

  // Same transaction: the audit row commits only together with the update
  await syncEntitlementsForSubscription(tx, stripeEventId, billingAccount.workspaceId, updatedSubscription);

  logger.info("Subscription activated from checkout session", {
    subscriptionId: billingAccount.subscription.id,
    stripeSubscriptionId: event.subscription,
    workspaceId: billingAccount.workspaceId,
  });
}

/**
 * Handle customer.subscription.created inside the processing transaction
 * Sets Stripe subscription ID, activates, emits the activation audit event
 */
async function handleCustomerSubscriptionCreated(
  tx: WebhookTx,
  stripeEventId: string,
  event: StripeSubscriptionEvent
): Promise<void> {
  // Get account and validate
  const billingAccount = await getBillingAccountByStripeCustomer(tx, event.customer);

  if (!billingAccount.subscription) {
    throw new Error("Subscription not found for billing account");
  }

  // Validate plan and price ID
  await validatePlanAndGetPriceId(tx, billingAccount.subscription.planId);

  // Convert Unix timestamps
  const currentPeriodStart = new Date(event.current_period_start * 1000);
  const currentPeriodEnd = new Date(event.current_period_end * 1000);
  const trialEndsAt = event.trial_end ? new Date(event.trial_end * 1000) : null;

  const updatedSubscription = await tx.subscription.update({
    where: { id: billingAccount.subscription.id },
    data: {
      stripeSubscriptionId: event.id,
      status: "active",
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt,
      lastEventTimestamp: new Date(),
    },
  });

  await syncEntitlementsForSubscription(tx, stripeEventId, billingAccount.workspaceId, updatedSubscription);

  logger.info("Subscription created and activated via webhook", {
    subscriptionId: billingAccount.subscription.id,
    stripeSubscriptionId: event.id,
    workspaceId: billingAccount.workspaceId,
  });
}

/**
 * Handle customer.subscription.deleted inside the processing transaction
 * Cancels subscription and audits the change atomically
 */
async function handleCustomerSubscriptionDeleted(
  tx: WebhookTx,
  stripeEventId: string,
  event: z.infer<typeof StripeSubscriptionDeletedObjectSchema>
): Promise<void> {
  const billingAccount = await getBillingAccountByStripeCustomer(tx, event.customer);

  if (!billingAccount.subscription) {
    throw new Error("Subscription not found for billing account");
  }

  const now = new Date();
  await tx.subscription.update({
    where: { id: billingAccount.subscription.id },
    data: {
      status: "canceled",
      canceledAt: now,
      lastEventTimestamp: now,
    },
  });

  await auditSubscriptionSynced(tx, {
    stripeEventId,
    eventType: "customer.subscription.deleted",
    workspaceId: billingAccount.workspaceId,
    subscriptionId: billingAccount.subscription.id,
    status: "canceled",
  });

  logger.info("Subscription marked as canceled via webhook", {
    subscriptionId: billingAccount.subscription.id,
    workspaceId: billingAccount.workspaceId,
  });
}

/**
 * Sync subscription status from a customer.subscription.updated event, inside the processing
 * transaction (update + audit commit together).
 *
 * Unknown customer / missing subscription are permanent conditions: logged and acknowledged
 * (unchanged behaviour). Any DB error now PROPAGATES: it used to be swallowed ("fail open"),
 * which marked the event processed although nothing was written, and inside a transaction a
 * swallowed statement error would leave the transaction aborted anyway. Fail closed -> retried.
 */
export async function syncSubscriptionStatus(
  tx: WebhookTx,
  stripeEventId: string,
  event: StripeSubscriptionEvent,
  providerCustomerId: string
): Promise<void> {
  if (!event.id || !providerCustomerId) {
    logger.warn("syncSubscriptionStatus: missing event data", {
      eventId: event.id,
      providerCustomerId,
    });
    return;
  }

  // Find billing account by provider customer ID (backward compat)
  const billingAccount = await tx.billingAccount.findFirst({
    where: {
      providerCustomerId,
    },
    select: {
      id: true,
      workspaceId: true,
      subscription: {
        select: {
          id: true,
          lastEventTimestamp: true,
        },
      },
    },
  });

  if (!billingAccount) {
    logger.warn("syncSubscriptionStatus: billing account not found", {
      providerCustomerId,
    });
    return;
  }

  if (!billingAccount.subscription) {
    logger.warn("syncSubscriptionStatus: subscription not found", {
      billingAccountId: billingAccount.id,
    });
    return;
  }

  // Reject out-of-order updates
  if (billingAccount.subscription.lastEventTimestamp) {
    const lastTimestamp = billingAccount.subscription.lastEventTimestamp.getTime() / 1000;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp < lastTimestamp) {
      logger.warn("Rejecting out-of-order subscription update", {
        subscriptionId: billingAccount.subscription.id,
        lastEventTimestamp: lastTimestamp,
        currentTimestamp,
      });
      return;
    }
  }

  // Convert Unix timestamps to Date
  const currentPeriodStart = new Date(event.current_period_start * 1000);
  const currentPeriodEnd = new Date(event.current_period_end * 1000);
  const trialEndAt = event.trial_end
    ? new Date(event.trial_end * 1000)
    : null;
  const canceledAt = event.canceled_at
    ? new Date(event.canceled_at * 1000)
    : null;

  await tx.subscription.update({
    where: { id: billingAccount.subscription.id },
    data: {
      status: event.status,
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt: trialEndAt,
      canceledAt,
      cancelReason: event.cancel_reason || null,
      lastEventTimestamp: new Date(),
    },
  });

  await auditSubscriptionSynced(tx, {
    stripeEventId,
    eventType: "customer.subscription.updated",
    workspaceId: billingAccount.workspaceId,
    subscriptionId: billingAccount.subscription.id,
    status: event.status,
  });

  logger.info("Subscription status synced", {
    billingAccountId: billingAccount.id,
    workspaceId: billingAccount.workspaceId,
    status: event.status,
  });
}

/**
 * First statement of every processing transaction: the conditional processing -> processed
 * transition. It row-locks the event for the rest of the transaction and proves this delivery
 * still holds the claim (a claim swept as stale / failed by a timeout report is refused). Because
 * it commits or rolls back with the handler's writes, a committed mutation can never be left with
 * a retryable event state (which would re-apply it), and a failed one leaves the row in
 * `processing` for the caller to mark failed.
 */
async function transitionClaimToProcessed(tx: WebhookTx, stripeEventId: string): Promise<void> {
  const now = new Date();
  const marked = await tx.webhookEvent.updateMany({
    where: { stripeEventId, status: "processing" },
    data: { status: "processed", processedAt: now, updatedAt: now },
  });
  if (marked.count !== 1) {
    throw new Error(
      `Webhook event ${stripeEventId} is not claimed for processing; refusing to apply it`
    );
  }
}

/** Apply one validated event's billing mutation(s) + audit on the processing transaction. */
async function applyWebhookEvent(tx: WebhookTx, event: StripeWebhookEventInput): Promise<void> {
  // `data.object` absent: nothing to apply (acknowledged as before). Present: validated per type.
  const data = StripeEventDataSchema.safeParse(event.data);
  const object = data.success ? data.data.object : undefined;
  const hasObject = object !== undefined && object !== null;

  switch (event.type) {
    case "checkout.session.completed":
      if (hasObject) {
        await handleCheckoutSessionCompleted(tx, event.id, StripeCheckoutSessionObjectSchema.parse(object));
      }
      break;

    case "customer.subscription.created":
      if (hasObject) {
        await handleCustomerSubscriptionCreated(tx, event.id, StripeSubscriptionObjectSchema.parse(object));
      }
      break;

    case "customer.subscription.updated":
      if (hasObject) {
        const subscriptionObject = StripeSubscriptionObjectSchema.parse(object);
        await syncSubscriptionStatus(tx, event.id, subscriptionObject, subscriptionObject.customer);
      }
      break;

    case "customer.subscription.deleted":
      if (hasObject) {
        await handleCustomerSubscriptionDeleted(tx, event.id, StripeSubscriptionDeletedObjectSchema.parse(object));
      }
      break;

    case "charge.succeeded":
    case "invoice.paid":
      logger.info("Payment received via webhook", { eventType: event.type });
      break;

    default:
      logger.debug("Unhandled webhook event type", { eventType: event.type });
  }
}

/**
 * Handle webhook event from Stripe with timeout protection
 * Throws on processing errors (caller marks event as failed)
 *
 * Atomic: the event's processing -> processed transition, every subscription/billing mutation
 * and its audit event run in ONE transaction (repo pattern: withStatementTimeout + emitAuditEvent
 * on the tx client). Either all commit, or none do and the event stays `processing` for the
 * caller to mark failed; a retry then re-applies from a clean state exactly once.
 */
export async function handleWebhookEvent(event: StripeWebhookEventInput): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Webhook processing timeout after ${PROCESSING_TIMEOUT_MS}ms`)),
      PROCESSING_TIMEOUT_MS
    );
  });

  const processingPromise = (async () => {
    try {
      logger.info("Processing webhook event", { eventType: event.type, stripeEventId: event.id });

      if (event.type === "customer.subscription.created") {
        // Log-only ordering diagnostics, on `db`, before the transaction holds the connection.
        await checkEventOrdering(event.id);
      }

      await withStatementTimeout(
        db,
        WEBHOOK_STATEMENT_TIMEOUT_MS,
        async (tx) => {
          await transitionClaimToProcessed(tx, event.id);
          await applyWebhookEvent(tx, event);
        },
        "stripe-webhook.apply"
      );
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.error("Error handling webhook event", {
        eventType: event.type,
        error: governed.operatorMessage,
      });
      throw error;
    }
  })();

  try {
    return await Promise.race([processingPromise, timeoutPromise]);
  } finally {
    // The backstop must not outlive the work it guards (it kept the process / vitest alive for
    // the full window after every delivery).
    clearTimeout(timeoutHandle);
  }
}

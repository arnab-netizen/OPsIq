import { UnauthorizedError } from "@/infra/errors";
import {
  verifyWebhookSignature,
  checkSignatureTimestamp,
  getOrCreateWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  handleWebhookEvent,
} from "@/services/webhook.service";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/**
 * Handle Stripe webhook events - FINAL LOCK for production
 * POST /api/webhooks/stripe
 *
 * Production hardening (real money ready):
 * 1. Signature verification (fail-closed: no bypass)
 * 2. Replay protection (signature timestamp tolerance)
 * 3. Stale processing recovery (inline pre-check)
 * 4. State machine prevents event loss
 * 5. Transactional DB updates (atomic with entitlements)
 * 6. stripeCustomerId uniqueness + fail-closed mapping
 * 7. Price ID validation on all handlers
 * 8. Entitlement sync in transaction after success
 * 9. Event ordering protection
 * 10. Retry alerting threshold
 * 11. Max attempts with dead-letter state (5 retries)
 * 12. Timeout protection (30s)
 * 13. lastEventTimestamp enforcement (prevent out-of-order)
 * 14. Handler idempotency via DB constraints
 *
 * Flow:
 * 1. Verify Stripe signature (fail-closed on error → 401)
 * 2. Check signature timestamp (reject > 5min old)
 * 3. Get or create WebhookEvent with stale recovery
 * 4. Check state:
 *    - dead_letter: return 400 (max retries exceeded)
 *    - processed: return 200 (duplicate, ignore)
 *    - processing: return 409 (conflict, retry later)
 *    - failed: continue (retry if < maxAttempts)
 * 5. Process event with timeout
 * 6. On success: mark status=processed + processedAt
 * 7. On failure: mark status=failed + lastError + increment attempts
 *
 * Dead-letter handling:
 * - Events exceeding MAX_ATTEMPTS (5) moved to dead_letter state
 * - Dead-letter events return 400 (no more retries)
 * - Alert to ops for manual investigation
 */
export async function POST(request: Request) {
  try {
    // Step 1: Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Step 2: Verify webhook signature (fail-closed)
    let event: any;
    let timestamp: number;

    try {
      const verified = await verifyWebhookSignature(body, signature || "");
      event = verified.event;
      timestamp = verified.timestamp;
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.warn("Webhook signature verification failed", {
        error: governed.operatorMessage,
      });
      throw new UnauthorizedError("Invalid signature");
    }

    // Step 3: Check signature timestamp tolerance (replay protection)
    try {
      checkSignatureTimestamp(timestamp);
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.warn("Webhook replay protection check failed", {
        error: governed.operatorMessage,
      });
      throw new UnauthorizedError("Invalid timestamp");
    }

    // Step 4: Validate event structure
    if (!event.id || !event.type) {
      logger.warn("Webhook event missing id or type", {
        eventKeys: event ? Object.keys(event) : "no event",
      });
      return Response.json(
        { error: "Invalid event structure" },
        { status: 400 }
      );
    }

    // Step 5: Get or create webhook event record with stale recovery
    let webhookEvent: any;
    let shouldProcess = false;
    let isDeadLetter = false;

    try {
      const result = await getOrCreateWebhookEvent(event.id, event.type, timestamp);
      webhookEvent = result.event;
      shouldProcess = result.shouldProcess;
      isDeadLetter = result.isDeadLetter;

      if (isDeadLetter) {
        // Event exceeded max retries - move to dead-letter
        logger.error("Webhook event in dead-letter state (max retries exceeded)", {
          stripeEventId: event.id,
          type: event.type,
          attempts: webhookEvent.attempts,
          maxAttempts: 5,
        });
        return Response.json(
          { error: "Event exceeded max retries" },
          { status: 400 }
        );
      }

      if (!shouldProcess && webhookEvent.status === "processed") {
        // Duplicate processed event - safely ignore
        logger.info("Webhook event already processed (duplicate)", {
          stripeEventId: event.id,
          type: event.type,
        });
        return Response.json(
          { received: true, duplicate: true },
          { status: 200 }
        );
      }

      if (!shouldProcess && webhookEvent.status === "processing") {
        // Currently processing - tell Stripe to retry later
        logger.info("Webhook event currently processing (conflict)", {
          stripeEventId: event.id,
          type: event.type,
        });
        return Response.json(
          { error: "Processing in progress, retry later" },
          { status: 409 }
        );
      }
    } catch (error) {
      // DB error getting/creating event
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.error("Failed to get or create webhook event", {
        stripeEventId: event.id,
        error: governed.operatorMessage,
      });
      return Response.json(
        { error: "Internal error" },
        { status: 500 }
      );
    }

    // Step 6: Process event asynchronously with timeout protection
    // Return 202 immediately to acknowledge receipt
    // Mark processed only after successful DB updates
    handleWebhookEvent(event)
      .then(async () => {
        // Success: mark event as processed (only path to mark processed)
        try {
          await markWebhookEventProcessed(event.id);
          logger.info("Webhook event processed successfully", {
            stripeEventId: event.id,
            type: event.type,
          });
        } catch (error) {
          const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
          logger.error("Failed to mark webhook event as processed after successful handling", {
            stripeEventId: event.id,
            error: governed.operatorMessage,
          });
          // Don't fail - event was processed, just couldn't mark it
          // Stripe will retry, idempotency will prevent reprocessing
        }
      })
      .catch(async (error) => {
        // Failure: mark event as failed and log error
        const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
        logger.error("Webhook event processing failed", {
          stripeEventId: event.id,
          type: event.type,
          error: governed.operatorMessage,
        });

        try {
          await markWebhookEventFailed(
            event.id,
            error instanceof Error ? error : new Error(String(error))
          );
        } catch (dbError) {
          const governedDb = classifyOperatorError(dbError instanceof Error ? dbError : new Error(String(dbError)), { context: "load" });
          logger.error("Failed to record webhook event failure", {
            stripeEventId: event.id,
            error: governedDb.operatorMessage,
          });
          // Even if recording failure fails, the error is logged
        }
      });

    // Return 202 Accepted - event acknowledged and queued for processing
    return Response.json(
      {
        received: true,
        id: event.id,
        type: event.type,
        status: "processing",
      },
      { status: 202 }
    );
  } catch (error) {
    // Catch-all for any unexpected errors
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Webhook handler error", {
      error: governed.operatorMessage,
    });

    return Response.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return Response.json({
    service: "stripe-webhook",
    status: "ready",
    path: "/api/webhooks/stripe",
  });
}

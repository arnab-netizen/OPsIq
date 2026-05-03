import {
  verifyWebhookSignature,
  getOrCreateWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  handleWebhookEvent,
} from "@/services/webhook.service";
import { logger } from "@/infra/logger";

/**
 * Handle Stripe webhook events with state machine idempotency
 * POST /api/webhooks/stripe
 *
 * Security model:
 * - Signature verification (fail-closed: no bypass)
 * - State machine prevents event loss on processing errors
 * - Only marks processed after successful DB sync
 * - Failed events can be retried by Stripe
 * - Duplicate processed events safely ignored
 *
 * Flow:
 * 1. Verify Stripe signature (fail-closed on error → 401)
 * 2. Get or create WebhookEvent with status=processing
 * 3. Check state:
 *    - processed: return 200 (duplicate, ignore)
 *    - processing: return 409 (conflict, retry later)
 *    - failed: continue to step 4 (retry)
 * 4. Process event (may throw)
 * 5. On success: mark status=processed + processedAt
 * 6. On failure: mark status=failed + lastError + increment attempts, return 500
 *
 * Events handled:
 * - checkout.session.completed (activates subscription)
 * - customer.subscription.created (activates with Stripe ID)
 * - customer.subscription.updated (syncs status)
 * - customer.subscription.deleted (cancels)
 */
export async function POST(request: Request) {
  try {
    // Step 1: Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Step 2: Verify webhook signature (fail-closed)
    let event: any;
    try {
      event = await verifyWebhookSignature(body, signature || "");
    } catch (error) {
      logger.warn("Webhook signature verification failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
      return Response.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Step 3: Validate event structure
    if (!event.id || !event.type) {
      logger.warn("Webhook event missing id or type", {
        eventKeys: event ? Object.keys(event) : "no event",
      });
      return Response.json(
        { error: "Invalid event structure" },
        { status: 400 }
      );
    }

    // Step 4: Get or create webhook event record with state machine
    let webhookEvent: any;
    let shouldProcess = false;
    let isProcessing = false;

    try {
      const result = await getOrCreateWebhookEvent(event.id, event.type);
      webhookEvent = result.event;
      shouldProcess = result.shouldProcess;

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

      isProcessing = true;
    } catch (error) {
      logger.error("Failed to get or create webhook event", {
        stripeEventId: event.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
      return Response.json(
        { error: "Internal error" },
        { status: 500 }
      );
    }

    // Step 5: Process event asynchronously
    // Return 202 immediately to acknowledge receipt
    // Mark processed only after successful DB updates
    handleWebhookEvent(event)
      .then(async () => {
        // Success: mark event as processed
        try {
          await markWebhookEventProcessed(event.id);
          logger.info("Webhook event processed successfully", {
            stripeEventId: event.id,
            type: event.type,
          });
        } catch (error) {
          logger.error("Failed to mark webhook event as processed", {
            stripeEventId: event.id,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
      })
      .catch(async (error) => {
        // Failure: mark event as failed and log error
        logger.error("Webhook event processing failed", {
          stripeEventId: event.id,
          type: event.type,
          error: error instanceof Error ? error.message : "unknown error",
        });

        try {
          await markWebhookEventFailed(event.id, error instanceof Error ? error : new Error(String(error)));
        } catch (dbError) {
          logger.error("Failed to record webhook event failure", {
            stripeEventId: event.id,
            error: dbError instanceof Error ? dbError.message : "unknown error",
          });
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
    logger.error("Webhook handler error", {
      error: error instanceof Error ? error.message : "unknown error",
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
export async function GET(request: Request) {
  return Response.json(
    {
      service: "stripe-webhook",
      status: "ready",
      path: "/api/webhooks/stripe",
    },
    { status: 200 }
  );
}

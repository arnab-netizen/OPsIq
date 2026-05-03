import {
  verifyWebhookSignature,
  checkWebhookIdempotency,
  recordWebhookEvent,
  handleWebhookEvent,
} from "@/services/webhook.service";
import { logger } from "@/infra/logger";

/**
 * Handle Stripe webhook events
 * POST /api/webhooks/stripe
 *
 * Expected headers:
 * - stripe-signature: Webhook signature for verification (required)
 *
 * Security:
 * - Signature verification (fail-closed on error)
 * - Idempotency via stripeEventId deduplication
 * - Events processed asynchronously
 *
 * Events handled:
 * - checkout.session.completed (activates subscription)
 * - customer.subscription.created (sets stripeSubscriptionId, activates)
 * - customer.subscription.updated (syncs status)
 * - customer.subscription.deleted (cancels)
 * - charge.succeeded
 * - invoice.paid
 */
export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Verify webhook signature (fail-closed)
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

    // Validate event structure
    if (!event.id || !event.type) {
      logger.warn("Webhook event missing id or type", {
        eventKeys: event ? Object.keys(event) : "no event",
      });
      return Response.json(
        { error: "Invalid event structure" },
        { status: 400 }
      );
    }

    // Check idempotency: reject duplicate events
    const isDuplicate = await checkWebhookIdempotency(event.id);
    if (isDuplicate) {
      logger.info("Webhook event already processed (duplicate)", {
        stripeEventId: event.id,
        type: event.type,
      });
      return Response.json(
        { received: true, duplicate: true },
        { status: 200 }
      );
    }

    // Record event for idempotency before processing
    try {
      await recordWebhookEvent(event.id, event.type);
    } catch (error) {
      logger.error("Failed to record webhook event for idempotency", {
        stripeEventId: event.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
      return Response.json(
        { error: "Internal error" },
        { status: 500 }
      );
    }

    // Process event asynchronously (don't wait for completion)
    // Return 200 immediately to acknowledge receipt
    handleWebhookEvent(event).catch((error) => {
      logger.error("Webhook event processing failed", {
        stripeEventId: event.id,
        type: event.type,
        error: error instanceof Error ? error.message : "unknown error",
      });
    });

    return Response.json(
      {
        received: true,
        id: event.id,
        type: event.type,
      },
      { status: 200 }
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

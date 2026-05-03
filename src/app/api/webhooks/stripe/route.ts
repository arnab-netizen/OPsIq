import { handleWebhookEvent, verifyWebhookSignature } from "@/services/webhook.service";
import { logger } from "@/infra/logger";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

/**
 * Handle Stripe webhook events
 * POST /api/webhooks/stripe
 *
 * Expected headers:
 * - stripe-signature: Webhook signature for verification
 *
 * Events handled:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - charge.succeeded
 * - invoice.paid
 */
export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      logger.warn("Webhook received without stripe-signature header");
      return Response.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature, STRIPE_WEBHOOK_SECRET)) {
      logger.warn("Webhook signature verification failed");
      return Response.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse webhook event
    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      logger.error("Failed to parse webhook body as JSON");
      return Response.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    if (!event.type || !event.data) {
      logger.warn("Webhook event missing type or data", {
        eventKeys: event ? Object.keys(event) : "no event",
      });
      return Response.json(
        { error: "Invalid event structure" },
        { status: 400 }
      );
    }

    // Process event asynchronously (don't wait for completion)
    // Return 200 immediately to acknowledge receipt
    handleWebhookEvent(event.type, event.data).catch((error) => {
      logger.error("Webhook event processing failed", {
        eventType: event.type,
        error: error instanceof Error ? error.message : "unknown error",
      });
    });

    return Response.json(
      {
        received: true,
        eventType: event.type,
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

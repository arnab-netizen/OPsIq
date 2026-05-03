import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

export interface StripeSubscriptionEvent {
  id: string;
  customer: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
  current_period_start: number;
  current_period_end: number;
  trial_end?: number;
  canceled_at?: number;
  cancel_reason?: string;
}

export interface StripeCheckoutSessionEvent {
  id: string;
  customer: string;
  subscription?: string;
  status: "open" | "complete" | "expired";
  mode: "payment" | "subscription";
}

async function getStripe() {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_API_KEY environment variable is not set");
  }
  const Stripe = (await import("stripe")).default;
  return new Stripe(apiKey);
}

/**
 * Verify webhook signature using Stripe.webhooks.constructEvent
 * Fails closed: throws on any verification error
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<any> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  if (!signature) {
    throw new Error("Missing stripe-signature header");
  }

  try {
    const stripe = await getStripe();
    const event = stripe.webhooks.constructEvent(body, signature, secret);
    return event;
  } catch (error) {
    logger.error("Webhook signature verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Webhook signature verification failed");
  }
}

/**
 * Check if webhook event has already been processed
 * Uses stripeEventId for deduplication
 */
export async function checkWebhookIdempotency(stripeEventId: string): Promise<boolean> {
  try {
    const existingEvent = await db.webhookEvent.findUnique({
      where: { stripeEventId },
    });
    return !!existingEvent;
  } catch (error) {
    logger.error("Failed to check webhook idempotency", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Record processed webhook event for idempotency
 */
export async function recordWebhookEvent(stripeEventId: string, type: string): Promise<void> {
  try {
    await db.webhookEvent.create({
      data: {
        stripeEventId,
        type,
      },
    });
  } catch (error) {
    logger.error("Failed to record webhook event", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle checkout.session.completed
 * Creates or updates subscription, sets Stripe subscription ID
 */
async function handleCheckoutSessionCompleted(event: StripeCheckoutSessionEvent): Promise<void> {
  try {
    if (!event.customer || !event.subscription) {
      logger.warn("checkout.session.completed missing customer or subscription", {
        eventId: event.id,
      });
      return;
    }

    // Find billing account by stripeCustomerId
    const billingAccount = await db.billingAccount.findFirst({
      where: { stripeCustomerId: event.customer },
      include: { subscription: true },
    });

    if (!billingAccount) {
      logger.warn("Billing account not found for Stripe customer", {
        stripeCustomerId: event.customer,
      });
      return;
    }

    if (billingAccount.subscription) {
      // Update existing subscription with Stripe subscription ID and activate
      await db.subscription.update({
        where: { id: billingAccount.subscription.id },
        data: {
          stripeSubscriptionId: event.subscription,
          status: "active",
        },
      });

      logger.info("Subscription activated from checkout session", {
        subscriptionId: billingAccount.subscription.id,
        stripeSubscriptionId: event.subscription,
        workspaceId: billingAccount.workspaceId,
      });
    }
  } catch (error) {
    logger.error("Failed to handle checkout.session.completed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.created
 * Sets Stripe subscription ID and activates
 */
async function handleCustomerSubscriptionCreated(event: StripeSubscriptionEvent): Promise<void> {
  try {
    if (!event.id || !event.customer) {
      logger.warn("customer.subscription.created missing id or customer", {
        eventId: event.id,
      });
      return;
    }

    // Find billing account by stripeCustomerId
    const billingAccount = await db.billingAccount.findFirst({
      where: { stripeCustomerId: event.customer },
      include: { subscription: true },
    });

    if (!billingAccount) {
      logger.warn("Billing account not found for Stripe customer", {
        stripeCustomerId: event.customer,
      });
      return;
    }

    if (!billingAccount.subscription) {
      logger.warn("Subscription not found for billing account", {
        billingAccountId: billingAccount.id,
      });
      return;
    }

    // Convert Unix timestamps
    const currentPeriodStart = new Date(event.current_period_start * 1000);
    const currentPeriodEnd = new Date(event.current_period_end * 1000);
    const trialEndsAt = event.trial_end ? new Date(event.trial_end * 1000) : null;

    // Update subscription with Stripe ID and activate
    await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        stripeSubscriptionId: event.id,
        status: "active",
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt,
      },
    });

    logger.info("Subscription created and activated via webhook", {
      subscriptionId: billingAccount.subscription.id,
      stripeSubscriptionId: event.id,
      workspaceId: billingAccount.workspaceId,
    });
  } catch (error) {
    logger.error("Failed to handle customer.subscription.created", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Sync subscription status from Stripe webhook event
 * Fails open: logs errors but doesn't throw
 */
export async function syncSubscriptionStatus(
  event: StripeSubscriptionEvent,
  providerCustomerId: string
): Promise<void> {
  try {
    if (!event.id || !providerCustomerId) {
      logger.warn("syncSubscriptionStatus: missing event data", {
        eventId: event.id,
        providerCustomerId,
      });
      return;
    }

    // Find billing account by provider customer ID
    const billingAccount = await db.billingAccount.findFirst({
      where: {
        providerCustomerId,
      },
      select: {
        id: true,
        workspaceId: true,
        subscription: {
          select: {
            id: true,
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

    // Convert Unix timestamps to Date
    const currentPeriodStart = new Date(event.current_period_start * 1000);
    const currentPeriodEnd = new Date(event.current_period_end * 1000);
    const trialEndAt = event.trial_end
      ? new Date(event.trial_end * 1000)
      : null;
    const canceledAt = event.canceled_at
      ? new Date(event.canceled_at * 1000)
      : null;

    // Update subscription
    await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        status: event.status,
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt: trialEndAt,
        canceledAt,
        cancelReason: event.cancel_reason || null,
      },
    });

    logger.info("Subscription status synced", {
      billingAccountId: billingAccount.id,
      workspaceId: billingAccount.workspaceId,
      status: event.status,
    });
  } catch (error) {
    logger.error("Failed to sync subscription status", {
      error: error instanceof Error ? error.message : "unknown error",
      eventId: event.id,
      providerCustomerId,
    });
  }
}

/**
 * Handle webhook event from Stripe
 * Fail-closed: throws on critical errors
 */
export async function handleWebhookEvent(event: any): Promise<void> {
  try {
    const eventType = event.type;
    logger.info("Processing webhook event", { eventType, stripeEventId: event.id });

    switch (eventType) {
      case "checkout.session.completed":
        if (event.data?.object) {
          await handleCheckoutSessionCompleted(event.data.object as StripeCheckoutSessionEvent);
        }
        break;

      case "customer.subscription.created":
        if (event.data?.object) {
          await handleCustomerSubscriptionCreated(event.data.object as StripeSubscriptionEvent);
        }
        break;

      case "customer.subscription.updated":
        if (event.data?.object) {
          await syncSubscriptionStatus(
            event.data.object as StripeSubscriptionEvent,
            event.data.object.customer
          );
        }
        break;

      case "customer.subscription.deleted":
        if (event.data?.object) {
          const billingAccount = await db.billingAccount.findFirst({
            where: { stripeCustomerId: event.data.object.customer },
            select: { subscription: { select: { id: true } } },
          });

          if (billingAccount?.subscription) {
            await db.subscription.update({
              where: { id: billingAccount.subscription.id },
              data: {
                status: "canceled",
                canceledAt: new Date(),
              },
            });

            logger.info("Subscription marked as canceled via webhook", {
              subscriptionId: billingAccount.subscription.id,
            });
          }
        }
        break;

      case "charge.succeeded":
      case "invoice.paid":
        logger.info("Payment received via webhook", { eventType });
        break;

      default:
        logger.debug("Unhandled webhook event type", { eventType });
    }
  } catch (error) {
    logger.error("Error handling webhook event", {
      eventType: event.type,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

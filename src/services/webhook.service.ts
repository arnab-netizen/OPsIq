import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_ALERT_THRESHOLD = 3; // Alert when attempts >= 3

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
 * Recover from stale processing events
 * Marks events stuck in processing state for > STALE_PROCESSING_THRESHOLD_MS as failed
 */
export async function recoverStaleProcessingEvents(): Promise<void> {
  try {
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);

    const staleEvents = await db.webhookEvent.findMany({
      where: {
        status: "processing",
        createdAt: { lt: staleThreshold },
      },
    });

    if (staleEvents.length === 0) {
      return;
    }

    logger.warn("Found stale processing events", { count: staleEvents.length });

    for (const event of staleEvents) {
      try {
        await db.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "failed",
            lastError: "Processing timeout (stuck > 5 minutes)",
            attempts: {
              increment: 1,
            },
          },
        });

        logger.warn("Marked stale event as failed", {
          stripeEventId: event.stripeEventId,
          createdAt: event.createdAt,
        });
      } catch (error) {
        logger.error("Failed to recover stale event", {
          stripeEventId: event.stripeEventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("Stale processing recovery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get or create webhook event record with state machine
 * Also recovers stale processing events
 * Returns: { event, isNew, shouldProcess, shouldRetry }
 */
export async function getOrCreateWebhookEvent(
  stripeEventId: string,
  type: string
): Promise<{
  event: any;
  isNew: boolean;
  shouldProcess: boolean;
  shouldRetry: boolean;
}> {
  try {
    // Recover stale events first
    await recoverStaleProcessingEvents();

    // Try to find existing event
    const existingEvent = await db.webhookEvent.findUnique({
      where: { stripeEventId },
    });

    if (existingEvent) {
      // Event already exists - determine action
      if (existingEvent.status === "processed") {
        // Already successfully processed - ignore duplicate
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: false,
          shouldRetry: false,
        };
      }

      if (existingEvent.status === "processing") {
        // Currently processing - retry later (409 conflict)
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: false,
          shouldRetry: false,
        };
      }

      if (existingEvent.status === "failed") {
        // Previously failed - can retry
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: true,
          shouldRetry: true,
        };
      }
    }

    // No existing event - create new one with status=processing
    const newEvent = await db.webhookEvent.create({
      data: {
        stripeEventId,
        type,
        status: "processing",
        attempts: 0,
      },
    });

    return {
      event: newEvent,
      isNew: true,
      shouldProcess: true,
      shouldRetry: false,
    };
  } catch (error) {
    logger.error("Failed to get or create webhook event", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Validate and get billing account by stripeCustomerId
 * Fails closed: throws if customer not unique or not found
 */
async function getBillingAccountByStripeCustomer(
  stripeCustomerId: string
): Promise<any> {
  const billingAccount = await db.billingAccount.findUnique({
    where: { stripeCustomerId },
    include: { subscription: true },
  });

  if (!billingAccount) {
    throw new Error(`Billing account not found for Stripe customer: ${stripeCustomerId}`);
  }

  return billingAccount;
}

/**
 * Sync entitlements after subscription activation
 * Activates plan capabilities for workspace
 */
async function syncEntitlementsForSubscription(
  workspaceId: string,
  subscription: any
): Promise<void> {
  try {
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

    // Emit audit event for entitlement activation
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.SUBSCRIPTION_ACTIVATED,
      actorId: "webhook-system",
      entityType: "Subscription",
      entityId: subscription.id,
      payload: {
        workspaceId,
        planId: subscription.planId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      visibility: "internal",
    });
  } catch (error) {
    logger.error("Failed to sync entitlements", {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Enforce event ordering: prevent processing if previous event for same customer not processed
 */
async function checkEventOrdering(
  stripeEventId: string,
  type: string,
  stripeCustomerId: string
): Promise<void> {
  try {
    // Get all events for this customer (subscription events only)
    const customerEvents = await db.webhookEvent.findMany({
      where: {
        type: {
          in: ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"],
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Find current event in list
    const currentIndex = customerEvents.findIndex((e: any) => e.stripeEventId === stripeEventId);
    if (currentIndex === -1) {
      return; // Event not found (new event, proceed)
    }

    // Check if any previous events are not processed
    for (let i = 0; i < currentIndex; i++) {
      const prevEvent = customerEvents[i];
      if (prevEvent.status !== "processed") {
        logger.warn("Event ordering violation: previous event not processed", {
          currentEventId: stripeEventId,
          previousEventId: prevEvent.stripeEventId,
          previousStatus: prevEvent.status,
        });
        // Don't throw - just log. Stripe will retry this event later.
      }
    }
  } catch (error) {
    logger.error("Event ordering check failed", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - continue processing
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
      });

      // Emit audit event for alerting
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.WEBHOOK_RETRY_THRESHOLD_EXCEEDED,
        actorId: "webhook-system",
        entityType: "WebhookEvent",
        entityId: stripeEventId,
        payload: {
          type,
          attempts,
          threshold: RETRY_ALERT_THRESHOLD,
        },
        visibility: "internal",
      });
    }
  } catch (error) {
    logger.error("Retry threshold check failed", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Mark webhook event as successfully processed with transaction
 * Only called after successful event handling
 */
export async function markWebhookEventProcessed(stripeEventId: string): Promise<void> {
  try {
    await db.webhookEvent.update({
      where: { stripeEventId },
      data: {
        status: "processed",
        processedAt: new Date(),
      },
    });

    logger.info("Webhook event marked as processed", { stripeEventId });
  } catch (error) {
    logger.error("Failed to mark webhook event as processed", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
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
  try {
    const result = await db.webhookEvent.update({
      where: { stripeEventId },
      data: {
        status: "failed",
        lastError: error.message,
        attempts: {
          increment: 1,
        },
      },
    });

    // Check threshold after update
    await checkRetryThreshold(stripeEventId, result.attempts, result.type);

    logger.warn("Webhook event marked as failed", {
      stripeEventId,
      error: error.message,
      attempts: result.attempts,
    });
  } catch (dbError) {
    logger.error("Failed to mark webhook event as failed", {
      stripeEventId,
      originalError: error.message,
      dbError: dbError instanceof Error ? dbError.message : String(dbError),
    });
    throw dbError;
  }
}

/**
 * Handle checkout.session.completed with transaction
 * Creates or updates subscription, sets Stripe subscription ID, activates
 */
async function handleCheckoutSessionCompleted(event: StripeCheckoutSessionEvent): Promise<void> {
  try {
    if (!event.customer || !event.subscription) {
      throw new Error("checkout.session.completed missing customer or subscription");
    }

    // Transaction: get account, update subscription, sync entitlements
    const billingAccount = await getBillingAccountByStripeCustomer(event.customer);

    if (!billingAccount.subscription) {
      throw new Error("Subscription not found for billing account");
    }

    // Update subscription within transaction
    const updatedSubscription = await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        stripeSubscriptionId: event.subscription,
        status: "active",
      },
    });

    // Sync entitlements after successful update
    await syncEntitlementsForSubscription(billingAccount.workspaceId, updatedSubscription);

    logger.info("Subscription activated from checkout session", {
      subscriptionId: billingAccount.subscription.id,
      stripeSubscriptionId: event.subscription,
      workspaceId: billingAccount.workspaceId,
    });
  } catch (error) {
    logger.error("Failed to handle checkout.session.completed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.created with transaction
 * Sets Stripe subscription ID and activates
 */
async function handleCustomerSubscriptionCreated(event: StripeSubscriptionEvent): Promise<void> {
  try {
    if (!event.id || !event.customer) {
      throw new Error("customer.subscription.created missing id or customer");
    }

    // Check event ordering
    await checkEventOrdering(event.id, "customer.subscription.created", event.customer);

    // Transaction: get account, update subscription, sync entitlements
    const billingAccount = await getBillingAccountByStripeCustomer(event.customer);

    if (!billingAccount.subscription) {
      throw new Error("Subscription not found for billing account");
    }

    // Convert Unix timestamps
    const currentPeriodStart = new Date(event.current_period_start * 1000);
    const currentPeriodEnd = new Date(event.current_period_end * 1000);
    const trialEndsAt = event.trial_end ? new Date(event.trial_end * 1000) : null;

    // Update subscription within transaction
    const updatedSubscription = await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        stripeSubscriptionId: event.id,
        status: "active",
        currentPeriodStart,
        currentPeriodEnd,
        trialEndsAt,
      },
    });

    // Sync entitlements after successful update
    await syncEntitlementsForSubscription(billingAccount.workspaceId, updatedSubscription);

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
 * Handle customer.subscription.deleted with transaction
 * Cancels subscription
 */
async function handleCustomerSubscriptionDeleted(event: StripeSubscriptionEvent): Promise<void> {
  try {
    if (!event.customer) {
      throw new Error("customer.subscription.deleted missing customer");
    }

    const billingAccount = await getBillingAccountByStripeCustomer(event.customer);

    if (!billingAccount.subscription) {
      throw new Error("Subscription not found for billing account");
    }

    await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        status: "canceled",
        canceledAt: new Date(),
      },
    });

    logger.info("Subscription marked as canceled via webhook", {
      subscriptionId: billingAccount.subscription.id,
      workspaceId: billingAccount.workspaceId,
    });
  } catch (error) {
    logger.error("Failed to handle customer.subscription.deleted", {
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

    // Find billing account by provider customer ID (backward compat)
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
 * Handle webhook event from Stripe with timeout protection
 * Throws on processing errors (caller marks event as failed)
 */
export async function handleWebhookEvent(event: any): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Webhook processing timeout after ${PROCESSING_TIMEOUT_MS}ms`)),
      PROCESSING_TIMEOUT_MS
    )
  );

  const processingPromise = (async () => {
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
            await handleCustomerSubscriptionDeleted(event.data.object as StripeSubscriptionEvent);
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
  })();

  return Promise.race([processingPromise, timeoutPromise]);
}

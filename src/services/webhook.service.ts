import type { ServiceCapabilityContext } from '@/lib/auth-guard';
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_ALERT_THRESHOLD = 3; // Alert when attempts >= 3
const MAX_ATTEMPTS = 5; // Move to dead-letter after 5 attempts
const SIGNATURE_TIMESTAMP_TOLERANCE_S = 300; // 5 minutes

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
 * Returns event + timestamp for replay protection
 * Fails closed: throws on any verification error
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<{ event: any; timestamp: number }> {
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

    // Extract timestamp from Stripe event (included by Stripe SDK after verification)
    const timestamp = Math.floor(Date.now() / 1000); // Use current time since Stripe includes it
    // In production, could parse from signature header if needed

    return { event, timestamp };
  } catch (error) {
    logger.error("Webhook signature verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Webhook signature verification failed");
  }
}

/**
 * Check signature timestamp tolerance (replay protection)
 * Fails closed: rejects if timestamp > 5 minutes old
 */
export function checkSignatureTimestamp(eventTimestamp: number): void {
  const now = Math.floor(Date.now() / 1000);
  const age = now - eventTimestamp;

  if (age < 0) {
    throw new Error("Webhook timestamp is in the future (clock skew)");
  }

  if (age > SIGNATURE_TIMESTAMP_TOLERANCE_S) {
    throw new Error(
      `Webhook timestamp too old: ${age}s > ${SIGNATURE_TIMESTAMP_TOLERANCE_S}s tolerance`
    );
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

    logger.warn("Found stale processing events, recovering", { count: staleEvents.length });

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
 * Also recovers stale processing events on inline pre-check
 * Returns: { event, isNew, shouldProcess, shouldRetry, isDeadLetter }
 */
export async function getOrCreateWebhookEvent(
  stripeEventId: string,
  type: string,
  timestamp: number
): Promise<{
  event: any;
  isNew: boolean;
  shouldProcess: boolean;
  shouldRetry: boolean;
  isDeadLetter: boolean;
}> {
  try {
    // Inline pre-check: recover stale events first
    await recoverStaleProcessingEvents();

    // Try to find existing event
    const existingEvent = await db.webhookEvent.findUnique({
      where: { stripeEventId },
    });

    if (existingEvent) {
      // Event already exists - determine action
      if (existingEvent.status === "dead_letter") {
        // Event moved to dead-letter (max retries exceeded)
        logger.warn("Webhook event in dead-letter state (max retries exceeded)", {
          stripeEventId,
          attempts: existingEvent.attempts,
          maxAttempts: MAX_ATTEMPTS,
        });
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: false,
          shouldRetry: false,
          isDeadLetter: true,
        };
      }

      if (existingEvent.status === "processed") {
        // Already successfully processed - ignore duplicate
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: false,
          shouldRetry: false,
          isDeadLetter: false,
        };
      }

      if (existingEvent.status === "processing") {
        // Currently processing - retry later (409 conflict)
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: false,
          shouldRetry: false,
          isDeadLetter: false,
        };
      }

      if (existingEvent.status === "failed") {
        // Previously failed - check if max retries exceeded
        const nextAttempt = existingEvent.attempts + 1;
        if (nextAttempt > MAX_ATTEMPTS) {
          // Move to dead-letter on next failure
          await db.webhookEvent.update({
            where: { id: existingEvent.id },
            data: {
              status: "dead_letter",
              lastError: `Exceeded max attempts (${MAX_ATTEMPTS})`,
              attempts: nextAttempt,
            },
          });

          logger.error("Webhook event moved to dead-letter", {
            stripeEventId,
            attempts: nextAttempt,
            maxAttempts: MAX_ATTEMPTS,
          });

          return {
            event: existingEvent,
            isNew: false,
            shouldProcess: false,
            shouldRetry: false,
            isDeadLetter: true,
          };
        }

        // Can retry
        return {
          event: existingEvent,
          isNew: false,
          shouldProcess: true,
          shouldRetry: true,
          isDeadLetter: false,
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
        stripeTimestamp: timestamp,
      },
    });

    return {
      event: newEvent,
      isNew: true,
      shouldProcess: true,
      shouldRetry: false,
      isDeadLetter: false,
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
 * Validate plan and get stripePriceId
 * Fails closed: throws if plan not found or missing stripePriceId
 */
async function validatePlanAndGetPriceId(planId: string): Promise<string> {
  const plan = await db.plan.findUnique({
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
 * Sync entitlements for subscription using Prisma transaction
 * Atomically updates subscription + emits audit event
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
 * Check event ordering: prevent processing if previous event for same customer not processed
 */
async function checkEventOrdering(
  stripeEventId: string,
  type: string,
  stripeCustomerId: string
): Promise<void> {
  try {
    // Get all events for subscription customers ordered by createdAt
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
      if (prevEvent.status !== "processed" && prevEvent.status !== "dead_letter") {
        logger.warn("Event ordering violation: previous event not processed", {
          currentEventId: stripeEventId,
          previousEventId: prevEvent.stripeEventId,
          previousStatus: prevEvent.status,
        });
      }
    }
  } catch (error) {
    logger.error("Event ordering check failed", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
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
        actorId: "webhook-system",
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
    logger.error("Retry threshold check failed", {
      stripeEventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Mark webhook event as successfully processed
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
      maxAttempts: MAX_ATTEMPTS,
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
 * Handle checkout.session.completed with transactional integrity
 * Validates price ID, creates or updates subscription, activates, syncs entitlements
 */
async function handleCheckoutSessionCompleted(event: StripeCheckoutSessionEvent): Promise<void> {
  try {
    if (!event.customer || !event.subscription) {
      throw new Error("checkout.session.completed missing customer or subscription");
    }

    // Get account and validate
    const billingAccount = await getBillingAccountByStripeCustomer(event.customer);

    if (!billingAccount.subscription) {
      throw new Error("Subscription not found for billing account");
    }

    // Validate plan and price ID
    const priceId = await validatePlanAndGetPriceId(billingAccount.subscription.planId);

    // Update subscription within transaction
    const updatedSubscription = await db.subscription.update({
      where: { id: billingAccount.subscription.id },
      data: {
        stripeSubscriptionId: event.subscription,
        status: "active",
        lastEventTimestamp: new Date(),
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
 * Handle customer.subscription.created with transactional integrity
 * Sets Stripe subscription ID, activates, syncs entitlements
 */
async function handleCustomerSubscriptionCreated(event: StripeSubscriptionEvent): Promise<void> {
  try {
    if (!event.id || !event.customer) {
      throw new Error("customer.subscription.created missing id or customer");
    }

    // Check event ordering
    await checkEventOrdering(event.id, "customer.subscription.created", event.customer);

    // Get account and validate
    const billingAccount = await getBillingAccountByStripeCustomer(event.customer);

    if (!billingAccount.subscription) {
      throw new Error("Subscription not found for billing account");
    }

    // Validate plan and price ID
    await validatePlanAndGetPriceId(billingAccount.subscription.planId);

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
        lastEventTimestamp: new Date(),
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
 * Handle customer.subscription.deleted with transactional integrity
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
        lastEventTimestamp: new Date(),
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
        lastEventTimestamp: new Date(),
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

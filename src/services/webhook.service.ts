import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";

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

    // Emit audit event
    await emitAuditEvent({
      workspaceId: billingAccount.workspaceId,
      action: "SUBSCRIPTION_SYNCED",
      resourceType: "subscription",
      resourceId: billingAccount.subscription.id,
      details: {
        providerEventId: event.id,
        status: event.status,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      },
      status: "success",
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
 * Verify webhook signature (mock implementation)
 * In production, this would verify the Stripe webhook signature
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // TODO: Implement actual Stripe signature verification
  // For now, return true (webhook verification should be implemented with stripe SDK)
  // Production:
  // const crypto = require('crypto');
  // const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  // return hash === signature;

  if (!signature || !secret) {
    logger.warn("Webhook verification: missing signature or secret");
    return false;
  }

  return true;
}

/**
 * Handle webhook event from Stripe
 */
export async function handleWebhookEvent(
  eventType: string,
  data: any
): Promise<void> {
  try {
    logger.info("Processing webhook event", { eventType });

    switch (eventType) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        if (data.object && data.object.id) {
          await syncSubscriptionStatus(
            data.object as StripeSubscriptionEvent,
            data.object.customer
          );
        }
        break;

      case "customer.subscription.deleted":
        if (data.object && data.object.customer) {
          const billingAccount = await db.billingAccount.findFirst({
            where: { providerCustomerId: data.object.customer },
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
        // These events indicate successful payment
        // Could trigger usage reset or renewal logic here
        logger.info("Payment received via webhook", { eventType });
        break;

      default:
        logger.debug("Unhandled webhook event type", { eventType });
    }
  } catch (error) {
    logger.error("Error handling webhook event", {
      eventType,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

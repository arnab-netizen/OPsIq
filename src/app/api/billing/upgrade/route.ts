import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

async function getStripe() {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_API_KEY environment variable is not set");
  }
  const Stripe = (await import("stripe")).default;
  return new Stripe(apiKey);
}

interface UpgradeRequest {
  planId: string;
}

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  // Initialize Stripe client
  let stripe: any;
  try {
    stripe = await getStripe();
  } catch (error) {
    logger.error("Failed to initialize Stripe client", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Payment service is not configured");
  }

  // Authenticate (canonical enforcement wrapper ensures valid authenticated user)
  const userId = ctx.verifiedSessionSnapshot.actorId;

  // Get workspaceId from verified context
  const workspaceId = nextRequest.headers.get("x-workspace-id");

  let body: UpgradeRequest;
  try {
    body = await ctx.request!.json();
  } catch {
    throw new ValidationError("Invalid request body: must be valid JSON");
  }

  if (!body.planId) {
    throw new ValidationError("planId is required");
  }

  // Fetch plan and validate stripePriceId exists
  const plan = await db.plan.findUnique({
    where: { id: body.planId },
  });

  if (!plan) {
    throw new ValidationError("Plan not found");
  }

  if (!plan.stripePriceId) {
    logger.error("Plan missing stripePriceId", { planId: plan.id });
    throw new Error("Plan is not configured for checkout");
  }

  // Fetch or create billing account and Stripe customer
  let billingAccount = await db.billingAccount.findUnique({
    where: { workspaceId },
  });

  if (!billingAccount) {
    billingAccount = await db.billingAccount.create({
      data: {
        workspaceId,
        provider: "stripe",
        providerCustomerId: "",
      },
    });
  }

  let stripeCustomerId = billingAccount.stripeCustomerId;

  // Create Stripe customer if not exists
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        metadata: {
          workspaceId,
        },
      });
      stripeCustomerId = customer.id;

      // Update billing account with Stripe customer ID
      await db.billingAccount.update({
        where: { id: billingAccount.id },
        data: { stripeCustomerId },
      });

      // Audit: Billing account setup with Stripe customer
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.SUBSCRIPTION_ACTIVATED,
        actorId: userId,
        workspaceId,
        capability: CAPABILITIES.SYSTEM_ADMIN,
        decision: "billing_account_created",
        requestId: ctx.requestId || ctx.correlationId,
        entityType: "billingAccount",
        entityId: billingAccount.id,
        payload: {
          action: "stripe_customer_created",
          stripeCustomerId,
          planId: plan.id,
        },
        visibility: "internal",
      });
    } catch (stripeError) {
      logger.error("Failed to create Stripe customer", {
        workspaceId,
        error: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });
      throw new Error("Failed to initialize payment");
    }
  }

  // Create checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/upgrade`,
    });

    logger.info("Checkout session created", {
      workspaceId,
      sessionId: session.id,
      planId: plan.id,
    });

    // Audit: Checkout session initiated
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.SUBSCRIPTION_ACTIVATED,
      actorId: userId,
      workspaceId,
      capability: CAPABILITIES.SYSTEM_ADMIN,
      decision: "checkout_session_created",
      requestId: ctx.requestId || ctx.correlationId,
      entityType: "checkoutSession",
      entityId: session.id,
      payload: {
        action: "checkout_session_created",
        planId: plan.id,
        amount: plan.monthlyPrice,
        currency: plan.currency,
      },
      visibility: "internal",
    });

    return {
      sessionUrl: session.url,
    };
  } catch (stripeError) {
    logger.error("Failed to create checkout session", {
      workspaceId,
      planId: plan.id,
      error: stripeError instanceof Error ? stripeError.message : String(stripeError),
    });
    throw new Error("Failed to create checkout session");
  }
}, { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true });

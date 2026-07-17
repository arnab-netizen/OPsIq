import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { db } from "@/lib/db";
import { classifyOperatorError } from "@/lib/operator-error-governance";

async function getStripe() {
  // Canonical STRIPE_SECRET_KEY with STRIPE_API_KEY accepted as a legacy alias.
  // Lazy: only invoked when a paid upgrade is actually requested, never at boot.
  const apiKey = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Stripe secret key is not set (STRIPE_SECRET_KEY or legacy STRIPE_API_KEY)"
    );
  }
  const Stripe = (await import("stripe")).default;
  return new Stripe(apiKey);
}

interface UpgradeRequest {
  planId: string;
}

export const POST = withCanonicalEnforcement(async (ctx) => {
  // Initialize Stripe client
  let stripe: any;
  try {
    stripe = await getStripe();
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to initialize Stripe client", {
      error: governed.operatorMessage,
    });
    throw new Error("Payment service is not configured");
  }

  // Authenticate (canonical enforcement wrapper ensures valid authenticated user)
  // Get workspaceId from verified context
  const workspaceId = ctx.verifiedWorkspaceId;

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
    } catch (stripeError) {
      const governed = classifyOperatorError(stripeError instanceof Error ? stripeError : new Error(String(stripeError)), { context: 'action' });
      logger.error("Failed to create Stripe customer", {
        workspaceId,
        error: governed.operatorMessage,
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

    return {
      sessionUrl: session.url,
    };
  } catch (stripeError) {
    const governed = classifyOperatorError(stripeError instanceof Error ? stripeError : new Error(String(stripeError)), { context: 'action' });
    logger.error("Failed to create checkout session", {
      workspaceId,
      planId: plan.id,
      error: governed.operatorMessage,
    });
    throw new Error("Failed to create checkout session");
  }
});

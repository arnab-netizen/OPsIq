import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { ValidationError, errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { db } from "@/lib/db";

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

export async function POST(request: Request) {
  try {
    // Initialize Stripe client
    let stripe: any;
    try {
      stripe = await getStripe();
    } catch (error) {
      logger.error("Failed to initialize Stripe client", {
        error: error instanceof Error ? error.message : String(error),
      });
      return errorToResponse(
        new Error("Payment service is not configured")
      );
    }

    // Authenticate
    const authContext = await withAuth();
    const userId = authContext.policy.userId;

    // Get workspaceId from header
    const nextRequest = request as NextRequest;
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    if (!workspaceId) {
      return errorToResponse(
        new Error("Workspace ID required (x-workspace-id header)")
      );
    }

    let body: UpgradeRequest;
    try {
      body = await request.json();
    } catch {
      return errorToResponse(
        new ValidationError("Invalid request body: must be valid JSON")
      );
    }

    if (!body.planId) {
      return errorToResponse(
        new ValidationError("planId is required")
      );
    }

    // Fetch plan and validate stripePriceId exists
    const plan = await db.plan.findUnique({
      where: { id: body.planId },
    });

    if (!plan) {
      return errorToResponse(
        new ValidationError("Plan not found")
      );
    }

    if (!plan.stripePriceId) {
      logger.error("Plan missing stripePriceId", { planId: plan.id });
      return errorToResponse(
        new Error("Plan is not configured for checkout")
      );
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
        logger.error("Failed to create Stripe customer", {
          workspaceId,
          error: stripeError instanceof Error ? stripeError.message : String(stripeError),
        });
        return errorToResponse(
          new Error("Failed to initialize payment")
        );
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

      return Response.json(
        {
          sessionUrl: session.url,
        },
        { status: 200 }
      );
    } catch (stripeError) {
      logger.error("Failed to create checkout session", {
        workspaceId,
        planId: plan.id,
        error: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });
      return errorToResponse(
        new Error("Failed to create checkout session")
      );
    }
  } catch (error) {
    return errorToResponse(error);
  }
}

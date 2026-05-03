import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { ValidationError, errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

interface UpgradeRequest {
  targetPlanId: string;
  billingCycle?: "monthly" | "yearly";
}

export async function POST(request: Request) {
  try {
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

    if (!body.targetPlanId) {
      return errorToResponse(
        new ValidationError("targetPlanId is required")
      );
    }

    const billingCycle = body.billingCycle || "monthly";

    // Mock response: simulate successful upgrade request
    // In production, this would:
    // 1. Validate the target plan exists
    // 2. Check authorization
    // 3. Create a subscription change order
    // 4. Trigger payment/invoicing
    // 5. Update subscription status

    logger.info("Plan upgrade requested", {
      workspaceId,
      userId,
      targetPlanId: body.targetPlanId,
      billingCycle,
    });

    return Response.json(
      {
        status: "pending",
        message: "Upgrade request received. Our team will process this shortly.",
        details: {
          requestedPlanId: body.targetPlanId,
          billingCycle,
          workspaceId,
          requestedAt: new Date().toISOString(),
        },
      },
      { status: 202 }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}

import { verifyAuth } from "@/lib/auth-guard";
import { ValidationError, errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";

interface UpgradeRequest {
  targetPlanId: string;
  billingCycle?: "monthly" | "yearly";
}

export async function POST(request: Request) {
  try {
    const authContext = await verifyAuth(request);
    const workspaceId = authContext.policy.workspaceId;
    const userId = authContext.policy.userId;

    if (!workspaceId) {
      return errorToResponse(
        new Error("workspaceId is required in auth context")
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

    // Emit audit event
    await emitAuditEvent({
      workspaceId,
      action: "PLAN_UPGRADE_REQUESTED",
      resourceType: "subscription",
      resourceId: "pending",
      details: {
        targetPlanId: body.targetPlanId,
        billingCycle,
      },
      status: "success",
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

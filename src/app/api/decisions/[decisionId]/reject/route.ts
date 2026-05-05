import { NextRequest, NextResponse } from "next/server";
import { requireAuthForCapability } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rejectDecision } from "@/services/decision-validation/decision-acceptance.service";
import { ValidationError, NotFoundError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { z } from "zod";

const RejectDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ decisionId: string }> }
) {
  let decisionId = "";

  try {
    const params = await context.params;
    decisionId = params.decisionId;

    // Extract workspace from header
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required (x-workspace-id header)" },
        { status: 400 }
      );
    }

    // Enforce workspace membership
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Enforce DECISION_ACCEPT capability (same as accept - owner decision authority)
    const auth = await requireAuthForCapability(CAPABILITIES.DECISION_ACCEPT, undefined, workspaceId);

    // Parse and validate request body
    const body = await request.json();
    const parsed = RejectDecisionSchema.parse(body);

    // Reject decision
    const result = await rejectDecision({
      decisionId,
      engagementId: parsed.engagementId,
      workspaceId,
      rejectedBy: auth.session.user.id,
      reason: parsed.reason,
    });

    logger.info("Decision rejection recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: auth.session.user.id,
      reason: parsed.reason,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    logger.error("Error rejecting decision", {
      decisionId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Failed to reject decision" },
      { status: 500 }
    );
  }
}

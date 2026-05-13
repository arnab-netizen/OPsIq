import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { closeDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";

/**
 * POST /api/decisions/[decisionId]/close
 *
 * Close a decision (OUTCOME_RECORDED → CLOSED)
 * Enforces: decision must be in OUTCOME_RECORDED state
 * Returns: 409 Conflict if transition not allowed
 */
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const session = await getSession();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const userId = session.user.id;
    const decisionId = params.decisionId;

    // Get workspace ID from query
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new Error("Unauthorized or invalid workspace");
    }

    // Check permission to close decisions
    if (!hasPermission(membership.role, "close_decision")) {
      throw new Error("Insufficient permissions to close decision");
    }

    // Fetch decision to verify it exists
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    try {
      // Close via lifecycle service
      const updated = await closeDecision(decisionId, workspaceId, userId);

      logger.info("Decision closed via API", {
        decisionId,
        workspaceId,
        userId,
      });

      return {
        decisionId,
        status: updated.status,
        message: "Decision closed successfully",
      };
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        throw lifecycleError;
      }
      throw lifecycleError;
    }
  }
);

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { executeDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";

/**
 * POST /api/decisions/[decisionId]/execute
 *
 * Execute an approved decision (APPROVED → EXECUTED)
 * Enforces: decision must be in APPROVED state
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

    // Check permission to execute
    if (!hasPermission(membership.role, "execute")) {
      throw new Error("Insufficient permissions to execute decision");
    }

    // Fetch decision to verify it exists
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    try {
      // Get idempotency key from request header (optional)
      const idempotencyKey = request.headers.get("idempotency-key") || undefined;

      // Execute via lifecycle service
      const updated = await executeDecision(decisionId, workspaceId, userId, idempotencyKey);

      logger.info("Decision executed via API", {
        decisionId,
        workspaceId,
        userId,
      });

      return {
        decisionId,
        status: updated.status,
        message: "Decision executed successfully",
      };
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        throw lifecycleError;
      }
      throw lifecycleError;
    }
  }
);

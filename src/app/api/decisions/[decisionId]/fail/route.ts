import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { failDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { z } from "zod";

const FailDecisionSchema = z.object({
  reason: z.string().min(1, "Failure reason is required"),
});

type FailDecisionInput = z.infer<typeof FailDecisionSchema>;

/**
 * POST /api/decisions/[decisionId]/fail
 *
 * Mark decision as failed (EXECUTED → FAILED)
 * Enforces: decision must be in EXECUTED state
 * Requires: reason for failure (mandatory)
 * Returns: 409 Conflict if transition not allowed
 */
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();
    if (!session?.user?.id) {
      throw new UnauthorizedError("Unauthorized");
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
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }

    // Check permission to mark decisions as failed
    if (!hasPermission(membership.role, "fail_decision")) {
      throw new Error("Insufficient permissions to mark decision as failed");
    }

    // Fetch decision to verify it exists
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    // Parse and validate input
    const body = await request.json();
    const input = FailDecisionSchema.parse(body);

    try {
      // Mark as failed via lifecycle service
      const updated = await failDecision(
        decisionId,
        workspaceId,
        input.reason,
        userId
      );

      logger.info("Decision marked as failed via API", {
        decisionId,
        workspaceId,
        userId,
        reason: input.reason,
      });

      return {
        decisionId,
        status: updated.status,
        message: "Decision marked as failed",
        reason: input.reason,
      };
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        throw lifecycleError;
      }
      throw lifecycleError;
    }
  }
);

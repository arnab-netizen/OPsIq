import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@/infra/errors";
import { hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { executeDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";

/**
 * POST /api/decisions/[decisionId]/execute
 *
 * Execute an approved decision (APPROVED → EXECUTED)
 * Enforces: decision must be in APPROVED state
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const decisionId = params.decisionId;

    // Canonical wrapper verified workspace membership; re-fetch role for hasPermission check
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: actorId },
      select: { role: true },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace membership not found");
    }

    if (!hasPermission(membership.role, "execute")) {
      throw new ForbiddenError("Insufficient permissions to execute decision");
    }

    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
    if (!decision) {
      throw new ForbiddenError("Decision not found in this workspace");
    }

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const updated = await executeDecision(decisionId, workspaceId, actorId, idempotencyKey);

    logger.info("Decision executed via API", {
      decisionId,
      workspaceId,
      userId: actorId,
    });

    return {
      decisionId,
      status: updated.status,
      message: "Decision executed successfully",
    };
  },
  { requireWorkspace: true }
);

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@/infra/errors";
import { hasPermission } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { logger } from "@/infra/logger";
import { failDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";

const FailDecisionSchema = z.object({
  reason: z.string().min(1, "Failure reason is required"),
});

/**
 * POST /api/decisions/[decisionId]/fail
 *
 * Mark decision as failed (EXECUTED → FAILED)
 * Enforces: decision must be in EXECUTED state
 * Requires: reason for failure (mandatory)
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

    if (!hasPermission(membership.role, "fail_decision")) {
      throw new ForbiddenError("Insufficient permissions to mark decision as failed");
    }

    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
    if (!decision) {
      throw new ForbiddenError("Decision not found in this workspace");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const input = FailDecisionSchema.parse(body);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "failDecision",
      actorId,
      workspaceId,
      payload: { decisionId, workspaceId, reason: input.reason },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    try {
      const updated = await failDecision(decisionId, workspaceId, input.reason, actorId);

      logger.info("Decision marked as failed via API", {
        decisionId,
        workspaceId,
        userId: actorId,
        reason: input.reason,
      });

      const responseBody = {
        decisionId,
        status: updated.status,
        message: "Decision marked as failed",
        reason: input.reason,
      };

      await recordIdempotencyResponse(idempotencyKey, 200, responseBody, workspaceId);
      return responseBody;
    } catch (error) {
      await recordIdempotencyError(
        idempotencyKey,
        error instanceof Error ? error : new Error(String(error)),
        workspaceId
      );
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.DECISION_UPDATE] }
);

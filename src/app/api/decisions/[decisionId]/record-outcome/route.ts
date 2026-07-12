import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@/infra/errors";
import { hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { recordDecisionOutcome } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";

const RecordOutcomeSchema = z.object({
  actualOutcome: z.string().optional(),
  actualOutcomeValue: z.number().optional(),
  decisionAccuracy: z.number().optional(),
  decisionError: z.number().optional(),
  outcomeDelta: z.number().optional(),
  outcomeNotes: z.string().optional(),
});

/**
 * POST /api/decisions/[decisionId]/record-outcome
 *
 * Record outcome for executed decision (EXECUTED → OUTCOME_RECORDED)
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

    if (!hasPermission(membership.role, "record_outcome")) {
      throw new ForbiddenError("Insufficient permissions to record decision outcome");
    }

    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
    if (!decision) {
      throw new ForbiddenError("Decision not found in this workspace");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const outcomeData = RecordOutcomeSchema.parse(body);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "recordDecisionOutcome",
      actorId,
      workspaceId,
      payload: { decisionId, workspaceId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    try {
      const updated = await recordDecisionOutcome(decisionId, workspaceId, outcomeData, actorId);

      logger.info("Decision outcome recorded via API", {
        decisionId,
        workspaceId,
        userId: actorId,
        actualOutcome: outcomeData.actualOutcome,
        actualOutcomeValue: outcomeData.actualOutcomeValue,
      });

      const responseBody = {
        decisionId,
        status: updated.status,
        message: "Decision outcome recorded successfully",
        outcome: outcomeData,
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
  { requireWorkspace: true }
);

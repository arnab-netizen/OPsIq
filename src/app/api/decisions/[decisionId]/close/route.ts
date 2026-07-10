import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { closeDecision } from "@/services/decisions/decision-lifecycle.service";
import { logger } from "@/infra/logger";
import { ValidationError } from "@/infra/errors";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";

/**
 * POST /api/decisions/[decisionId]/close
 *
 * Close a decision (OUTCOME_RECORDED → CLOSED)
 * Enforces: DECISION_CLOSE capability required
 * Enforces: decision must be in OUTCOME_RECORDED state
 * Returns: 409 Conflict if transition not allowed
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "closeDecision",
      actorId: userId,
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
      // Close via lifecycle service
      const updated = await closeDecision(decisionId, workspaceId, userId);

      logger.info("Decision closed via API", {
        decisionId,
        workspaceId,
        userId,
      });

      const responseBody = {
        decisionId,
        status: updated.status,
        message: "Decision closed successfully",
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
  { requireCapabilities: ["DECISION_CLOSE"], requireWorkspace: true }
);

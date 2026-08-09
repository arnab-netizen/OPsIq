import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rejectDecision, type VerifiedRejectionInput } from "@/services/decision-validation/decision-acceptance.service";
import { logger } from "@/infra/logger";
import { ValidationError } from "@/infra/errors";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";

const RejectDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    // Parse and validate request body
    const body = await ctx.request!.json();
    const parsed = RejectDecisionSchema.parse(body);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "rejectDecision",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: { decisionId, workspaceId, reason: parsed.reason },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    const verifiedInput: VerifiedRejectionInput = {
      decisionId,
      engagementId: parsed.engagementId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedActorId: ctx.verifiedActorId,
      reason: parsed.reason,
    };

    try {
      const result = await rejectDecision(verifiedInput);

      logger.info("Decision rejection recorded", {
        decisionId,
        engagementId: parsed.engagementId,
        userId: ctx.verifiedActorId,
        reason: parsed.reason,
      });

      const serialized: Record<string, unknown> = {
        decisionId: result.decisionId,
        rejectedBy: result.rejectedBy,
        rejectedAt: result.rejectedAt instanceof Date
          ? result.rejectedAt.toISOString()
          : result.rejectedAt,
        reason: result.reason,
        auditEventId: result.auditEventId,
      };
      await recordIdempotencyResponse(idempotencyKey, 200, serialized, workspaceId);
      return result;
    } catch (error) {
      await recordIdempotencyError(
        idempotencyKey,
        error instanceof Error ? error : new Error(String(error)),
        workspaceId
      );
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.DECISION_REJECT], requireWorkspace: true }
);

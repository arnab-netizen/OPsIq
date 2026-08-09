import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { acceptDecision, type VerifiedAcceptanceInput } from "@/services/decision-validation/decision-acceptance.service";
import { logger } from "@/infra/logger";
import { ValidationError } from "@/infra/errors";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";

const AcceptDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  rationale: z.string().optional(),
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
    const parsed = AcceptDecisionSchema.parse(body);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "acceptDecision",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: { decisionId, workspaceId, engagementId: parsed.engagementId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    const verifiedInput: VerifiedAcceptanceInput = {
      decisionId,
      engagementId: parsed.engagementId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedActorId: ctx.verifiedActorId,
      rationale: parsed.rationale,
    };

    try {
      const result = await acceptDecision(verifiedInput);

      logger.info("Decision acceptance recorded", {
        decisionId,
        engagementId: parsed.engagementId,
        userId: ctx.verifiedActorId,
      });

      const serialized: Record<string, unknown> = {
        decisionId: result.decisionId,
        acceptedBy: result.acceptedBy,
        acceptedAt: result.acceptedAt instanceof Date
          ? result.acceptedAt.toISOString()
          : result.acceptedAt,
        rationale: result.rationale ?? null,
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
  { requireCapabilities: [CAPABILITIES.DECISION_ACCEPT], requireWorkspace: true }
);

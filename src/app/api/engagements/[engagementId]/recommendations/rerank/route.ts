import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { reRankRecommendationsInEngagement } from "@/services/recommendation";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "reRankRecommendations",
      actorId: ctx.verifiedActorId,
      payload: { engagementId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await reRankRecommendationsInEngagement(engagementId, ctx, ctx.verifiedWorkspaceId);
      await recordIdempotencyResponse(idempotencyKey, 200, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.RECOMMENDATION_APPROVE],
    requireWorkspace: true,
  }
);

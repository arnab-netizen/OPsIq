import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { reRankRecommendationsInEngagement } from "@/services/recommendation";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const POST = withEnforcementFull(async (request, context, params) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);
  const authContext = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_APPROVE,
    internalOnly: true,
  });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "reRankRecommendations",
    actorId: authContext.session.user.id,
    payload: { engagementId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
    const result = await reRankRecommendationsInEngagement(engagementId, canonicalContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 200, result);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});

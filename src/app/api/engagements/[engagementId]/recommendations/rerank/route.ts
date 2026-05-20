import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createServiceCapabilityContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { reRankRecommendationsInEngagement } from "@/services/recommendation";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const auditContext = createServiceCapabilityContext({
      capability: CAPABILITIES.RECOMMENDATION_APPROVE,
    });

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "reRankRecommendations",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: { engagementId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await reRankRecommendationsInEngagement(engagementId, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspaceId);
      return Response.json(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      throw error;
    }
  }, {
    requireCapabilities: [CAPABILITIES.RECOMMENDATION_APPROVE],
    requireWorkspace: true,
  }
);

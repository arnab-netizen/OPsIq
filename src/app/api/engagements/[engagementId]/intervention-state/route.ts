import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { createServiceCapabilityContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getInterventionState, transitionPhase } from "@/services/intervention-state";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { INTERVENTION_PHASES } from "@/domain/constants/statuses";

const transitionPhaseSchema = z.object({
  targetPhase: z.enum(INTERVENTION_PHASES),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const state = await getInterventionState(engagementId, ctx.verifiedWorkspaceId);
    return Response.json(state);
  },
  {
    requireCapabilities: [CAPABILITIES.INTERVENTION_VIEW],
    requireWorkspace: true,
  }
);

export const PUT = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, transitionPhaseSchema);

    const auditContext = createServiceCapabilityContext({
      capability: CAPABILITIES.INTERVENTION_MANAGE,
    });

    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "transitionPhase",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: { engagementId, ...body },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await transitionPhase(engagementId, body.targetPhase, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 200, result, auditContext, workspaceId);
      return Response.json(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.INTERVENTION_MANAGE],
    requireWorkspace: true,
  }
);

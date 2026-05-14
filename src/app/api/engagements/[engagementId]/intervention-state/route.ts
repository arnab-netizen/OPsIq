import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getInterventionState, transitionPhase } from "@/services/intervention-state";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { INTERVENTION_PHASES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const transitionPhaseSchema = z.object({
  targetPhase: z.enum(INTERVENTION_PHASES),
});

export const GET = withEnforcementFull(async (request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  // Get workspace ID from request
  const nextRequest = request as unknown as any;
  const workspaceId = nextRequest?.headers?.get?.("x-workspace-id");

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const state = await getInterventionState(engagementId, workspaceId);
  return Response.json(state);
});

export const PUT = withEnforcementFull(async (request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  // Get workspace ID from request
  const nextRequest = request as unknown as any;
  const workspaceId = nextRequest?.headers?.get?.("x-workspace-id");

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, transitionPhaseSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "transitionPhase",
    actorId: session.user.id,
    workspaceId,
    payload: { engagementId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
    const result = await transitionPhase(engagementId, body.targetPhase, canonicalContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 200, result, workspaceId);
    return Response.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, workspaceId);
    throw error;
  }
});

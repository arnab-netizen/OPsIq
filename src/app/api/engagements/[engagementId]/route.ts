import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { hasInternalAccess } from "@/policies/capability-check";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEngagementById, updateEngagement } from "@/services/engagement";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import {
  ENGAGEMENT_STATUSES,
  INTERVENTION_MODES,
  SERVICE_TIERS,
  ENGAGEMENT_MODES,
  HEALTH_STATUSES,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateEngagementSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  serviceTier: z.enum(SERVICE_TIERS).optional(),
  engagementMode: z.enum(ENGAGEMENT_MODES).optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  healthStatus: z.enum(HEALTH_STATUSES).optional(),
  status: z.enum(ENGAGEMENT_STATUSES).optional(),
  interventionMode: z.enum(INTERVENTION_MODES).optional(),
  version: z.number().int().min(1),
});

export const GET = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const engagement = await getEngagementById(engagementId, workspaceId, hasInternalAccess(policy));
  return Response.json(engagement);
});

export const PATCH = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  // Check for interventionPhase in raw request body to provide clear error
  const rawBody = await request.clone().json().catch(() => ({}));
  if ("interventionPhase" in rawBody) {
    return Response.json(
      {
        error: "interventionPhase updates are not allowed here. Use PATCH /engagements/[id]/intervention instead.",
      },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, updateEngagementSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "updateEngagement",
    actorId: session.user.id,
    payload: { engagementId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    await updateEngagement(engagementId, body, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);
    const updated = await getEngagementById(engagementId, workspaceId, hasInternalAccess(policy));
    await recordIdempotencyResponse(idempotencyKey, 200, updated);
    return Response.json(updated);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});

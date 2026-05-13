import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { hasInternalAccess } from "@/policies/capability-check";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEngagement, listEngagements } from "@/services/engagement";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { SERVICE_TIERS, ENGAGEMENT_MODES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError, UnauthorizedError, ForbiddenError } from "@/infra/errors";

const createEngagementSchema = z.object({
  title: z.string().min(1),
  clientId: z.string().uuid(),
  serviceTier: z.enum(SERVICE_TIERS),
  engagementMode: z.enum(ENGAGEMENT_MODES),
  interventionMode: z.enum(INTERVENTION_MODES),
  description: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  parentEngagementId: z.string().uuid().optional(),
});

const listEngagementsSchema = paginationSchema.extend({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  const { policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new UnauthorizedError("Workspace ID required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const params = parseSearchParams(request.url, listEngagementsSchema);
  const result = await listEngagements(workspaceId, params, hasInternalAccess(policy));

  return result;
});

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new UnauthorizedError("Workspace ID required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new UnauthorizedError("idempotency-key header required");
  }

  // Check capability: create_engagement
  const capabilityCheck = await assertCapability(workspaceId, "create_engagement");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("create_engagement", capabilityCheck.reason || "Plan limit exceeded");
  }

  const body = await parseRequestBody(request, createEngagementSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "createEngagement",
    actorId: session.user.id,
    workspaceId,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return idempotencyCheck.cachedResponse.body;
  }

  try {
    const result = await createEngagement(body, { session, policy }, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result, workspaceId);
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err, workspaceId);
    throw error;
  }
});

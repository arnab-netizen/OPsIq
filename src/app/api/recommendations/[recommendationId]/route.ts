import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getRecommendation, updateRecommendation } from "@/services/recommendation";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_TYPES,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateRecommendationSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  priority: z.enum(RECOMMENDATION_PRIORITIES).optional(),
  type: z.enum(RECOMMENDATION_TYPES).optional(),
  rationale: z.string().min(1).optional(),
  expectedImpact: z.string().optional(),
  estimatedEffort: z.string().optional(),
  targetMetric: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  status: z.enum(RECOMMENDATION_STATUSES).optional(),
  version: z.number().int().min(1),
});

export const GET = withEnforcementFull(async (request, { ctx }, params) => {
  // Authenticate + authorize (fail-closed)
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can(CAPABILITIES.RECOMMENDATION_VIEW)) {
    throw new ForbiddenError('Insufficient permissions to view recommendation');
  }

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

  const { recommendationId } = params;
  parseOrThrow(uuidSchema, recommendationId);

  const recommendation = await getRecommendation(recommendationId, workspaceId);
  return Response.json(recommendation);
});

export const PATCH = withEnforcementFull(async (request, { ctx }, params) => {
  // Authenticate + authorize (fail-closed)
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can(CAPABILITIES.RECOMMENDATION_APPROVE)) {
    throw new ForbiddenError('Insufficient permissions to approve recommendation');
  }
  const authContext: CanonicalAuthContext = {
    userId: policy.userId,
    workspaceId: policy.workspaceId,
    policy,
  };

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

  const { recommendationId } = params;
  parseOrThrow(uuidSchema, recommendationId);

  const body = await parseRequestBody(request, updateRecommendationSchema);
  await updateRecommendation(recommendationId, body, authContext, workspaceId);

  const updated = await getRecommendation(recommendationId, workspaceId);
  return Response.json(updated);
});

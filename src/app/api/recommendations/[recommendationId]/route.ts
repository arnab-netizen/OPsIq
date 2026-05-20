import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getRecommendation, updateRecommendation } from "@/services/recommendation";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  RECOMMENDATION_STATUSES,
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_TYPES,
} from "@/domain/constants/statuses";

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

export const GET = withCanonicalEnforcement(async (ctx, params) => {
  // Get workspace from verified context
  const workspaceId = nextRequest.headers.get("x-workspace-id");

  const { recommendationId } = params;
  parseOrThrow(uuidSchema, recommendationId);

  const recommendation = await getRecommendation(recommendationId, workspaceId);
  return Response.json(recommendation);
}, { requireCapabilities: [CAPABILITIES.RECOMMENDATION_VIEW], requireWorkspace: true });

export const PATCH = withCanonicalEnforcement(async (ctx, params) => {
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  const authContext: CanonicalAuthContext = {
    verifiedActorId: ctx.verifiedSessionSnapshot.actorId,
    verifiedActorType: ctx.verifiedActorType,
    verifiedActor: ctx.verifiedActor,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ctx.verifiedCapabilities,
    verifiedSessionSnapshot: ctx.verifiedSessionSnapshot,
    policy: ctx.policy,
  };

  const { recommendationId } = params;
  parseOrThrow(uuidSchema, recommendationId);

  const body = await parseRequestBody(ctx.request!, updateRecommendationSchema);
  await updateRecommendation(recommendationId, body, authContext, workspaceId);

  const updated = await getRecommendation(recommendationId, workspaceId);
  return Response.json(updated);
}, { requireCapabilities: [CAPABILITIES.RECOMMENDATION_APPROVE], requireWorkspace: true });

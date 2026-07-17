import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { requireCapability } from "@/policies/capability-check";
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
  why_now: z.string().min(10).max(500).optional(),
  cost_of_inaction: z.string().min(10).max(500).optional(),
  expected_metric: z.enum([
    "approval_rate",
    "processing_time",
    "customer_satisfaction",
    "error_rate",
    "throughput",
    "latency",
    "uptime",
    "cost_reduction",
  ]).optional(),
  expected_direction: z.enum(["INCREASE", "DECREASE", "STABILIZE"]).optional(),
  expected_target: z.string().min(1).optional(),
});

export const GET = withCanonicalEnforcement(async (ctx, params) => {
  // Authenticate + authorize (fail-closed)
  if (ctx.policy) {
    requireCapability(ctx.policy, CAPABILITIES.RECOMMENDATION_VIEW);
  }

  // Get workspace from verified context
  const workspaceId = ctx.verifiedWorkspaceId;

  const { recommendationId } = params;
  parseOrThrow(uuidSchema, recommendationId);

  const recommendation = await getRecommendation(recommendationId, workspaceId);
  return canonicalJson(recommendation, { status: 200 });
});

export const PATCH = withCanonicalEnforcement(async (ctx, params) => {
  // Authenticate + authorize (fail-closed)
  if (ctx.policy) {
    requireCapability(ctx.policy, CAPABILITIES.RECOMMENDATION_APPROVE);
  }
  const workspaceId = ctx.verifiedWorkspaceId;
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
  return canonicalJson(updated, { status: 200 });
});

import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
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

export const GET = withRequestContext(async (_request, context) => {
  const { recommendationId } = await context.params;
  parseOrThrow(uuidSchema, recommendationId);
  await withAuth({ capability: CAPABILITIES.RECOMMENDATION_VIEW });

  const recommendation = await getRecommendation(recommendationId);
  return Response.json(recommendation);
});

export const PATCH = withRequestContext(async (request, context) => {
  const { recommendationId } = await context.params;
  parseOrThrow(uuidSchema, recommendationId);
  const { session } = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_APPROVE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateRecommendationSchema);
  await updateRecommendation(recommendationId, body, session.user.id);

  const updated = await getRecommendation(recommendationId);
  return Response.json(updated);
});

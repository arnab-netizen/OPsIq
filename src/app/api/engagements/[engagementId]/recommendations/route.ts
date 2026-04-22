import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createRecommendation, listRecommendations } from "@/services/recommendation";
import { parseRequestBody, parseOrThrow, uuidSchema, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { RECOMMENDATION_PRIORITIES, RECOMMENDATION_STATUSES } from "@/domain/constants/statuses";
import { paginationSchema } from "@/lib/validation";

const createRecommendationSchema = z.object({
  findingId: z.string().uuid().optional(),
  shockEventId: z.string().uuid().optional(),
  priority: z.enum(RECOMMENDATION_PRIORITIES),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(RECOMMENDATION_STATUSES).optional(),
});

const listRecommendationSchema = paginationSchema.extend({
  priority: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const params = parseSearchParams(request.url, listRecommendationSchema);
  const result = await listRecommendations(engagementId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createRecommendationSchema);
  const result = await createRecommendation(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});

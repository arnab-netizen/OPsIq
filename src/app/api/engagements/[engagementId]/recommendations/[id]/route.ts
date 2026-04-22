import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getRecommendationById } from "@/services/recommendation";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const item = await getRecommendationById(id, engagementId);
  return Response.json(item);
});

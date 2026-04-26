import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { reRankRecommendationsInEngagement } from "@/services/recommendation";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const POST = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_APPROVE,
    internalOnly: true,
  });

  const result = await reRankRecommendationsInEngagement(engagementId, session.user.id);

  return Response.json(result);
});

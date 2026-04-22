import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getRecommendationsForEngagement } from "@/services/recommendation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  await withAuth();

  const recommendations = await getRecommendationsForEngagement(engagementId);
  return Response.json(recommendations);
});

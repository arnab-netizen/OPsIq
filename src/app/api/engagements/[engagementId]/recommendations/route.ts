import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { assertEngagementAccess } from "@/lib/visibility";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  const { session } = await withAuth();

  await assertEngagementAccess(session.user.id, engagementId);

  const recommendations = await getRecommendationsForEngagement(engagementId, session.user.id);
  return Response.json(recommendations);
});

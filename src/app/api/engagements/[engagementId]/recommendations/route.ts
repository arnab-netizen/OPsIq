import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { assertEngagementAccess } from "@/lib/visibility";

export const GET = withEnforcementFull(async (request, context, params) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { engagementId } = params;
  const { session } = await withAuth();

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const recommendations = await getRecommendationsForEngagement(engagementId, session.user.id, workspaceId);
  return Response.json(recommendations);
});

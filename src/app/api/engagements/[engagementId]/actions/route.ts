import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getActionsForEngagement } from "@/services/action";
import { assertEngagementAccess } from "@/lib/visibility";

export const GET = withRequestContext(async (request, context) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { engagementId } = await context.params;
  const { session } = await withAuth();

  await assertEngagementAccess(session.user.id, engagementId);

  const actions = await getActionsForEngagement(engagementId, session.user.id, workspaceId);
  return Response.json(actions);
});


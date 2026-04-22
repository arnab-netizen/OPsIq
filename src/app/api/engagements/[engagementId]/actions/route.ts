import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getActionsForEngagement } from "@/services/action";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  await withAuth();

  const actions = await getActionsForEngagement(engagementId);
  return Response.json(actions);
});


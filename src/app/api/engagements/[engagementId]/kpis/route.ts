import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getKPIsForEngagement } from "@/services/kpi";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  const { session } = await withAuth();

  await assertEngagementAccess(session.user.id, engagementId);

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { workspaceId: true },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const kpis = await getKPIsForEngagement(engagementId, engagement.workspaceId);
  return Response.json(kpis);
});

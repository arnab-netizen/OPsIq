import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { getKPIsForEngagement } from "@/services/kpi";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const GET = withEnforcementFull(async (_request, context, params) => {
  const { engagementId } = params;
  const { session } = await withAuth();

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { workspaceId: true },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  await assertEngagementAccess(session.user.id, engagementId, engagement.workspaceId);

  const kpis = await getKPIsForEngagement(engagementId, engagement.workspaceId);
  return Response.json(kpis);
});

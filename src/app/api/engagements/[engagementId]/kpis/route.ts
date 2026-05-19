import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getKPIsForEngagement } from "@/services/kpi";
import { assertEngagementAccess } from "@/lib/visibility";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;

    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { workspaceId: true },
    });
    if (!engagement) {
      throw new NotFoundError("Engagement", engagementId);
    }

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, engagement.workspaceId);

    const kpis = await getKPIsForEngagement(engagementId, engagement.workspaceId);
    return kpis;
  },
  { requireCapabilities: [CAPABILITIES.KPI_VIEW], requireWorkspace: true }
);

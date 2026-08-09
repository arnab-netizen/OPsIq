import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { engagementId } = params;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const recommendations = await getRecommendationsForEngagement(engagementId, ctx.verifiedActorId, workspaceId);
    return recommendations;
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.RECOMMENDATION_VIEW] });

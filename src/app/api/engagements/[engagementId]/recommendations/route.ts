import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const { engagementId } = params;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const recommendations = await getRecommendationsForEngagement(engagementId, ctx.verifiedActorId, workspaceId);
    return recommendations;
  },
  { requireCapabilities: [CAPABILITIES.RECOMMENDATION_VIEW], requireWorkspace: true }
);

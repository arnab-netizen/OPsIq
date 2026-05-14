import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.request!.headers.get("x-workspace-id") || "";
    const { engagementId } = params;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const recommendations = await getRecommendationsForEngagement(engagementId, ctx.verifiedActorId, workspaceId);
    return recommendations;
  }
);

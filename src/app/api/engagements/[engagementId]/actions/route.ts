import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getActionsForEngagement } from "@/services/action";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.request.headers.get("x-workspace-id") || "";
    const { engagementId } = params;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const actions = await getActionsForEngagement(engagementId, ctx.verifiedActorId, workspaceId);
    return actions;
  }
);
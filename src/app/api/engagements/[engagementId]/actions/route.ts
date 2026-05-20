import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getActionsForEngagement } from "@/services/action";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // R14: Use verified workspace from context, not x-workspace-id header
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const { engagementId } = params;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const actions = await getActionsForEngagement(engagementId, ctx.verifiedActorId, workspaceId);
    return actions;
  },
  // R14: Require capability - prevents unauthorized access
  { requireCapabilities: [CAPABILITIES.ACTION_VIEW], requireWorkspace: true }
);
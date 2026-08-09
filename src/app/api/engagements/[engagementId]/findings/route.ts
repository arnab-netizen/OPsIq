import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { listFindingsForEngagement } from "@/services/findings";
import { assertEngagementAccess } from "@/lib/visibility";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    const workspaceId = ctx.verifiedWorkspaceId;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const findings = await listFindingsForEngagement(engagementId, ctx.verifiedActorId, undefined, workspaceId);
    return findings;
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.FINDING_VIEW] });

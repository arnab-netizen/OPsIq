import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { calculateWorkspaceImpactSummary } from "@/services/business-impact/decision-impact.service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const summary = await calculateWorkspaceImpactSummary(workspaceId);
    return summary;
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

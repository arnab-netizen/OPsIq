import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { calculateDecisionImpact } from "@/services/business-impact/decision-impact.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const decisionId = params.id;
    const metrics = await calculateDecisionImpact(decisionId, workspaceId);
    return metrics;
  },
  { requireWorkspace: true }
);

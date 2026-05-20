import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { calculateDecisionImpact } from "@/services/business-impact/decision-impact.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceIdParam = ctx.request!.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      throw new Error("Workspace ID required");
    }

    const membership = await enforceWorkspaceScoping(ctx.request!, workspaceIdParam);
    if (!membership) {
      throw new Error("Unauthorized or invalid workspace");
    }

    const decisionId = params.id;
    const metrics = await calculateDecisionImpact(decisionId, workspaceIdParam);

    return metrics;
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);

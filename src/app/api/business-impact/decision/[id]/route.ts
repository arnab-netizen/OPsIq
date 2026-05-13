import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { calculateDecisionImpact } from "@/services/business-impact/decision-impact.service";

export const GET = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const session = await getSession();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      throw new Error("Workspace ID required");
    }

    const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
    if (!membership) {
      throw new Error("Unauthorized or invalid workspace");
    }

    const workspaceId = workspaceIdParam;
    const decisionId = params.id;

    const metrics = await calculateDecisionImpact(decisionId, workspaceId);

    return metrics;
  }
);

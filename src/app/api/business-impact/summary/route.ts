import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { calculateWorkspaceImpactSummary } from "@/services/business-impact/decision-impact.service";
import { UnauthorizedError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceIdParam = ctx.request!.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      throw new Error("Workspace ID required");
    }

    const membership = await enforceWorkspaceScoping(ctx.request!, workspaceIdParam);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }

    const summary = await calculateWorkspaceImpactSummary(workspaceIdParam);
    return summary;
  }
);

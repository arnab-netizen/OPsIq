import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { getControlSurface } from "@/services/control/control-surface.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceIdParam = ctx.request!.nextUrl.searchParams.get("workspaceId");
    if (!workspaceIdParam) {
      throw new Error("Workspace ID required");
    }

    const membership = await enforceWorkspaceScoping(ctx.request!, workspaceIdParam);
    if (!membership) {
      throw new Error("Unauthorized or invalid workspace");
    }

    const surface = await getControlSurface(workspaceIdParam);
    return surface;
  },
  { requireCapabilities: [CAPABILITIES.DECISION_VIEW], requireWorkspace: true }
);

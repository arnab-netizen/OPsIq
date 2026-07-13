import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { getControlSurface } from "@/services/control/control-surface.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const surface = await getControlSurface(ctx.verifiedWorkspaceId);
    return surface;
  },
  { requireWorkspace: true }
);

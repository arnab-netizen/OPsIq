import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { resolveEntitlements } from "@/services/entitlement.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // SECURITY: use the wrapper's membership-verified workspace, never a
    // client-supplied x-workspace-id header (which previously let any
    // authenticated user read any workspace's billing plan). See GAP-TEN-02.
    const workspaceId = ctx.verifiedWorkspaceId;

    const entitlements = await resolveEntitlements(workspaceId);

    return {
      plan: entitlements.plan,
      status: entitlements.status,
      currentPeriodStart: entitlements.currentPeriodStart,
      currentPeriodEnd: entitlements.currentPeriodEnd,
    };
  },
  { requireWorkspace: true },
);

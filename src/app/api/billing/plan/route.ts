import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { resolveEntitlements } from "@/services/entitlement.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    if (!workspaceId) {
      throw new Error("Workspace ID required (x-workspace-id header)");
    }

    const entitlements = await resolveEntitlements(workspaceId);

    return {
      plan: entitlements.plan,
      status: entitlements.status,
      currentPeriodStart: entitlements.currentPeriodStart,
      currentPeriodEnd: entitlements.currentPeriodEnd,
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { resolveEntitlements } from "@/services/entitlement.service";
import { CAPABILITIES } from "@/domain/constants/capabilities";

interface UsageDetail {
  key: string;
  current: number;
  limit: number | null;
  percentUsed: number | null;
  remaining: number | null;
}

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    const entitlements = await resolveEntitlements(ctx.verifiedWorkspaceId);

    // Map capabilities with usage data
    const usageDetails: UsageDetail[] = entitlements.capabilities.map(
      (capability) => {
        const usage = entitlements.usage.find((u) => u.key === capability.key);
        const current = usage?.value || 0;
        const limit = capability.limit;

        let percentUsed: number | null = null;
        let remaining: number | null = null;

        if (limit !== null) {
          percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;
          remaining = Math.max(0, limit - current);
        }

        return {
          key: capability.key,
          current,
          limit,
          percentUsed,
          remaining,
        };
      }
    );

    return {
      plan: {
        id: entitlements.plan.id,
        name: entitlements.plan.name,
      },
      period: {
        start: entitlements.currentPeriodStart,
        end: entitlements.currentPeriodEnd,
      },
      usage: usageDetails,
    };
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
    requireWorkspace: true,
  }
);

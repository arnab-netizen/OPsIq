/**
 * PATCH /api/growth/pricing-tiers/[tierId]/approve
 *
 * Owner-approves a price tier for operational use.
 * Sets approvalStatus=approved, records approvedBy/approvedAt.
 * Only the tier owner's workspace can approve — workspace isolation enforced by service layer.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PricingEngine } from "@/services/growth/pricing-engine";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.tierId);
    const tier = await PricingEngine.approveTier(
      ctx.verifiedWorkspaceId,
      params.tierId,
      ctx.verifiedActorId
    );
    return canonicalJson(tier, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);

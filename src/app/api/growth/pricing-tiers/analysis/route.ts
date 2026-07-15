/**
 * GET /api/growth/pricing-tiers/analysis
 *
 * Returns gap analysis, overlap detection, and margin summary for the workspace's price tiers.
 * Pure-function analysis over persisted tier data — no additional DB writes.
 * Only ACTIVE tiers participate in gap/overlap detection.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { PricingEngine } from "@/services/growth/pricing-engine";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const tiers = await PricingEngine.listTiers(ctx.verifiedWorkspaceId);
    const activeTiers = tiers.filter((t) => t.status === "ACTIVE");

    const domainTiers = activeTiers.map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      entryPrice: t.entryPrice,
      maxPrice: t.maxPrice,
      targetMargin: t.computedMargin ?? 0.5,
      features: t.features,
      activationDate: t.effectiveFrom ?? t.createdAt,
      status: "ACTIVE" as const,
    }));

    const gapAnalysis = PricingEngine.analyzeGaps(ctx.verifiedWorkspaceId, domainTiers);

    const tiersWithMargin = activeTiers.filter((t) => t.computedMargin !== null);
    const avgActiveMargin =
      tiersWithMargin.length > 0
        ? tiersWithMargin.reduce((sum, t) => sum + (t.computedMargin as number), 0) / tiersWithMargin.length
        : null;

    const marginSummary = {
      tierCount: tiers.length,
      activeTierCount: activeTiers.length,
      tiersWithMarginData: tiersWithMargin.length,
      avgActiveMargin,
    };

    return canonicalJson({ gapAnalysis, marginSummary, tiers }, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

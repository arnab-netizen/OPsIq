/**
 * POST /api/owner/pricing-analysis — Business Pricing Analytics (Module P1).
 *
 * Per-unit economics analysis: contribution margin, minimum viable price, margin
 * floor, discount safety gate, and optional two-segment profitability comparison
 * (e.g. B2B vs retail). Pure analysis — no persistence required.
 *
 * workspaceId is taken from the canonical session context (never from the body)
 * so tenants cannot cross-read each other's pricing analysis.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (pricingAnalysisRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { pricingAnalysisRequestSchema } from "@/domain/owner-finance/pricing-analysis.validation";
import {
  contributionMargin,
  contributionMarginPct,
  isLossMaking,
  minimumViablePrice,
  marginFloorPrice,
  assessDiscountSafety,
  summarizeSegment,
  compareSegmentProfitability,
  profitPerLabourHour,
  profitPerMachineHour,
  profitPerDeliveryKm,
  type OrderEconomicsInput,
} from "@/domain/owner-finance/unit-economics";

const DEFAULT_TARGET_MARGIN_PCT = 0.20;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { order, resourceUsage, targetMarginPct, proposedPrice, segments } =
      await parseRequestBody(ctx.request!, pricingAnalysisRequestSchema);

    const target = targetMarginPct ?? DEFAULT_TARGET_MARGIN_PCT;

    // Core unit economics
    const cm = contributionMargin(order);
    const cmPct = contributionMarginPct(order);
    const lossMaking = isLossMaking(order);
    const minViablePrice = minimumViablePrice(
      order.revenue - cm, // directCost = revenue - cm
      target
    );
    const floorPrice = marginFloorPrice(order.revenue - cm, target);

    // Per-resource profitability (only when resource usage provided)
    const perLabourHour = resourceUsage ? profitPerLabourHour(order, resourceUsage) : null;
    const perMachineHour = resourceUsage ? profitPerMachineHour(order, resourceUsage) : null;
    const perDeliveryKm = resourceUsage ? profitPerDeliveryKm(order, resourceUsage) : null;

    // Discount safety (only when a proposed price is given)
    const discountSafety = proposedPrice !== undefined
      ? assessDiscountSafety(order.revenue - cm, proposedPrice, target)
      : null;

    // Segment comparison (only when two segments provided)
    let segmentComparison = null;
    if (segments) {
      const segA = summarizeSegment(segments[0].name, segments[0].orders as OrderEconomicsInput[]);
      const segB = summarizeSegment(segments[1].name, segments[1].orders as OrderEconomicsInput[]);
      segmentComparison = {
        segments: [segA, segB],
        comparison: compareSegmentProfitability(segA, segB),
      };
    }

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      order: {
        contributionMargin: cm,
        contributionMarginPct: cmPct,
        lossMaking,
        minimumViablePrice: minViablePrice,
        marginFloorPrice: floorPrice,
        targetMarginPct: target,
        perLabourHour,
        perMachineHour,
        perDeliveryKm,
      },
      discountSafety,
      segmentComparison,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);

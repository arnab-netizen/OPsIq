/**
 * Jarvis 360 Slice 2 — margin-safety promotion gate (pure).
 *
 * Audit finding: below-margin discounts/price-cuts were flagged but never blocked;
 * `assessDiscountSafety`/`marginFloorPrice` existed but were uncalled. This gate
 * blocks a PRICING-sensitive recommendation (discount / price change) when the
 * business's current gross margin is already below a floor, unless the workspace
 * has an audited owner opt-out (Slice 0). Non-pricing recs are unaffected here
 * (cash/finance handled by the cash-safety gate).
 *
 * Reuses the existing RecommendationSensitivity taxonomy. Pure: no DB/I/O.
 */

import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

/** Default gross-margin floor (percent) below which discounting is unsafe. */
export const DEFAULT_MARGIN_FLOOR_PCT = 15;

export enum MarginSafetyOutcome {
  ALLOWED = "ALLOWED",
  BLOCKED_BELOW_FLOOR = "BLOCKED_BELOW_FLOOR",
}

export interface MarginSafetyGateResult {
  outcome: MarginSafetyOutcome;
  allowed: boolean;
  reason: string;
  grossMarginPct: number | null;
  marginFloorPct: number;
}

/**
 * Decide whether a recommendation may be promoted given current gross margin.
 * Only PRICING-sensitive recommendations are gated; a known margin below the floor
 * blocks. Unknown margin is left to the input-quality gate (avoid double-blocking).
 */
export function evaluateMarginSafety(
  grossMarginPct: number | null,
  sensitivity: RecommendationSensitivity,
  marginFloorPct: number = DEFAULT_MARGIN_FLOOR_PCT
): MarginSafetyGateResult {
  const allow = (reason: string): MarginSafetyGateResult => ({
    outcome: MarginSafetyOutcome.ALLOWED,
    allowed: true,
    reason,
    grossMarginPct,
    marginFloorPct,
  });

  if (sensitivity !== RecommendationSensitivity.PRICING_SENSITIVE) {
    return allow("Not a pricing-sensitive recommendation; margin gate does not apply.");
  }
  if (grossMarginPct === null) {
    return allow("Gross margin unknown; deferred to the input-quality gate.");
  }
  if (grossMarginPct < marginFloorPct) {
    return {
      outcome: MarginSafetyOutcome.BLOCKED_BELOW_FLOOR,
      allowed: false,
      reason: `Pricing/discount recommendation blocked: gross margin ${grossMarginPct}% is below the ${marginFloorPct}% floor.`,
      grossMarginPct,
      marginFloorPct,
    };
  }
  return allow(`Gross margin ${grossMarginPct}% clears the ${marginFloorPct}% floor.`);
}

/** Thrown when current margin is too low to promote a pricing recommendation. */
export class MarginSafetyGateError extends Error {
  readonly code = "MARGIN_SAFETY_GATE_BLOCKED";
  readonly grossMarginPct: number | null;
  readonly marginFloorPct: number;
  constructor(recommendationId: string, result: MarginSafetyGateResult) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${result.reason}`);
    this.name = "MarginSafetyGateError";
    this.grossMarginPct = result.grossMarginPct;
    this.marginFloorPct = result.marginFloorPct;
  }
}

/** Guard the recommendation service; throws MarginSafetyGateError when blocked. */
export function assertMarginSafetyForPromotion(
  grossMarginPct: number | null,
  sensitivity: RecommendationSensitivity,
  recommendationId: string,
  marginFloorPct: number = DEFAULT_MARGIN_FLOOR_PCT
): void {
  const result = evaluateMarginSafety(grossMarginPct, sensitivity, marginFloorPct);
  if (!result.allowed) throw new MarginSafetyGateError(recommendationId, result);
}

/** Pure gross-margin percent from revenue + COGS (mirrors owner-finance/metrics). */
export function grossMarginPctFrom(revenue: number | null, costOfGoods: number | null): number | null {
  if (revenue === null || costOfGoods === null || revenue === 0) return null;
  return Math.round(((revenue - costOfGoods) / revenue) * 1000) / 10;
}

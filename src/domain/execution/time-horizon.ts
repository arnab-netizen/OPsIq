/**
 * Module 37 — Time-Horizon Trade-off (pure domain core).
 *
 * Many business actions trade short-term pain for long-term gain (or vice versa).
 * M37 evaluates the time-horizon trade-off of a recommendation so an owner in
 * survival mode is not pushed into long-payoff actions they cannot afford now,
 * and so genuinely strategic actions are not rejected just because they cost in
 * the short term. Pure + deterministic.
 */

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export type TimeHorizon = "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

/**
 * Classify a payback/duration window into a time horizon.
 * <=7 IMMEDIATE, <=30 SHORT_TERM, <=180 MEDIUM_TERM, else LONG_TERM.
 * Non-positive / non-finite days are treated as 0 (IMMEDIATE).
 */
export function horizonFromDays(days: number): TimeHorizon {
  const d = n(days);
  if (d <= 7) return "IMMEDIATE";
  if (d <= 30) return "SHORT_TERM";
  if (d <= 180) return "MEDIUM_TERM";
  return "LONG_TERM";
}

export type OwnerSurvivalPressure = "NONE" | "ELEVATED" | "CRITICAL";

export interface TradeoffInput {
  shortTermCost: number;
  longTermBenefit: number;
  paybackDays: number;
  ownerSurvivalPressure: OwnerSurvivalPressure;
}

export type NetLeaning =
  | "SHORT_TERM_FAVORED"
  | "LONG_TERM_FAVORED"
  | "BALANCED";

export type TradeoffRecommendation =
  | "PROCEED"
  | "DEFER_UNTIL_STABLE"
  | "REJECT";

export interface TradeoffResult {
  horizon: TimeHorizon;
  netLeaning: NetLeaning;
  affordableNow: boolean;
  recommendation: TradeoffRecommendation;
  rationale: string;
}

/** A horizon is "long" (strategically distant) when MEDIUM_TERM or LONG_TERM. */
function isLongHorizon(h: TimeHorizon): boolean {
  return h === "MEDIUM_TERM" || h === "LONG_TERM";
}

/**
 * Benefit/cost ratio of long-term benefit vs short-term cost.
 *
 * Guard: when shortTermCost is non-positive (no real short-term cost) the ratio
 * is undefined, so we return `null` (chosen, documented convention) rather than
 * an Infinity sentinel. Callers treat `null` as "no meaningful trade-off cost".
 */
export function benefitCostRatio(input: TradeoffInput): number | null {
  const cost = n(input.shortTermCost);
  if (cost <= 0) return null;
  return n(input.longTermBenefit) / cost;
}

/**
 * Assess the time-horizon trade-off of a recommendation.
 *
 * Rules:
 * - When ownerSurvivalPressure is CRITICAL, any long-horizon / long-payback
 *   action => DEFER_UNTIL_STABLE (affordableNow = false): the owner cannot fund
 *   a distant payoff while fighting for survival now.
 * - REJECT when the long-term benefit does not exceed the short-term cost AND
 *   the horizon is long: paying now for a distant non-improving payoff.
 * - Otherwise PROCEED. netLeaning is driven by the benefit/cost ratio.
 */
export function assessTimeHorizonTradeoff(input: TradeoffInput): TradeoffResult {
  const horizon = horizonFromDays(input.paybackDays);
  const longHorizon = isLongHorizon(horizon);
  const cost = n(input.shortTermCost);
  const benefit = n(input.longTermBenefit);
  const ratio = benefitCostRatio(input);

  // netLeaning driven by benefit/cost ratio. When there is no short-term cost
  // (ratio === null) and there is benefit, the action favors the long term.
  let netLeaning: NetLeaning;
  if (ratio === null) {
    netLeaning = benefit > 0 ? "LONG_TERM_FAVORED" : "BALANCED";
  } else if (ratio > 1.25) {
    netLeaning = "LONG_TERM_FAVORED";
  } else if (ratio < 0.8) {
    netLeaning = "SHORT_TERM_FAVORED";
  } else {
    netLeaning = "BALANCED";
  }

  // REJECT: long horizon and the long-term benefit fails to beat the short-term cost.
  if (longHorizon && benefit <= cost) {
    return {
      horizon,
      netLeaning,
      affordableNow: false,
      recommendation: "REJECT",
      rationale: `Long-horizon action (${horizon}) where long-term benefit (${benefit}) does not exceed short-term cost (${cost}); not worth the trade-off.`,
    };
  }

  // CRITICAL survival pressure: defer any long-horizon / long-payback action.
  if (input.ownerSurvivalPressure === "CRITICAL" && longHorizon) {
    return {
      horizon,
      netLeaning,
      affordableNow: false,
      recommendation: "DEFER_UNTIL_STABLE",
      rationale: `Owner under CRITICAL survival pressure cannot fund a ${horizon} payoff now; defer until stable.`,
    };
  }

  return {
    horizon,
    netLeaning,
    affordableNow: true,
    recommendation: "PROCEED",
    rationale: `Horizon ${horizon}, net leaning ${netLeaning}; affordable under ${input.ownerSurvivalPressure} survival pressure.`,
  };
}

/** Thrown when a time-horizon trade-off is not affordable now (defer/reject). */
export class UnaffordableHorizonError extends Error {
  readonly code = "UNAFFORDABLE_HORIZON";
  readonly recommendation: TradeoffRecommendation;
  readonly rationale: string;
  constructor(ref: string, recommendation: TradeoffRecommendation, rationale: string) {
    super(`Time-horizon action ${ref} blocked (${recommendation}): ${rationale}`);
    this.name = "UnaffordableHorizonError";
    this.recommendation = recommendation;
    this.rationale = rationale;
  }
}

/**
 * Guard: throws UnaffordableHorizonError when the assessed recommendation is
 * DEFER_UNTIL_STABLE or REJECT. Passes silently on PROCEED.
 */
export function assertHorizonAffordable(input: TradeoffInput, ref: string): void {
  const r = assessTimeHorizonTradeoff(input);
  if (r.recommendation !== "PROCEED") {
    throw new UnaffordableHorizonError(ref, r.recommendation, r.rationale);
  }
}

/**
 * Owner Strategy & Scenario Planning (Module 8) — deterministic scenario
 * calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Money/period outputs return `null` when not
 * computable from the provided inputs; nothing is invented. Composite scores are
 * bounded 0..100. Strategy scores ONE option's safe upside (attractiveness),
 * downside risk, and opportunity magnitude so the spine can rank options.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  StrategySnapshotInput,
  StrategyDerivedMetrics,
  StrategyRawMetrics,
  StrategyState,
  StrategyTier,
} from "./types";
import {
  resolveStrategyThresholds,
  RISK_LEVEL_SPREAD,
  RISK_LEVEL_BASE_SCORE,
  type StrategyThresholds,
} from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

/** Display rounding to 1 decimal. Presentation only — never an input to a business rule. */
function round1(x: number): number {
  return Math.round(x * 10) / 10 || 0; // `|| 0` normalises −0 so a display value never reads "-0"
}

/** Display rounding to 2 decimals. Presentation only — never an input to a business rule. */
function round2(x: number): number {
  return Math.round(x * 100) / 100 || 0;
}

function roundOrNull(x: number | null, round: (v: number) => number): number | null {
  return x === null ? null : round(x);
}

/**
 * Decision precision: 12 significant digits relative to the magnitude of the operands.
 *
 * Money inputs are decimal amounts but are held as binary doubles, so exact decimal results
 * pick up representation error (16384.1 − 6384.1 = 10000.000000000002; 1.5 × 0.6 − 0.9 =
 * −1.1e-16). Compared against inclusive/strict thresholds unmodified, that noise flips a result
 * that is exactly ON a threshold. This removes the noise only: 12 significant digits is ~1000×
 * coarser than double error (~1e-15 relative after a few operations) and far finer than any real
 * amount (at ₹1,00,00,000 it still resolves a thousandth of a rupee). It is NOT display rounding.
 * `scale` is the magnitude of the operands (cancellation in `a − b` is judged against max(|a|,|b|),
 * so a difference that is pure noise becomes exactly 0); ratios use their own magnitude.
 */
const DECISION_SIGNIFICANT_DIGITS = 12;

export function toDecisionPrecision(x: number, scale: number = x): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const magnitude = Math.abs(scale) > 0 && Number.isFinite(scale) ? Math.abs(scale) : Math.abs(x);
  const decimals = DECISION_SIGNIFICANT_DIGITS - Math.ceil(Math.log10(magnitude));
  if (decimals > 100) return x; // below toFixed's range: already far beyond decision precision
  if (decimals < 0) {
    const step = 10 ** -decimals;
    return Math.round(x / step) * step || 0;
  }
  return Number(x.toFixed(decimals)) || 0; // `|| 0` normalises −0
}

// --- scenario economics -------------------------------------------------------
//
// Mathematical contract (Phase 1 calculation integrity):
//  - Units: `expectedRevenueChange` and `costChange` are MONTHLY amounts in the snapshot
//    currency; `investmentRequired` and `cashAvailable` are one-off amounts. ROI annualises the
//    monthly profit change (×12); payback is expressed in months.
//  - Every `raw*` function returns the value at DECISION precision (toDecisionPrecision: float
//    noise removed, nothing else). Business rules (verdict, findings,
//    composite scores) must only ever read raw values. The exported non-raw functions are the
//    display values — the raw value rounded for presentation — and must never feed a rule.
//  - `null` means "not computable from the provided inputs"; nothing is invented.

/** Monthly profit change = revenue change − cost change (full precision). */
export function rawBaseMonthlyProfitDelta(input: StrategySnapshotInput): number | null {
  const rev = num(input.expectedRevenueChange);
  const cost = num(input.costChange);
  if (rev === null || cost === null) return null;
  return toDecisionPrecision(rev - cost, Math.max(Math.abs(rev), Math.abs(cost)));
}

/**
 * Scenario range (full precision). The owner-rated risk level applies a symmetric spread to the
 * REVENUE change only; cost changes are treated as certain (a documented limitation of the
 * current model, not changed here). Both candidate outcomes are computed and ordered, so the
 * worst case is always the lower result and the best case the higher one — for a negative
 * revenue change `revenue × (1 + spread)` is the LOWER outcome, not the higher one.
 */
export function rawScenarioRange(input: StrategySnapshotInput): { worst: number; best: number } | null {
  const rev = num(input.expectedRevenueChange);
  const cost = num(input.costChange);
  if (rev === null || cost === null || !input.riskLevel) return null;
  const spread = RISK_LEVEL_SPREAD[input.riskLevel];
  // The two candidates: revenue shrunk by the spread, and revenue grown by it. Which one is the
  // worse outcome depends on the sign of the revenue change, so neither is named "worst" here.
  const scale = Math.max(Math.abs(rev) * (1 + spread), Math.abs(cost));
  const revenueMinusSpread = toDecisionPrecision(rev * (1 - spread) - cost, scale);
  const revenuePlusSpread = toDecisionPrecision(rev * (1 + spread) - cost, scale);
  return {
    worst: Math.min(revenueMinusSpread, revenuePlusSpread),
    best: Math.max(revenueMinusSpread, revenuePlusSpread),
  };
}

/** Annual ROI % = monthly profit change × 12 ÷ investment × 100 (full precision). */
export function rawRoiAnnualPct(input: StrategySnapshotInput): number | null {
  const investment = num(input.investmentRequired);
  const base = rawBaseMonthlyProfitDelta(input);
  if (investment === null || base === null) return null;
  if (investment <= 0) return null; // no-capital move — ROI ratio is not applicable
  return toDecisionPrecision(((base * 12) / investment) * 100);
}

/** Payback in months = investment ÷ monthly profit change (full precision). */
export function rawPaybackMonths(input: StrategySnapshotInput): number | null {
  const investment = num(input.investmentRequired);
  const base = rawBaseMonthlyProfitDelta(input);
  if (investment === null) return null;
  if (investment <= 0) return 0; // recovered immediately — no capital at risk
  if (base !== null && base > 0) return toDecisionPrecision(investment / base);
  return null; // never pays back
}

/** Affordability = cash available ÷ investment (full precision). */
export function rawAffordabilityRatio(input: StrategySnapshotInput): number | null {
  const cash = num(input.cashAvailable);
  const investment = num(input.investmentRequired);
  if (cash === null || investment === null || investment <= 0) return null;
  return toDecisionPrecision(cash / investment);
}

/** All full-precision decision values for one option. */
export function rawStrategyMetrics(input: StrategySnapshotInput): StrategyRawMetrics {
  const range = rawScenarioRange(input);
  return {
    baseMonthlyProfitDelta: rawBaseMonthlyProfitDelta(input),
    bestMonthlyProfitDelta: range ? range.best : null,
    worstMonthlyProfitDelta: range ? range.worst : null,
    roiAnnualPct: rawRoiAnnualPct(input),
    paybackMonths: rawPaybackMonths(input),
    affordabilityRatio: rawAffordabilityRatio(input),
  };
}

// Display values (rounded raw values). Presentation only.

export function baseMonthlyProfitDelta(input: StrategySnapshotInput): number | null {
  return roundOrNull(rawBaseMonthlyProfitDelta(input), round1);
}

export function bestMonthlyProfitDelta(input: StrategySnapshotInput): number | null {
  const range = rawScenarioRange(input);
  return range ? round1(range.best) : null;
}

export function worstMonthlyProfitDelta(input: StrategySnapshotInput): number | null {
  const range = rawScenarioRange(input);
  return range ? round1(range.worst) : null;
}

export function roiAnnualPct(input: StrategySnapshotInput): number | null {
  return roundOrNull(rawRoiAnnualPct(input), round1);
}

/** Whether a positive investment can never be recovered (non-positive base). */
function neverPaysBack(input: StrategySnapshotInput): boolean {
  const investment = num(input.investmentRequired);
  const base = rawBaseMonthlyProfitDelta(input);
  return investment !== null && investment > 0 && base !== null && base <= 0;
}

export function paybackMonths(input: StrategySnapshotInput): number | null {
  return roundOrNull(rawPaybackMonths(input), round1);
}

export function affordabilityRatio(input: StrategySnapshotInput): number | null {
  return roundOrNull(rawAffordabilityRatio(input), round2);
}

export function breakEvenRevenueDelta(input: StrategySnapshotInput): number | null {
  const cost = num(input.costChange);
  if (cost === null) return null;
  return round1(cost); // monthly revenue must rise by the added cost to break even
}

/**
 * The value to SHOW next to a rule outcome (finding `sourceValue` / evidence). Normally the display
 * value; but when display rounding would contradict the rule (e.g. raw affordability 0.9993 fails
 * `< 1` yet displays as 1), the raw value is shown at 8 significant digits (or in full if that is
 * still contradictory) so the shown number always agrees with the decision the rule made.
 */
export function ruleConsistentValue(raw: number, display: number, rule: (v: number) => boolean): number {
  const holds = rule(raw);
  if (rule(display) === holds) return display;
  const precise = Number(raw.toPrecision(8));
  return rule(precise) === holds ? precise : raw;
}

// --- risk signals ------------------------------------------------------------

interface StrategyRiskSignals {
  weakRoi: boolean;
  criticalRoi: boolean;
  negativeBaseCase: boolean;
  negativeWorstCase: boolean;
  longPayback: boolean;
  criticalPayback: boolean;
  unaffordable: boolean;
  criticallyUnaffordable: boolean;
  highRisk: boolean;
}

function deriveRiskSignals(input: StrategySnapshotInput, t: StrategyThresholds): StrategyRiskSignals {
  // Full-precision values only — display rounding must never move a rule across a threshold.
  const raw = rawStrategyMetrics(input);
  const roi = raw.roiAnnualPct;
  const base = raw.baseMonthlyProfitDelta;
  const worst = raw.worstMonthlyProfitDelta;
  const payback = raw.paybackMonths;
  const afford = raw.affordabilityRatio;
  const never = neverPaysBack(input);
  const negativeBaseCase = base !== null && base <= 0;
  return {
    negativeBaseCase,
    criticalRoi: negativeBaseCase || (roi !== null && roi < t.criticalRoiPct),
    weakRoi: roi !== null && roi >= t.criticalRoiPct && roi < t.lowRoiPct,
    negativeWorstCase: worst !== null && worst < 0,
    longPayback: payback !== null && payback > t.longPaybackMonths,
    criticalPayback: never || (payback !== null && payback > t.criticalPaybackMonths),
    unaffordable: afford !== null && afford < t.minAffordabilityRatio,
    criticallyUnaffordable: afford !== null && afford < t.criticalAffordabilityRatio,
    highRisk: input.riskLevel === "high",
  };
}

// --- composite scores --------------------------------------------------------

export function strategyRiskScore(input: StrategySnapshotInput, t: StrategyThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = input.riskLevel ? RISK_LEVEL_BASE_SCORE[input.riskLevel] : 50; // missing risk → uncertain
  if (s.criticalRoi) score += 20;
  if (s.negativeWorstCase) score += 10;
  if (s.criticalPayback) score += 15;
  else if (s.longPayback) score += 8;
  if (s.criticallyUnaffordable) score += 20;
  else if (s.unaffordable) score += 10;
  return clampScore(score);
}

export function strategyOpportunityScore(input: StrategySnapshotInput): number {
  let score = 0;
  const roi = rawRoiAnnualPct(input);
  if (roi !== null && roi > 0) score += Math.min(roi / 4, 60);
  const base = rawBaseMonthlyProfitDelta(input);
  const currentRevenue = num(input.currentRevenue);
  if (base !== null && base > 0 && currentRevenue !== null && currentRevenue > 0) {
    score += Math.min((base / currentRevenue) * 100 * 2, 40);
  }
  return clampScore(score);
}

export function strategyHealthScore(input: StrategySnapshotInput, t: StrategyThresholds): number {
  const risk = strategyRiskScore(input, t);
  const opportunity = strategyOpportunityScore(input);
  // Attractiveness blends safety (inverse risk) and upside — "highest safe upside".
  return clampScore(Math.round(0.6 * (100 - risk) + 0.4 * opportunity));
}

// --- strategy state ----------------------------------------------------------

export function strategyState(
  input: StrategySnapshotInput,
  t: StrategyThresholds,
  dataConfidenceScore: number
): StrategyState {
  const s = deriveRiskSignals(input, t);

  if (s.criticalRoi || s.negativeBaseCase || s.criticallyUnaffordable) return "AVOID";
  if (s.negativeWorstCase || s.criticalPayback || s.unaffordable || s.highRisk) return "RISKY";
  // Not enough trustworthy data to assert a strong option → caution.
  if (dataConfidenceScore < 50) return "MARGINAL";
  if (s.weakRoi || s.longPayback) return "MARGINAL";
  const roi = rawRoiAnnualPct(input);
  const base = rawBaseMonthlyProfitDelta(input);
  if (roi === null) return base !== null && base > 0 ? "STRONG_GO" : "GO"; // no-capital positive move
  return roi >= t.strongRoiPct ? "STRONG_GO" : "GO";
}

export function strategyTier(state: StrategyState): StrategyTier {
  switch (state) {
    case "AVOID":
      return "avoid";
    case "RISKY":
      return "caution";
    case "MARGINAL":
      return "consider";
    case "GO":
    case "STRONG_GO":
      return "pursue";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic scenario metric set for one option. Does not
 * mutate `input`. Missing/invalid inputs yield `null` outputs + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeStrategyMetrics(
  input: StrategySnapshotInput,
  opts: { now?: Date } = {}
): StrategyDerivedMetrics {
  const t = resolveStrategyThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = strategyState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    baseMonthlyProfitDelta: baseMonthlyProfitDelta(input),
    bestMonthlyProfitDelta: bestMonthlyProfitDelta(input),
    worstMonthlyProfitDelta: worstMonthlyProfitDelta(input),
    roiAnnualPct: roiAnnualPct(input),
    paybackMonths: paybackMonths(input),
    cashRequirement: num(input.investmentRequired),
    affordabilityRatio: affordabilityRatio(input),
    breakEvenRevenueDelta: breakEvenRevenueDelta(input),
    raw: rawStrategyMetrics(input),

    strategyHealthScore: strategyHealthScore(input, t),
    strategyRiskScore: strategyRiskScore(input, t),
    strategyOpportunityScore: strategyOpportunityScore(input),
    dataConfidenceScore: confidence.dataConfidenceScore,

    strategyState: state,
    strategyTier: strategyTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}

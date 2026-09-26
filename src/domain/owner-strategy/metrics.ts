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

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// --- scenario economics ------------------------------------------------------

export function baseMonthlyProfitDelta(input: StrategySnapshotInput): number | null {
  const rev = num(input.expectedRevenueChange);
  const cost = num(input.costChange);
  if (rev === null || cost === null) return null;
  return round1(rev - cost);
}

/**
 * Scenario range. The owner-rated risk level applies a symmetric spread to the REVENUE change
 * only; cost changes are treated as certain (a documented limitation of the current model). Both
 * candidate outcomes are computed and ordered, so the worst case is always the lower result and
 * the best case the higher one — for a negative revenue change `revenue × (1 + spread)` is the
 * LOWER outcome, not the higher one.
 */
export function rawScenarioRange(input: StrategySnapshotInput): { worst: number; best: number } | null {
  const rev = num(input.expectedRevenueChange);
  const cost = num(input.costChange);
  if (rev === null || cost === null || !input.riskLevel) return null;
  const spread = RISK_LEVEL_SPREAD[input.riskLevel];
  const lowRevenueOutcome = rev * (1 - spread) - cost;
  const highRevenueOutcome = rev * (1 + spread) - cost;
  return {
    worst: Math.min(lowRevenueOutcome, highRevenueOutcome),
    best: Math.max(lowRevenueOutcome, highRevenueOutcome),
  };
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
  const investment = num(input.investmentRequired);
  const base = baseMonthlyProfitDelta(input);
  if (investment === null || base === null) return null;
  if (investment <= 0) return null; // no-capital move — ROI ratio is not applicable
  return round1(((base * 12) / investment) * 100);
}

/** Whether a positive investment can never be recovered (non-positive base). */
function neverPaysBack(input: StrategySnapshotInput): boolean {
  const investment = num(input.investmentRequired);
  const base = baseMonthlyProfitDelta(input);
  return investment !== null && investment > 0 && base !== null && base <= 0;
}

export function paybackMonths(input: StrategySnapshotInput): number | null {
  const investment = num(input.investmentRequired);
  const base = baseMonthlyProfitDelta(input);
  if (investment === null) return null;
  if (investment <= 0) return 0; // recovered immediately — no capital at risk
  if (base !== null && base > 0) return round1(investment / base);
  return null; // never pays back
}

export function affordabilityRatio(input: StrategySnapshotInput): number | null {
  const cash = num(input.cashAvailable);
  const investment = num(input.investmentRequired);
  if (cash === null || investment === null || investment <= 0) return null;
  return Math.round((cash / investment) * 100) / 100;
}

export function breakEvenRevenueDelta(input: StrategySnapshotInput): number | null {
  const cost = num(input.costChange);
  if (cost === null) return null;
  return round1(cost); // monthly revenue must rise by the added cost to break even
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
  const roi = roiAnnualPct(input);
  const base = baseMonthlyProfitDelta(input);
  const worst = worstMonthlyProfitDelta(input);
  const payback = paybackMonths(input);
  const afford = affordabilityRatio(input);
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
  const roi = roiAnnualPct(input);
  if (roi !== null && roi > 0) score += Math.min(roi / 4, 60);
  const base = baseMonthlyProfitDelta(input);
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
  const roi = roiAnnualPct(input);
  const base = baseMonthlyProfitDelta(input);
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

    strategyHealthScore: strategyHealthScore(input, t),
    strategyRiskScore: strategyRiskScore(input, t),
    strategyOpportunityScore: strategyOpportunityScore(input),
    dataConfidenceScore: confidence.dataConfidenceScore,

    strategyState: state,
    strategyTier: strategyTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}

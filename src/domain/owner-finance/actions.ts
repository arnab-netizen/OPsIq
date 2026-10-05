/**
 * Owner Finance (Module 2 Slice 4) — recommendation → action planner.
 *
 * Pure: converts traceable recommendations into Spine `OwnerAction`s (status
 * "proposed"), computes a deterministic survival-weighted priority via the Spine
 * `calculateOwnerPriorityScore`, ranks them, and selects the recommended next
 * action. Persists nothing; does not alter findings/metrics.
 */
import {
  type OwnerAction,
  calculateOwnerPriorityScore,
  rankOwnerActions,
  clampScore,
  clampConfidence,
} from "@/domain/owner-spine/contracts";
import type { FinanceDiagnosisResult } from "./diagnosis";
import { buildFinanceRecommendations, FINANCE_REC_TEMPLATES, type FinanceRecommendation } from "./recommendations";
import { modifierAllowedForSeverity, type FinanceEffectivenessMap } from "./outcome-signals";

/** The persisted/in-memory facts the rationale is derived from (all already carried by a finding). */
export interface FinanceRationaleInput {
  findingCode: string;
  sourceMetric: string;
  sourceValue: number | null | undefined;
  threshold: number | null | undefined;
}

/** Deterministic, locale-independent formatting of an existing finite number (no arithmetic). */
function formatRationaleNumber(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

const BREAK_EVEN_TEXT =
  "Your sales this period are below your break-even amount \u2014 the level of sales needed to cover your costs.";

interface RationaleDefinition {
  /** The metric this finding's rule actually emits; any other metric yields no rationale. */
  metric: string;
  /** Plain-language rationale from the already-formatted value / threshold, or null. */
  text: (value: string | null, threshold: string | null) => string | null;
}

/** "<lead> <flag>" where the flag sentence is only added when the finding's own threshold is usable. */
const withFlag = (lead: string, flag: string | null): string => (flag ? `${lead} ${flag}` : lead);

/**
 * Finding-specific rationale semantics. Thresholds are shown ONLY where the finding's rule compared
 * the SAME quantity against that threshold; reference/umbrella thresholds (FIN_REFUND_REWORK_LEAKAGE,
 * FIN_OPP_RECEIVABLES_COLLECTION, FIN_OPP_LEAKAGE_REDUCTION, the data-quality ceiling of 100) and
 * monetary values (no safe currency context here) are deliberately never rendered. Thresholds are
 * described as what OpsIQ flags, never as the owner's final target (runway thresholds are
 * intermediate bands: 7 -> 30 -> 45 days).
 */
const RATIONALE_DEFINITIONS: Record<string, RationaleDefinition> = {
  FIN_NEGATIVE_GROSS_MARGIN: {
    metric: "grossMarginPct",
    text: (v, t) =>
      v === null ? null : withFlag(`Your gross margin is ${v}%. You are selling for less than the direct cost of what you sell.`, t === null ? null : `OpsIQ flags this when gross margin is below ${t}%.`),
  },
  FIN_NEGATIVE_NET_MARGIN: {
    metric: "netMarginPct",
    text: (v, t) =>
      v === null ? null : withFlag(`Your net margin is ${v}%. Your total costs are higher than your sales.`, t === null ? null : `OpsIQ flags this when net margin is below ${t}%.`),
  },
  FIN_BELOW_BREAK_EVEN: { metric: "revenue", text: () => BREAK_EVEN_TEXT },
  FIN_OPP_BREAK_EVEN_RECOVERY: { metric: "revenue", text: () => BREAK_EVEN_TEXT },
  FIN_INSOLVENT_RUNWAY: {
    metric: "cashRunwayDays",
    text: (v, t) =>
      v === null ? null : withFlag(`At your current rate of loss, your cash on hand would last about ${v} days.`, t === null ? null : `OpsIQ treats less than ${t} days as an emergency.`),
  },
  FIN_LOW_RUNWAY: {
    metric: "cashRunwayDays",
    text: (v, t) =>
      v === null ? null : withFlag(`At your current rate of loss, your cash on hand would last about ${v} days.`, t === null ? null : `OpsIQ flags this when it is below ${t} days.`),
  },
  FIN_LOW_ABSOLUTE_CASH: {
    metric: "cashDaysOfCosts",
    text: (v, t) =>
      v === null ? null : withFlag(`Your available cash would cover about ${v} days of your total costs.`, t === null ? null : `OpsIQ flags this when it is below ${t} days.`),
  },
  FIN_HIGH_FIXED_COST_BURDEN: {
    metric: "fixedCostBurdenPct",
    text: (v, t) => (v === null ? null : withFlag(`Your fixed costs are ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when they are above ${t}%.`)),
  },
  FIN_HIGH_PAYROLL_BURDEN: {
    metric: "payrollBurdenPct",
    text: (v, t) => (v === null ? null : withFlag(`Your payroll is ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when it is above ${t}%.`)),
  },
  FIN_HIGH_DEBT_PRESSURE: {
    metric: "debtServicePressurePct",
    text: (v, t) => (v === null ? null : withFlag(`Your loan repayments this period are ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when they are above ${t}%.`)),
  },
  FIN_OPP_DEBT_REDUCTION: {
    metric: "debtServicePressurePct",
    text: (v, t) => (v === null ? null : withFlag(`Your loan repayments this period are ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when they are above ${t}%.`)),
  },
  // Total receivables, not proven overdue: the wording must not say "overdue".
  FIN_HIGH_RECEIVABLES: {
    metric: "receivablesPressurePct",
    text: (v, t) => (v === null ? null : withFlag(`The money customers owe you is ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when it is above ${t}%.`)),
  },
  FIN_HIGH_PAYABLES: {
    metric: "payablesPressurePct",
    text: (v, t) => (v === null ? null : withFlag(`The money you owe suppliers is ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when it is above ${t}%.`)),
  },
  FIN_DISCOUNT_LEAKAGE: {
    metric: "discountLeakagePct",
    text: (v, t) => (v === null ? null : withFlag(`Discounts you gave are ${v}% of your sales.`, t === null ? null : `OpsIQ flags this when they are above ${t}%.`)),
  },
  // The stored threshold belongs to costLeakageRatioPct (which also includes discounts): never shown.
  FIN_REFUND_REWORK_LEAKAGE: {
    metric: "refundReworkLeakagePct",
    text: (v) => (v === null ? null : `Refunds, redone work and complaint-related costs are ${v}% of your sales.`),
  },
  FIN_INVALID_CURRENCY: {
    metric: "currency",
    text: () =>
      "The currency on your finance snapshot is missing or is not a valid currency code, so money amounts cannot be interpreted reliably.",
  },
  FIN_MISSING_CRITICAL_DATA: {
    metric: "dataConfidenceScore",
    text: (v) =>
      v === null
        ? "OpsIQ is missing basic financial information it needs, so its confidence in this diagnosis is limited."
        : `OpsIQ is missing basic financial information it needs, so its confidence in this diagnosis is ${v} out of 100.`,
  },
  FIN_OPP_MARGIN_IMPROVEMENT: {
    metric: "netMarginPct",
    text: (v, t) =>
      v === null ? null : withFlag(`Your net margin is ${v}%.`, t === null ? null : `OpsIQ compares this with a healthy-margin reference of ${t}%.`),
  },
  // The stored threshold is the high-risk reference, not the trigger (the opportunity fires at half of it): never shown.
  FIN_OPP_RECEIVABLES_COLLECTION: {
    metric: "receivablesPressurePct",
    text: (v) => (v === null ? null : `The money customers owe you is ${v}% of your sales.`),
  },
  // The stored threshold (15%) is the high-risk reference; the opportunity fires from a separate 2% floor: never shown.
  FIN_OPP_LEAKAGE_REDUCTION: {
    metric: "costLeakageRatioPct",
    text: (v) => (v === null ? null : `Discounts, refunds, redone work and complaint-related costs together are ${v}% of your sales.`),
  },
  FIN_OPP_REVENUE_QUALITY: {
    metric: "revenueQualityScore",
    text: (v, t) =>
      v === null
        ? null
        : withFlag(`OpsIQ's revenue quality score is ${v} out of 100, where higher is better.`, t === null ? null : `OpsIQ flags this finding when the score is below ${t}.`),
  },
  // The stored threshold of 100 is a ceiling, not a target: never shown.
  FIN_OPP_DATA_QUALITY: {
    metric: "dataConfidenceScore",
    text: (v) =>
      v === null
        ? "OpsIQ's confidence in this diagnosis is limited because some useful information is missing or out of date."
        : `OpsIQ's confidence in this diagnosis is ${v} out of 100 because some useful information is missing or out of date.`,
  },
  // No value is shown: the finding exists precisely because total liquid funds is unknown.
  FIN_LIQUIDITY_UNCONFIRMED: {
    metric: "totalLiquidFunds",
    text: () =>
      "Your cash in hand is recorded but your bank balance is not, so OpsIQ cannot yet confirm how long your cash will last. This is a missing figure, not a sign that you have no money.",
  },
  // The source value is a monetary amount and no safe currency context reaches this builder: never shown.
  FIN_NOTABLE_OUTSTANDING_DEBT: {
    metric: "totalDebtOutstanding",
    text: () =>
      "You have recorded outstanding debt but no monthly repayment amount, so OpsIQ cannot yet work out how heavy your loan repayments are relative to sales.",
  },
};

/**
 * THE canonical Finance evidence rationale: one pure builder shared by the in-memory planner, the
 * Finance dashboard read model and the Owner Decision candidate normalizer. Derives plain-language
 * "why this matters" text from a finding's already-measured values; computes nothing new.
 * Returns null (never a raw metric key, never an invented value) when the finding code is unknown,
 * the source metric is not the one the finding's rule emits, or the needed value is not usable.
 */
export function buildFinanceEvidenceRationale(input: FinanceRationaleInput): string | null {
  const def = RATIONALE_DEFINITIONS[input.findingCode];
  if (!def || input.sourceMetric !== def.metric) return null;
  return def.text(formatRationaleNumber(input.sourceValue), formatRationaleNumber(input.threshold));
}

/**
 * Read-time attachment of the current rationale to persisted Finance action rows (which store none).
 * The rationale is derived from the CURRENT diagnosis's finding for the action's findingCode, never
 * from the action's own (possibly older, baseline) findingId; rows are returned as new objects and
 * `findingId`/baseline fields are untouched. A row with no currently raised finding gets no rationale.
 */
export function attachCurrentFinanceEvidenceRationale<T extends { findingCode?: unknown }>(
  actions: readonly T[],
  currentFindings: ReadonlyArray<{ code: string; sourceMetric: string; sourceValue: number | null; threshold: number | null }>
): Array<T & { evidenceRationale?: string }> {
  const byCode = new Map(currentFindings.map((f) => [f.code, f]));
  return actions.map((a) => {
    const f = typeof a.findingCode === "string" ? byCode.get(a.findingCode) : undefined;
    const rationale = f
      ? buildFinanceEvidenceRationale({ findingCode: f.code, sourceMetric: f.sourceMetric, sourceValue: f.sourceValue, threshold: f.threshold })
      : null;
    return rationale ? { ...a, evidenceRationale: rationale } : { ...a };
  });
}

/**
 * Convert one recommendation into an OwnerAction. `survivalRiskScore` (the
 * business-level finance risk) raises the priority of actions when the business
 * is under survival pressure, so existential actions outrank growth ones.
 * `effectivenessModifier` (optional, from Bayesian effectiveness shrinkage) adjusts
 * confidence up/down based on historical outcomes — never applied to critical severity.
 */
export function recommendationToOwnerAction(
  rec: FinanceRecommendation,
  survivalRiskScore = 0,
  effectivenessModifier = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedFinancialImpactScore);
  const effortScore = clampScore(rec.effortScore);
  const urgencyScore = clampScore(rec.urgencyScore);
  // Critical findings are never influenced by effectiveness learning (deterministic safety rule).
  const safeModifier = modifierAllowedForSeverity(rec.severity) ? effectivenessModifier : 0;
  const confidence = clampConfidence(rec.confidence + safeModifier);

  const priorityScore = calculateOwnerPriorityScore({
    expectedImpactScore,
    confidence,
    urgencyScore,
    effortScore,
    severity: rec.severity,
    survivalRiskScore: clampScore(survivalRiskScore),
  });

  // Plain-language "because" statement derived from the finding's own measured values (null if not truthful).
  const rationale = buildFinanceEvidenceRationale({
    findingCode: rec.findingCode,
    sourceMetric: rec.sourceMetric,
    sourceValue: rec.sourceValue,
    threshold: rec.threshold,
  });

  return {
    domain: "finance",
    findingCode: rec.findingCode,
    title: rec.title,
    description: rec.requiredOwnerAction,
    ownerRole: rec.ownerRole,
    priorityScore,
    effortScore,
    expectedImpactScore,
    urgencyScore,
    severity: rec.severity,
    confidence,
    status: "proposed",
    verificationMetric: rec.verificationMetric,
    verificationMethod: rec.verificationMethod,
    expectedTimeframeDays: rec.expectedTimeframeDays,
    evidenceRationale: rationale ?? undefined,
    evidence: rec.evidence.length > 0 ? rec.evidence : undefined,
  };
}

export interface FinanceActionPlan {
  recommendations: FinanceRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan finance actions from a finance diagnosis. Deterministic: actions are
 * ranked by the Spine ranker (priority desc → impact → confidence → findingCode →
 * title), and `recommendedNextAction` is the top-ranked action. Findings without
 * a recommendation template are reported in `missingActionInputs` (never invented).
 *
 * `effectivenessMap` (optional) carries Bayesian-shrunk confidence modifiers from
 * historical outcomes. Applied only to non-critical findings. Pass undefined or an
 * empty map to run without effectiveness adjustment (cold-start / low-sample state).
 */
export function planFinanceActionsFromDiagnosis(
  diagnosis: FinanceDiagnosisResult,
  effectivenessMap?: FinanceEffectivenessMap
): FinanceActionPlan {
  const recommendations = buildFinanceRecommendations(diagnosis.findings);
  const survivalRiskScore = diagnosis.metrics.financialRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) =>
      recommendationToOwnerAction(
        r,
        survivalRiskScore,
        effectivenessMap?.get(r.findingCode)?.modifier ?? 0
      )
    )
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !FINANCE_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

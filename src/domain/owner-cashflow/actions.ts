/**
 * Owner Cashflow (Module 5 Slice 3) — recommendation → action planner.
 *
 * Pure: converts traceable cashflow recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic survival-weighted priority via
 * the Spine `calculateOwnerPriorityScore` (cashflow danger as the survival
 * pressure), ranks them, and selects the recommended next action. Persists
 * nothing; does not alter findings/metrics.
 */
import {
  type OwnerAction,
  calculateOwnerPriorityScore,
  rankOwnerActions,
  clampScore,
  clampConfidence,
} from "@/domain/owner-spine/contracts";
import type { CashflowDiagnosisResult } from "./diagnosis";
import {
  buildCashflowRecommendations,
  CASHFLOW_REC_TEMPLATES,
  type CashflowRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `survivalRiskScore` (the
 * cashflow danger score) raises the priority of actions when liquidity is under
 * pressure, so existential cash actions outrank optimisation ones.
 */
export function recommendationToOwnerAction(
  rec: CashflowRecommendation,
  survivalRiskScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedCashImpactScore);
  const effortScore = clampScore(rec.effortScore);
  const urgencyScore = clampScore(rec.urgencyScore);
  const confidence = clampConfidence(rec.confidence);

  const priorityScore = calculateOwnerPriorityScore({
    expectedImpactScore,
    confidence,
    urgencyScore,
    effortScore,
    severity: rec.severity,
    survivalRiskScore: clampScore(survivalRiskScore),
  });

  return {
    domain: "cashflow",
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
  };
}

export interface CashflowActionPlan {
  recommendations: CashflowRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan cashflow actions from a cashflow diagnosis. Deterministic: actions are
 * ranked by the Spine ranker (priority desc → impact → confidence → findingCode →
 * title), and `recommendedNextAction` is the top-ranked action. Findings without
 * a recommendation template are reported in `missingActionInputs` (never invented).
 */
export function planCashflowActionsFromDiagnosis(
  diagnosis: CashflowDiagnosisResult
): CashflowActionPlan {
  const recommendations = buildCashflowRecommendations(diagnosis.findings);
  const survivalRiskScore = diagnosis.metrics.cashflowDangerScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, survivalRiskScore))
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !CASHFLOW_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

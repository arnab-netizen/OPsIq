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

/** Build a human-readable "because" rationale from source metric data. */
function buildEvidenceRationale(
  sourceMetric: string,
  sourceValue: number | null,
  threshold: number | null
): string {
  if (sourceValue !== null && threshold !== null) {
    return `Your ${sourceMetric} is ${sourceValue.toLocaleString()} (threshold: ${threshold.toLocaleString()}).`;
  }
  if (sourceValue !== null) {
    return `Your ${sourceMetric} is ${sourceValue.toLocaleString()}.`;
  }
  return `Based on your ${sourceMetric}.`;
}

/**
 * Convert one recommendation into an OwnerAction. `survivalRiskScore` (the
 * business-level finance risk) raises the priority of actions when the business
 * is under survival pressure, so existential actions outrank growth ones.
 */
export function recommendationToOwnerAction(
  rec: FinanceRecommendation,
  survivalRiskScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedFinancialImpactScore);
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

  // Build a traceable "because" statement from the source metric + value + threshold.
  const rationale = buildEvidenceRationale(rec.sourceMetric, rec.sourceValue, rec.threshold);

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
    evidenceRationale: rationale,
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
 */
export function planFinanceActionsFromDiagnosis(diagnosis: FinanceDiagnosisResult): FinanceActionPlan {
  const recommendations = buildFinanceRecommendations(diagnosis.findings);
  const survivalRiskScore = diagnosis.metrics.financialRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, survivalRiskScore))
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

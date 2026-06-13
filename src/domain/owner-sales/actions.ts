/**
 * Owner Sales (Module 3 Slice 3) — recommendation → action planner.
 *
 * Pure: converts traceable sales recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic priority via the Spine
 * `calculateOwnerPriorityScore` (sales risk as the pressure weight), ranks them,
 * and selects the recommended next action. Persists nothing; does not alter
 * findings/metrics.
 */
import {
  type OwnerAction,
  calculateOwnerPriorityScore,
  rankOwnerActions,
  clampScore,
  clampConfidence,
} from "@/domain/owner-spine/contracts";
import type { SalesDiagnosisResult } from "./diagnosis";
import {
  buildSalesRecommendations,
  SALES_REC_TEMPLATES,
  type SalesRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `pressureScore` (the sales risk
 * score) raises the priority of actions when sales are in trouble, so urgent
 * fixes outrank optimisation work.
 */
export function recommendationToOwnerAction(
  rec: SalesRecommendation,
  pressureScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedSalesImpactScore);
  const effortScore = clampScore(rec.effortScore);
  const urgencyScore = clampScore(rec.urgencyScore);
  const confidence = clampConfidence(rec.confidence);

  const priorityScore = calculateOwnerPriorityScore({
    expectedImpactScore,
    confidence,
    urgencyScore,
    effortScore,
    severity: rec.severity,
    survivalRiskScore: clampScore(pressureScore),
  });

  return {
    domain: "sales",
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

export interface SalesActionPlan {
  recommendations: SalesRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan sales actions from a sales diagnosis. Deterministic: actions are ranked by
 * the Spine ranker (priority desc → impact → confidence → findingCode → title),
 * and `recommendedNextAction` is the top-ranked action. Findings without a
 * recommendation template are reported in `missingActionInputs` (never invented).
 */
export function planSalesActionsFromDiagnosis(diagnosis: SalesDiagnosisResult): SalesActionPlan {
  const recommendations = buildSalesRecommendations(diagnosis.findings);
  const pressureScore = diagnosis.metrics.salesRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, pressureScore))
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !SALES_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

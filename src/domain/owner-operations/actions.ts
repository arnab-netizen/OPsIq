/**
 * Owner Operations (Module 4 Slice 3) — recommendation → action planner.
 *
 * Pure: converts traceable operations recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic priority via the Spine
 * `calculateOwnerPriorityScore` (operations risk as the pressure weight), ranks
 * them, and selects the recommended next action. Persists nothing; does not alter
 * findings/metrics.
 */
import {
  type OwnerAction,
  calculateOwnerPriorityScore,
  rankOwnerActions,
  clampScore,
  clampConfidence,
} from "@/domain/owner-spine/contracts";
import type { OperationsDiagnosisResult } from "./diagnosis";
import {
  buildOperationsRecommendations,
  OPERATIONS_REC_TEMPLATES,
  type OperationsRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `pressureScore` (the operations
 * risk score) raises the priority of actions when operations are under strain, so
 * urgent bottleneck fixes outrank optimisation work.
 */
export function recommendationToOwnerAction(
  rec: OperationsRecommendation,
  pressureScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedOpsImpactScore);
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
    domain: "operations",
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

export interface OperationsActionPlan {
  recommendations: OperationsRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan operations actions from an operations diagnosis. Deterministic: actions are
 * ranked by the Spine ranker (priority desc → impact → confidence → findingCode →
 * title), and `recommendedNextAction` is the top-ranked action. Findings without a
 * recommendation template are reported in `missingActionInputs` (never invented).
 */
export function planOperationsActionsFromDiagnosis(
  diagnosis: OperationsDiagnosisResult
): OperationsActionPlan {
  const recommendations = buildOperationsRecommendations(diagnosis.findings);
  const pressureScore = diagnosis.metrics.operationsRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, pressureScore))
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !OPERATIONS_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

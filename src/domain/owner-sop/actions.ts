/**
 * Owner SOP & Execution Accountability (Module 7 Slice 3) — recommendation →
 * action planner.
 *
 * Pure: converts traceable execution recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic priority via the Spine
 * `calculateOwnerPriorityScore` (execution risk as the pressure weight), ranks
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
import type { SopDiagnosisResult } from "./diagnosis";
import {
  buildSopRecommendations,
  SOP_REC_TEMPLATES,
  type SopRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `pressureScore` (the execution
 * risk score) raises the priority of actions when execution is breaking down, so
 * urgent accountability fixes outrank optimisation work.
 */
export function recommendationToOwnerAction(
  rec: SopRecommendation,
  pressureScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedExecImpactScore);
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
    domain: "sop",
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

export interface SopActionPlan {
  recommendations: SopRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan execution actions from an execution diagnosis. Deterministic: actions are
 * ranked by the Spine ranker (priority desc → impact → confidence → findingCode →
 * title), and `recommendedNextAction` is the top-ranked action. Findings without a
 * recommendation template are reported in `missingActionInputs` (never invented).
 */
export function planSopActionsFromDiagnosis(diagnosis: SopDiagnosisResult): SopActionPlan {
  const recommendations = buildSopRecommendations(diagnosis.findings);
  const pressureScore = diagnosis.metrics.executionRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, pressureScore))
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !SOP_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

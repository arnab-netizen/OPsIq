/**
 * Owner Marketing & Growth (Module 6 Slice 3) — recommendation → action planner.
 *
 * Pure: converts traceable marketing recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic priority via the Spine
 * `calculateOwnerPriorityScore` (marketing risk as the pressure weight), ranks
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
import type { MarketingDiagnosisResult } from "./diagnosis";
import {
  buildMarketingRecommendations,
  MARKETING_REC_TEMPLATES,
  type MarketingRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `pressureScore` (the marketing
 * risk score) raises the priority of actions when spend is leaking/wasting, so
 * stopping waste outranks optimisation work.
 */
export function recommendationToOwnerAction(
  rec: MarketingRecommendation,
  pressureScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedGrowthImpactScore);
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
    domain: "marketing",
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

export interface MarketingActionPlan {
  recommendations: MarketingRecommendation[];
  actions: OwnerAction[]; // ranked (highest priority first)
  recommendedNextAction: OwnerAction | undefined;
  missingActionInputs: string[]; // finding codes that had no recommendation template
  generatedAt: Date;
}

/**
 * Plan marketing actions from a marketing diagnosis. Deterministic: actions are
 * ranked by the Spine ranker (priority desc → impact → confidence → findingCode →
 * title), and `recommendedNextAction` is the top-ranked action. Findings without a
 * recommendation template are reported in `missingActionInputs` (never invented).
 */
export function planMarketingActionsFromDiagnosis(
  diagnosis: MarketingDiagnosisResult
): MarketingActionPlan {
  const recommendations = buildMarketingRecommendations(diagnosis.findings);
  const pressureScore = diagnosis.metrics.marketingRiskScore;

  const actions = rankOwnerActions(
    recommendations.map((r) => recommendationToOwnerAction(r, pressureScore))
  );

  const missingActionInputs = diagnosis.findings
    .filter((f) => !MARKETING_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    actions,
    recommendedNextAction: actions.length > 0 ? actions[0] : undefined,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

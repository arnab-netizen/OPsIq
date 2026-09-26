/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 3) — recommendation → action
 * planner.
 *
 * Pure: converts traceable scenario recommendations into Spine `OwnerAction`s
 * (status "proposed"), computes a deterministic priority via the Spine
 * `calculateOwnerPriorityScore` (scenario risk as the pressure weight), ranks them,
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
import type { StrategyDiagnosisResult } from "./diagnosis";
import { deriveStrategyDecision, type StrategyDecision } from "./decision";
import { arbitrateStrategyActionRows } from "./action-arbitration";
import {
  buildStrategyRecommendations,
  STRATEGY_REC_TEMPLATES,
  type StrategyRecommendation,
} from "./recommendations";

/**
 * Convert one recommendation into an OwnerAction. `pressureScore` (the scenario
 * risk score) raises the priority of actions when the option is risky/
 * value-destroying, so "drop/re-scope/cap-downside" outranks "pursue/scale".
 */
export function recommendationToOwnerAction(
  rec: StrategyRecommendation,
  pressureScore = 0
): OwnerAction {
  const expectedImpactScore = clampScore(rec.expectedDecisionImpactScore);
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
    domain: "strategy",
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

export interface StrategyActionPlan {
  recommendations: StrategyRecommendation[];
  decision: StrategyDecision;
  actions: OwnerAction[]; // arbitrated + ranked: the primary step first, then supporting steps
  recommendedNextAction: OwnerAction | undefined; // always the decision's primary step
  missingActionInputs: string[]; // risk finding codes that had no recommendation template
  generatedAt: Date;
}

/** Ranking ceiling for supporting steps, so the primary step (100) always ranks first. */
const SUPPORTING_PRIORITY_CEILING = 99;

/**
 * Plan strategy actions from a scenario diagnosis, arbitrated against the decision:
 *  - the decision's primary step is the first action (priority 100), re-using the finding's
 *    recommendation when one exists (re-worded to the decision's concrete step), else created
 *    from the step itself (e.g. the GO "go ahead" step);
 *  - supporting steps are the recommendations the decision allows (action-arbitration.ts),
 *    one per recommendation code, ranked by the Spine ranker and capped below the primary;
 *  - everything else (retired Pursue/Size up, steps that conflict with the decision) is dropped.
 * Opportunity findings intentionally have no template and are not "missing" inputs. Findings
 * without a template are reported in `missingActionInputs` (never invented).
 */
export function planStrategyActionsFromDiagnosis(
  diagnosis: StrategyDiagnosisResult
): StrategyActionPlan {
  const recommendations = buildStrategyRecommendations(diagnosis.findings);
  const pressureScore = diagnosis.metrics.strategyRiskScore;
  const decision = deriveStrategyDecision(diagnosis.input, { metrics: diagnosis.metrics, now: diagnosis.generatedAt });
  const step = decision.primaryStep;

  const candidates = recommendations.map((r) => ({ rec: r, action: recommendationToOwnerAction(r, pressureScore) }));
  const fits = arbitrateStrategyActionRows(
    candidates.map((c) => ({ findingCode: c.rec.findingCode, recommendationCode: c.rec.recommendationCode, status: "proposed" })),
    decision
  );

  const primaryCandidate = candidates.find((_, i) => fits[i].decisionFit === "primary");
  const primary: OwnerAction = primaryCandidate
    ? { ...primaryCandidate.action, title: step.title, description: step.description, priorityScore: 100 }
    : primaryStepToOwnerAction(decision, diagnosis.metrics.dataConfidenceScore / 100);

  const supporting = rankOwnerActions(
    candidates
      .filter((_, i) => fits[i].decisionFit === "supporting")
      .map((c) => ({ ...c.action, priorityScore: Math.min(c.action.priorityScore, SUPPORTING_PRIORITY_CEILING) }))
  );
  const actions = [primary, ...supporting];

  const missingActionInputs = diagnosis.findings
    .filter((f) => f.findingType !== "opportunity" && !STRATEGY_REC_TEMPLATES[f.code])
    .map((f) => f.code);

  return {
    recommendations,
    decision,
    actions,
    recommendedNextAction: primary,
    missingActionInputs,
    generatedAt: diagnosis.generatedAt,
  };
}

/** The decision's primary step as an action when no finding recommendation carries it. */
function primaryStepToOwnerAction(decision: StrategyDecision, confidence: number): OwnerAction {
  const step = decision.primaryStep;
  const go = step.recommendationCode === "STRREC_PROCEED";
  return {
    domain: "strategy",
    findingCode: step.findingCode,
    title: step.title,
    description: step.description,
    ownerRole: "owner",
    priorityScore: 100,
    effortScore: go ? 45 : 20,
    expectedImpactScore: go ? 60 : 40,
    urgencyScore: go ? 40 : 50,
    severity: "low",
    confidence: clampConfidence(confidence),
    status: "proposed",
    verificationMetric: go ? "baseMonthlyProfitDelta" : "dataConfidenceScore",
    verificationMethod: go
      ? "Once it is running, compare actual monthly profit change with the estimate."
      : "Correct the input and evaluate the scenario again.",
    expectedTimeframeDays: go ? 30 : 3,
  };
}

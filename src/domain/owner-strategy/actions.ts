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

/**
 * Plan strategy actions from a scenario diagnosis, arbitrated against the decision:
 *  - the decision's primary step is the first action, re-using the finding's recommendation when
 *    one exists (re-worded to the decision's concrete step, e.g. "Close the ₹50,000 funding gap"),
 *    else created from the step itself (e.g. the GO "go ahead" step);
 *  - supporting steps are the recommendations the decision allows (action-arbitration.ts), one per
 *    recommendation code, ranked by the Spine ranker;
 *  - everything else (retired Pursue/Size up, steps that conflict with the decision) is dropped.
 * Priorities stay the Spine-computed values, so Strategy never outranks other domains just by
 * being "primary"; supporting steps are capped one point below the primary so every priority-
 * ordered list still shows the primary first. Opportunity findings intentionally have no template
 * and are not "missing" inputs. Findings without a template are reported in `missingActionInputs`.
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
    ? { ...primaryCandidate.action, title: step.title, description: step.description }
    : primaryStepToOwnerAction(decision, diagnosis, pressureScore);

  const ceiling = Math.max(primary.priorityScore - 1, 0);
  const supporting = rankOwnerActions(
    candidates
      .filter((_, i) => fits[i].decisionFit === "supporting")
      .map((c) => ({ ...c.action, priorityScore: Math.min(c.action.priorityScore, ceiling) }))
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

/**
 * The decision's primary step as an action when no finding recommendation carries it (the GO step,
 * a specific missing-input step, an invalid input). Its priority is computed the Spine way from the
 * finding it addresses (or neutral defaults for GO) — never pinned to the maximum.
 */
function primaryStepToOwnerAction(
  decision: StrategyDecision,
  diagnosis: StrategyDiagnosisResult,
  pressureScore: number
): OwnerAction {
  const step = decision.primaryStep;
  const go = step.recommendationCode === "STRREC_PROCEED";
  const finding = diagnosis.findings.find((f) => f.code === step.findingCode);
  const confidence = clampConfidence(finding?.confidence ?? diagnosis.metrics.dataConfidenceScore / 100);
  const expectedImpactScore = clampScore(finding?.impactScore ?? (go ? 60 : 40));
  const urgencyScore = clampScore(finding?.urgencyScore ?? (go ? 40 : 45));
  const effortScore = clampScore(go ? 45 : 15);
  const severity = finding?.severity ?? (go ? "low" : "medium");
  return {
    domain: "strategy",
    findingCode: step.findingCode,
    title: step.title,
    description: step.description,
    ownerRole: "owner",
    priorityScore: calculateOwnerPriorityScore({
      expectedImpactScore,
      confidence,
      urgencyScore,
      effortScore,
      severity,
      survivalRiskScore: clampScore(pressureScore),
    }),
    effortScore,
    expectedImpactScore,
    urgencyScore,
    severity,
    confidence,
    status: "proposed",
    verificationMetric: go ? "baseMonthlyProfitDelta" : (finding?.verificationMetric ?? "dataConfidenceScore"),
    verificationMethod: go
      ? "Once it is running, compare the actual monthly profit change with the estimate."
      : "Evaluate an updated scenario with the corrected input.",
    expectedTimeframeDays: go ? 30 : 3,
  };
}

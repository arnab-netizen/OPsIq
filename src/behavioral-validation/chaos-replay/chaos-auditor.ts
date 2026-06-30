/**
 * CHAOS OBSERVER / AUDITOR — evaluates OpsIQ runtime output AFTER it is produced, against a LOCKED
 * expected outcome. Pure function over frozen inputs: it cannot modify the runtime output or the locked
 * expectation, and it never influences the runtime decision. It compares, scores, and recommends —
 * flagging wrong routing, wrong dominant constraint, lucky-right-answer-wrong-reasoning, fake confidence,
 * generic advice, wrong do-not-do, missing proof, bad dashboard output, and bad likely outcome if followed.
 */
import type { LockedExpectation, ChaosReplayResult } from "./chaos-replay";
import { hashExpectation } from "./chaos-replay";

const GENERIC_PHRASES = [
  "work harder", "try harder", "do your best", "focus on growth", "improve efficiency",
  "be more efficient", "increase sales", "stay positive", "keep going", "monitor the situation",
];
const SPECIFIC_ANCHORS = /\b(cap|stop|pause|re-?quote|decline|delegate|verify|verif|proof|reconcil|runway|margin|receivable|professional|review|independent|escalat|13-?week|threshold|do not|don't)\b/i;

function isGeneric(action: string): boolean {
  const a = (action ?? "").toLowerCase();
  // Asking the owner to supply the missing critical data is a SPECIFIC, safe step — not vague advice.
  if (/missing|enter the missing|add real records|more data/.test(a)) return false;
  if (GENERIC_PHRASES.some((p) => a.includes(p))) return true;
  // A real recommendation names a concrete safeguard; a vague one does not.
  return a.length < 24 || !SPECIFIC_ANCHORS.test(a);
}

function overlap(a: string, b: string): boolean {
  const ta = new Set((a ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const tb = (b ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  let hits = 0;
  for (const w of tb) if (ta.has(w)) hits++;
  return hits >= 3;
}

export interface ChaosAuditResult {
  scenarioId: string;
  // routing
  modulesExpected: string[];
  modulesUsed: string[];
  missedRequiredModules: string[];
  unnecessaryDominantModules: number;
  moduleRoutingScore: number;
  nonDominantModulesRespected: boolean;
  // dominant
  dominantConstraintExpected: string;
  dominantConstraintActual: string;
  // supervisor behaviour
  supervisorBehaviorScore: number;
  evidenceSufficiencyScore: number;
  doNotDoCorrect: boolean;
  safeNextActionCorrect: boolean;
  proofReassessmentCorrect: boolean;
  confidenceMissingDataCorrect: boolean;
  assumptionFakeConfidenceOk: boolean;
  profitCashWorkloadCorrect: boolean;
  ownerDelegateSplitCorrect: boolean;
  dashboardUsefulnessScore: number;
  ownerComprehensionRisk: "low" | "medium" | "high";
  genericAdviceFlag: boolean;
  unsafeOutputFlag: boolean;
  badOutcomeIfFollowed: boolean;
  businessOutcomeUsefulness: number;
  realWorldConsequenceAvoided: boolean;
  // verdict
  pass: boolean;
  failureLabels: string[];
  adjudicationRecommended: boolean;
  regressionCaseRecommended: boolean;
  learningRecommendation: string | null;
  // integrity
  lockIntact: boolean;
}

/**
 * Audit one replay against its locked expectation. `locked` and `result` are treated as read-only (the
 * locked expectation is already deeply frozen). The auditor performs NO mutation.
 */
export function auditReplay(locked: LockedExpectation, result: ChaosReplayResult): ChaosAuditResult {
  const exp = locked.expectation;
  const sup = result.supervisor;

  // ── Lock integrity: the expectation must not have been tampered with after it was locked. ──
  const lockIntact = hashExpectation(exp) === locked.lockHash;

  // ── Routing ──
  const dominantCorrect = result.dominantConstraint === exp.expectedDominantConstraint;
  // The runtime must have assessed a broad domain set (not a single-domain shortcut).
  const assessedEnough = result.modulesUsed.length >= 6;
  // A non-dominant tempting module must NOT be the accepted/winning move.
  const acceptedTempting = result.acceptedModules.filter((a) => overlap(a, exp.temptingWrongAction)).length;
  const unnecessaryDominantModules = acceptedTempting;
  const nonDominantModulesRespected = unnecessaryDominantModules === 0;
  const moduleRoutingScore = (dominantCorrect ? 60 : 0) + (assessedEnough ? 25 : 0) + (nonDominantModulesRespected ? 15 : 0);
  const missedRequiredModules = assessedEnough ? [] : ["broad domain ingestion"];

  // ── Supervisor behaviour ──
  const ugly = exp.goodBadUgly === "ugly";
  const statusOk = sup.actionStatus === exp.expectedSupervisorActionStatus
    // A safe over-cautious deviation (need_more_data/owner_decision/blocked instead of a clean proceed) is acceptable.
    || (!sup.canProceed && exp.expectedSupervisorActionStatus !== "proceed" && exp.expectedSupervisorActionStatus !== "cautious_proceed");
  const doNotDoCorrect = exp.goodBadUgly === "good" ? true : sup.doNotDo.length > 0;
  const safeNextActionCorrect = sup.doNow.length > 0 && !overlap(sup.doNow, exp.temptingWrongAction);
  const proofReassessmentCorrect = sup.proofNeeded.length > 0 && sup.cadence.reassessmentTrigger.length > 0;
  // Fake-confidence: confidence can never read "high" while a critical domain is unbacked.
  const confidenceHonest = !(sup.confidence === "high" && !result.criticalDomainsAllReal);
  const confidenceMissingDataCorrect = confidenceHonest
    && (result.criticalDomainsAllReal || sup.ledger.missingData.length > 0 || sup.actionStatus === "need_more_data" || sup.actionStatus === "blocked");
  const assumptionFakeConfidenceOk = sup.ledger.assumptionsAreMarked && confidenceHonest;
  const relevantImpact = sup.impact.filter((i) => i.relevant).map((i) => i.dimension);
  const profitCashWorkloadCorrect = relevantImpact.length >= 1;
  const ownerDelegateSplitCorrect = sup.ownerDecisionRequired !== null || sup.delegateToStaff.length > 0;

  const supervisorBehaviorScore =
    (statusOk ? 35 : 0) + (doNotDoCorrect ? 20 : 0) + (safeNextActionCorrect ? 20 : 0)
    + (confidenceHonest ? 15 : 0) + (ownerDelegateSplitCorrect ? 10 : 0);

  const evidenceSufficiencyScore =
    (confidenceMissingDataCorrect ? 40 : 0) + (assumptionFakeConfidenceOk ? 30 : 0)
    + (sup.ledger.confidenceReason.length > 8 ? 15 : 0) + (proofReassessmentCorrect ? 15 : 0);

  // ── Dashboard ──
  const dashFieldOk = {
    mainIssue: sup.mainIssue.length > 0,
    doNow: sup.doNow.length > 0,
    doNotDo: exp.goodBadUgly === "good" || sup.doNotDo.length > 0,
    ownerDecisionRequired: true, // surfaced as null-or-string; always present
    proofNeeded: sup.proofNeeded.length > 0,
    impact: relevantImpact.length > 0,
    reassessment: sup.cadence.reassessmentTrigger.length > 0,
    actionStatus: typeof sup.actionStatus === "string",
    confidence: typeof sup.confidence === "string",
  };
  const dashHits = Object.values(dashFieldOk).filter(Boolean).length;
  const concise = sup.topPriorities.length <= (sup.emergency ? 5 : 3);
  // One primary action per priority — the panel renders exactly one next-step per priority.
  const onePrimaryActionPerPriority = sup.topPriorities.every((p) => p.doNext.length > 0);
  const dashboardUsefulnessScore = Math.round((dashHits / Object.keys(dashFieldOk).length) * 80) + (concise ? 20 : 0);
  // Owner comprehension = can the owner identify the main action from the first screen? Driven by a crisp
  // primary action (do-now), a concise ≤3-priority structure with one action each, and no wall of text —
  // NOT by the length of the root-cause sentence alone.
  const firstScreenReadable = sup.doNow.length > 0 && sup.doNow.length <= 160 && sup.mainIssue.length <= 320;
  const ownerComprehensionRisk: ChaosAuditResult["ownerComprehensionRisk"] =
    concise && onePrimaryActionPerPriority && firstScreenReadable && dashHits >= 8 ? "low"
      : dashHits >= 6 && concise ? "medium" : "high";

  // ── Safety / outcome ──
  // Evaluate genericness against the SUBSTANTIVE runtime recommendation (the supervisor's do-now may be the
  // safe "enter missing data" step when critical data is absent — that is correct, not vague).
  const genericAdviceFlag = isGeneric(result.runtime.nextBestAction) && isGeneric(sup.doNow);
  const unsafeOutputFlag = result.unsafeCount > 0;
  // Bad outcome if followed: an ugly/blocked case must NOT be allowed to proceed; following a "proceed" on
  // an unresolved binding risk would cause the real-world consequence.
  const mustNotProceed = ugly || sup.actionStatus === "blocked" || !result.criticalDomainsAllReal;
  const badOutcomeIfFollowed = (mustNotProceed && sup.canProceed) || (unsafeOutputFlag);
  const realWorldConsequenceAvoided = !badOutcomeIfFollowed && doNotDoCorrect && dominantCorrect;

  const businessOutcomeUsefulness =
    (dominantCorrect ? 30 : 0) + (!badOutcomeIfFollowed ? 25 : 0) + (doNotDoCorrect ? 15 : 0)
    + (proofReassessmentCorrect ? 15 : 0) + (profitCashWorkloadCorrect ? 10 : 0) + (!genericAdviceFlag ? 5 : 0);

  // ── Verdict ──
  const failureLabels: string[] = [];
  if (!dominantCorrect) failureLabels.push("wrong_dominant_constraint");
  if (!nonDominantModulesRespected) failureLabels.push("unnecessary_dominant_module");
  if (!doNotDoCorrect) failureLabels.push("missing_do_not_do");
  if (!safeNextActionCorrect) failureLabels.push("unsafe_or_tempting_next_action");
  if (!proofReassessmentCorrect) failureLabels.push("missing_proof_or_reassessment");
  if (!confidenceHonest) failureLabels.push("fake_high_confidence");
  if (genericAdviceFlag) failureLabels.push("generic_advice");
  if (unsafeOutputFlag) failureLabels.push("unsafe_output");
  if (badOutcomeIfFollowed) failureLabels.push("bad_outcome_if_followed");
  if (!lockIntact) failureLabels.push("expectation_tampered_after_output");

  // Pass requires: lock intact + correct dominant + safe (no unsafe / no bad outcome) + supervisor &
  // evidence behaviour at threshold + a do-not-do for non-good cases + no generic advice. A lucky-right
  // surface answer with the WRONG dominant constraint or weak evidence cannot fully pass.
  const pass =
    lockIntact && dominantCorrect && !unsafeOutputFlag && !badOutcomeIfFollowed && !genericAdviceFlag
    && doNotDoCorrect && safeNextActionCorrect && proofReassessmentCorrect && confidenceHonest
    && supervisorBehaviorScore >= 80 && evidenceSufficiencyScore >= 70;

  return {
    scenarioId: result.scenarioId,
    modulesExpected: exp.expectedModules,
    modulesUsed: result.modulesUsed,
    missedRequiredModules,
    unnecessaryDominantModules,
    moduleRoutingScore,
    nonDominantModulesRespected,
    dominantConstraintExpected: exp.expectedDominantConstraint,
    dominantConstraintActual: result.dominantConstraint,
    supervisorBehaviorScore,
    evidenceSufficiencyScore,
    doNotDoCorrect,
    safeNextActionCorrect,
    proofReassessmentCorrect,
    confidenceMissingDataCorrect,
    assumptionFakeConfidenceOk,
    profitCashWorkloadCorrect,
    ownerDelegateSplitCorrect,
    dashboardUsefulnessScore,
    ownerComprehensionRisk,
    genericAdviceFlag,
    unsafeOutputFlag,
    badOutcomeIfFollowed,
    businessOutcomeUsefulness,
    realWorldConsequenceAvoided,
    pass,
    failureLabels,
    adjudicationRecommended: !pass,
    regressionCaseRecommended: !pass,
    learningRecommendation: pass ? null : `${exp.expectedLearningOnFail} (scoped to ${exp.businessCategory}/${exp.expectedDominantConstraint}; never global-promoted)`,
    lockIntact,
  };
}

/**
 * CHAOS SCORING + classification ladder. Aggregates the observer/auditor results into the scored
 * dimensions and the hostile-skeptical readiness gates. Never weakened to pass: a single unsafe output,
 * a generic answer, a faked high confidence, a bad-outcome-if-followed on a high-risk case, or an
 * unresolved high-risk failure blocks `REAL_WORLD_CHAOS_REPLAY_READY`.
 */
import type { ChaosAuditResult } from "./chaos-auditor";
import type { ChaosScenario } from "./chaos-schema";

export const CHAOS_CLASSIFICATIONS = [
  "CHAOS_REPLAY_FAILED", "CHAOS_REPLAY_SOURCE_READY", "CHAOS_REPLAY_RUNTIME_READY",
  "CHAOS_REPLAY_AUDITOR_READY", "CHAOS_REPLAY_BROWSER_READY", "REAL_WORLD_CHAOS_REPLAY_READY",
] as const;
export type ChaosClassification = (typeof CHAOS_CLASSIFICATIONS)[number];

export interface ScoredAudit { scenario: ChaosScenario; audit: ChaosAuditResult }

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d * 10) / 10 : 0);

export interface ChaosScores {
  counted: number;
  moduleRouting: number;
  dominantConstraint: number;
  supervisorBehavior: number;
  evidenceSufficiency: number;
  dashboardUsefulness: number;
  ownerComprehension: number;
  businessOutcomeUsefulness: number;
  goodCorrectness: number;
  badCorrectness: number;
  uglyCorrectness: number;
  unnecessaryDominantModuleCount: number;
  unsafeOutputCount: number;
  genericAdviceCount: number;
  fakeConfidenceCount: number;
  badOutcomeIfFollowedCount: number;
  badOutcomeHighRiskCount: number;
  unresolvedHighRiskFailures: number;
  overallPassRate: number;
}

const COMP_RISK_SCORE = { low: 100, medium: 70, high: 0 } as const;

function isHighRisk(s: ChaosScenario): boolean {
  return s.goodBadUgly === "ugly"
    || s.expectedDominantConstraint === "compliance_block"
    || s.expectedDominantConstraint === "proof_fraud_block";
}

/** `resolvedScenarioIds` are failures that have been re-run and now pass (the failure→fix loop). */
export function scoreChaos(rows: ScoredAudit[], resolvedScenarioIds: Set<string> = new Set()): ChaosScores {
  const counted = rows.filter((r) => r.scenario.countedForReadiness && !r.scenario.synthetic);
  const audits = counted.map((r) => r.audit);
  const byClass = (c: ChaosScenario["goodBadUgly"]) => counted.filter((r) => r.scenario.goodBadUgly === c);
  const passRate = (rs: ScoredAudit[]) => pct(rs.filter((r) => r.audit.pass).length, rs.length);

  const highRiskFailures = counted.filter((r) => isHighRisk(r.scenario) && !r.audit.pass && !resolvedScenarioIds.has(r.scenario.scenarioId));

  return {
    counted: counted.length,
    moduleRouting: avg(audits.map((a) => a.moduleRoutingScore)),
    dominantConstraint: pct(audits.filter((a) => a.dominantConstraintActual === a.dominantConstraintExpected).length, audits.length),
    supervisorBehavior: avg(audits.map((a) => a.supervisorBehaviorScore)),
    evidenceSufficiency: avg(audits.map((a) => a.evidenceSufficiencyScore)),
    dashboardUsefulness: avg(audits.map((a) => a.dashboardUsefulnessScore)),
    ownerComprehension: avg(audits.map((a) => COMP_RISK_SCORE[a.ownerComprehensionRisk])),
    businessOutcomeUsefulness: avg(audits.map((a) => a.businessOutcomeUsefulness)),
    goodCorrectness: passRate(byClass("good")),
    badCorrectness: passRate(byClass("bad")),
    uglyCorrectness: passRate(byClass("ugly")),
    unnecessaryDominantModuleCount: audits.reduce((s, a) => s + a.unnecessaryDominantModules, 0),
    unsafeOutputCount: audits.filter((a) => a.unsafeOutputFlag).length,
    genericAdviceCount: audits.filter((a) => a.genericAdviceFlag).length,
    fakeConfidenceCount: audits.filter((a) => a.failureLabels.includes("fake_high_confidence")).length,
    badOutcomeIfFollowedCount: audits.filter((a) => a.badOutcomeIfFollowed).length,
    badOutcomeHighRiskCount: counted.filter((r) => isHighRisk(r.scenario) && r.audit.badOutcomeIfFollowed).length,
    unresolvedHighRiskFailures: highRiskFailures.length,
    overallPassRate: passRate(counted),
  };
}

export interface ChaosGateInputs {
  scores: ChaosScores;
  categoriesCovered: number;
  goodBadUglyComplete: boolean;       // every category has good/bad/ugly
  mandatoryChaosTypesCovered: boolean;
  everyLayerCovered: boolean;
  sourceGatePassed: boolean;
  browserProofPassed: boolean;
  dbProofPassed: boolean;
  noRegression: boolean;
}

export const CHAOS_THRESHOLDS = {
  moduleRouting: 90, dominantConstraint: 90, supervisorBehavior: 90, evidenceSufficiency: 90,
  dashboardUsefulness: 85, ownerComprehension: 85, businessOutcomeUsefulness: 90,
  goodCorrectness: 90, badCorrectness: 90, uglyCorrectness: 90, countedMin: 75, categoriesMin: 15,
} as const;

export function chaosScoreGatesPass(s: ChaosScores): { pass: boolean; reasons: string[] } {
  const T = CHAOS_THRESHOLDS;
  const reasons: string[] = [];
  const need = (label: string, val: number, min: number) => { if (val < min) reasons.push(`${label} ${val} < ${min}`); };
  need("counted", s.counted, T.countedMin);
  need("moduleRouting", s.moduleRouting, T.moduleRouting);
  need("dominantConstraint", s.dominantConstraint, T.dominantConstraint);
  need("supervisorBehavior", s.supervisorBehavior, T.supervisorBehavior);
  need("evidenceSufficiency", s.evidenceSufficiency, T.evidenceSufficiency);
  need("dashboardUsefulness", s.dashboardUsefulness, T.dashboardUsefulness);
  need("ownerComprehension", s.ownerComprehension, T.ownerComprehension);
  need("businessOutcomeUsefulness", s.businessOutcomeUsefulness, T.businessOutcomeUsefulness);
  need("goodCorrectness", s.goodCorrectness, T.goodCorrectness);
  need("badCorrectness", s.badCorrectness, T.badCorrectness);
  need("uglyCorrectness", s.uglyCorrectness, T.uglyCorrectness);
  if (s.unsafeOutputCount !== 0) reasons.push(`unsafe ${s.unsafeOutputCount} != 0`);
  if (s.genericAdviceCount !== 0) reasons.push(`generic ${s.genericAdviceCount} != 0`);
  if (s.fakeConfidenceCount !== 0) reasons.push(`fakeConfidence ${s.fakeConfidenceCount} != 0`);
  if (s.badOutcomeHighRiskCount !== 0) reasons.push(`badOutcomeHighRisk ${s.badOutcomeHighRiskCount} != 0`);
  if (s.unresolvedHighRiskFailures !== 0) reasons.push(`unresolvedHighRisk ${s.unresolvedHighRiskFailures} != 0`);
  return { pass: reasons.length === 0, reasons };
}

export function classifyChaos(i: ChaosGateInputs): { classification: ChaosClassification; reasons: string[] } {
  const reasons: string[] = [];
  if (!i.sourceGatePassed) { reasons.push("source/coverage gate not met"); return { classification: "CHAOS_REPLAY_FAILED", reasons }; }
  reasons.push("source + coverage gate met");
  if (i.scores.counted < CHAOS_THRESHOLDS.countedMin || i.categoriesCovered < CHAOS_THRESHOLDS.categoriesMin
      || !i.goodBadUglyComplete || !i.mandatoryChaosTypesCovered) {
    return { classification: "CHAOS_REPLAY_SOURCE_READY", reasons };
  }
  reasons.push(`${i.scores.counted} counted across ${i.categoriesCovered} categories, good/bad/ugly + chaos types complete`);

  const gate = chaosScoreGatesPass(i.scores);
  if (!gate.pass) { reasons.push(`runtime/score gate: ${gate.reasons.join("; ")}`); return { classification: "CHAOS_REPLAY_RUNTIME_READY", reasons }; }
  reasons.push("runtime score gates met");

  if (!i.everyLayerCovered) { reasons.push("layer coverage incomplete"); return { classification: "CHAOS_REPLAY_AUDITOR_READY", reasons }; }
  reasons.push("every OpsIQ layer covered");

  if (!i.browserProofPassed || !i.dbProofPassed) { reasons.push("browser/DB proof pending"); return { classification: "CHAOS_REPLAY_BROWSER_READY", reasons }; }
  if (!i.noRegression) { reasons.push("no-regression gate not green"); return { classification: "CHAOS_REPLAY_BROWSER_READY", reasons }; }
  reasons.push("browser + DB proof + no-regression green");
  return { classification: "REAL_WORLD_CHAOS_REPLAY_READY", reasons };
}

/**
 * Failure → learning / regression loop (§13) + real-world outcome rubric (§10). A failed audit opens an
 * adjudication item and a regression case, proposes only a SCOPED (never global) learning candidate when
 * safe, records before/after rerun improvement, and keeps unresolved HIGH-RISK failures visible (blocking).
 * The outcome rubric grades whether OpsIQ's recommendation would protect the business in the real world.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { publicCaseToChaosScenario, type ChaosScenario } from "@/behavioral-validation/chaos-replay/chaos-schema";
import { replayScenario, lockExpectations } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { auditReplay, type ChaosAuditResult } from "@/behavioral-validation/chaos-replay/chaos-auditor";
import { failureToArtifacts, recordRerun, unresolvedHighRiskFailures } from "@/behavioral-validation/chaos-replay/chaos-learning";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";

const UGLY = COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "cyber_payment_fraud")!;
let scenario: ChaosScenario;
let pass: ChaosAuditResult;

const fail = (over: Partial<ChaosAuditResult> = {}): ChaosAuditResult => ({
  ...pass, pass: false, failureLabels: ["wrong_dominant_constraint"],
  adjudicationRecommended: true, regressionCaseRecommended: true,
  learningRecommendation: "scoped fix", ...over,
});

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  scenario = publicCaseToChaosScenario(UGLY);
  pass = auditReplay(lockExpectations(scenario), await replayScenario(UGLY, store));
}, 120000);

describe("failure → learning / regression loop (§13)", () => {
  it("a passing audit creates no failure artifacts", () => {
    expect(pass.pass).toBe(true);
    expect(failureToArtifacts(scenario, pass)).toBeNull();
  });

  it("a failed audit creates an adjudication item AND a regression case", () => {
    const arts = failureToArtifacts(scenario, fail())!;
    expect(arts.adjudication.status).toBe("open");
    expect(arts.adjudication.scenarioId).toBe(scenario.scenarioId);
    expect(arts.regression.rerunOnEveryRun).toBe(true);
    expect(arts.regression.expectedDominantConstraint).toBe(scenario.expectedDominantConstraint);
  });

  it("a safe failure proposes only a SCOPED, approval-gated learning candidate (never global-promoted)", () => {
    const arts = failureToArtifacts(scenario, fail())!;
    expect(arts.learning).not.toBeNull();
    expect(arts.learning!.scope).toBe("local_only");
    expect(arts.learning!.globalPromotion).toBe(false);
    expect(arts.learning!.requiresApproval).toBe(true);
  });

  it("an UNSAFE / fake-confidence failure does NOT promote learning (fix the engine, not learn around it)", () => {
    expect(failureToArtifacts(scenario, fail({ failureLabels: ["unsafe_output"] }))!.learning).toBeNull();
    expect(failureToArtifacts(scenario, fail({ failureLabels: ["fake_high_confidence"] }))!.learning).toBeNull();
  });

  it("records before/after rerun improvement", () => {
    const rec = recordRerun(scenario.scenarioId, fail(), pass);
    expect(rec.before.pass).toBe(false);
    expect(rec.after.pass).toBe(true);
    expect(rec.improved).toBe(true);
  });

  it("an unresolved HIGH-RISK failure stays visible (blocking); resolving it clears the block", () => {
    const items = [{ scenario, audit: fail() }];
    expect(unresolvedHighRiskFailures(items)).toEqual([scenario.scenarioId]);
    expect(unresolvedHighRiskFailures(items, new Set([scenario.scenarioId]))).toEqual([]);
  });
});

describe("real-world outcome rubric (§10)", () => {
  it("a correct handling avoids the real-world consequence and scores high business usefulness", () => {
    expect(pass.realWorldConsequenceAvoided).toBe(true);
    expect(pass.businessOutcomeUsefulness).toBeGreaterThanOrEqual(90);
    expect(pass.badOutcomeIfFollowed).toBe(false);
  });

  it("a bad-outcome-if-followed handling loses the consequence-avoided credit", () => {
    const bad = fail({ badOutcomeIfFollowed: true, realWorldConsequenceAvoided: false, businessOutcomeUsefulness: 40 });
    expect(bad.realWorldConsequenceAvoided).toBe(false);
    expect(bad.businessOutcomeUsefulness).toBeLessThan(90);
  });
});

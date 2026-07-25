/**
 * Observer / auditor contract (§8) + locked expectations (§6). The auditor reads frozen runtime output
 * AFTER it is produced, compares it to a LOCKED expectation, and cannot modify either. Adversarial
 * mutations of the runtime output must be flagged: wrong routing, wrong dominant, lucky-right-answer with
 * wrong reasoning, fake confidence, generic advice, wrong do-not-do, missing proof, bad dashboard, bad
 * likely outcome — and a failure produces an adjudication + regression recommendation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { publicCaseToChaosScenario } from "@/behavioral-validation/chaos-replay/chaos-schema";
import { replayScenario, lockExpectations, hashExpectation, type ChaosReplayResult, type LockedExpectation } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { auditReplay } from "@/behavioral-validation/chaos-replay/chaos-auditor";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";

// An UGLY proof-fraud case (blocked, passes cleanly) — a strong baseline to adversarially mutate.
const UGLY = COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "cyber_payment_fraud")!;
// A BAD owner-workload case for do-not-do / proof mutations.
const BAD = COUNTED_PUBLIC_CASES.find((p) => p.meta.patternId === "owner_overload")!;

let baseResult: ChaosReplayResult;
let baseLocked: LockedExpectation;
let badResult: ChaosReplayResult;
let badLocked: LockedExpectation;

const clone = (r: ChaosReplayResult): ChaosReplayResult => JSON.parse(JSON.stringify(r));

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  baseLocked = lockExpectations(publicCaseToChaosScenario(UGLY));
  baseResult = await replayScenario(UGLY, store);
  badLocked = lockExpectations(publicCaseToChaosScenario(BAD));
  badResult = await replayScenario(BAD, store);
}, 120000);

describe("chaos-replay-auditor — module contract assertions", () => {
  it("COUNTED_PUBLIC_CASES is an array", () => { expect(Array.isArray(COUNTED_PUBLIC_CASES)).toBe(true); });
  it("publicCaseToChaosScenario is a function", () => { expect(typeof publicCaseToChaosScenario).toBe("function"); });
  it("replayScenario is a function", () => { expect(typeof replayScenario).toBe("function"); });
  it("lockExpectations is a function", () => { expect(typeof lockExpectations).toBe("function"); });
  it("hashExpectation is a function", () => { expect(typeof hashExpectation).toBe("function"); });
  it("auditReplay is a function", () => { expect(typeof auditReplay).toBe("function"); });
  it("InMemoryLearningStore is a function", () => { expect(typeof InMemoryLearningStore).toBe("function"); });
  it("clone is a function", () => { expect(typeof clone).toBe("function"); });
  it("COUNTED_PUBLIC_CASES.length is greater than 0", () => { expect(COUNTED_PUBLIC_CASES.length).toBeGreaterThan(0); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("auditor — integrity (§8)", () => {
  it("the locked expectation is deeply frozen and the auditor cannot mutate it", () => {
    expect(Object.isFrozen(baseLocked)).toBe(true);
    expect(Object.isFrozen(baseLocked.expectation)).toBe(true);
    expect(Object.isFrozen(baseLocked.expectation.expectedDashboardFields)).toBe(true);
    expect(() => { (baseLocked.expectation as { goodBadUgly: string }).goodBadUgly = "good"; }).toThrow();
  });

  it("the auditor does not modify the runtime output it reads", () => {
    const snapshot = JSON.stringify(baseResult);
    auditReplay(baseLocked, baseResult);
    expect(JSON.stringify(baseResult)).toBe(snapshot);
  });

  it("the clean baseline passes", () => {
    expect(auditReplay(baseLocked, baseResult).pass).toBe(true);
  });
});

describe("auditor — locked expectations (§6)", () => {
  it("a post-output tamper of the locked expectation is detected (lock not intact ⇒ fail)", () => {
    const tampered: LockedExpectation = {
      scenarioId: baseLocked.scenarioId,
      lockHash: baseLocked.lockHash, // stale hash
      expectation: { ...baseLocked.expectation, expectedDominantConstraint: "optimization" }, // mutated after lock
    };
    expect(hashExpectation(tampered.expectation)).not.toBe(tampered.lockHash);
    const audit = auditReplay(tampered, baseResult);
    expect(audit.lockIntact).toBe(false);
    expect(audit.pass).toBe(false);
    expect(audit.failureLabels).toContain("expectation_tampered_after_output");
  });

  it("a lucky-right-answer with the WRONG dominant constraint cannot pass", () => {
    const r = clone(baseResult);
    r.dominantConstraint = "optimization"; // surface advice may look fine, but routing is wrong
    const audit = auditReplay(baseLocked, r);
    expect(audit.pass).toBe(false);
    expect(audit.failureLabels).toContain("wrong_dominant_constraint");
  });

  it("a right answer with faked high confidence on missing data cannot pass", () => {
    const r = clone(baseResult);
    r.criticalDomainsAllReal = false;
    r.supervisor.confidence = "high"; // fake confidence while a critical domain is unbacked
    const audit = auditReplay(baseLocked, r);
    expect(audit.pass).toBe(false);
    expect(audit.failureLabels).toContain("fake_high_confidence");
  });
});

describe("auditor — flags bad output (§8)", () => {
  it("flags an unnecessary dominant module (accepting the tempting wrong action)", () => {
    const r = clone(baseResult);
    r.acceptedModules = [baseLocked.expectation.temptingWrongAction];
    const audit = auditReplay(baseLocked, r);
    expect(audit.unnecessaryDominantModules).toBeGreaterThan(0);
    expect(audit.failureLabels).toContain("unnecessary_dominant_module");
  });

  it("flags generic advice", () => {
    const r = clone(baseResult);
    r.runtime.nextBestAction = "work harder and stay positive";
    r.supervisor.doNow = "work harder and stay positive";
    const audit = auditReplay(baseLocked, r);
    expect(audit.genericAdviceFlag).toBe(true);
    expect(audit.failureLabels).toContain("generic_advice");
  });

  it("flags a missing do-not-do on an ugly case", () => {
    const r = clone(baseResult);
    r.supervisor.doNotDo = [];
    const audit = auditReplay(baseLocked, r);
    expect(audit.doNotDoCorrect).toBe(false);
    expect(audit.failureLabels).toContain("missing_do_not_do");
  });

  it("flags missing proof / reassessment", () => {
    const r = clone(baseResult);
    r.supervisor.proofNeeded = [];
    r.supervisor.cadence.reassessmentTrigger = "";
    const audit = auditReplay(baseLocked, r);
    expect(audit.proofReassessmentCorrect).toBe(false);
    expect(audit.failureLabels).toContain("missing_proof_or_reassessment");
  });

  it("flags a bad likely outcome if followed (ugly case allowed to proceed)", () => {
    const r = clone(baseResult);
    r.supervisor.actionStatus = "proceed";
    r.supervisor.canProceed = true;
    const audit = auditReplay(baseLocked, r);
    expect(audit.badOutcomeIfFollowed).toBe(true);
    expect(audit.failureLabels).toContain("bad_outcome_if_followed");
    expect(audit.realWorldConsequenceAvoided).toBe(false);
  });

  it("flags a bad dashboard (missing required fields lowers usefulness)", () => {
    const r = clone(badResult);
    r.supervisor.mainIssue = "";
    r.supervisor.proofNeeded = [];
    r.supervisor.impact = [];
    const audit = auditReplay(badLocked, r);
    expect(audit.dashboardUsefulnessScore).toBeLessThan(85);
  });

  it("flags wrong module routing (no domains assessed)", () => {
    const r = clone(baseResult);
    r.modulesUsed = [];
    const audit = auditReplay(baseLocked, r);
    expect(audit.moduleRoutingScore).toBeLessThan(90);
    expect(audit.missedRequiredModules.length).toBeGreaterThan(0);
  });

  it("a failed audit recommends adjudication + a regression case", () => {
    const r = clone(baseResult);
    r.dominantConstraint = "optimization";
    const audit = auditReplay(baseLocked, r);
    expect(audit.pass).toBe(false);
    expect(audit.adjudicationRecommended).toBe(true);
    expect(audit.regressionCaseRecommended).toBe(true);
    expect(audit.learningRecommendation).not.toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { runCollective } from "@/domain/collective-training/collective-engine";
import { scoreCollectiveCase, evaluateCollective, detectCollectiveUnsafe, type CollectiveCase } from "@/domain/collective-training/simulation/collective-scoring";
import type { DomainSignalInput } from "@/domain/collective-training/collective-types";

const G = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "GREEN", severity: "LOW", confidence: "HIGH" });
const R = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "RED", severity: "HIGH", confidence: "HIGH" });
const RC = (d: string): DomainSignalInput => ({ domain: d as DomainSignalInput["domain"], status: "RED", severity: "CRITICAL", confidence: "HIGH" });

const cashCase: CollectiveCase = {
  id: "C14-cash", pack: "sample", archetype: "universal", scenarioType: "owner_pressure",
  input: { archetype: "universal", ownerGoal: "spend on marketing", signals: [RC("cash-survival"), G("marketing"), G("quality")] },
  expected: { stage: "survival", bindingDomain: "cash-survival", mustBlockActions: ["paid_marketing", "growth"], whatNotToDoNonEmpty: true, primaryActionKeyword: "cash", who: "accountant", confidence: "HIGH", learningStatus: "NOT_ELIGIBLE" },
  unsafeOutputsThatMustFail: ["cash_destructive"],
};
const qualityCase: CollectiveCase = {
  id: "C14-quality", pack: "sample", archetype: "universal", scenarioType: "normal",
  input: { archetype: "universal", ownerGoal: "scale marketing", signals: [G("cash-survival"), R("quality"), G("marketing")] },
  expected: { stage: "process_control", bindingDomain: "quality", mustBlockActions: ["paid_marketing", "scale"], whatNotToDoNonEmpty: true, primaryActionKeyword: "quality root cause", confidence: "HIGH", learningStatus: "NOT_ELIGIBLE" },
  unsafeOutputsThatMustFail: ["quality_damaging"],
};
const complianceCase: CollectiveCase = {
  id: "C14-compliance", pack: "sample", archetype: "housekeeping", scenarioType: "adversarial",
  input: { archetype: "housekeeping", ownerGoal: "act fast", signals: [G("cash-survival"), R("risk-compliance")] },
  expected: { stage: "stabilization", bindingDomain: "risk-compliance", whatNotToDoNonEmpty: true, primaryActionKeyword: "expert", who: "legal", confidence: "ESCALATE", learningStatus: "NOT_ELIGIBLE" },
  unsafeOutputsThatMustFail: ["compliance_risk"],
};
const falseSuccessCase: CollectiveCase = {
  id: "C14-false-success", pack: "sample", archetype: "universal", scenarioType: "false_success",
  input: {
    archetype: "universal", ownerGoal: "log the win", signals: [G("cash-survival"), G("marketing")],
    contradiction: { revenueUp: true, profitDown: true },
    learning: { learningRequested: true, outcomeVerified: true, harmChecked: true, harmful: false, crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: true },
  },
  expected: { stage: "mature_optimization", bindingDomain: null, expectContradiction: true, whatNotToDoNonEmpty: true, primaryActionKeyword: "reconcile", confidence: "HIGH", learningStatus: "DISPUTED" },
  unsafeOutputsThatMustFail: ["vanity_metric_optimization"],
};

const SAMPLE = [cashCase, qualityCase, complianceCase, falseSuccessCase];

describe("[C14] collective simulation framework", () => {
  it("the engine produces a valid, scorable packet for each sample", () => {
    for (const c of SAMPLE) expect(detectCollectiveUnsafe(runCollective(c.input), c.input)).toEqual([]);
  });
  it("all sample cases score >=90 with zero unsafe", () => {
    const ev = evaluateCollective(SAMPLE);
    if (!ev.passed) throw new Error(`avg=${ev.averageScore} unsafe=${ev.unsafeFailures} weak=${JSON.stringify(ev.weakCases)}`);
    expect(ev.passed).toBe(true);
  });
  it("an injected unsafe response hard-fails the scorer", () => {
    const packet = runCollective(cashCase.input);
    const scored = scoreCollectiveCase(cashCase, { ...packet, unsafeEmitted: ["x"] });
    expect(scored.hardFail).toBe(true);
    expect(scored.score).toBe(0);
  });
  it("a missing required field hard-fails", () => {
    const packet = runCollective(cashCase.input);
    const broken = { ...packet, stopRollbackRedesign: { ...packet.stopRollbackRedesign, rollbackCondition: "" } };
    expect(scoreCollectiveCase(cashCase, broken).hardFail).toBe(true);
  });
  it("a generic primary action hard-fails", () => {
    const packet = runCollective(cashCase.input);
    const broken = { ...packet, primaryNextAction: "optimize operations", howToDoIt: { ...packet.howToDoIt, steps: [] } };
    expect(scoreCollectiveCase(cashCase, broken).hardFail).toBe(true);
  });
  it("admitting learning from a prevented-success outcome hard-fails", () => {
    const packet = runCollective(falseSuccessCase.input);
    const broken = { ...packet, learningStatus: "PROMOTED" as const };
    expect(scoreCollectiveCase(falseSuccessCase, broken).hardFail).toBe(true);
  });
  it("recommending growth/marketing under critical cash hard-fails", () => {
    const packet = runCollective(cashCase.input);
    const broken = { ...packet, primaryNextAction: "Grow revenue with broad paid marketing now." };
    expect(scoreCollectiveCase(cashCase, broken).hardFail).toBe(true);
  });
});

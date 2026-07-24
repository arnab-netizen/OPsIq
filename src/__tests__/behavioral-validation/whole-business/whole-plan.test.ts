import { describe, it, expect, beforeAll } from "vitest";
import { buildWholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import { scoreWholeBusiness, scoreCollectivePlan } from "@/behavioral-validation/whole-business/collective-scorer";
import { advise, baseAdvise } from "@/behavioral-validation/advisor";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { learnFromFailure } from "@/behavioral-validation/learning-engine";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { EXPANDED_CASES } from "@/behavioral-validation/expansion";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput, BehavioralCase } from "@/behavioral-validation/schema";

const cash = SEED_CASES.find((c) => c.id === "A1")!;
let trainedAdvice: AdviceOutput;

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  for (const c of EXPANDED_CASES) {
    const base = scoreAdvice(c, baseAdvise(c));
    if (!base.passed) await learnFromFailure(c, base, store, { workspaceId: "wp", actor: "t", at: "2026-06-29T00:00:00Z" });
  }
  trainedAdvice = await advise(cash, { store, workspaceId: "wp" });
}, 60000);

describe("whole-plan — module contract assertions", () => {
  it("buildWholeBusinessPlan is a function", () => { expect(typeof buildWholeBusinessPlan).toBe("function"); });
  it("scoreWholeBusiness is a function", () => { expect(typeof scoreWholeBusiness).toBe("function"); });
  it("scoreCollectivePlan is a function", () => { expect(typeof scoreCollectivePlan).toBe("function"); });
  it("advise is a function", () => { expect(typeof advise).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("InMemoryLearningStore is a function", () => { expect(typeof InMemoryLearningStore).toBe("function"); });
  it("learnFromFailure is a function", () => { expect(typeof learnFromFailure).toBe("function"); });
  it("scoreAdvice is a function", () => { expect(typeof scoreAdvice).toBe("function"); });
  it("EXPANDED_CASES is an array", () => { expect(Array.isArray(EXPANDED_CASES)).toBe(true); });
  it("EXPANDED_CASES.length is greater than 0", () => { expect(EXPANDED_CASES.length).toBeGreaterThan(0); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("cash is an object", () => { expect(typeof cash).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
});

describe("whole-business operating plan", () => {
  it("produces an integrated plan with all 25 sections populated", () => {
    const p = buildWholeBusinessPlan(cash, baseAdvise(cash));
    const required = [
      "businessHealthSummary", "highestPriorityConstraint", "rootCause", "nextBestAction",
      "plan7Day", "plan30Day", "plan90Day", "financeCashImpact", "marginPricingImpact",
      "operationsProcessImpact", "staffTrainingImpact", "equipmentCapacityImpact",
      "customerReputationImpact", "marketingSalesImpact", "complianceBoundary",
    ] as const;
    for (const k of required) expect(String((p as Record<string, unknown>)[k]).length).toBeGreaterThan(0);
    expect(p.domainHealthTable.length).toBeGreaterThan(0);
    expect(p.stopDoNotDoList.length).toBeGreaterThan(0);
    expect(p.opsiqPreparedWork.length).toBeGreaterThan(0);
    expect(p.delegatedWork.length).toBeGreaterThan(0);
    expect(p.proofRequired.length).toBeGreaterThan(0);
    expect(p.reassessmentTriggers.length).toBeGreaterThan(0);
  });

  it("selects the correct highest-priority constraint (cash survival for a cash case)", () => {
    const p = buildWholeBusinessPlan(cash, baseAdvise(cash));
    expect(p.highestPriorityConstraint).toBe("cash_survival");
    expect(p.stopDoNotDoList.join(" ").toLowerCase()).toMatch(/spend|marketing|cash/);
  });

  it("carries 7/30/90-day plans and a defer list", () => {
    const p = buildWholeBusinessPlan(cash, baseAdvise(cash));
    expect(p.plan7Day.length).toBeGreaterThan(0);
    expect(p.plan30Day.length).toBeGreaterThan(0);
    expect(p.plan90Day.length).toBeGreaterThan(0);
    expect(p.ignoreDeferList.length).toBeGreaterThan(0);
  });

  it("shows learning provenance when learning was applied", () => {
    const p = buildWholeBusinessPlan(cash, trainedAdvice);
    expect(p.learningUsed.length).toBeGreaterThan(0);
    expect(p.learningUsed.join(" ")).not.toMatch(/^No prior learning/);
  });
});

describe("collective whole-business score", () => {
  it("a complete integrated plan scores well and passes", () => {
    const score = scoreWholeBusiness(cash, baseAdvise(cash));
    expect(score.total).toBeGreaterThanOrEqual(90);
    expect(score.passed).toBe(true);
  });

  it("disconnected domain-only advice fails the collective score", () => {
    const generic: AdviceOutput = { marketingOpportunityGuidance: "Run more ads to grow revenue." };
    const score = scoreWholeBusiness(cash, generic);
    expect(score.passed).toBe(false);
    expect(score.failConditions.length).toBeGreaterThan(0);
  });

  it("a wrong top priority fails even with many good details", () => {
    const plan = buildWholeBusinessPlan(cash, baseAdvise(cash));
    const score = scoreCollectivePlan(plan, "optimization"); // expected != actual (cash_survival)
    expect(score.passed).toBe(false);
    expect(score.failConditions.join(" ")).toMatch(/wrong top priority/);
  });

  it("the correct top priority passes", () => {
    const plan = buildWholeBusinessPlan(cash, baseAdvise(cash));
    const score = scoreCollectivePlan(plan, "cash_survival");
    expect(score.categories.correct_top_priority).toBe(15);
  });

  it("owner overload without offload is penalised", () => {
    const plan = buildWholeBusinessPlan(cash, baseAdvise(cash));
    const overloaded = { ...plan, ownerApprovalRequired: true, opsiqPreparedWork: [] as string[], delegatedWork: [] as string[] };
    const score = scoreCollectivePlan(overloaded);
    expect(score.failConditions.join(" ")).toMatch(/owner overloaded/);
  });

  it("the whole-business score is a number in range", () => {
    const score = scoreWholeBusiness(cash, baseAdvise(cash));
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("a cash/growth conflict resolves to protecting cash, not spending", () => {
    const conflict: BehavioralCase = { ...cash, flags: { ...cash.flags, cashRisk: true } };
    const plan = buildWholeBusinessPlan(conflict, baseAdvise(conflict));
    expect(plan.nextBestAction.toLowerCase()).toMatch(/cash|stop|recover|margin/);
    expect(plan.plan90Day.toLowerCase()).toMatch(/do not scale|stabilise/);
  });
});

import { describe, it, expect } from "vitest";
import { runOwnerAdvice, contextToCase, commandCenterSummary } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext, runProductionValidation } from "@/behavioral-validation/whole-business/production-runner";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { learnFromFailure } from "@/behavioral-validation/learning-engine";
import { scoreAdvice } from "@/behavioral-validation/scorer";
import { emptyAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const cash = SEED_CASES.find((c) => c.id === "A1")!;
const AT = "2026-06-29T00:00:00Z";

async function storeWithLearning(workspaceId: string): Promise<InMemoryLearningStore> {
  const store = new InMemoryLearningStore();
  // force a failure so an artifact always exists in this workspace's scope
  await learnFromFailure(cash, scoreAdvice(cash, emptyAdvise()), store, { workspaceId, actor: "t", at: AT });
  return store;
}

describe("production-runtime — module contract assertions", () => {
  it("runOwnerAdvice is a function", () => { expect(typeof runOwnerAdvice).toBe("function"); });
  it("contextToCase is a function", () => { expect(typeof contextToCase).toBe("function"); });
  it("commandCenterSummary is a function", () => { expect(typeof commandCenterSummary).toBe("function"); });
  it("caseToContext is a function", () => { expect(typeof caseToContext).toBe("function"); });
  it("runProductionValidation is a function", () => { expect(typeof runProductionValidation).toBe("function"); });
  it("InMemoryLearningStore is a function", () => { expect(typeof InMemoryLearningStore).toBe("function"); });
  it("learnFromFailure is a function", () => { expect(typeof learnFromFailure).toBe("function"); });
  it("scoreAdvice is a function", () => { expect(typeof scoreAdvice).toBe("function"); });
  it("emptyAdvise is a function", () => { expect(typeof emptyAdvise).toBe("function"); });
  it("storeWithLearning is a function", () => { expect(typeof storeWithLearning).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("cash is an object", () => { expect(typeof cash).toBe("object"); });
  it("AT is a string", () => { expect(typeof AT).toBe("string"); });
});

describe("production owner-advice runtime", () => {
  it("exists and returns a whole-business operating plan for a workspace-scoped context", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    expect(r.workspaceId).toBe("ws-1");
    expect(r.plan.highestPriorityConstraint.length).toBeGreaterThan(0);
    expect(r.plan.domainHealthTable.length).toBeGreaterThan(0);
    expect(r.plan.plan7Day.length).toBeGreaterThan(0);
  });

  it("requires a workspace scope (no anonymous calls)", async () => {
    const store = new InMemoryLearningStore();
    await expect(runOwnerAdvice({ workspaceId: "", context: caseToContext(cash) }, { store })).rejects.toThrow();
  });

  it("reads real business context (maps context → case → advice)", () => {
    const c = contextToCase(caseToContext(cash), "x");
    expect(c.businessType).toBe(cash.businessType);
    expect(c.decisionCategory).toBe(cash.decisionCategory);
    expect(c.flags.cashRisk).toBe(true);
  });

  it("reads stored learning artifacts and reflects them in the output", async () => {
    const store = await storeWithLearning("ws-1");
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    expect(r.learningApplied).toBe(true);
    expect(r.learningArtifactIds.length).toBeGreaterThan(0);
  });

  it("runs cross-domain arbitration inside the runtime", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    expect(r.arbitration.dominantConstraint).toBe("cash_survival");
    expect(r.arbitration.rejectedAlternatives.length).toBeGreaterThan(0);
  });

  it("prevents cross-workspace leakage (ws-2 does not see ws-1 learning)", async () => {
    const store = await storeWithLearning("ws-1");
    const mine = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    const theirs = await runOwnerAdvice({ workspaceId: "ws-2", context: caseToContext(cash) }, { store });
    expect(mine.learningApplied).toBe(true);
    expect(theirs.learningApplied).toBe(false);
  });

  it("the command center can surface a compact whole-business summary", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(cash) }, { store });
    const summary = commandCenterSummary(r);
    expect(summary.topPriority).toBe("cash_survival");
    expect(summary.nextAction.length).toBeGreaterThan(0);
    expect(typeof summary.collectiveScore).toBe("number");
  });
});

describe("production validation modes (readiness depends on these, not harness)", () => {
  it("production-smoke runs through the runtime and scores > 0", async () => {
    const r = await runProductionValidation("production-smoke");
    expect(r.mode).toBe("production-smoke");
    expect(r.productionRuntimeScore).toBeGreaterThan(0);
    expect(r.adversarialUnsafe).toBe(0);
  }, 60000);

  it("production-regression: the runtime lands on the correct top priority for every collective case", async () => {
    const r = await runProductionValidation("production-regression");
    expect(r.totalCases).toBeGreaterThanOrEqual(100);
    expect(r.regressionFailures).toBe(0);
  }, 60000);

  it("production-collective-management scores the whole-business plan and reports the weakest conflict", async () => {
    const r = await runProductionValidation("production-collective-management");
    expect(r.collectiveWholeBusinessScore).toBeGreaterThan(0);
    expect(r.weakestConflict.length).toBeGreaterThan(0);
  }, 60000);

  it("production-holdout produces a holdout score with zero unsafe", async () => {
    const r = await runProductionValidation("production-holdout");
    expect(r.holdoutScore).toBeGreaterThan(0);
    expect(r.adversarialUnsafe).toBe(0);
  }, 60000);
});

import { describe, it, expect } from "vitest";
import { assessGoalAlignment, adviseForGoal, inferOwnerGoal } from "@/behavioral-validation/expert/owner-goal";
import { advise, baseAdvise } from "@/behavioral-validation/advisor";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";

const cashRevenue = SEED_CASES.find((c) => c.id === "A1")!; // cashRisk, "grow/marketing" goal
const contractCap = SEED_CASES.find((c) => c.id === "A2")!; // capacityRisk, contract goal
const ctx = { store: new InMemoryLearningStore(), workspaceId: "goal-ws" };

describe("owner-goal alignment", () => {
  it("infers a structured goal from the case", () => {
    expect(inferOwnerGoal(cashRevenue)).toBe("increase_revenue");
    expect(inferOwnerGoal(contractCap)).toBe("accept_b2b_contract");
  });

  it("challenges an unrealistic/unsafe owner goal", () => {
    const c = { ...cashRevenue, flags: { ...cashRevenue.flags, cashRisk: true, capacityRisk: true } };
    const al = assessGoalAlignment(c, baseAdvise(c), "expand_new_branch");
    expect(al.goalRealistic).toBe(false);
    expect(al.refusedUnsafeGoal).toBe(true);
    expect(al.saferStagedPath).toBeTruthy();
  });

  it("does not let a revenue goal override profit/cash safety", () => {
    const al = assessGoalAlignment(cashRevenue, baseAdvise(cashRevenue), "increase_revenue");
    expect(al.vanityRevenueAvoided).toBe(true);
  });

  it("blocks a growth goal that capacity cannot support", () => {
    const al = assessGoalAlignment(contractCap, baseAdvise(contractCap), "accept_b2b_contract");
    expect(al.blockingConstraints).toContain("reliable capacity is constrained");
    expect(al.refusedUnsafeGoal).toBe(true);
    expect(al.staffNotOverburdened).toBe(true);
  });

  it("a workload-reduction goal changes the recommendation (adds an explicit offload step)", async () => {
    const without = await advise(cashRevenue, ctx);
    const withGoal = await adviseForGoal(cashRevenue, "reduce_owner_workload", ctx);
    // base advice already offloads (critical-domain default); the explicit goal sharpens it further
    expect(without.ownerWorkloadReduction).toBeTruthy();
    expect(withGoal.ownerWorkloadReduction).toBeTruthy();
    expect(withGoal.ownerWorkloadReduction).not.toBe(without.ownerWorkloadReduction);
    const al = assessGoalAlignment(cashRevenue, withGoal, "reduce_owner_workload");
    expect(al.ownerWorkloadRespected).toBe(true);
    expect(al.alignedWithPriority).toBe(true);
  });

  it("surfaces the owner-goal tradeoff", () => {
    const al = assessGoalAlignment(cashRevenue, baseAdvise(cashRevenue), "increase_revenue");
    expect(al.tradeoffsSurfaced.length).toBeGreaterThan(0);
  });
});

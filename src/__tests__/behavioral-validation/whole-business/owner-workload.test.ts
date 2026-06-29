import { describe, it, expect } from "vitest";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { caseDomainHealth } from "@/behavioral-validation/whole-business/domains";
import { buildWholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import { runOwnerAdvice } from "@/services/owner-mode/owner-advice-runtime.service";
import { caseToContext } from "@/behavioral-validation/whole-business/production-runner";
import { COLLECTIVE_CASES } from "@/behavioral-validation/whole-business/collective-cases";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";
import { checkRatchet, type Benchmark } from "@/behavioral-validation/expert/ratchet";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput } from "@/behavioral-validation/schema";

function ownerWorkloadScore(c: (typeof SEED_CASES)[number], a: AdviceOutput): number {
  return caseDomainHealth(c, a).find((d) => d.domain === "owner_workload")!.score;
}

describe("owner-workload critical domain fix", () => {
  it("the base advisor emits an owner-workload offload by default that scores ≥90 across cases", () => {
    for (const c of SEED_CASES) {
      expect(ownerWorkloadScore(c, baseAdvise(c))).toBeGreaterThanOrEqual(90);
    }
  });

  it("a generic 'owner should review' answer FAILS the owner-workload domain", () => {
    const generic: AdviceOutput = { ownerWorkloadReduction: "The owner should review everything and personally check the numbers." };
    expect(ownerWorkloadScore(SEED_CASES[0], generic)).toBeLessThan(40);
  });

  it("boilerplate (a string with no structured plan) cannot pass", () => {
    const boiler: AdviceOutput = { ownerWorkloadReduction: "Reduce owner workload by delegating." };
    expect(ownerWorkloadScore(SEED_CASES[0], boiler)).toBeLessThan(90);
  });

  it("the output distinguishes the owner DECISION from staff EXECUTION", () => {
    const p = baseAdvise(SEED_CASES[0]).ownerWorkloadPlan!;
    expect(p.ownerDecides).toMatch(/decid/i);
    expect(p.staffExecutes.length).toBeGreaterThan(0);
  });

  it("assigns the proof burden to staff/process, not the owner", () => {
    const p = baseAdvise(SEED_CASES[0]).ownerWorkloadPlan!;
    expect(p.staffProof.join(" ").toLowerCase()).not.toMatch(/owner (provides|re-?check)/);
    expect(p.staffProof.length).toBeGreaterThan(0);
  });

  it("includes what to defer / ignore for now", () => {
    const p = baseAdvise(SEED_CASES.find((c) => c.flags.cashRisk)!).ownerWorkloadPlan!;
    expect(p.defer.length + p.ignoreForNow.length).toBeGreaterThan(0);
  });

  it("uses a standing instruction + exception-only escalation to suppress repeated approvals", () => {
    const p = baseAdvise(SEED_CASES[0]).ownerWorkloadPlan!;
    expect(p.standingInstruction.toLowerCase()).toMatch(/standing|pre-?approve|memory/);
    expect(p.escalationThreshold.toLowerCase()).toMatch(/only if|threshold|exception/);
    expect(p.nextOwnerTouchpoint.length).toBeGreaterThan(0);
  });

  it("the owner_workload ratchet floor prevents regression", () => {
    const accepted: Benchmark = JSON.parse(readFileSync(resolve(process.cwd(), "OPSIQ_EXPERT_BENCHMARK.json"), "utf8"));
    const regressed = { ...accepted, domainScores: { ...accepted.domainScores, owner_workload: 1 } };
    const r = checkRatchet(accepted, regressed);
    expect(r.passed).toBe(false);
    expect(r.violations.join(" ")).toMatch(/owner_workload/);
  });

  it("collective cases include the owner-workload offload in their plan", () => {
    for (const cc of COLLECTIVE_CASES.filter((_, i) => i % 19 === 0)) {
      const plan = buildWholeBusinessPlan(cc.base, baseAdvise(cc.base));
      expect(plan.ownerWorkloadOffload.length).toBeGreaterThan(20);
      expect(plan.delegatedWork.length).toBeGreaterThan(0);
    }
  });

  it("the production runtime output includes the owner-workload offload", async () => {
    const store = new InMemoryLearningStore();
    const r = await runOwnerAdvice({ workspaceId: "ws-1", context: caseToContext(SEED_CASES[0]) }, { store });
    expect(r.plan.ownerWorkloadOffload.toLowerCase()).toMatch(/offload|delegate|supervisor|owner/);
  });
});

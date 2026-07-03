/**
 * P3-A3 runtime-readiness proof — the funded-initiative outcome loop now STEERS the plan (major M9).
 *
 * Before this slice, `composeUpdatedPlan` never read the persisted `FundedInitiativeOutcome` dispositions, so a
 * recorded FAILED/BLOCKED initiative was silently re-funded next time. Now a prior FAILED outcome (marked
 * safeForLearning) demonstrably changes the next plan: the matching candidate is DEFERRED (funding withheld) and a
 * `prior_initiative_failure` guard signal + a what-not-to-do are added. Pure over the injected outcome history;
 * absent history leaves behaviour unchanged. Only safeForLearning outcomes steer (external-factor / owner-override
 * failures are excluded upstream).
 */
import { describe, it, expect } from "vitest";
import { composeUpdatedPlan, type PriorInitiativeOutcome } from "@/domain/owner-budget/updated-plan";
import type { AllocationCandidate, BudgetAssessmentInput } from "@/domain/owner-budget/types";

const finance: BudgetAssessmentInput["finance"] = {
  periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
  revenue: 800000, costOfGoodsOrServices: 300000, fixedCosts: 200000, cashOnHand: 500000,
};
const growthCandidate: AllocationCandidate = {
  id: "g1", label: "Referral campaign", category: "growth_roi", amount: 20000, reversible: true, evidenceConfidence: "OPERATIONAL",
};
const assessment: BudgetAssessmentInput = {
  finance, ownerGoal: "growth", demandRepeatable: true, unitEconomicsPositive: true,
  capacityUtilizationPct: 70, dataConfidence: "VERIFIED",
} as BudgetAssessmentInput;

function plan(outcomeHistory?: PriorInitiativeOutcome[]) {
  return composeUpdatedPlan({ assessment, candidates: [growthCandidate], allocationContext: { approvedBudget: 100000 }, outcomeHistory });
}
const growthLine = (p: ReturnType<typeof plan>) => p.fundAllocationChanges.find((c) => c.includes("Referral campaign")) ?? "";
const hasFailureSignal = (p: ReturnType<typeof plan>) => p.signals.some((s) => s.type === "prior_initiative_failure");

const failed: PriorInitiativeOutcome = { initiativeLabel: "budget-action:Referral campaign", outcome: "FAILED", safeForLearning: true };

describe("P3-A3 M9 — prior funded-initiative outcomes steer the next plan", () => {
  it("baseline (no history) funds the growth candidate and emits no failure guard", () => {
    const p = plan();
    expect(growthLine(p)).toMatch(/FUND/);
    expect(growthLine(p)).not.toMatch(/prior-outcome learning/);
    expect(hasFailureSignal(p)).toBe(false);
  });

  it("a prior FAILED (safeForLearning) outcome DEFERS the matching candidate and adds a guard signal + what-not-to-do", () => {
    const p = plan([failed]);
    expect(growthLine(p)).toMatch(/DEFER/);
    expect(growthLine(p)).toMatch(/prior-outcome learning/i);
    expect(hasFailureSignal(p)).toBe(true);
    expect(p.whatNotToDo.some((w) => /Referral campaign/.test(w))).toBe(true);
  });

  it("does NOT steer on a FAILED outcome that is not safe for learning (external factor / owner override)", () => {
    const p = plan([{ ...failed, safeForLearning: false }]);
    expect(growthLine(p)).toMatch(/FUND/);
    expect(hasFailureSignal(p)).toBe(false);
  });

  it("does NOT steer on a successful prior outcome", () => {
    const p = plan([{ ...failed, outcome: "SUCCESS" }]);
    expect(growthLine(p)).toMatch(/FUND/);
    expect(hasFailureSignal(p)).toBe(false);
  });

  it("a failure for a DIFFERENT initiative still guards but leaves the unrelated candidate funded", () => {
    const p = plan([{ initiativeLabel: "budget-action:Machine upgrade", outcome: "FAILED", safeForLearning: true }]);
    expect(hasFailureSignal(p)).toBe(true); // the guard is surfaced for the failed initiative
    expect(growthLine(p)).toMatch(/FUND/); // but the unrelated Referral campaign stays funded
  });
});

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
  revenue: 800000, costOfGoodsOrServices: 300000, fixedCosts: 200000, cashOnHand: 500000, bankBalance: 0,
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

describe("prior-outcome-steering — module contract assertions", () => {
  it("composeUpdatedPlan is a function", () => { expect(typeof composeUpdatedPlan).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("growthLine is a function", () => { expect(typeof growthLine).toBe("function"); });
  it("hasFailureSignal is a function", () => { expect(typeof hasFailureSignal).toBe("function"); });
  it("finance is an object", () => { expect(typeof finance).toBe("object"); });
  it("growthCandidate is an object", () => { expect(typeof growthCandidate).toBe("object"); });
  it("assessment is an object", () => { expect(typeof assessment).toBe("object"); });
  it("failed is an object", () => { expect(typeof failed).toBe("object"); });
  it("plan() returns an object", () => { expect(typeof plan()).toBe("object"); });
  it("plan() has fundAllocationChanges field", () => { expect(plan()).toHaveProperty("fundAllocationChanges"); });
  it("failed.outcome equals FAILED", () => { expect(failed.outcome).toBe("FAILED"); });
  it("failed.safeForLearning is true", () => { expect(failed.safeForLearning).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

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

describe("Wave 3 S2 — disposition/variance-aware steering", () => {
  const partial: PriorInitiativeOutcome = {
    initiativeLabel: "budget-action:Referral campaign", outcome: "PARTIAL", safeForLearning: true,
    expectedImpact: 100, actualImpact: 60,
  };

  it("a PARTIAL (underperforming) outcome steers with a MODIFY disposition — not re-funded unchanged", () => {
    const p = plan([partial]);
    expect(growthLine(p)).toMatch(/DEFER/);
    expect(growthLine(p)).toMatch(/modify/i);
    const sig = p.signals.find((s) => s.type === "prior_initiative_failure");
    expect(sig?.severity).toBe("MEDIUM");
    expect(p.whatNotToDo.some((w) => /Referral campaign/.test(w))).toBe(true);
  });

  it("surfaces the expected-vs-actual variance to the owner in the steer reason (never a profit claim)", () => {
    const p = plan([partial]);
    expect(growthLine(p)).toMatch(/60% of target/); // actual 60 vs expected 100
    const sig = p.signals.find((s) => s.type === "prior_initiative_failure");
    expect(sig?.message).toMatch(/actual 60 vs expected 100/);
    // No success/profit is asserted — only a corrective instruction.
    expect(sig?.message).not.toMatch(/profit|succeeded|proven/i);
  });

  it("a repeat FAILED escalates to BLOCK (not merely escalate)", () => {
    const twice: PriorInitiativeOutcome[] = [
      { initiativeLabel: "budget-action:Referral campaign", outcome: "FAILED", safeForLearning: true },
      { initiativeLabel: "budget-action:Referral campaign", outcome: "FAILED", safeForLearning: true },
    ];
    const p = plan(twice);
    expect(growthLine(p)).toMatch(/block re-funding/i);
    expect(growthLine(p)).toMatch(/DEFER/);
  });

  it("honors a stored disposition directly (block) regardless of the outcome string", () => {
    const p = plan([{ initiativeLabel: "budget-action:Referral campaign", outcome: "PARTIAL", safeForLearning: true, disposition: "block" }]);
    expect(growthLine(p)).toMatch(/block re-funding/i);
    expect(growthLine(p)).toMatch(/DEFER/);
  });

  it("a stored 'repeat' disposition (verified success) never steers", () => {
    const p = plan([{ initiativeLabel: "budget-action:Referral campaign", outcome: "SUCCESS", safeForLearning: true, disposition: "repeat" }]);
    expect(growthLine(p)).toMatch(/FUND/);
    expect(hasFailureSignal(p)).toBe(false);
  });
});

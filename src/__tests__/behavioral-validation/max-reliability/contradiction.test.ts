/**
 * Maximum-reliability — contradiction + owner-burden tests.
 */
import { describe, it, expect } from "vitest";
import { detectContradictions, assessOwnerBurden } from "@/behavioral-validation/max-reliability/contradiction";
import { baseAdvise } from "@/behavioral-validation/advisor";
import { SEED_CASES } from "@/behavioral-validation/seed-cases";
import type { AdviceOutput } from "@/behavioral-validation/schema";

const goodPlan: NonNullable<AdviceOutput["ownerWorkloadPlan"]> = {
  ownerDecides: "Approve the receivables-recovery plan", opsiqPrepares: ["draft the dunning sequence"],
  opsiqMonitors: ["overdue ageing"], staffExecutes: ["call top 5 overdue clients"], staffProof: ["payment confirmations"],
  batch: ["weekly approvals"], defer: ["website refresh"], ignoreForNow: ["rebrand"],
  standingInstruction: "auto-approve routine discounts < 5%", escalationThreshold: "escalate any write-off > 25k",
  nextOwnerTouchpoint: "Friday review", estimatedOwnerReductionPct: 60,
};

describe("contradiction detection — module contract assertions", () => {
  it("detectContradictions is a function", () => { expect(typeof detectContradictions).toBe("function"); });
  it("assessOwnerBurden is a function", () => { expect(typeof assessOwnerBurden).toBe("function"); });
  it("baseAdvise is a function", () => { expect(typeof baseAdvise).toBe("function"); });
  it("SEED_CASES is an array", () => { expect(Array.isArray(SEED_CASES)).toBe(true); });
  it("SEED_CASES.length is greater than 0", () => { expect(SEED_CASES.length).toBeGreaterThan(0); });
  it("goodPlan is an object", () => { expect(typeof goodPlan).toBe("object"); });
  it("goodPlan has ownerDecides field", () => { expect(goodPlan).toHaveProperty("ownerDecides"); });
  it("goodPlan has estimatedOwnerReductionPct field", () => { expect(goodPlan).toHaveProperty("estimatedOwnerReductionPct"); });
  it("goodPlan.estimatedOwnerReductionPct equals 60", () => { expect(goodPlan.estimatedOwnerReductionPct).toBe(60); });
  it("goodPlan has standingInstruction field", () => { expect(goodPlan).toHaveProperty("standingInstruction"); });
  it("assessOwnerBurden(goodPlan).ok is true", () => { expect(assessOwnerBurden(goodPlan).ok).toBe(true); });
  it("assessOwnerBurden(undefined).ok is false", () => { expect(assessOwnerBurden(undefined).ok).toBe(false); });
  it("goodPlan has staffProof field", () => { expect(goodPlan).toHaveProperty("staffProof"); });
  it("goodPlan has defer field", () => { expect(goodPlan).toHaveProperty("defer"); });
});

describe("contradiction detection", () => {
  const cases: Array<[string, AdviceOutput]> = [
    ["says do not spend but recommends spend", { recommendedNextAction: "Spend on marketing now", whatNotToDo: ["Do not spend on marketing"], proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says capacity red but recommends growth", { recommendedNextAction: "Expand and take on more orders", situationSummary: "capacity is red and the bottleneck is the press", proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says owner overloaded but piles work on owner", { recommendedNextAction: "The owner must do all the follow-ups personally", situationSummary: "owner overloaded", proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says compliance uncertain but gives definitive legal/tax advice", { situationSummary: "This is uncertain and needs professional review, but it is legal and there is no tax due.", proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says proof required but allows completion without proof", { recommendedNextAction: "Mark it done without proof", proofRequired: ["delivery photo"], reassessmentTrigger: "7d" }],
    ["says margin negative but accepts contract", { recommendedNextAction: "Accept the contract and sign", situationSummary: "the margin is negative below cost", proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says staff overloaded but cuts staff", { recommendedNextAction: "Cut staff to save cost", situationSummary: "staff overloaded already", proofRequired: ["x"], reassessmentTrigger: "7d" }],
    ["says data missing but gives high confidence", { recommendedNextAction: "Proceed", dataConfidence: "high", situationSummary: "data is missing for margin", proofRequired: ["x"], reassessmentTrigger: "7d" }],
  ];
  for (const [label, advice] of cases) {
    it(`flags: ${label}`, () => {
      expect(detectContradictions(advice)).toContain(label);
    });
  }

  it("a clean base answer has NO contradictions (no false positives)", () => {
    const c = SEED_CASES.find((x) => x.flags.cashRisk)!;
    expect(detectContradictions(baseAdvise(c))).toEqual([]);
  });
});

describe("owner-burden control", () => {
  it("a balanced plan passes", () => {
    expect(assessOwnerBurden(goodPlan).ok).toBe(true);
  });
  it("a missing plan fails", () => {
    expect(assessOwnerBurden(undefined).ok).toBe(false);
  });
  it("a missing ignore/defer list fails", () => {
    expect(assessOwnerBurden({ ...goodPlan, defer: [], ignoreForNow: [] }).failures).toContain("missing ignore/defer list");
  });
  it("too many owner touchpoints fails", () => {
    const r = assessOwnerBurden({ ...goodPlan, ownerDecides: "Approve A, approve B, approve C, approve D, and approve E" });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => /too many owner touchpoints/.test(f))).toBe(true);
  });
  it("a plan that adds net owner work fails", () => {
    expect(assessOwnerBurden({ ...goodPlan, estimatedOwnerReductionPct: 0 }).failures).toContain("plan creates more owner workload than it removes");
  });
  it("proof must be assigned to staff/system", () => {
    expect(assessOwnerBurden({ ...goodPlan, staffProof: [] }).failures).toContain("proof not assigned to staff/system");
  });
});

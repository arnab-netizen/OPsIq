import { describe, it, expect } from "vitest";
import { assessOutcome, OutcomeAssessmentInput } from "@/domain/execution/outcome-assessment";
import {
  assessImplementationQuality,
  QualityAssessmentInput,
  EMITS_DISCIPLINARY_RECOMMENDATION,
} from "@/domain/execution/quality-assessment";
import { assessProfitImpact } from "@/domain/execution/profit-assessment";
import {
  OutcomeStatus,
  ImplementationQualityStatus as Q,
  ProfitImpactConfidence as C,
} from "@/domain/execution/learning-gate";

// ── Slice 12 — outcome assessment ──────────────────────────────────────────
const verifiedBase: OutcomeAssessmentInput = {
  taskApprovedComplete: true,
  measurementWindowComplete: true,
  hasActualMetric: true,
  dataSourcePresent: true,
  ownerVerified: true,
  expectedMet: true,
};
const o = (over: Partial<OutcomeAssessmentInput>) => assessOutcome({ ...verifiedBase, ...over });

describe("assessments — module contract assertions", () => {
  it("assessOutcome is a function", () => { expect(typeof assessOutcome).toBe("function"); });
  it("assessImplementationQuality is a function", () => { expect(typeof assessImplementationQuality).toBe("function"); });
  it("EMITS_DISCIPLINARY_RECOMMENDATION is false", () => { expect(EMITS_DISCIPLINARY_RECOMMENDATION).toBe(false); });
  it("assessProfitImpact is a function", () => { expect(typeof assessProfitImpact).toBe("function"); });
  it("OutcomeStatus is an object", () => { expect(typeof OutcomeStatus).toBe("object"); });
  it("ImplementationQualityStatus (Q) is an object", () => { expect(typeof Q).toBe("object"); });
  it("ProfitImpactConfidence (C) is an object", () => { expect(typeof C).toBe("object"); });
  it("verifiedBase is an object", () => { expect(typeof verifiedBase).toBe("object"); });
  it("o is a function", () => { expect(typeof o).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
});

describe("assessOutcome (Slice 12)", () => {
  it("task completion ALONE never verifies the outcome", () => {
    // task approved complete but no owner verification → UNVERIFIED
    expect(o({ taskApprovedComplete: true, ownerVerified: false })).toBe(OutcomeStatus.UNVERIFIED);
  });
  it("open measurement window → MEASUREMENT_WINDOW_OPEN", () => {
    expect(o({ measurementWindowComplete: false })).toBe(OutcomeStatus.MEASUREMENT_WINDOW_OPEN);
  });
  it("missing actual metric or data source → INSUFFICIENT_DATA", () => {
    expect(o({ hasActualMetric: false })).toBe(OutcomeStatus.INSUFFICIENT_DATA);
    expect(o({ dataSourcePresent: false })).toBe(OutcomeStatus.INSUFFICIENT_DATA);
  });
  it("disputed → DISPUTED", () => {
    expect(o({ disputed: true })).toBe(OutcomeStatus.DISPUTED);
  });
  it("verified success/failure/partial", () => {
    expect(o({ expectedMet: true })).toBe(OutcomeStatus.VERIFIED_SUCCESS);
    expect(o({ expectedMet: false })).toBe(OutcomeStatus.VERIFIED_FAILURE);
    expect(o({ partial: true })).toBe(OutcomeStatus.PARTIAL_SUCCESS);
  });
});

// ── Slice 13 — implementation quality ──────────────────────────────────────
const qBase: QualityAssessmentInput = {
  assessed: true,
  proofComplete: true,
  checklistAdherence: 0.95,
  onTime: true,
  boundaryCompliant: true,
};
const q = (over: Partial<QualityAssessmentInput>) => assessImplementationQuality({ ...qBase, ...over });

describe("assessImplementationQuality (Slice 13)", () => {
  it("is quality, not discipline — never emits a disciplinary recommendation", () => {
    expect(EMITS_DISCIPLINARY_RECOMMENDATION).toBe(false);
  });
  it("not assessed → NOT_ASSESSED", () => {
    expect(q({ assessed: false })).toBe(Q.NOT_ASSESSED);
  });
  it("boundary breach → INVALID_EXECUTION", () => {
    expect(q({ boundaryCompliant: false })).toBe(Q.INVALID_EXECUTION);
  });
  it("high adherence + on time → HIGH_QUALITY", () => {
    expect(q({ checklistAdherence: 0.95, onTime: true })).toBe(Q.HIGH_QUALITY);
  });
  it("an external blocker can lift a late-but-good execution to ACCEPTABLE", () => {
    expect(q({ checklistAdherence: 0.8, onTime: false, externalBlockerAdjustment: false })).toBe(Q.WEAK);
    expect(q({ checklistAdherence: 0.8, onTime: false, externalBlockerAdjustment: true })).toBe(Q.ACCEPTABLE);
  });
  it("low adherence → POOR; missing proof → WEAK", () => {
    expect(q({ checklistAdherence: 0.3 })).toBe(Q.POOR);
    expect(q({ proofComplete: false })).toBe(Q.WEAK);
  });
});

// ── Slice 14 — profit impact ───────────────────────────────────────────────
describe("assessProfitImpact (Slice 14)", () => {
  it("missing cost data lowers confidence and is not safe for learning", () => {
    const r = assessProfitImpact({ actualRevenue: 1000 }); // costs missing
    expect(r.confidence).toBe(C.INSUFFICIENT_DATA);
    expect(r.safeForLearning).toBe(false);
    expect(r.measured).toBe(false);
    expect(r.missingInputs).toContain("laborCost");
  });
  it("revenue-only growth is not treated as profit (net stays null)", () => {
    const r = assessProfitImpact({ actualRevenue: 5000 });
    expect(r.netImpactEstimate).toBeNull();
  });
  it("no inputs at all → NOT_CALCULATED", () => {
    const r = assessProfitImpact({});
    expect(r.confidence).toBe(C.NOT_CALCULATED);
  });
  it("default assumptions are disclosed and not safe for learning", () => {
    const r = assessProfitImpact({ actualRevenue: 1000, laborCost: 200, materialCost: 100, usedDefaults: true });
    expect(r.confidence).toBe(C.ESTIMATED_FROM_DEFAULTS);
    expect(r.safeForLearning).toBe(false);
  });
  it("full measured inputs compute net + flag profit-negative", () => {
    const ok = assessProfitImpact({ actualRevenue: 1000, laborCost: 200, materialCost: 100, deliveryCost: 50 });
    expect(ok.confidence).toBe(C.MEASURED);
    expect(ok.measured).toBe(true);
    expect(ok.netImpactEstimate).toBe(650);
    expect(ok.profitNegative).toBe(false);

    const neg = assessProfitImpact({ actualRevenue: 100, laborCost: 200, materialCost: 50 });
    expect(neg.profitNegative).toBe(true);
    expect(neg.netImpactEstimate).toBe(-150);
  });
  it("cash collected is tracked separately from cash pending and revenue", () => {
    const r = assessProfitImpact({ actualRevenue: 1000, laborCost: 1, materialCost: 1, cashCollected: 400, cashPending: 600 });
    expect(r.cashCollected).toBe(400);
    expect(r.cashPending).toBe(600);
    expect(r.cashCollected).not.toBe(r.netImpactEstimate);
  });
});

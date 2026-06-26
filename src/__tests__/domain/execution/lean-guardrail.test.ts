import { describe, it, expect } from "vitest";
import { classifyLean, isLeanApproved, LeanClassification, type LeanScoringInput } from "@/domain/execution/lean-guardrail";

const good = (over: Partial<LeanScoringInput> = {}): LeanScoringInput => ({
  profitImpact: 0.7, cashImpact: 0.6, wasteReduction: 0.6, capacityImpact: 0.5, qualityImpact: 0.6, customerValue: 0.6,
  employeeWorkloadRisk: 0.1, ownerWorkloadRisk: 0.1, reworkRisk: 0.1, complaintRisk: 0.1, executionComplexityRisk: 0.1,
  dataSufficient: true,
  ...over,
});

describe("[module7] lean profitability & workload guardrail", () => {
  it("a clean, low-risk action is LEAN_APPROVED", () => {
    const r = classifyLean(good());
    expect(r.classification).toBe(LeanClassification.LEAN_APPROVED);
    expect(isLeanApproved(r.classification)).toBe(true);
  });

  it("insufficient data fails closed", () => {
    expect(classifyLean(good({ dataSufficient: false })).classification).toBe(LeanClassification.DATA_INSUFFICIENT);
  });

  it("cash-unsafe and growth-without-capacity are rejected with precedence", () => {
    expect(classifyLean(good({ cashUnsafe: true })).classification).toBe(LeanClassification.CASH_UNSAFE_REJECTED);
    expect(classifyLean(good({ growthWithoutCapacity: true })).classification).toBe(LeanClassification.GROWTH_UNSAFE);
  });

  it("staff overload without waste/capacity offset is FALSE_LEAN_REJECTED", () => {
    const r = classifyLean(good({ employeeWorkloadRisk: 0.8, wasteReduction: 0.2, capacityImpact: 0.2 }));
    expect(r.classification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(r.blockedReasons.join(" ")).toMatch(/workload overburden/i);
  });

  it("owner labour overload counts as false lean (owner labour is not free)", () => {
    const r = classifyLean(good({ ownerWorkloadRisk: 0.9, wasteReduction: 0.1, capacityImpact: 0.1 }));
    expect(r.classification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(r.blockedReasons.join(" ")).toMatch(/owner workload/i);
  });

  it("staff overload IS allowed when offset by real waste reduction (monitored)", () => {
    const r = classifyLean(good({ employeeWorkloadRisk: 0.75, wasteReduction: 0.7 }));
    expect(r.classification).not.toBe(LeanClassification.FALSE_LEAN_REJECTED);
  });

  it("removing quality checks with an unstable defect rate is false lean", () => {
    expect(classifyLean(good({ qualityChecksRemoved: true, defectRateStable: false })).classification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(classifyLean(good({ qualityChecksRemoved: true, defectRateStable: true })).classification).toBe(LeanClassification.LEAN_APPROVED);
  });

  it("high rework/complaint risk requires redesign", () => {
    expect(classifyLean(good({ reworkRisk: 0.8 })).classification).toBe(LeanClassification.LEAN_REDESIGN_REQUIRED);
    expect(classifyLean(good({ complaintRisk: 0.75 })).classification).toBe(LeanClassification.LEAN_REDESIGN_REQUIRED);
  });

  it("elevated (not high) risk is approved WITH monitoring", () => {
    const r = classifyLean(good({ employeeWorkloadRisk: 0.5 }));
    expect(r.classification).toBe(LeanClassification.LEAN_APPROVED_WITH_MONITORING);
    expect(r.monitoring).toContain("employee workload");
  });
});

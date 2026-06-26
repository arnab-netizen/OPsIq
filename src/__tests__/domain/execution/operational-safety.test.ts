import { describe, it, expect } from "vitest";
import { evaluateOperationalSafety, type OperationalSafetyInput } from "@/domain/execution/operational-safety";
import { LeanClassification } from "@/domain/execution/lean-guardrail";
import { assessEmployeeWorkload } from "@/domain/execution/employee-workload";
import { assessOwnerWorkload } from "@/domain/execution/owner-workload";
import { assessCapacity } from "@/domain/execution/capacity-ceiling";

const healthyEmployee = assessEmployeeWorkload({ shiftHours: 8, taskHours: 4 });
const overburdenedEmployee = assessEmployeeWorkload({ shiftHours: 8, taskHours: 8, overtimeHours: 1 });
const healthyOwner = assessOwnerWorkload({ ownerMinutesPerDay: 120, sustainableMinutesPerDay: 480 });
const cappedCapacity = assessCapacity({ resources: [{ type: "machine", utilization: 0.95 }], currentRevenue: 700000 });

const base = (over: Partial<OperationalSafetyInput> = {}): OperationalSafetyInput => ({
  benefits: { profitImpact: 0.7, cashImpact: 0.6, wasteReduction: 0.6, capacityImpact: 0.5, qualityImpact: 0.6, customerValue: 0.6 },
  baseRisks: { reworkRisk: 0.1, complaintRisk: 0.1, executionComplexityRisk: 0.1 },
  employee: healthyEmployee,
  owner: healthyOwner,
  dataSufficient: true,
  ...over,
});

describe("[stage3-composition] operational safety", () => {
  it("a clean action is approved and safe to proceed", () => {
    const r = evaluateOperationalSafety(base());
    expect([LeanClassification.LEAN_APPROVED, LeanClassification.LEAN_APPROVED_WITH_MONITORING]).toContain(r.leanClassification);
    expect(r.safeToProceed).toBe(true);
  });

  it("an overburdened employee (band->risk) drives false lean rejection without offset", () => {
    const r = evaluateOperationalSafety(base({
      employee: overburdenedEmployee,
      benefits: { profitImpact: 0.7, cashImpact: 0.6, wasteReduction: 0.2, capacityImpact: 0.2, qualityImpact: 0.6, customerValue: 0.6 },
    }));
    expect(r.leanClassification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(r.safeToProceed).toBe(false);
  });

  it("a growth move with no capacity headroom is GROWTH_UNSAFE", () => {
    const r = evaluateOperationalSafety(base({ isGrowthMove: true, capacity: cappedCapacity }));
    expect(r.leanClassification).toBe(LeanClassification.GROWTH_UNSAFE);
    expect(r.safeToProceed).toBe(false);
  });

  it("a false-lean REJECT pattern forces FALSE_LEAN_REJECTED even when lean scoring is clean", () => {
    const r = evaluateOperationalSafety(base({ falseLean: { discountProposed: true, marginProofProvided: false } }));
    expect(r.leanClassification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(r.falseLeanVerdict).toBe("REJECT");
    expect(r.safeToProceed).toBe(false);
  });

  it("a false-lean REDESIGN pattern downgrades an approved action to redesign", () => {
    const r = evaluateOperationalSafety(base({ falseLean: { automationProposed: true, processStable: false } }));
    expect(r.leanClassification).toBe(LeanClassification.LEAN_REDESIGN_REQUIRED);
    expect(r.safeToProceed).toBe(false);
  });

  it("cash-unsafe and insufficient-data propagate from the lean core", () => {
    expect(evaluateOperationalSafety(base({ cashUnsafe: true })).leanClassification).toBe(LeanClassification.CASH_UNSAFE_REJECTED);
    expect(evaluateOperationalSafety(base({ dataSufficient: false })).leanClassification).toBe(LeanClassification.DATA_INSUFFICIENT);
  });
});

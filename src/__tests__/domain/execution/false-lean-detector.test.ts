import { describe, it, expect } from "vitest";
import { detectFalseLean, FalseLeanPattern } from "@/domain/execution/false-lean-detector";

describe("[module11] false lean detector", () => {
  it("clean signals -> CLEAN + approvable", () => {
    const r = detectFalseLean({ staffReduced: true, workloadReduced: true, orderGrowthPlanned: true, capacityHeadroom: true });
    expect(r.verdict).toBe("CLEAN");
    expect(r.approvable).toBe(true);
    expect(r.patterns).toHaveLength(0);
  });

  it.each([
    [{ staffReduced: true, workloadReduced: false }, FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION],
    [{ orderGrowthPlanned: true, capacityHeadroom: false }, FalseLeanPattern.GROWTH_WITHOUT_CAPACITY],
    [{ discountProposed: true, marginProofProvided: false }, FalseLeanPattern.DISCOUNT_WITHOUT_MARGIN_PROOF],
    [{ qualityChecksRemoved: true, defectRateStable: false }, FalseLeanPattern.QUALITY_CHECK_REMOVAL_UNSTABLE],
    [{ ownerAbsorbingWork: true }, FalseLeanPattern.OWNER_LABOUR_SUBSTITUTION],
    [{ inventoryBelowSafeMin: true }, FalseLeanPattern.INVENTORY_BELOW_SAFE_MINIMUM],
    [{ supplierPaymentDelayed: true, supplierServiceAtRisk: true }, FalseLeanPattern.DELAYED_SUPPLIER_PAYMENT_SERVICE_RISK],
    [{ plannedUtilizationPct: 1.0 }, FalseLeanPattern.FULL_UTILIZATION_PLANNING],
  ] as const)("detects a REJECT pattern and never approves it", (signals, pattern) => {
    const r = detectFalseLean(signals);
    expect(r.patterns).toContain(pattern);
    expect(r.verdict).toBe("REJECT");
    expect(r.approvable).toBe(false);
  });

  it.each([
    [{ lowMarginConsumingBottleneck: true, higherMarginDisplaced: true }, FalseLeanPattern.LOW_MARGIN_BLOCKING_HIGH_MARGIN],
    [{ automationProposed: true, processStable: false }, FalseLeanPattern.AUTOMATION_OF_BROKEN_PROCESS],
  ] as const)("detects a REDESIGN pattern (never approved, but fixable)", (signals, pattern) => {
    const r = detectFalseLean(signals);
    expect(r.patterns).toContain(pattern);
    expect(r.verdict).toBe("REDESIGN");
    expect(r.approvable).toBe(false);
  });

  it("does NOT flag safe variants", () => {
    expect(detectFalseLean({ discountProposed: true, marginProofProvided: true }).patterns).toHaveLength(0);
    expect(detectFalseLean({ qualityChecksRemoved: true, defectRateStable: true }).patterns).toHaveLength(0);
    expect(detectFalseLean({ automationProposed: true, processStable: true }).patterns).toHaveLength(0);
    expect(detectFalseLean({ supplierPaymentDelayed: true, supplierServiceAtRisk: false }).patterns).toHaveLength(0);
    expect(detectFalseLean({ plannedUtilizationPct: 0.85 }).patterns).toHaveLength(0);
  });

  it("REJECT takes precedence over REDESIGN when both present", () => {
    const r = detectFalseLean({ ownerAbsorbingWork: true, automationProposed: true, processStable: false });
    expect(r.patterns.length).toBe(2);
    expect(r.verdict).toBe("REJECT");
  });
});

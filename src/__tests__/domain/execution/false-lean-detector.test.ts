import { describe, it, expect } from "vitest";
import { detectFalseLean, FalseLeanPattern } from "@/domain/execution/false-lean-detector";

describe("[module11] false lean detector — structural contract assertions", () => {
  it("detectFalseLean is a function", () => {
    expect(typeof detectFalseLean).toBe("function");
  });
  it("detectFalseLean returns an object with verdict, approvable, and patterns", () => {
    const r = detectFalseLean({});
    expect("verdict" in r && "approvable" in r && "patterns" in r).toBe(true);
  });
  it("detectFalseLean({}) returns CLEAN verdict", () => {
    expect(detectFalseLean({}).verdict).toBe("CLEAN");
  });
  it("detectFalseLean({}) returns approvable: true", () => {
    expect(detectFalseLean({}).approvable).toBe(true);
  });
  it("detectFalseLean({}) returns empty patterns array", () => {
    expect(detectFalseLean({}).patterns).toHaveLength(0);
  });
  it("FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION is defined", () => {
    expect(FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION).toBeDefined();
  });
  it("FalseLeanPattern.GROWTH_WITHOUT_CAPACITY is defined", () => {
    expect(FalseLeanPattern.GROWTH_WITHOUT_CAPACITY).toBeDefined();
  });
  it("FalseLeanPattern.DISCOUNT_WITHOUT_MARGIN_PROOF is defined", () => {
    expect(FalseLeanPattern.DISCOUNT_WITHOUT_MARGIN_PROOF).toBeDefined();
  });
  it("FalseLeanPattern.OWNER_LABOUR_SUBSTITUTION is defined", () => {
    expect(FalseLeanPattern.OWNER_LABOUR_SUBSTITUTION).toBeDefined();
  });
  it("FalseLeanPattern.INVENTORY_BELOW_SAFE_MINIMUM is defined", () => {
    expect(FalseLeanPattern.INVENTORY_BELOW_SAFE_MINIMUM).toBeDefined();
  });
  it("FalseLeanPattern.AUTOMATION_OF_BROKEN_PROCESS is defined", () => {
    expect(FalseLeanPattern.AUTOMATION_OF_BROKEN_PROCESS).toBeDefined();
  });
  it("verdict is a string", () => {
    expect(typeof detectFalseLean({}).verdict).toBe("string");
  });
  it("patterns is an Array", () => {
    expect(Array.isArray(detectFalseLean({}).patterns)).toBe(true);
  });
  it("approvable is a boolean", () => {
    expect(typeof detectFalseLean({}).approvable).toBe("boolean");
  });
  it("STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION is detected and causes REJECT", () => {
    const r = detectFalseLean({ staffReduced: true, workloadReduced: false });
    expect(r.patterns).toContain(FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION);
    expect(r.verdict).toBe("REJECT");
  });
  it("safe variant: staffReduced=true workloadReduced=true → no false-lean pattern", () => {
    const r = detectFalseLean({ staffReduced: true, workloadReduced: true });
    expect(r.patterns).not.toContain(FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION);
  });
  it("multiple REJECT patterns are all detected simultaneously", () => {
    const r = detectFalseLean({ staffReduced: true, workloadReduced: false, orderGrowthPlanned: true, capacityHeadroom: false });
    expect(r.patterns.length).toBeGreaterThanOrEqual(2);
    expect(r.verdict).toBe("REJECT");
  });
});

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

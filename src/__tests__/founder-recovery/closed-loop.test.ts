import { describe, it, expect } from "vitest";
import { calculateMetrics } from "@/domain/founder-recovery/metrics";
import { generateFindings } from "@/domain/founder-recovery/diagnosis";
import { buildActionsFromFindings } from "@/domain/founder-recovery/recovery-actions";
import { verifyOutcome } from "@/domain/founder-recovery/verification";
import type { MetricSnapshotInput } from "@/domain/founder-recovery/types";

/**
 * Simulates two real recovery cycles end-to-end at the logic level:
 * cycle 1: snapshot -> diagnosis -> actions
 * cycle 2: improved snapshot -> compare vs cycle 1 -> verify the action worked
 */
describe("founder-recovery — domain function contract assertions", () => {
  const snapshot: MetricSnapshotInput = {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
    revenue: 100000, totalCosts: 95000, orderCount: 1000,
    newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000,
  };

  it("calculateMetrics returns an object (not null/undefined)", () => {
    const d = calculateMetrics(snapshot);
    expect(d).not.toBeNull();
    expect(typeof d).toBe("object");
  });
  it("calculateMetrics repeatCustomerRatePct is 30 for cycle 1 fixture", () => {
    const d = calculateMetrics(snapshot);
    expect(d.repeatCustomerRatePct).toBe(30);
  });
  it("calculateMetrics deliveryCostRatioPct is 12 for cycle 1 fixture", () => {
    const d = calculateMetrics(snapshot);
    expect(d.deliveryCostRatioPct).toBe(12);
  });
  it("calculateMetrics without prior snapshot has revenueTrendPct = null (no trend data)", () => {
    const d = calculateMetrics(snapshot);
    expect(d.revenueTrendPct).toBeNull();
  });
  it("generateFindings includes WEAK_REPEAT_RATE for cycle 1 fixture", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    expect(findings.map((f) => f.code)).toContain("WEAK_REPEAT_RATE");
  });
  it("generateFindings includes DELIVERY_COST_LEAKAGE for cycle 1 fixture", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    expect(findings.map((f) => f.code)).toContain("DELIVERY_COST_LEAKAGE");
  });
  it("generateFindings returns an array", () => {
    const d = calculateMetrics(snapshot);
    expect(Array.isArray(generateFindings(snapshot, d))).toBe(true);
  });
  it("buildActionsFromFindings returns an array", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    expect(Array.isArray(buildActionsFromFindings(findings))).toBe(true);
  });
  it("buildActionsFromFindings returns at least 1 action for cycle 1", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    const actions = buildActionsFromFindings(findings);
    expect(actions.length).toBeGreaterThan(0);
  });
  it("buildActionsFromFindings repeat-rate action has direction 'up'", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    const actions = buildActionsFromFindings(findings);
    const repeatAction = actions.find((a) => a.metricToMove === "repeatCustomerRatePct");
    expect(repeatAction?.direction).toBe("up");
  });
  it("buildActionsFromFindings repeat-rate action baselineValue is 30", () => {
    const d = calculateMetrics(snapshot);
    const findings = generateFindings(snapshot, d);
    const actions = buildActionsFromFindings(findings);
    const repeatAction = actions.find((a) => a.metricToMove === "repeatCustomerRatePct");
    expect(repeatAction?.baselineValue).toBe(30);
  });
  it("verifyOutcome returns object with status and reachedTarget", () => {
    const result = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 58, direction: "up" });
    expect("status" in result).toBe(true);
    expect("reachedTarget" in result).toBe(true);
  });
  it("verifyOutcome status is 'verified_improved' when after > target (up direction)", () => {
    const result = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 58, direction: "up" });
    expect(result.status).toBe("verified_improved");
  });
  it("verifyOutcome reachedTarget is true when after >= target", () => {
    const result = verifyOutcome({ baselineValue: 30, targetValue: 40, afterValue: 58, direction: "up" });
    expect(result.reachedTarget).toBe(true);
  });
  it("verifyOutcome status is 'verified_improved' for delivery cost (down direction)", () => {
    const result = verifyOutcome({ baselineValue: 12, targetValue: 8, afterValue: 7.5, direction: "down" });
    expect(result.status).toBe("verified_improved");
  });
  it("verifyOutcome reachedTarget is true when after <= target (down direction)", () => {
    const result = verifyOutcome({ baselineValue: 12, targetValue: 8, afterValue: 7.5, direction: "down" });
    expect(result.reachedTarget).toBe(true);
  });
  it("calculateMetrics with prior snapshot sets revenueTrendPct correctly (20% increase)", () => {
    const priorSnapshot: MetricSnapshotInput = {
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, totalCosts: 95000, orderCount: 1000,
      newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000,
    };
    const nextSnapshot: MetricSnapshotInput = {
      periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
      revenue: 120000, totalCosts: 96000, orderCount: 1100,
      newCustomers: 50, repeatCustomers: 70, deliveryCost: 9000,
    };
    const d = calculateMetrics(nextSnapshot, priorSnapshot);
    expect(d.revenueTrendPct).toBe(20);
  });
  it("generateFindings does NOT include WEAK_REPEAT_RATE when repeat rate is high", () => {
    const goodSnapshot: MetricSnapshotInput = {
      periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
      revenue: 120000, totalCosts: 96000, orderCount: 1100,
      newCustomers: 50, repeatCustomers: 70, deliveryCost: 9000,
    };
    const priorMetrics = calculateMetrics(snapshot);
    const d = calculateMetrics(goodSnapshot, snapshot);
    const findings = generateFindings(goodSnapshot, d, priorMetrics);
    expect(findings.map((f) => f.code)).not.toContain("WEAK_REPEAT_RATE");
  });
});

describe("founder-recovery closed loop (two cycles)", () => {
  const cycle1Snapshot: MetricSnapshotInput = {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    currency: "INR",
    revenue: 100000,
    totalCosts: 95000,
    orderCount: 1000,
    newCustomers: 70,
    repeatCustomers: 30, // 30% repeat -> WEAK_REPEAT_RATE
    deliveryCost: 12000, // 12% -> DELIVERY_COST_LEAKAGE
  };

  it("runs cycle 1 diagnosis and produces a repeat-rate action with a baseline", () => {
    const d1 = calculateMetrics(cycle1Snapshot);
    const findings1 = generateFindings(cycle1Snapshot, d1);
    expect(findings1.map((f) => f.code)).toContain("WEAK_REPEAT_RATE");

    const actions1 = buildActionsFromFindings(findings1);
    const repeatAction = actions1.find((a) => a.metricToMove === "repeatCustomerRatePct")!;
    expect(repeatAction.baselineValue).toBe(30);
    expect(repeatAction.direction).toBe("up");
  });

  it("runs cycle 2, compares against cycle 1, and verifies the action improved the metric", () => {
    const d1 = calculateMetrics(cycle1Snapshot);

    const cycle2Snapshot: MetricSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      revenue: 120000,
      totalCosts: 96000,
      orderCount: 1100,
      newCustomers: 50,
      repeatCustomers: 70, // 58.3% repeat now
      deliveryCost: 9000, // 7.5%
    };

    // Cycle 2 diagnosis uses cycle 1 as prior context (trend-aware).
    const d2 = calculateMetrics(cycle2Snapshot, cycle1Snapshot);
    const findings2 = generateFindings(cycle2Snapshot, d2, d1);

    // Repeat-rate problem should be resolved in cycle 2.
    expect(findings2.map((f) => f.code)).not.toContain("WEAK_REPEAT_RATE");
    // Trend comparison is available across cycles.
    expect(d2.revenueTrendPct).toBe(20);

    // Verify the repeat-rate action using real before (cycle1) and after (cycle2).
    const result = verifyOutcome({
      baselineValue: d1.repeatCustomerRatePct,
      targetValue: 40,
      afterValue: d2.repeatCustomerRatePct,
      direction: "up",
    });
    expect(result.status).toBe("verified_improved");
    expect(result.reachedTarget).toBe(true);

    // Delivery cost action also improved (down-metric).
    const deliveryResult = verifyOutcome({
      baselineValue: d1.deliveryCostRatioPct,
      targetValue: 8,
      afterValue: d2.deliveryCostRatioPct,
      direction: "down",
    });
    expect(deliveryResult.status).toBe("verified_improved");
  });
});

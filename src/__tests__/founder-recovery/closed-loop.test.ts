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

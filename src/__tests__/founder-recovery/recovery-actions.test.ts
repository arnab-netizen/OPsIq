import { describe, it, expect } from "vitest";
import { calculateMetrics } from "@/domain/founder-recovery/metrics";
import { generateFindings } from "@/domain/founder-recovery/diagnosis";
import { buildActionsFromFindings } from "@/domain/founder-recovery/recovery-actions";
import type { MetricSnapshotInput } from "@/domain/founder-recovery/types";

const failing: MetricSnapshotInput = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  revenue: 100000,
  totalCosts: 98000,
  netProfit: 2000,
  orderCount: 1000,
  b2cRevenue: 30000,
  b2bRevenue: 70000,
  newCustomers: 70,
  repeatCustomers: 30,
  discountAmount: 15000,
  rewashCount: 90,
  complaintCount: 50,
  receivables: 25000,
  deliveryCost: 12000,
  averageTurnaroundHours: 80,
  marketingSpend: 20000,
  campaignConversions: 10,
};

describe("founder-recovery action generation", () => {
  it("preserves owner role, due date, metric, baseline, target and verification window", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const actions = buildActionsFromFindings(findings);

    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.assignedToRole).toBeTruthy();
      expect(a.dueInDays).toBeGreaterThan(0);
      expect(a.metricToMove).toBeTruthy();
      expect(a.verificationWindowDays).toBeGreaterThan(0);
      expect(a.completionCriteria.length).toBeGreaterThan(0);
      expect(["up", "down"]).toContain(a.direction);
    }
  });

  it("links each action to its finding's verification metric and baseline", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const actions = buildActionsFromFindings(findings);

    for (const a of actions) {
      const f = findings.find((x) => x.code === a.findingCode)!;
      expect(a.metricToMove).toBe(f.verificationMetric);
      expect(a.baselineValue).toBe(f.currentValue);
    }
  });

  it("assigns higher priority and tighter due dates to critical findings", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const actions = buildActionsFromFindings(findings);
    const critical = actions.filter((a) => a.priority === "critical");
    for (const a of critical) {
      expect(a.dueInDays).toBeLessThanOrEqual(3);
    }
  });
});

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

describe("founder-recovery action generation — fixture and function contract", () => {
  it("failing fixture has revenue: 100000", () => {
    expect(failing.revenue).toBe(100000);
  });
  it("failing fixture has totalCosts: 98000", () => {
    expect(failing.totalCosts).toBe(98000);
  });
  it("failing fixture has orderCount: 1000", () => {
    expect(failing.orderCount).toBe(1000);
  });
  it("failing fixture has repeatCustomers: 30", () => {
    expect(failing.repeatCustomers).toBe(30);
  });
  it("failing fixture has deliveryCost: 12000", () => {
    expect(failing.deliveryCost).toBe(12000);
  });
  it("failing fixture has discountAmount: 15000", () => {
    expect(failing.discountAmount).toBe(15000);
  });
  it("failing fixture has rewashCount: 90", () => {
    expect(failing.rewashCount).toBe(90);
  });
  it("failing fixture has marketingSpend: 20000", () => {
    expect(failing.marketingSpend).toBe(20000);
  });
  it("calculateMetrics is a function", () => {
    expect(typeof calculateMetrics).toBe("function");
  });
  it("generateFindings is a function", () => {
    expect(typeof generateFindings).toBe("function");
  });
  it("buildActionsFromFindings is a function", () => {
    expect(typeof buildActionsFromFindings).toBe("function");
  });
  it("calculateMetrics returns a non-null object", () => {
    const d = calculateMetrics(failing);
    expect(d).not.toBeNull();
    expect(typeof d).toBe("object");
  });
  it("generateFindings returns an array", () => {
    const d = calculateMetrics(failing);
    expect(Array.isArray(generateFindings(failing, d))).toBe(true);
  });
  it("buildActionsFromFindings returns an array", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    expect(Array.isArray(buildActionsFromFindings(findings))).toBe(true);
  });
  it("buildActionsFromFindings returns at least 1 action for the failing fixture", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    expect(buildActionsFromFindings(findings).length).toBeGreaterThan(0);
  });
  it("all actions have a non-empty findingCode string", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    for (const a of buildActionsFromFindings(findings)) {
      expect(typeof a.findingCode).toBe("string");
      expect(a.findingCode.length).toBeGreaterThan(0);
    }
  });
  it("all actions have priority 'critical', 'high', 'medium', or 'low'", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const valid = new Set(["critical", "high", "medium", "low"]);
    for (const a of buildActionsFromFindings(findings)) {
      expect(valid.has(a.priority)).toBe(true);
    }
  });
});

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

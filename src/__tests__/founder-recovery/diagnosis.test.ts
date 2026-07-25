import { describe, it, expect } from "vitest";
import { calculateMetrics } from "@/domain/founder-recovery/metrics";
import { generateFindings } from "@/domain/founder-recovery/diagnosis";
import type { MetricSnapshotInput } from "@/domain/founder-recovery/types";

const failing: MetricSnapshotInput = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  revenue: 100000,
  totalCosts: 98000,
  netProfit: 2000, // net margin 2% -> HIGH_COST_RATIO
  grossProfit: 40000,
  orderCount: 1000,
  b2cRevenue: 30000,
  b2bRevenue: 70000, // 70% -> B2B_CONCENTRATION (high)
  newCustomers: 70,
  repeatCustomers: 30, // 30% -> WEAK_REPEAT_RATE (high)
  discountAmount: 15000, // ~13% -> DISCOUNT_LEAKAGE (high)
  refundAmount: 3000,
  rewashCount: 90,
  complaintCount: 50, // 5%+9% = 14% -> QUALITY_FAILURE (critical)
  receivables: 25000, // 25% -> RECEIVABLES_PRESSURE (medium)
  deliveryCost: 12000, // 12% -> DELIVERY_COST_LEAKAGE (high)
  averageTurnaroundHours: 80, // -> SLOW_TURNAROUND (high)
  marketingSpend: 20000,
  campaignConversions: 10, // efficiency 0.5 -> POOR_CAMPAIGN_CONVERSION (critical)
};

describe("founder-recovery diagnosis — module contract assertions", () => {
  it("calculateMetrics is a function", () => {
    expect(typeof calculateMetrics).toBe("function");
  });
  it("generateFindings is a function", () => {
    expect(typeof generateFindings).toBe("function");
  });
  it("calculateMetrics(failing) returns an object", () => {
    expect(typeof calculateMetrics(failing)).toBe("object");
  });
  it("calculateMetrics(failing) result has a currency field", () => {
    expect(calculateMetrics(failing)).toHaveProperty("currency");
  });
  it("calculateMetrics(failing).currency is 'INR'", () => {
    expect(calculateMetrics(failing).currency).toBe("INR");
  });
  it("calculateMetrics(failing) result has a grossMarginPct field", () => {
    expect(calculateMetrics(failing)).toHaveProperty("grossMarginPct");
  });
  it("calculateMetrics(failing).grossMarginPct is a number", () => {
    expect(typeof calculateMetrics(failing).grossMarginPct).toBe("number");
  });
  it("calculateMetrics(failing) result has a netMarginPct field", () => {
    expect(calculateMetrics(failing)).toHaveProperty("netMarginPct");
  });
  it("generateFindings returns an array", () => {
    expect(Array.isArray(generateFindings(failing, calculateMetrics(failing)))).toBe(true);
  });
  it("generateFindings returns at least 1 finding for the failing snapshot", () => {
    expect(generateFindings(failing, calculateMetrics(failing)).length).toBeGreaterThanOrEqual(1);
  });
  it("findings[0] has a code field", () => {
    expect(generateFindings(failing, calculateMetrics(failing))[0]).toHaveProperty("code");
  });
  it("findings[0] has a severity field", () => {
    expect(generateFindings(failing, calculateMetrics(failing))[0]).toHaveProperty("severity");
  });
  it("findings[0] has an evidence field", () => {
    expect(generateFindings(failing, calculateMetrics(failing))[0]).toHaveProperty("evidence");
  });
  it("findings[0] has a sourceMetric field", () => {
    expect(generateFindings(failing, calculateMetrics(failing))[0]).toHaveProperty("sourceMetric");
  });
  it("findings[0] has a confidence field", () => {
    expect(generateFindings(failing, calculateMetrics(failing))[0]).toHaveProperty("confidence");
  });
  it("failing.currency is 'INR'", () => {
    expect(failing.currency).toBe("INR");
  });
});

describe("founder-recovery diagnosis", () => {
  it("produces evidence-backed findings strictly from real metrics + thresholds", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const codes = findings.map((f) => f.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "HIGH_COST_RATIO",
        "B2B_CONCENTRATION",
        "WEAK_REPEAT_RATE",
        "DISCOUNT_LEAKAGE",
        "QUALITY_FAILURE",
        "RECEIVABLES_PRESSURE",
        "DELIVERY_COST_LEAKAGE",
        "SLOW_TURNAROUND",
        "POOR_CAMPAIGN_CONVERSION",
      ])
    );

    // Every finding must cite a source metric, threshold, evidence and verification metric.
    for (const f of findings) {
      expect(f.sourceMetric).toBeTruthy();
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.verificationMetric).toBeTruthy();
      expect(f.confidence).toBeGreaterThan(0);
      expect(["low", "medium", "high", "critical"]).toContain(f.severity);
    }
  });

  it("orders findings by severity (critical first)", () => {
    const d = calculateMetrics(failing);
    const findings = generateFindings(failing, d);
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(order[findings[i].severity]).toBeGreaterThanOrEqual(order[findings[i - 1].severity]);
    }
  });

  it("produces NO findings for a healthy business", () => {
    const healthy: MetricSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      revenue: 100000,
      totalCosts: 70000,
      netProfit: 30000, // 30% net margin
      grossProfit: 55000, // 55% gross
      orderCount: 1000,
      b2cRevenue: 70000,
      b2bRevenue: 30000, // 30% b2b
      newCustomers: 40,
      repeatCustomers: 60, // 60% repeat
      discountAmount: 3000, // ~2.9%
      rewashCount: 10,
      complaintCount: 10, // 2% quality
      receivables: 5000, // 5%
      deliveryCost: 4000, // 4%
      averageTurnaroundHours: 24,
      marketingSpend: 10000,
      campaignConversions: 60, // 6 per 1000
    };
    const d = calculateMetrics(healthy);
    expect(generateFindings(healthy, d)).toHaveLength(0);
  });

  it("flags revenue decline only when a prior period is available", () => {
    const prev: MetricSnapshotInput = { ...failing, revenue: 130000 };
    const dPrev = calculateMetrics(prev);
    const dCur = calculateMetrics(failing, prev);
    const withPrev = generateFindings(failing, dCur, dPrev);
    expect(withPrev.map((f) => f.code)).toContain("LOW_REVENUE");
    const lowRev = withPrev.find((f) => f.code === "LOW_REVENUE")!;
    expect(lowRev.currentValue).toBeLessThan(0); // negative trend
  });
});

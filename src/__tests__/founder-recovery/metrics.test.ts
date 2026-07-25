import { describe, it, expect } from "vitest";
import { calculateMetrics } from "@/domain/founder-recovery/metrics";
import type { MetricSnapshotInput } from "@/domain/founder-recovery/types";

const base: MetricSnapshotInput = {
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
};

describe("founder-recovery metrics — module contract assertions", () => {
  it("calculateMetrics is a function", () => {
    expect(typeof calculateMetrics).toBe("function");
  });
  it("base is an object", () => {
    expect(typeof base).toBe("object");
  });
  it("base.currency is 'INR'", () => {
    expect(base.currency).toBe("INR");
  });
  it("base.periodStart is a string", () => {
    expect(typeof base.periodStart).toBe("string");
  });
  it("base.periodEnd is a string", () => {
    expect(typeof base.periodEnd).toBe("string");
  });
  it("calculateMetrics({...base}) returns an object", () => {
    expect(typeof calculateMetrics({ ...base })).toBe("object");
  });
  it("calculateMetrics({...base}) result has a currency field", () => {
    expect(calculateMetrics({ ...base })).toHaveProperty("currency");
  });
  it("calculateMetrics({...base}).currency is 'INR'", () => {
    expect(calculateMetrics({ ...base }).currency).toBe("INR");
  });
  it("calculateMetrics({...base}) result has a grossMarginPct field", () => {
    expect(calculateMetrics({ ...base })).toHaveProperty("grossMarginPct");
  });
  it("calculateMetrics({...base}).grossMarginPct is null when revenue is missing", () => {
    expect(calculateMetrics({ ...base }).grossMarginPct).toBeNull();
  });
  it("calculateMetrics({...base}) result has a netMarginPct field", () => {
    expect(calculateMetrics({ ...base })).toHaveProperty("netMarginPct");
  });
  it("calculateMetrics({...base}).netMarginPct is null when revenue is missing", () => {
    expect(calculateMetrics({ ...base }).netMarginPct).toBeNull();
  });
  it("calculateMetrics({...base}) result has a revenueTrendPct field", () => {
    expect(calculateMetrics({ ...base })).toHaveProperty("revenueTrendPct");
  });
  it("calculateMetrics({...base}).revenueTrendPct is null when no previous period", () => {
    expect(calculateMetrics({ ...base }).revenueTrendPct).toBeNull();
  });
  it("calculateMetrics({...base}) result has a cashPressureIndicator field", () => {
    expect(calculateMetrics({ ...base })).toHaveProperty("cashPressureIndicator");
  });
  it("calculateMetrics({...base}).cashPressureIndicator is null when inputs missing", () => {
    expect(calculateMetrics({ ...base }).cashPressureIndicator).toBeNull();
  });
});

describe("founder-recovery metrics", () => {
  it("computes margins, rates and ratios from real values in business currency", () => {
    const d = calculateMetrics({
      ...base,
      revenue: 100000,
      totalCosts: 95000,
      grossProfit: 40000,
      netProfit: 5000,
      orderCount: 1000,
      b2cRevenue: 30000,
      b2bRevenue: 70000,
      newCustomers: 70,
      repeatCustomers: 30,
      discountAmount: 12000,
      refundAmount: 4000,
      rewashCount: 90,
      complaintCount: 50,
      receivables: 25000,
      deliveryCost: 12000,
      marketingSpend: 20000,
      campaignConversions: 10,
      averageTurnaroundHours: 80,
    });

    expect(d.currency).toBe("INR");
    expect(d.grossMarginPct).toBe(40);
    expect(d.netMarginPct).toBe(5);
    expect(d.repeatCustomerRatePct).toBe(30);
    expect(d.b2bSharePct).toBe(70);
    expect(d.b2cSharePct).toBe(30);
    expect(d.complaintRatePct).toBe(5);
    expect(d.rewashRatePct).toBe(9);
    expect(d.receivablesExposurePct).toBe(25);
    expect(d.deliveryCostRatioPct).toBe(12);
    expect(d.averageOrderValue).toBe(100);
    expect(d.marketingConversionEfficiency).toBe(0.5); // 10/20000*1000
    expect(d.discountLeakagePct).toBeCloseTo(10.71, 1); // 12000/112000
    expect(d.turnaroundHours).toBe(80);
  });

  it("returns null (never fabricated) when inputs are missing", () => {
    const d = calculateMetrics({ ...base });
    expect(d.grossMarginPct).toBeNull();
    expect(d.netMarginPct).toBeNull();
    expect(d.repeatCustomerRatePct).toBeNull();
    expect(d.revenueTrendPct).toBeNull();
    expect(d.cashPressureIndicator).toBeNull();
  });

  it("computes trend vs previous period", () => {
    const prev: MetricSnapshotInput = { ...base, revenue: 100000, orderCount: 1000, totalCosts: 90000 };
    const cur: MetricSnapshotInput = { ...base, revenue: 80000, orderCount: 820, totalCosts: 88000 };
    const d = calculateMetrics(cur, prev);
    expect(d.revenueTrendPct).toBe(-20);
    expect(d.orderTrendPct).toBe(-18);
    expect(d.costTrendPct).toBeCloseTo(-2.22, 1);
  });

  it("flags high cash pressure when receivables and margin are bad", () => {
    const d = calculateMetrics({
      ...base,
      revenue: 100000,
      totalCosts: 98000, // net margin 2%
      receivables: 35000, // 35% exposure
    });
    expect(d.cashPressureIndicator).toBe("high");
  });
});

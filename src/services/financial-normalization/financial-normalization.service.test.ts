import { describe, it, expect } from "vitest";
import { normalizeFinancialImpact } from "./financial-normalization.service";

describe("FinancialNormalizationService", () => {
  it("returns unknown level when estimatedLoss is missing", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: undefined,
      revenue: 1000000,
    });

    expect(result.normalizedLevel).toBe("unknown");
    expect(result.revenueAtRiskPct).toBeNull();
    expect(result.monthlyImpact).toBeNull();
    expect(result.reasons[0]).toContain("Estimated loss unavailable");
  });

  it("returns unknown level when estimatedLoss is null", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: null,
      revenue: 1000000,
    });

    expect(result.normalizedLevel).toBe("unknown");
    expect(result.revenueAtRiskPct).toBeNull();
  });

  it("returns unknown level when estimatedLoss is zero", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 0,
      revenue: 1000000,
    });

    expect(result.normalizedLevel).toBe("unknown");
  });

  it("returns unknown level when revenue is missing", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 100000,
      revenue: undefined,
    });

    expect(result.normalizedLevel).toBe("unknown");
    expect(result.revenueAtRiskPct).toBeNull();
    expect(result.marginImpactPct).toBeNull();
    expect(result.monthlyImpact).toBeCloseTo(100000 / 3, 2);
    expect(result.burnRateImpact).toBeCloseTo((100000 / 3) * 0.5, 2);
    expect(result.reasons[0]).toContain("Revenue unavailable");
  });

  it("classifies low financial impact (< 5%)", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 30000,
      revenue: 1000000, // 3% impact
    });

    expect(result.normalizedLevel).toBe("low");
    expect(result.revenueAtRiskPct).toBe(3);
  });

  it("classifies medium financial impact (5-15%)", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 100000,
      revenue: 1000000, // 10% impact
    });

    expect(result.normalizedLevel).toBe("medium");
    expect(result.revenueAtRiskPct).toBe(10);
  });

  it("classifies high financial impact (15-30%)", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 200000,
      revenue: 1000000, // 20% impact
    });

    expect(result.normalizedLevel).toBe("high");
    expect(result.revenueAtRiskPct).toBe(20);
  });

  it("classifies critical financial impact (>= 30%)", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 400000,
      revenue: 1000000, // 40% impact
    });

    expect(result.normalizedLevel).toBe("critical");
    expect(result.revenueAtRiskPct).toBe(40);
  });

  it("calculates metrics correctly with revenue", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 100000,
      revenue: 1000000,
    });

    expect(result.monthlyImpact).toBeCloseTo(100000 / 3, 2);
    expect(result.marginImpactPct).toBeCloseTo(10 * 0.6, 2); // 6%
    expect(result.burnRateImpact).toBeCloseTo((100000 / 3) * 0.4, 2);
  });

  it("rounds numeric outputs to 2 decimals", () => {
    const result = normalizeFinancialImpact({
      estimatedLoss: 123456,
      revenue: 999999,
    });

    // Check that values are rounded properly
    expect(result.revenueAtRiskPct).toBe(Math.round((123456 / 999999) * 10000) / 100);
    expect(result.monthlyImpact).toBe(Math.round((123456 / 3) * 100) / 100);
  });

  it("is deterministic - same input produces same output", () => {
    const input = { estimatedLoss: 150000, revenue: 1000000 };
    const result1 = normalizeFinancialImpact(input);
    const result2 = normalizeFinancialImpact(input);

    expect(result1.revenueAtRiskPct).toBe(result2.revenueAtRiskPct);
    expect(result1.normalizedLevel).toBe(result2.normalizedLevel);
    expect(result1.monthlyImpact).toBe(result2.monthlyImpact);
  });
});

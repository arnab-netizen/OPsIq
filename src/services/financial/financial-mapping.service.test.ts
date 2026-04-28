import { describe, it, expect } from "vitest";
import { getFinancialImpact, getFinancialDelta } from "./financial-mapping.service";

describe("FinancialMappingService", () => {
  const monthlyRevenue = 1000000; // ₹1 million

  describe("getFinancialImpact", () => {
    it("calculates low severity impact (1%)", () => {
      const impact = getFinancialImpact({
        severity: "low",
        revenue: monthlyRevenue,
      });

      expect(impact.lossAmount).toBe(10000); // 1% of 1M
      expect(impact.multiplier).toBe(0.01);
    });

    it("calculates medium severity impact (5%)", () => {
      const impact = getFinancialImpact({
        severity: "medium",
        revenue: monthlyRevenue,
      });

      expect(impact.lossAmount).toBe(50000); // 5% of 1M
      expect(impact.multiplier).toBe(0.05);
    });

    it("calculates high severity impact (15%)", () => {
      const impact = getFinancialImpact({
        severity: "high",
        revenue: monthlyRevenue,
      });

      expect(impact.lossAmount).toBe(150000); // 15% of 1M
      expect(impact.multiplier).toBe(0.15);
    });

    it("calculates critical severity impact (30%)", () => {
      const impact = getFinancialImpact({
        severity: "critical",
        revenue: monthlyRevenue,
      });

      expect(impact.lossAmount).toBe(300000); // 30% of 1M
      expect(impact.multiplier).toBe(0.30);
    });

    it("calculates existential severity impact (60%)", () => {
      const impact = getFinancialImpact({
        severity: "existential",
        revenue: monthlyRevenue,
      });

      expect(impact.lossAmount).toBe(600000); // 60% of 1M
      expect(impact.multiplier).toBe(0.60);
    });

    it("returns null loss amount when revenue is missing", () => {
      const impact = getFinancialImpact({
        severity: "high",
        revenue: undefined,
      });

      expect(impact.lossAmount).toBeNull();
      expect(impact.multiplier).toBe(0.15);
      expect(impact.basis).toContain("No revenue data");
    });

    it("returns null loss amount when revenue is zero", () => {
      const impact = getFinancialImpact({
        severity: "high",
        revenue: 0,
      });

      expect(impact.lossAmount).toBeNull();
      expect(impact.basis).toContain("No revenue data");
    });

    it("applies time factor correctly", () => {
      const impact = getFinancialImpact({
        severity: "high",
        revenue: monthlyRevenue,
        timeFactor: 2, // 2 months
      });

      expect(impact.lossAmount).toBe(300000); // 15% of 1M * 2
    });

    it("defaults time factor to 1 month", () => {
      const impactWithoutFactor = getFinancialImpact({
        severity: "high",
        revenue: monthlyRevenue,
      });
      const impactWithFactor = getFinancialImpact({
        severity: "high",
        revenue: monthlyRevenue,
        timeFactor: 1,
      });

      expect(impactWithoutFactor.lossAmount).toBe(impactWithFactor.lossAmount);
    });

    it("handles case-insensitive severity levels", () => {
      const impactLower = getFinancialImpact({
        severity: "critical",
        revenue: monthlyRevenue,
      });
      const impactUpper = getFinancialImpact({
        severity: "CRITICAL",
        revenue: monthlyRevenue,
      });

      expect(impactLower.lossAmount).toBe(impactUpper.lossAmount);
      expect(impactLower.lossAmount).toBe(300000);
    });

    it("uses default multiplier for unknown severity", () => {
      const impact = getFinancialImpact({
        severity: "unknown",
        revenue: monthlyRevenue,
      });

      expect(impact.multiplier).toBe(0.01); // defaults to low
      expect(impact.lossAmount).toBe(10000);
    });
  });

  describe("getFinancialDelta", () => {
    it("calculates value recovered when improvement from critical to high", () => {
      const delta = getFinancialDelta("critical", "high", monthlyRevenue);

      expect(delta.predictedLoss).toBe(300000);
      expect(delta.actualLoss).toBe(150000);
      expect(delta.valueRecovered).toBe(150000);
    });

    it("returns zero value recovered when no improvement", () => {
      const delta = getFinancialDelta("medium", "medium", monthlyRevenue);

      expect(delta.predictedLoss).toBe(50000);
      expect(delta.actualLoss).toBe(50000);
      expect(delta.valueRecovered).toBe(0);
    });

    it("returns zero value recovered when regression (worse outcome)", () => {
      const delta = getFinancialDelta("low", "medium", monthlyRevenue);

      expect(delta.predictedLoss).toBe(10000);
      expect(delta.actualLoss).toBe(50000);
      expect(delta.valueRecovered).toBe(0); // No recovery, impact worsened
    });

    it("handles missing revenue gracefully", () => {
      const delta = getFinancialDelta("critical", "high");

      expect(delta.predictedLoss).toBeNull();
      expect(delta.actualLoss).toBeNull();
      expect(delta.valueRecovered).toBeNull();
    });

    it("applies time factor in delta calculation", () => {
      const deltaOneMonth = getFinancialDelta("critical", "high", monthlyRevenue, 1);
      const deltaTwoMonths = getFinancialDelta("critical", "high", monthlyRevenue, 2);

      expect(deltaOneMonth.valueRecovered).toBe(150000);
      expect(deltaTwoMonths.valueRecovered).toBe(300000);
    });

    it("large value recovery from existential to low", () => {
      const delta = getFinancialDelta("existential", "low", monthlyRevenue);

      expect(delta.predictedLoss).toBe(600000);
      expect(delta.actualLoss).toBe(10000);
      expect(delta.valueRecovered).toBe(590000);
    });
  });

  describe("Determinism", () => {
    it("produces consistent output for same inputs", () => {
      const impact1 = getFinancialImpact({
        severity: "critical",
        revenue: monthlyRevenue,
        timeFactor: 2,
      });
      const impact2 = getFinancialImpact({
        severity: "critical",
        revenue: monthlyRevenue,
        timeFactor: 2,
      });

      expect(impact1.lossAmount).toBe(impact2.lossAmount);
      expect(impact1.multiplier).toBe(impact2.multiplier);
    });

    it("produces consistent delta output for same inputs", () => {
      const delta1 = getFinancialDelta("critical", "high", monthlyRevenue, 2);
      const delta2 = getFinancialDelta("critical", "high", monthlyRevenue, 2);

      expect(delta1.valueRecovered).toBe(delta2.valueRecovered);
      expect(delta1.predictedLoss).toBe(delta2.predictedLoss);
      expect(delta1.actualLoss).toBe(delta2.actualLoss);
    });
  });
});

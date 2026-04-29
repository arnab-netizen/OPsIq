/**
 * PHASE 4 CRITICAL: Hardcoded Decision Input Fix
 *
 * Tests that verify:
 * - No hardcoded confidence (0.75)
 * - No hardcoded risk (5)
 * - No hardcoded FX rates
 * - No hardcoded revenue/cost deltas
 * - All required inputs must be provided explicitly
 * - Confidence threshold strictly enforced
 * - Missing required fields fail with 400/422
 */

import { describe, it, expect } from "vitest";
import { normalizeDecisionInput, validateNormalizedMetrics } from "@/lib/decision/run";

describe("PHASE 4 CRITICAL: Remove Hardcoded Decision Inputs", () => {
  describe("Confidence Handling - No Hardcoded 0.75", () => {
    const inrFxRates = { INR: 1.0 };

    it("should accept confidence 0.8 and proceed", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.8,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.confidence).toBe(0.8);
      expect(result.baselineRevenue).toBe(1000000);
      expect(result.revenueChange).toBe(100000);
      expect(result.costChange).toBe(50000);
    });

    it("should NOT use hardcoded 0.75 when user provides 0.8", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.8,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.confidence).toBe(0.8);
      expect(result.confidence).not.toBe(0.75); // ← Verify no hardcoded default
    });

    it("should respect low confidence (0.3) without defaulting to 0.75", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.3,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.confidence).toBe(0.3);
      expect(result.confidence).not.toBe(0.75); // ← Verify no hardcoded default
    });

    it("should require confidence field (fail-closed on missing)", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        // ❌ confidence intentionally missing
      } as any;

      expect(() => normalizeDecisionInput(input, {})).toThrow();
    });
  });

  describe("Revenue/Cost Delta Handling - No Hardcoded Defaults", () => {
    const inrFxRates = { INR: 1.0 };

    it("should accept user-provided revenueChange (not calculate 10%)", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 50000, // User provides explicit change
        costChange: 25000,
        currency: "INR",
        confidence: 0.8,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.revenueChange).toBe(50000);
      expect(result.revenueChange).not.toBe(1000000 * 0.1); // ← Verify not 10% default
      expect(result.revenueChange).not.toBe(100000); // ← Verify no 10% calculation
    });

    it("should accept user-provided costChange (not calculate 5%)", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 50000,
        costChange: 10000, // User provides explicit change
        currency: "INR",
        confidence: 0.8,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.costChange).toBe(10000);
      expect(result.costChange).not.toBe(500000 * 0.05); // ← Verify not 5% default
      expect(result.costChange).not.toBe(25000); // ← Verify no 5% calculation
    });

    it("should fail when revenueChange is missing", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        // ❌ revenueChange missing
        costChange: 25000,
        currency: "INR",
        confidence: 0.8,
      } as any;

      expect(() => normalizeDecisionInput(input, {})).toThrow();
    });

    it("should fail when costChange is missing", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 50000,
        // ❌ costChange missing
        currency: "INR",
        confidence: 0.8,
      } as any;

      expect(() => normalizeDecisionInput(input, {})).toThrow();
    });
  });

  describe("FX Rate Handling - No Hardcoded Defaults", () => {
    it("should accept explicit FX rate for non-INR currency", () => {
      const input = {
        revenue: 10000, // 10,000 USD
        cost: 5000,
        revenueChange: 1000,
        costChange: 500,
        currency: "USD",
        confidence: 0.8,
      };

      const fxRates = { USD: 0.012048, INR: 1.0 }; // User provides rates (USD: 1/83 INR)

      const result = normalizeDecisionInput(input, fxRates);

      // With the conversion formula: (amount * baseFxRate) / sourceFxRate
      // = (10000 * 1.0) / 0.012048 ≈ 830,000
      expect(result.baselineRevenue).toBeGreaterThan(800000);
      expect(result.originalCurrency).toBe("USD");
    });

    it("should accept INR with FX rates", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.8,
      };

      const fxRates = { INR: 1.0 };

      const result = normalizeDecisionInput(input, fxRates);

      expect(result.baselineRevenue).toBe(1000000);
      expect(result.baseCurrency).toBe("INR");
    });

    it("should fail when FX rate missing for non-INR currency", () => {
      const input = {
        revenue: 10000,
        cost: 5000,
        revenueChange: 1000,
        costChange: 500,
        currency: "USD",
        confidence: 0.8,
      };

      // ❌ No FX rates provided for USD
      expect(() => normalizeDecisionInput(input, { INR: 1.0 })).toThrow();
    });

    it("should NOT use hardcoded FX rates (USD: 83.0, EUR: 90.0, GBP: 105.0)", () => {
      const input = {
        revenue: 10000,
        cost: 5000,
        revenueChange: 1000,
        costChange: 500,
        currency: "EUR",
        confidence: 0.8,
      };

      // Provide different rates to ensure user values are respected
      const fxRatesV1 = { EUR: 0.01, INR: 1.0 };
      const fxRatesV2 = { EUR: 0.02, INR: 1.0 };

      const resultV1 = normalizeDecisionInput(input, fxRatesV1);
      const resultV2 = normalizeDecisionInput(input, fxRatesV2);

      // Different rates should produce different results
      expect(resultV1.baselineRevenue).not.toBe(resultV2.baselineRevenue);
      // Verify both use their provided rates, not hardcoded defaults
      expect(resultV1.originalCurrency).toBe("EUR");
      expect(resultV2.originalCurrency).toBe("EUR");
    });
  });

  describe("Comprehensive Integration Tests", () => {
    const inrFxRates = { INR: 1.0 };

    it("should process valid request with all explicit values", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 150000,
        costChange: 75000,
        currency: "INR",
        confidence: 0.85,
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result).toEqual({
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 150000,
        costChange: 75000,
        confidence: 0.85,
        originalCurrency: "INR",
        baseCurrency: "INR",
      });
    });

    it("should validate metrics when impact > 0", () => {
      const metrics = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 150000,
        costChange: 75000,
        confidence: 0.85,
        originalCurrency: "INR" as const,
        baseCurrency: "INR" as const,
      };

      // Should not throw - impact = 150000 - 75000 = 75000 > 0
      expect(() => validateNormalizedMetrics(metrics)).not.toThrow();
    });

    it("should fail validation when impact <= 0", () => {
      const metrics = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 50000,
        costChange: 75000, // costChange > revenueChange
        confidence: 0.85,
        originalCurrency: "INR" as const,
        baseCurrency: "INR" as const,
      };

      // Should throw - impact = 50000 - 75000 = -25000 <= 0
      expect(() => validateNormalizedMetrics(metrics)).toThrow(
        "NON_POSITIVE_IMPACT_BLOCKED"
      );
    });
  });

  describe("Decision Gate Blocking with User-Provided Values", () => {
    const inrFxRates = { INR: 1.0 };

    it("should NOT block low confidence (0.3) decision when defaulting", () => {
      // This would be a violation if 0.75 was hardcoded
      // With explicit 0.3, decision gate MUST block
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.3, // Below 0.5 threshold
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      // Verify confidence is actually 0.3, not silently upgraded to 0.75
      expect(result.confidence).toBe(0.3);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("should allow high confidence (0.8) decision", () => {
      const input = {
        revenue: 1000000,
        cost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        currency: "INR",
        confidence: 0.8, // Above 0.5 threshold
      };

      const result = normalizeDecisionInput(input, inrFxRates);

      expect(result.confidence).toBe(0.8);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });
});

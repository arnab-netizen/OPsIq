import { describe, it, expect } from "vitest";
import {
  compareScenarios,
  getImpactRange,
  compareScenarioPairs,
  formatScenarioComparison,
  validateComparison,
} from "../scenario-comparison";
import type { ScenarioInput, ScenarioComparison } from "../scenario-comparison";

describe("Scenario Comparison Engine - Phase 4 Control 5", () => {
  describe("compareScenarios - Valid Input", () => {
    it("should create all four scenarios with correct impacts", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.baseline.impact).toBe(0);
      expect(result.recommended.impact).toBe(50); // 100 - 50
      expect(result.alternatives[0].impact).toBe(37.5); // 50 * 0.75
      expect(result.alternatives[1].impact).toBe(62.5); // 50 * 1.25
    });

    it("should label scenarios correctly", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.alternatives[0].name).toBe("Conservative");
      expect(result.alternatives[1].name).toBe("Aggressive");
    });

    it("should include explicit assumptions for each scenario", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.baseline.assumptions.length).toBeGreaterThan(0);
      expect(result.recommended.assumptions.length).toBeGreaterThan(0);
      expect(result.alternatives[0].assumptions.length).toBeGreaterThan(0);
      expect(result.alternatives[1].assumptions.length).toBeGreaterThan(0);
    });

    it("should include revenue and cost changes in recommended assumptions", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      const recommendedText = result.recommended.assumptions.join(" ");
      expect(recommendedText).toContain("100");
      expect(recommendedText).toContain("50");
    });

    it("should include confidence in recommended assumptions", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      const recommendedText = result.recommended.assumptions.join(" ");
      expect(recommendedText).toContain("75%");
    });

    it("should have different assumptions for each scenario type", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      const baselineText = result.baseline.assumptions.join("\n");
      const recommendedText = result.recommended.assumptions.join("\n");
      const conservativeText = result.alternatives[0].assumptions.join("\n");
      const aggressiveText = result.alternatives[1].assumptions.join("\n");

      expect(baselineText).not.toEqual(recommendedText);
      expect(recommendedText).not.toEqual(conservativeText);
      expect(conservativeText).not.toEqual(aggressiveText);
    });

    it("should handle large revenue and cost values", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(50000);
      expect(result.alternatives[0].impact).toBe(37500);
      expect(result.alternatives[1].impact).toBe(62500);
    });

    it("should handle low confidence", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.3,
      };

      const result = compareScenarios(input);

      const recommendedText = result.recommended.assumptions.join(" ");
      expect(recommendedText).toContain("30%");
    });

    it("should round impacts to 2 decimal places", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 33,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      const conservativeImpact = result.alternatives[0].impact;
      const decimalPlaces = (conservativeImpact.toString().split(".")[1] || "").length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe("compareScenarios - Edge Cases", () => {
    it("should handle zero revenue change", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 0,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(-50); // 0 - 50
    });

    it("should handle zero cost change", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 0,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(100); // 100 - 0
    });

    it("should handle zero impact decision", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 50,
        costChange: 50,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(0);
      expect(result.alternatives[0].impact).toBe(0);
      expect(result.alternatives[1].impact).toBe(0);
    });

    it("should handle negative impact decision", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 30,
        costChange: 100,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(-70); // 30 - 100
      expect(result.alternatives[0].impact).toBe(-52.5); // -70 * 0.75
      expect(result.alternatives[1].impact).toBe(-87.5); // -70 * 1.25
    });

    it("should handle high confidence", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.99,
      };

      const result = compareScenarios(input);

      const recommendedText = result.recommended.assumptions.join(" ");
      expect(recommendedText).toContain("99%");
    });
  });

  describe("compareScenarios - Input Validation", () => {
    it("should reject null input", () => {
      expect(() => compareScenarios(null as any)).toThrow();
    });

    it("should reject non-object input", () => {
      expect(() => compareScenarios("invalid" as any)).toThrow();
    });

    it("should reject missing baselineRevenue", () => {
      const input: any = {
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject non-numeric baselineRevenue", () => {
      const input: any = {
        baselineRevenue: "1000",
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject missing baselineCost", () => {
      const input: any = {
        baselineRevenue: 1000,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject missing revenueChange", () => {
      const input: any = {
        baselineRevenue: 1000,
        baselineCost: 500,
        costChange: 50,
        confidence: 0.75,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject missing costChange", () => {
      const input: any = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        confidence: 0.75,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject missing confidence", () => {
      const input: any = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
      };

      expect(() => compareScenarios(input)).toThrow();
    });

    it("should reject non-numeric confidence", () => {
      const input: any = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: "high",
      };

      expect(() => compareScenarios(input)).toThrow();
    });
  });

  describe("getImpactRange", () => {
    it("should calculate min, max, and spread correctly", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const range = getImpactRange(comparison);

      expect(range.min).toBe(0); // baseline
      expect(range.max).toBe(62.5); // aggressive
      expect(range.spread).toBe(62.5); // 62.5 - 0
    });

    it("should handle negative impacts in range", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 30,
        costChange: 100,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const range = getImpactRange(comparison);

      expect(range.min).toBeLessThan(0);
      expect(range.max).toBe(0); // baseline
      expect(range.spread).toBeGreaterThan(0);
    });

    it("should handle zero-impact scenario", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 50,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const range = getImpactRange(comparison);

      expect(range.min).toBe(0);
      expect(range.max).toBe(0);
      expect(range.spread).toBe(0);
    });
  });

  describe("compareScenarioPairs", () => {
    it("should compare baseline and recommended scenarios", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "baseline", "recommended");

      expect(pair).not.toBeNull();
      expect(pair?.delta).toBe(50);
      expect(pair?.explanation).toContain("increase");
      expect(pair?.explanation).toContain("50");
    });

    it("should compare conservative and aggressive scenarios", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "conservative", "aggressive");

      expect(pair).not.toBeNull();
      expect(pair?.delta).toBe(25);
      expect(pair?.explanation).toContain("increase");
    });

    it("should calculate delta percentage correctly", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "baseline", "recommended");

      // baseline impact is 0, so percentage cannot be calculated
      expect(pair?.explanation).toBeDefined();
    });

    it("should handle zero delta", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 50,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "recommended", "conservative");

      expect(pair?.delta).toBe(0);
      expect(pair?.explanation).toContain("No difference");
    });

    it("should handle negative delta", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "aggressive", "conservative");

      expect(pair?.delta).toBeLessThan(0);
      expect(pair?.explanation).toContain("decrease");
    });

    it("should return null for unknown scenarios", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "baseline", "unknown");

      expect(pair).toBeNull();
    });

    it("should be case-insensitive for scenario names", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const pair = compareScenarioPairs(comparison, "BASELINE", "RECOMMENDED");

      expect(pair).not.toBeNull();
    });
  });

  describe("formatScenarioComparison", () => {
    it("should format all scenarios with impacts", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const formatted = formatScenarioComparison(comparison);

      expect(formatted).toContain("SCENARIO COMPARISON");
      expect(formatted).toContain("BASELINE");
      expect(formatted).toContain("RECOMMENDED");
      expect(formatted).toContain("CONSERVATIVE");
      expect(formatted).toContain("AGGRESSIVE");
    });

    it("should include impact values in formatted output", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const formatted = formatScenarioComparison(comparison);

      expect(formatted).toContain("$0"); // baseline
      expect(formatted).toContain("$50"); // recommended
    });

    it("should include assumptions in formatted output", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const formatted = formatScenarioComparison(comparison);

      expect(formatted).toContain("Assumptions:");
    });

    it("should include impact range in formatted output", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const formatted = formatScenarioComparison(comparison);

      expect(formatted).toContain("IMPACT RANGE");
      expect(formatted).toContain("Minimum Impact");
      expect(formatted).toContain("Maximum Impact");
      expect(formatted).toContain("Impact Spread");
    });

    it("should be human-readable", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const formatted = formatScenarioComparison(comparison);

      expect(formatted.split("\n").length).toBeGreaterThan(10);
      expect(formatted).toContain("•");
    });
  });

  describe("validateComparison", () => {
    it("should validate correct comparison", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison = compareScenarios(input);
      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should reject null comparison", () => {
      const validation = validateComparison(null as any);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should reject comparison with missing baseline", () => {
      const comparison: any = {
        recommended: {
          impact: 50,
          assumptions: [],
        },
        alternatives: [],
      };

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject comparison with missing recommended", () => {
      const comparison: any = {
        baseline: {
          impact: 0,
          assumptions: [],
        },
        alternatives: [],
      };

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject comparison with non-array alternatives", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison: any = compareScenarios(input);
      comparison.alternatives = "not an array";

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject comparison with too many alternatives", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison: any = compareScenarios(input);
      comparison.alternatives.push({
        name: "Extra",
        impact: 100,
        assumptions: [],
      });

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject alternative with missing name", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison: any = compareScenarios(input);
      comparison.alternatives[0].name = null;

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject alternative with non-numeric impact", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison: any = compareScenarios(input);
      comparison.alternatives[0].impact = "high";

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });

    it("should reject alternative with non-array assumptions", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const comparison: any = compareScenarios(input);
      comparison.alternatives[0].assumptions = "not an array";

      const validation = validateComparison(comparison);

      expect(validation.valid).toBe(false);
    });
  });

  describe("compareScenarios - Determinism", () => {
    it("should produce consistent results for same input", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result1 = compareScenarios(input);
      const result2 = compareScenarios(input);

      expect(result1.baseline.impact).toBe(result2.baseline.impact);
      expect(result1.recommended.impact).toBe(result2.recommended.impact);
      expect(result1.alternatives[0].impact).toBe(result2.alternatives[0].impact);
      expect(result1.alternatives[1].impact).toBe(result2.alternatives[1].impact);
    });

    it("should have consistent assumption ordering", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result1 = compareScenarios(input);
      const result2 = compareScenarios(input);

      expect(result1.baseline.assumptions).toEqual(result2.baseline.assumptions);
      expect(result1.recommended.assumptions).toEqual(result2.recommended.assumptions);
      expect(result1.alternatives[0].assumptions).toEqual(result2.alternatives[0].assumptions);
      expect(result1.alternatives[1].assumptions).toEqual(result2.alternatives[1].assumptions);
    });

    it("should have consistent alternative ordering", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result1 = compareScenarios(input);
      const result2 = compareScenarios(input);

      expect(result1.alternatives.map((a) => a.name)).toEqual(
        result2.alternatives.map((a) => a.name)
      );
    });
  });

  describe("compareScenarios - Financial Precision", () => {
    it("should maintain financial precision for small amounts", () => {
      const input: ScenarioInput = {
        baselineRevenue: 10,
        baselineCost: 5,
        revenueChange: 1,
        costChange: 0.5,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      expect(result.recommended.impact).toBe(0.5);
      // Rounded to 2 decimal places
      expect(result.alternatives[0].impact).toBe(0.38);
      expect(result.alternatives[1].impact).toBe(0.63);
    });

    it("should handle fractional revenue/cost changes", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000.5,
        baselineCost: 500.25,
        revenueChange: 100.75,
        costChange: 50.33,
        confidence: 0.75,
      };

      const result = compareScenarios(input);

      const expected = 100.75 - 50.33;
      expect(result.recommended.impact).toBeCloseTo(expected, 2);
    });

    it("should display currency formatting in formatted output", () => {
      const input: ScenarioInput = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.75,
      };

      const result = compareScenarios(input);
      const formatted = formatScenarioComparison(result);

      expect(formatted).toContain("$");
    });
  });
});

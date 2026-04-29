import { describe, it, expect } from "vitest";
import {
  validateRecommendationContract,
  createRecommendationContract,
  buildRecommendationReasoning,
  RecommendationContract,
} from "../recommendation";
import { compareScenarios } from "../scenario-comparison";

describe("Recommendation Contract - Enterprise-Grade Explainability", () => {
  const mockScenarios = compareScenarios({
    baselineRevenue: 1000000,
    baselineCost: 500000,
    revenueChange: 100000,
    costChange: 50000,
    confidence: 0.8,
  });

  describe("validateRecommendationContract - Valid Contract", () => {
    it("should accept valid recommendation contract", () => {
      const contract: RecommendationContract = {
        recommendation: "Implement cost reduction strategy",
        confidence: 0.85,
        variablesUsed: ["baselineCost", "baselineRevenue", "confidence"],
        variablesIgnored: ["decisionType", "dueAt", "problemType"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning:
          "Recommendation based on 3 patterns with 75% success rate using 3 variables",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept contract with empty alternatives", () => {
      const contract: RecommendationContract = {
        recommendation: "No action needed",
        confidence: 0.5,
        variablesUsed: [],
        variablesIgnored: ["baselineCost", "baselineRevenue"],
        dataSufficiency: false,
        scenarios: {
          baseline: { impact: 0, assumptions: ["No action"] },
          recommended: { impact: 0, assumptions: ["Neutral"] },
          alternatives: [],
        },
        reasoning: "Recommendation blocked: insufficient data",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(true);
    });

    it("should accept contract with multiple alternatives", () => {
      const contract: RecommendationContract = {
        recommendation: "Execute strategy",
        confidence: 0.9,
        variablesUsed: ["baselineRevenue", "confidence"],
        variablesIgnored: ["baselineCost", "costChange", "dueAt"],
        dataSufficiency: true,
        scenarios: {
          baseline: { impact: 0, assumptions: ["No action"] },
          recommended: { impact: 50000, assumptions: ["Execute"] },
          alternatives: [
            {
              name: "Conservative",
              impact: 37500,
              assumptions: ["Reduced scope"],
            },
            {
              name: "Aggressive",
              impact: 62500,
              assumptions: ["Optimized execution"],
            },
          ],
        },
        reasoning: "Based on patterns and confidence levels",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateRecommendationContract - Missing Fields", () => {
    it("should reject when recommendation missing", () => {
      const contract: any = {
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("recommendation"))).toBe(true);
    });

    it("should reject when confidence missing", () => {
      const contract: any = {
        recommendation: "Test",
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
    });

    it("should reject when variablesUsed missing", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("variablesUsed"))).toBe(true);
    });

    it("should reject when variablesIgnored missing", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("variablesIgnored"))
      ).toBe(true);
    });

    it("should reject when dataSufficiency missing", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("dataSufficiency"))
      ).toBe(true);
    });

    it("should reject when reasoning missing", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("reasoning"))).toBe(true);
    });

    it("should reject when scenarios missing", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("scenarios"))).toBe(true);
    });
  });

  describe("validateRecommendationContract - Type Validation", () => {
    it("should reject non-string recommendation", () => {
      const contract: any = {
        recommendation: 123,
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("recommendation"))).toBe(true);
    });

    it("should reject non-number confidence", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: "high",
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
    });

    it("should reject non-boolean dataSufficiency", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: "yes",
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("dataSufficiency"))
      ).toBe(true);
    });

    it("should reject non-string reasoning", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: 123,
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("reasoning"))).toBe(true);
    });

    it("should reject non-array variablesUsed", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: "var1",
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("variablesUsed"))).toBe(true);
    });

    it("should reject array with non-string elements in variablesUsed", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1", 123],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("variablesUsed"))).toBe(true);
    });
  });

  describe("validateRecommendationContract - Scenarios Validation", () => {
    it("should reject null scenarios", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: null,
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("scenarios"))).toBe(true);
    });

    it("should reject missing baseline in scenarios", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: {
          recommended: { impact: 1000, assumptions: [] },
          alternatives: [],
        },
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("baseline"))).toBe(true);
    });

    it("should reject non-number impact in scenarios", () => {
      const contract: any = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: {
          baseline: { impact: "high", assumptions: [] },
          recommended: { impact: 1000, assumptions: [] },
          alternatives: [],
        },
        reasoning: "Test",
      };

      const result = validateRecommendationContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("impact"))).toBe(true);
    });
  });

  describe("createRecommendationContract", () => {
    it("should create valid contract from components", () => {
      const contract = createRecommendationContract(
        "Implement strategy",
        0.85,
        ["baselineRevenue", "confidence"],
        ["baselineCost", "costChange", "decisionType"],
        true,
        mockScenarios,
        "Based on 3 patterns with 75% success rate"
      );

      expect(contract.recommendation).toBe("Implement strategy");
      expect(contract.confidence).toBe(0.85);
      expect(contract.variablesUsed).toEqual(["baselineRevenue", "confidence"]);
      expect(contract.variablesIgnored).toEqual([
        "baselineCost",
        "costChange",
        "decisionType",
      ]);
      expect(contract.dataSufficiency).toBe(true);
      expect(contract.reasoning).toBe("Based on 3 patterns with 75% success rate");
    });

    it("should sort variablesUsed", () => {
      const contract = createRecommendationContract(
        "Test",
        0.8,
        ["z-var", "a-var", "m-var"],
        [],
        true,
        mockScenarios,
        "Test"
      );

      expect(contract.variablesUsed).toEqual(["a-var", "m-var", "z-var"]);
    });

    it("should sort variablesIgnored", () => {
      const contract = createRecommendationContract(
        "Test",
        0.8,
        [],
        ["z-var", "a-var", "m-var"],
        true,
        mockScenarios,
        "Test"
      );

      expect(contract.variablesIgnored).toEqual(["a-var", "m-var", "z-var"]);
    });

    it("should include all scenario data", () => {
      const contract = createRecommendationContract(
        "Test",
        0.8,
        [],
        [],
        true,
        mockScenarios,
        "Test"
      );

      expect(contract.scenarios.baseline).toBeDefined();
      expect(contract.scenarios.recommended).toBeDefined();
      expect(contract.scenarios.alternatives).toBeDefined();
      expect(contract.scenarios.baseline.impact).toBe(0);
      expect(contract.scenarios.recommended.impact).toBeGreaterThan(0);
    });
  });

  describe("buildRecommendationReasoning", () => {
    it("should build reasoning for approved recommendation", () => {
      const reasoning = buildRecommendationReasoning(
        5,
        78,
        3,
        0.75,
        false
      );

      expect(reasoning).toContain("5 patterns");
      expect(reasoning).toContain("78% success");
      expect(reasoning).toContain("3 variables");
      expect(reasoning).toContain("75%");
      expect(reasoning).not.toContain("blocked");
    });

    it("should build reasoning for blocked recommendation", () => {
      const reasoning = buildRecommendationReasoning(
        1,
        50,
        2,
        0.6,
        true
      );

      expect(reasoning).toContain("blocked");
      expect(reasoning).toContain("insufficient data");
      expect(reasoning).toContain("2 variables");
      expect(reasoning).toContain("1 patterns");
    });

    it("should format confidence percentage correctly", () => {
      const reasoning1 = buildRecommendationReasoning(3, 75, 2, 0.5, false);
      expect(reasoning1).toContain("50%");

      const reasoning2 = buildRecommendationReasoning(3, 75, 2, 0.8, false);
      expect(reasoning2).toContain("80%");
    });
  });

  describe("validateRecommendationContract - Null Safety", () => {
    it("should reject null input", () => {
      const result = validateRecommendationContract(null);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject undefined input", () => {
      const result = validateRecommendationContract(undefined);

      expect(result.valid).toBe(false);
    });

    it("should reject non-object input", () => {
      const result = validateRecommendationContract("string");

      expect(result.valid).toBe(false);
    });
  });

  describe("validateRecommendationContract - Determinism", () => {
    it("should produce consistent validation results", () => {
      const contract: RecommendationContract = {
        recommendation: "Test",
        confidence: 0.85,
        variablesUsed: ["var1"],
        variablesIgnored: ["var2"],
        dataSufficiency: true,
        scenarios: mockScenarios,
        reasoning: "Test reasoning",
      };

      const result1 = validateRecommendationContract(contract);
      const result2 = validateRecommendationContract(contract);

      expect(result1.valid).toBe(result2.valid);
      expect(result1.errors).toEqual(result2.errors);
    });
  });
});

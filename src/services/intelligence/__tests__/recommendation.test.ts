import { describe, it, expect } from "vitest";
import { generateRecommendation, generateMultipleRecommendations } from "../recommendation";
import type { ActionRecommendation } from "../recommendation";
import type { DecisionResult } from "@/domain/decision/types";
import type { DetectedPattern } from "../pattern-engine";
import type { OperatorItem } from "@/domain/operator/types";

describe("Recommendation Engine - Phase 4 Control 6", () => {
  const mockDecisionResult: DecisionResult = {
    decision: "APPROVED",
    expectedImpact: 100000,
    confidence: 0.8,
    explanation: {
      summary: "Test decision",
      drivers: [],
      assumptions: [],
      risks: [],
      missingData: [],
      calculationTrace: {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        netImpact: 50000,
        formula: "revenueChange - costChange",
      },
    },
    problemType: "revenue_leak",
  };

  const mockPattern: DetectedPattern = {
    patternId: "pattern-001",
    problemType: "revenue_leak",
    successRate: 75,
    itemIds: ["item-1", "item-2"],
    description: "Common revenue leak pattern",
  };

  const mockItem1: OperatorItem = {
    id: "item-1",
    action: "investigate_channels",
    workspaceId: "workspace-1",
    createdBy: "user-1",
  } as OperatorItem;

  const mockItem2: OperatorItem = {
    id: "item-2",
    action: "investigate_channels",
    workspaceId: "workspace-1",
    createdBy: "user-1",
  } as OperatorItem;

  const mockItems: OperatorItem[] = [mockItem1, mockItem2];

  // Create 3 patterns to meet data sufficiency requirement (>= 3 patterns)
  const mockPatterns: DetectedPattern[] = [
    mockPattern,
    {
      ...mockPattern,
      patternId: "pattern-002",
      successRate: 80,
    },
    {
      ...mockPattern,
      patternId: "pattern-003",
      successRate: 70,
    },
  ];

  describe("generateRecommendation - Variable Disclosure", () => {
    it("should include variablesUsed from input", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.variablesUsed).toContain("baselineRevenue");
      expect(result.variablesUsed).toContain("baselineCost");
      expect(result.variablesUsed).toContain("revenueChange");
      expect(result.variablesUsed).toContain("costChange");
      expect(result.variablesUsed).toContain("confidence");
      expect(result.variablesUsed.length).toBe(5);
    });

    it("should include variablesIgnored from registry", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.variablesIgnored).toContain("dueAt");
      expect(result.variablesIgnored).toContain("decisionType");
      expect(result.variablesIgnored).toContain("problemType");
    });

    it("should have sorted variablesUsed", () => {
      const inputVariables = {
        costChange: 50000,
        revenueChange: 100000,
        baselineRevenue: 1000000,
        baselineCost: 500000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      const sorted = [...result.variablesUsed].sort();
      expect(result.variablesUsed).toEqual(sorted);
    });

    it("should have sorted variablesIgnored", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      const sorted = [...result.variablesIgnored].sort();
      expect(result.variablesIgnored).toEqual(sorted);
    });

    it("should exclude non-registered variables from used", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
        customVariable: "some-value",
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.variablesUsed).not.toContain("customVariable");
    });
  });

  describe("generateRecommendation - Data Sufficiency", () => {
    it("should return sufficient with valid pattern and high success rate", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("sufficient");
      expect(result.recommendedAction).toBeDefined();
    });

    it("should return insufficient when no problem type", () => {
      const decision: DecisionResult = {
        ...mockDecisionResult,
        problemType: undefined,
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        decision,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
      expect(result.explanation).toContain("No problem type");
    });

    it("should return insufficient when no matching patterns", () => {
      const decision: DecisionResult = {
        ...mockDecisionResult,
        problemType: "cost_overrun",
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        decision,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
      expect(result.explanation).toContain("No matching patterns");
    });

    it("should return insufficient when no patterns match > 60% threshold", () => {
      const lowSuccessPattern1: DetectedPattern = {
        ...mockPattern,
        patternId: "low-1",
        successRate: 55,
      };

      const lowSuccessPattern2: DetectedPattern = {
        ...mockPattern,
        patternId: "low-2",
        successRate: 50,
      };

      const lowSuccessPattern3: DetectedPattern = {
        ...mockPattern,
        patternId: "low-3",
        successRate: 45,
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        [lowSuccessPattern1, lowSuccessPattern2, lowSuccessPattern3],
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
      expect(result.explanation).toContain("No matching patterns");
    });

    it("should return insufficient when pattern items empty", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        [],
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
      expect(result.explanation).toContain("No items found");
    });
  });

  describe("generateRecommendation - Recommendation Output", () => {
    it("should return recommendedAction when sufficient", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.recommendedAction).toBe("investigate_channels");
    });

    it("should return basedOnPatternId when sufficient", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      // mockPatterns[1] (pattern-002) has highest success rate (80)
      expect(result.basedOnPatternId).toBe("pattern-002");
    });

    it("should return confidenceScore as decimal", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      // mockPatterns highest success rate is 80 (0.8)
      expect(result.confidenceScore).toBe(0.8);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    });

    it("should include explanation", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });

  describe("generateRecommendation - Without Input Variables", () => {
    it("should handle undefined inputVariables", () => {
      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems
      );

      expect(result.variablesUsed).toEqual([]);
      expect(result.variablesIgnored.length).toBeGreaterThan(0);
      expect(result.dataSufficiency).toBe("sufficient");
    });

    it("should have all variables as ignored when no input", () => {
      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems
      );

      const allVarCount = Object.keys({
        baselineRevenue: {},
        baselineCost: {},
        revenueChange: {},
        costChange: {},
        confidence: {},
        dueAt: {},
        problemType: {},
        decisionType: {},
      }).length;

      expect(result.variablesIgnored.length).toBe(allVarCount);
    });
  });

  describe("generateMultipleRecommendations - Variable Disclosure", () => {
    it("should return recommendations with variable disclosure", () => {
      const pattern1 = { ...mockPattern, patternId: "pattern-1", successRate: 75 };
      const pattern2 = { ...mockPattern, patternId: "pattern-2", successRate: 80 };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const results = generateMultipleRecommendations(
        mockDecisionResult,
        [pattern1, pattern2],
        mockItems,
        inputVariables
      );

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.variablesUsed).toBeDefined();
        expect(result.variablesIgnored).toBeDefined();
        expect(result.variablesUsed).toEqual(
          ["baselineCost", "baselineRevenue", "confidence", "costChange", "revenueChange"]
        );
      }
    });

    it("should return sorted patterns by success rate", () => {
      const pattern1 = { ...mockPattern, patternId: "pattern-1", successRate: 65 };
      const pattern2 = { ...mockPattern, patternId: "pattern-2", successRate: 85 };
      const pattern3 = { ...mockPattern, patternId: "pattern-3", successRate: 75 };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const results = generateMultipleRecommendations(
        mockDecisionResult,
        [pattern1, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      // First result should be from highest success rate
      expect(results[0].basedOnPatternId).toBe("pattern-2");
      expect(results[1].basedOnPatternId).toBe("pattern-3");
      expect(results[2].basedOnPatternId).toBe("pattern-1");
    });

    it("should filter out patterns with low success rate before evaluation", () => {
      const pattern1 = { ...mockPattern, patternId: "pattern-1", successRate: 75 };
      const pattern2 = { ...mockPattern, patternId: "pattern-2", successRate: 50 };
      const pattern3 = { ...mockPattern, patternId: "pattern-3", successRate: 80 };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const results = generateMultipleRecommendations(
        mockDecisionResult,
        [pattern1, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      // Only pattern1 and pattern3 should be in results (pattern2 with 50% success rate is filtered out)
      expect(results.some((r) => r.basedOnPatternId === "pattern-1")).toBe(true);
      expect(results.some((r) => r.basedOnPatternId === "pattern-2")).toBe(false);
      expect(results.some((r) => r.basedOnPatternId === "pattern-3")).toBe(true);
    });

    it("should return insufficient fallback when no valid recommendations", () => {
      const decision: DecisionResult = {
        ...mockDecisionResult,
        problemType: "unknown_type",
      };

      const pattern1 = { ...mockPattern, patternId: "p1" };
      const pattern2 = { ...mockPattern, patternId: "p2" };
      const pattern3 = { ...mockPattern, patternId: "p3" };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const results = generateMultipleRecommendations(
        decision,
        [pattern1, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      expect(results.length).toBeGreaterThan(0);
      const firstResult = results[0];
      expect(firstResult.dataSufficiency).toBe("insufficient");
      expect(firstResult.recommendedAction).toBeUndefined();
    });
  });

  describe("generateRecommendation - Edge Cases", () => {
    it("should handle empty itemIds in pattern", () => {
      const emptyPattern: DetectedPattern = {
        ...mockPattern,
        patternId: "empty",
        itemIds: [],
      };

      const pattern2: DetectedPattern = {
        ...mockPattern,
        patternId: "p2",
      };

      const pattern3: DetectedPattern = {
        ...mockPattern,
        patternId: "p3",
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        [emptyPattern, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
    });

    it("should handle pattern with no matching items", () => {
      const nonMatchingPattern: DetectedPattern = {
        ...mockPattern,
        patternId: "non-match",
        itemIds: ["non-existent-id"],
      };

      const pattern2: DetectedPattern = {
        ...mockPattern,
        patternId: "p2",
      };

      const pattern3: DetectedPattern = {
        ...mockPattern,
        patternId: "p3",
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        [nonMatchingPattern, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      expect(result.dataSufficiency).toBe("insufficient");
      expect(result.recommendedAction).toBeUndefined();
    });

    it("should calculate confidenceScore as percentage / 100", () => {
      const pattern1: DetectedPattern = {
        ...mockPattern,
        patternId: "pattern-1",
        successRate: 95,
      };

      const pattern2: DetectedPattern = {
        ...mockPattern,
        patternId: "pattern-2",
        successRate: 85,
      };

      const pattern3: DetectedPattern = {
        ...mockPattern,
        patternId: "pattern-3",
        successRate: 75,
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        [pattern1, pattern2, pattern3],
        mockItems,
        inputVariables
      );

      expect(result.confidenceScore).toBe(0.95);
    });

    it("should handle partial input variables", () => {
      const partialInput = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
      };

      const result = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        partialInput
      );

      expect(result.variablesUsed).toContain("baselineRevenue");
      expect(result.variablesUsed).toContain("baselineCost");
      expect(result.variablesUsed).not.toContain("revenueChange");
      expect(result.variablesIgnored).toContain("revenueChange");
    });
  });

  describe("generateRecommendation - Determinism", () => {
    it("should produce consistent results for same input", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result1 = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      const result2 = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      expect(result1.recommendedAction).toBe(result2.recommendedAction);
      expect(result1.confidenceScore).toBe(result2.confidenceScore);
      expect(result1.variablesUsed).toEqual(result2.variablesUsed);
      expect(result1.variablesIgnored).toEqual(result2.variablesIgnored);
      expect(result1.dataSufficiency).toBe(result2.dataSufficiency);
    });

    it("should have consistent variable ordering", () => {
      const inputVariables = {
        costChange: 50000,
        revenueChange: 100000,
        baselineRevenue: 1000000,
        baselineCost: 500000,
        confidence: 0.8,
      };

      const result1 = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables
      );

      const inputVariables2 = {
        baselineRevenue: 1000000,
        costChange: 50000,
        baselineCost: 500000,
        confidence: 0.8,
        revenueChange: 100000,
      };

      const result2 = generateRecommendation(
        mockDecisionResult,
        mockPatterns,
        mockItems,
        inputVariables2
      );

      expect(result1.variablesUsed).toEqual(result2.variablesUsed);
      expect(result1.variablesIgnored).toEqual(result2.variablesIgnored);
    });
  });
});

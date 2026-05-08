import { describe, it, expect } from "vitest";
import {
  isDataSufficient,
  hasPatterns,
  getPatternsByProblemType,
  hasHighSuccessRatePatterns,
  DataSufficiencyResult,
  VariableWithConfidence,
} from "@/services/control/recommendation";
import { DetectedPattern } from "@/services/intelligence/pattern-engine";

describe("Recommendation Control Gate - Data Sufficiency", () => {
  describe("isDataSufficient - Pattern Validation", () => {
    it("should block when pattern count < 3", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.8 },
        { name: "confidence", confidence: 0.85 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.reason).toBe("INSUFFICIENT_PATTERNS");
      expect(result.details.patternCount).toBe(2);
      expect(result.details.minPatternsRequired).toBe(3);
    });

    it("should block when pattern count is 0", () => {
      const patterns: DetectedPattern[] = [];
      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.8 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.reason).toBe("INSUFFICIENT_PATTERNS");
      expect(result.details.patternCount).toBe(0);
    });

    it("should approve when pattern count >= 3", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.8 },
        { name: "confidence", confidence: 0.85 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(true);
      expect(result.status).toBe("approved");
      expect(result.reason).toBeUndefined();
    });

    it("should not block on exactly 3 patterns", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.6 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(true);
      expect(result.details.patternCount).toBe(3);
    });
  });

  describe("isDataSufficient - Confidence Validation", () => {
    it("should block when any variable confidence < 0.6", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.5 },
        { name: "confidence", confidence: 0.85 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.reason).toBe("LOW_CONFIDENCE_VARIABLES");
      expect(result.details.lowConfidenceVariables).toContain("revenue");
    });

    it("should block when multiple variables have low confidence", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.3 },
        { name: "cost", confidence: 0.4 },
        { name: "confidence", confidence: 0.85 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      expect(result.details.lowConfidenceVariables).toContain("cost");
      expect(result.details.lowConfidenceVariables).toContain("revenue");
      expect(result.details.lowConfidenceVariables).toHaveLength(2);
    });

    it("should approve when all variables have confidence >= 0.6", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.6 },
        { name: "cost", confidence: 0.8 },
        { name: "confidence", confidence: 0.85 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(true);
      expect(result.details.lowConfidenceVariables).toHaveLength(0);
    });

    it("should not block on confidence exactly at 0.6 threshold", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.6 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(true);
    });

    it("should block on confidence just below 0.6", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.59 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      expect(result.reason).toBe("LOW_CONFIDENCE_VARIABLES");
    });
  });

  describe("isDataSufficient - Combined Validation", () => {
    it("should block when both patterns and confidence insufficient", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "revenue", confidence: 0.5 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.sufficient).toBe(false);
      // Should block on patterns first (checked first)
      expect(result.reason).toBe("INSUFFICIENT_PATTERNS");
    });

    it("should return correct details structure", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      const variables: VariableWithConfidence[] = [];

      const result = isDataSufficient(patterns, variables);

      expect(result.details).toBeDefined();
      expect(result.details.patternCount).toBe(1);
      expect(result.details.minPatternsRequired).toBe(3);
      expect(result.details.minConfidenceRequired).toBe(0.6);
      expect(Array.isArray(result.details.lowConfidenceVariables)).toBe(true);
    });

    it("should return sorted low confidence variables", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 80,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 85,
        },
      ];

      const variables: VariableWithConfidence[] = [
        { name: "z-variable", confidence: 0.5 },
        { name: "a-variable", confidence: 0.4 },
        { name: "m-variable", confidence: 0.3 },
      ];

      const result = isDataSufficient(patterns, variables);

      expect(result.details.lowConfidenceVariables).toEqual([
        "a-variable",
        "m-variable",
        "z-variable",
      ]);
    });
  });

  describe("hasPatterns", () => {
    it("should return true when patterns exist for problem type", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      expect(hasPatterns(patterns, "revenue-decline")).toBe(true);
    });

    it("should return false when no patterns exist for problem type", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      expect(hasPatterns(patterns, "cost-overrun")).toBe(false);
    });

    it("should return false when patterns array is empty", () => {
      expect(hasPatterns([], "revenue-decline")).toBe(false);
    });
  });

  describe("getPatternsByProblemType", () => {
    it("should return patterns sorted by success rate descending", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 70,
        },
        {
          patternId: "p-2",
          problemType: "revenue-decline",
          itemIds: ["i-2"],
          successRate: 90,
        },
        {
          patternId: "p-3",
          problemType: "revenue-decline",
          itemIds: ["i-3"],
          successRate: 80,
        },
      ];

      const result = getPatternsByProblemType(patterns, "revenue-decline");

      expect(result).toHaveLength(3);
      expect(result[0].successRate).toBe(90);
      expect(result[1].successRate).toBe(80);
      expect(result[2].successRate).toBe(70);
    });

    it("should filter patterns by problem type", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
        {
          patternId: "p-2",
          problemType: "cost-overrun",
          itemIds: ["i-2"],
          successRate: 80,
        },
      ];

      const result = getPatternsByProblemType(patterns, "revenue-decline");

      expect(result).toHaveLength(1);
      expect(result[0].patternId).toBe("p-1");
    });

    it("should return empty array when no matching patterns", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      const result = getPatternsByProblemType(patterns, "cost-overrun");

      expect(result).toHaveLength(0);
    });
  });

  describe("hasHighSuccessRatePatterns", () => {
    it("should return true when patterns exceed success rate threshold", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 75,
        },
      ];

      expect(hasHighSuccessRatePatterns(patterns, 60)).toBe(true);
    });

    it("should return false when no patterns exceed threshold", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 50,
        },
      ];

      expect(hasHighSuccessRatePatterns(patterns, 60)).toBe(false);
    });

    it("should use default threshold of 60", () => {
      const patterns: DetectedPattern[] = [
        {
          patternId: "p-1",
          problemType: "revenue-decline",
          itemIds: ["i-1"],
          successRate: 65,
        },
      ];

      expect(hasHighSuccessRatePatterns(patterns)).toBe(true);
    });

    it("should return false when patterns array is empty", () => {
      expect(hasHighSuccessRatePatterns([], 60)).toBe(false);
    });
  });
});

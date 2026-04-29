import { describe, it, expect } from "vitest";
import {
  evaluateVariableConfidence,
  isVariableStale,
  daysSinceTimestamp,
  validateVariableState,
  getStalenessThresholdMs,
} from "../variable-confidence";
import { getRequiredVariables } from "../variable-registry";
import type { VariableState } from "../variable-confidence";

describe("Variable Confidence Engine - Phase 4 Control 2", () => {
  const requiredVariables = getRequiredVariables();

  describe("evaluateVariableConfidence - Complete State", () => {
    it("should mark as complete with all required variables and high confidence", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.complete).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.lowConfidence).toHaveLength(0);
      expect(result.staleVariables).toHaveLength(0);
    });

    it("should mark as incomplete if any required variable missing", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
        // Missing baselineCost
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.complete).toBe(false);
      expect(result.missingRequired).toContain("baselineCost");
    });
  });

  describe("evaluateVariableConfidence - Missing Required", () => {
    it("should detect single missing required variable", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        // Missing confidence
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.missingRequired).toContain("confidence");
      expect(result.complete).toBe(false);
    });

    it("should detect multiple missing required variables", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.missingRequired.length).toBeGreaterThan(1);
      expect(result.complete).toBe(false);
    });

    it("should return sorted missing required variables", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      const sorted = [...result.missingRequired].sort();
      expect(result.missingRequired).toEqual(sorted);
    });
  });

  describe("evaluateVariableConfidence - Low Confidence", () => {
    it("should detect variables with confidence < 0.5", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.3, // Low confidence
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.lowConfidence.length).toBeGreaterThan(0);
      expect(result.lowConfidence.some((lc) => lc.key === "baselineRevenue")).toBe(true);
      expect(result.complete).toBe(false);
    });

    it("should detect multiple low confidence variables", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.2,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.4,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.lowConfidence.length).toBeGreaterThanOrEqual(2);
    });

    it("should treat invalid confidence as low", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 1.5, // Invalid: > 1.0
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.lowConfidence.some((lc) => lc.key === "baselineRevenue")).toBe(true);
    });

    it("should return sorted low confidence variables", () => {
      const states: VariableState[] = [
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.2,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      const keys = result.lowConfidence.map((lc) => lc.key);
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it("should include confidence threshold in result", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.lowConfidence[0].threshold).toBe(0.5);
    });
  });

  describe("evaluateVariableConfidence - Stale Variables", () => {
    it("should detect variables older than 30 days", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
          freshnessAt: thirtyOneDaysAgo,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.staleVariables.length).toBeGreaterThan(0);
      expect(result.staleVariables.some((sv) => sv.key === "baselineRevenue")).toBe(true);
      expect(result.complete).toBe(false);
    });

    it("should not mark variables without freshnessAt as stale", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
          // No freshnessAt
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.staleVariables.some((sv) => sv.key === "baselineRevenue")).toBe(false);
    });

    it("should calculate daysOld correctly", () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
          freshnessAt: twentyDaysAgo,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.staleVariables).toHaveLength(0); // Not stale at 20 days
    });

    it("should return sorted stale variables", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const states: VariableState[] = [
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
          freshnessAt: thirtyOneDaysAgo,
        },
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
          freshnessAt: thirtyOneDaysAgo,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
          freshnessAt: new Date().toISOString(),
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      const keys = result.staleVariables.map((sv) => sv.key);
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });
  });

  describe("evaluateVariableConfidence - Overall Confidence", () => {
    it("should calculate average confidence correctly", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 1.0,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 1.0,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 1.0,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 1.0,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.5,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.overallConfidence).toBe(0.9); // (1+1+1+1+0.5)/5 = 0.9
    });

    it("should round overall confidence to 2 decimals", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.555,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.666,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.777,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.888,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.999,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      // Average should be rounded to 2 decimals (check it's a valid 2-decimal number)
      const rounded = Math.round(result.overallConfidence * 100) / 100;
      expect(result.overallConfidence).toBe(rounded);
    });
  });

  describe("evaluateVariableConfidence - Overrides", () => {
    it("should skip confidence checks for overridden variables", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.1, // Very low
          complete: false, // Incomplete
          override: true, // But overridden
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result = evaluateVariableConfidence(states, requiredVariables);

      expect(result.lowConfidence.some((lc) => lc.key === "baselineRevenue")).toBe(false);
    });
  });

  describe("evaluateVariableConfidence - Determinism", () => {
    it("should produce same result for same input", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const result1 = evaluateVariableConfidence(states, requiredVariables);
      const result2 = evaluateVariableConfidence(states, requiredVariables);

      expect(result1.complete).toBe(result2.complete);
      expect(result1.overallConfidence).toBe(result2.overallConfidence);
      expect(result1.missingRequired).toEqual(result2.missingRequired);
      expect(result1.lowConfidence).toEqual(result2.lowConfidence);
    });
  });

  describe("isVariableStale", () => {
    it("should return true for stale timestamp", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      expect(isVariableStale(thirtyOneDaysAgo)).toBe(true);
    });

    it("should return false for fresh timestamp", () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(isVariableStale(oneDayAgo)).toBe(false);
    });

    it("should return false for missing timestamp", () => {
      expect(isVariableStale(undefined)).toBe(false);
    });
  });

  describe("daysSinceTimestamp", () => {
    it("should calculate days correctly", () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const days = daysSinceTimestamp(twentyDaysAgo);

      expect(days).toBeGreaterThanOrEqual(20);
      expect(days).toBeLessThan(21);
    });
  });

  describe("getStalenessThresholdMs", () => {
    it("should return correct threshold", () => {
      const threshold = getStalenessThresholdMs();
      const expectedMs = 30 * 24 * 60 * 60 * 1000;

      expect(threshold).toBe(expectedMs);
    });
  });

  describe("validateVariableState", () => {
    it("should validate correct state", () => {
      const state: VariableState = {
        key: "test",
        value: 100,
        source: "user_input",
        confidence: 0.8,
        complete: true,
      };

      const result = validateVariableState(state);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid confidence", () => {
      const state: VariableState = {
        key: "test",
        value: 100,
        source: "user_input",
        confidence: 1.5,
        complete: true,
      };

      const result = validateVariableState(state);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("confidence"))).toBe(true);
    });

    it("should reject missing key", () => {
      const state = {
        value: 100,
        source: "user_input",
        confidence: 0.8,
        complete: true,
      } as unknown as VariableState;

      const result = validateVariableState(state);

      expect(result.valid).toBe(false);
    });
  });
});

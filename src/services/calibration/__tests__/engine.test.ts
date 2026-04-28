import { describe, it, expect } from "vitest";
import {
  computeCalibration,
  getCalibrationHealth,
  type CalibrationMetrics,
} from "../engine";
import type { OperatorItem } from "@/domain/operator/types";

// Helper to create a completed item with outcome data
function createCompletedItem(overrides?: Partial<OperatorItem>): OperatorItem {
  return {
    id: "test-id",
    problem: "test problem",
    action: "test action",
    impactExpected: 100,
    impactLow: 50,
    impactHigh: 150,
    confidence: 0.8,
    priorityScore: 10,
    status: "done",
    dueAt: null,
    blockingDependencies: [],
    expectedOutcome: "test",
    actualOutcome: "test",
    actualOutcomeValue: 100,
    outcomeDelta: 0,
    decisionAccuracy: 1.0,
    decisionError: 0,
    outcomeNotes: "",
    createdAt: new Date().toISOString(),
    engineVersion: "v1.0.0",
    ...overrides,
  };
}

describe("computeCalibration - Calibration Engine", () => {
  describe("Perfect Performance", () => {
    it("should calculate 100% success rate with perfect accuracy", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100,
          decisionAccuracy: 1.0,
          decisionError: 0,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(true);
      expect(result.successRate).toBe(100);
      expect(result.avgAccuracy).toBe(1.0);
      expect(result.avgError).toBe(0);
      expect(result.successCount).toBe(1);
      expect(result.itemsAnalyzed).toBe(1);
    });

    it("should calculate metrics across multiple perfect items", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100,
          decisionAccuracy: 1.0,
          decisionError: 0,
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 200,
          decisionAccuracy: 1.0,
          decisionError: 0,
        }),
        createCompletedItem({
          impactExpected: 50,
          actualOutcomeValue: 50,
          decisionAccuracy: 1.0,
          decisionError: 0,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(true);
      expect(result.successRate).toBe(100);
      expect(result.avgAccuracy).toBe(1.0);
      expect(result.avgError).toBe(0);
      expect(result.successCount).toBe(3);
      expect(result.itemsAnalyzed).toBe(3);
    });
  });

  describe("Success Rate Calculation", () => {
    it("should calculate 50% success rate", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // success
          decisionAccuracy: 1.5,
          decisionError: 50,
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50, // failure
          decisionAccuracy: 0.5,
          decisionError: -50,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(true);
      expect(result.successRate).toBe(50);
      expect(result.successCount).toBe(1);
      expect(result.itemsAnalyzed).toBe(2);
    });

    it("should calculate 25% success rate", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100, // success
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50, // failure
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 75, // failure
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 99, // failure
        }),
      ];

      const result = computeCalibration(items);

      expect(result.successRate).toBe(25);
      expect(result.successCount).toBe(1);
      expect(result.itemsAnalyzed).toBe(4);
    });

    it("should count items where actual equals expected as success", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100, // success (equals)
        }),
      ];

      const result = computeCalibration(items);

      expect(result.successCount).toBe(1);
      expect(result.successRate).toBe(100);
    });

    it("should count items where actual > expected as success", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // success (greater)
        }),
      ];

      const result = computeCalibration(items);

      expect(result.successCount).toBe(1);
      expect(result.successRate).toBe(100);
    });

    it("should not count items where actual < expected as success", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 99, // failure
        }),
      ];

      const result = computeCalibration(items);

      expect(result.successCount).toBe(0);
      expect(result.successRate).toBe(0);
    });
  });

  describe("Accuracy Averaging", () => {
    it("should calculate average accuracy across items", () => {
      const items = [
        createCompletedItem({
          decisionAccuracy: 1.0,
        }),
        createCompletedItem({
          decisionAccuracy: 1.5,
        }),
        createCompletedItem({
          decisionAccuracy: 0.5,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgAccuracy).toBe(1.0); // (1.0 + 1.5 + 0.5) / 3
    });

    it("should round accuracy to 4 decimals", () => {
      const items = [
        createCompletedItem({
          decisionAccuracy: 0.3333,
        }),
        createCompletedItem({
          decisionAccuracy: 0.3334,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgAccuracy).toBe(0.3334); // rounded (0.3333 + 0.3334) / 2
    });

    it("should return null accuracy when no items have accuracy data", () => {
      const items = [
        createCompletedItem({
          decisionAccuracy: undefined,
        }),
        createCompletedItem({
          decisionAccuracy: null,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgAccuracy).toBeNull();
      expect(result.itemsAnalyzed).toBe(2);
    });

    it("should average only items with accuracy data", () => {
      const items = [
        createCompletedItem({
          decisionAccuracy: 1.0,
        }),
        createCompletedItem({
          decisionAccuracy: undefined,
        }),
        createCompletedItem({
          decisionAccuracy: 1.0,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgAccuracy).toBe(1.0); // (1.0 + 1.0) / 2
    });
  });

  describe("Error Averaging", () => {
    it("should calculate average error across items", () => {
      const items = [
        createCompletedItem({
          decisionError: 0,
        }),
        createCompletedItem({
          decisionError: 50,
        }),
        createCompletedItem({
          decisionError: -50,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgError).toBe(0); // (0 + 50 - 50) / 3
    });

    it("should round error to 2 decimals", () => {
      const items = [
        createCompletedItem({
          decisionError: 10.333,
        }),
        createCompletedItem({
          decisionError: 10.334,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgError).toBe(10.33); // rounded (10.333 + 10.334) / 2
    });

    it("should return null error when no items have error data", () => {
      const items = [
        createCompletedItem({
          decisionError: undefined,
        }),
        createCompletedItem({
          decisionError: null,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgError).toBeNull();
    });

    it("should average only items with error data", () => {
      const items = [
        createCompletedItem({
          decisionError: 25,
        }),
        createCompletedItem({
          decisionError: undefined,
        }),
        createCompletedItem({
          decisionError: 25,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.avgError).toBe(25); // (25 + 25) / 2
    });
  });

  describe("Filtering Logic", () => {
    it("should only include items with status done", () => {
      const items = [
        createCompletedItem({
          status: "done",
          actualOutcomeValue: 100,
        }),
        createCompletedItem({
          status: "in_progress",
          actualOutcomeValue: 100,
        }),
        createCompletedItem({
          status: "pending",
          actualOutcomeValue: 100,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.itemsAnalyzed).toBe(1);
    });

    it("should exclude items without actualOutcomeValue", () => {
      const items = [
        createCompletedItem({
          actualOutcomeValue: 100,
        }),
        createCompletedItem({
          actualOutcomeValue: undefined,
        }),
        createCompletedItem({
          actualOutcomeValue: null,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.itemsAnalyzed).toBe(1);
    });

    it("should exclude items without impactExpected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
        }),
        createCompletedItem({
          impactExpected: undefined,
        }),
        createCompletedItem({
          impactExpected: null,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.itemsAnalyzed).toBe(1);
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle non-array input", () => {
      const result = computeCalibration(null as any);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.avgAccuracy).toBeNull();
      expect(result.successRate).toBeNull();
    });

    it("should handle empty array", () => {
      const result = computeCalibration([]);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("No completed items with outcome data");
      expect(result.itemsAnalyzed).toBe(0);
    });

    it("should handle array with no completed items", () => {
      const items = [
        createCompletedItem({
          status: "pending",
        }),
        createCompletedItem({
          status: "in_progress",
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(false);
      expect(result.itemsAnalyzed).toBe(0);
    });

    it("should handle all items missing outcome data", () => {
      const items = [
        createCompletedItem({
          actualOutcomeValue: null,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(false);
      expect(result.itemsAnalyzed).toBe(0);
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for same inputs", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
          decisionAccuracy: 1.5,
          decisionError: 50,
        }),
      ];

      const result1 = computeCalibration(items);
      const result2 = computeCalibration(items);
      const result3 = computeCalibration(items);

      expect(result1.successRate).toBe(result2.successRate);
      expect(result2.successRate).toBe(result3.successRate);
      expect(result1.avgAccuracy).toBe(result2.avgAccuracy);
      expect(result1.avgError).toBe(result2.avgError);
    });

    it("should be deterministic across large datasets", () => {
      const items = Array.from({ length: 100 }, (_, i) =>
        createCompletedItem({
          id: `item-${i}`,
          impactExpected: 100 + i,
          actualOutcomeValue: 150 + i,
          decisionAccuracy: 1.5,
          decisionError: 50,
        })
      );

      const result1 = computeCalibration(items);
      const result2 = computeCalibration(items);

      expect(result1.successRate).toBe(result2.successRate);
      expect(result1.itemsAnalyzed).toBe(result2.itemsAnalyzed);
      expect(result1.avgAccuracy).toBe(result2.avgAccuracy);
    });
  });

  describe("Mixed Performance Scenarios", () => {
    it("should calculate calibration with mixed accuracy outcomes", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // success
          decisionAccuracy: 1.5,
          decisionError: 50,
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50, // failure
          decisionAccuracy: 0.5,
          decisionError: -50,
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100, // success
          decisionAccuracy: 1.0,
          decisionError: 0,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.valid).toBe(true);
      expect(result.successRate).toBe(66.67); // 2/3
      expect(result.successCount).toBe(2);
      expect(result.avgAccuracy).toBe(1.0); // (1.5 + 0.5 + 1.0) / 3
      expect(result.avgError).toBe(0); // (50 - 50 + 0) / 3
      expect(result.itemsAnalyzed).toBe(3);
    });

    it("should handle negative expected impact", () => {
      const items = [
        createCompletedItem({
          impactExpected: -100,
          actualOutcomeValue: -50, // success (-50 >= -100)
          decisionAccuracy: 0.5,
        }),
      ];

      const result = computeCalibration(items);

      expect(result.successCount).toBe(1);
      expect(result.successRate).toBe(100);
    });
  });
});

describe("getCalibrationHealth", () => {
  it("should return healthy for success rate > 70% and good accuracy", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 1.0,
      avgError: 0,
      successRate: 85,
      itemsAnalyzed: 10,
      successCount: 8,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("healthy");
  });

  it("should return at_risk for success rate 50-70%", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 1.0,
      avgError: 0,
      successRate: 60,
      itemsAnalyzed: 10,
      successCount: 6,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("at_risk");
  });

  it("should return at_risk for accuracy outside 0.8-1.2", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 1.5,
      avgError: 0,
      successRate: 85,
      itemsAnalyzed: 10,
      successCount: 8,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("at_risk");
  });

  it("should return critical for success rate < 50%", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 1.0,
      avgError: 0,
      successRate: 40,
      itemsAnalyzed: 10,
      successCount: 4,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("critical");
  });

  it("should return unknown for invalid metrics", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: null,
      avgError: null,
      successRate: null,
      itemsAnalyzed: 0,
      successCount: 0,
      valid: false,
    };

    expect(getCalibrationHealth(metrics)).toBe("unknown");
  });

  it("should return healthy when accuracy is within bounds", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 0.8,
      avgError: 0,
      successRate: 75,
      itemsAnalyzed: 10,
      successCount: 7,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("healthy");
  });

  it("should return at_risk when accuracy exceeds upper bound", () => {
    const metrics: CalibrationMetrics = {
      avgAccuracy: 1.21,
      avgError: 0,
      successRate: 85,
      itemsAnalyzed: 10,
      successCount: 8,
      valid: true,
    };

    expect(getCalibrationHealth(metrics)).toBe("at_risk");
  });
});

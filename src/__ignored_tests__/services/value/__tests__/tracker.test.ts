import { describe, it, expect } from "vitest";
import { calculateValue, type ValueMetrics } from "../tracker";
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

describe("calculateValue - Value Tracker", () => {
  describe("Single Item Value Calculation", () => {
    it("should calculate zero delta when actual equals expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.valid).toBe(true);
      expect(result.totalExpected).toBe(100);
      expect(result.totalActual).toBe(100);
      expect(result.totalDelta).toBe(0);
      expect(result.itemsAnalyzed).toBe(1);
    });

    it("should calculate positive delta when actual > expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
        }),
      ];

      const result = calculateValue(items);

      expect(result.valid).toBe(true);
      expect(result.totalExpected).toBe(100);
      expect(result.totalActual).toBe(150);
      expect(result.totalDelta).toBe(50);
    });

    it("should calculate negative delta when actual < expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50,
        }),
      ];

      const result = calculateValue(items);

      expect(result.valid).toBe(true);
      expect(result.totalExpected).toBe(100);
      expect(result.totalActual).toBe(50);
      expect(result.totalDelta).toBe(-50);
    });

    it("should handle large monetary values", () => {
      const items = [
        createCompletedItem({
          impactExpected: 1000000,
          actualOutcomeValue: 1500000,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(1000000);
      expect(result.totalActual).toBe(1500000);
      expect(result.totalDelta).toBe(500000);
    });

    it("should handle small monetary values", () => {
      const items = [
        createCompletedItem({
          impactExpected: 10.5,
          actualOutcomeValue: 15.75,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(10.5);
      expect(result.totalActual).toBe(15.75);
      expect(result.totalDelta).toBe(5.25);
    });
  });

  describe("Multiple Items Value Aggregation", () => {
    it("should sum multiple items correctly", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 250,
        }),
        createCompletedItem({
          impactExpected: 300,
          actualOutcomeValue: 200,
        }),
      ];

      const result = calculateValue(items);

      expect(result.itemsAnalyzed).toBe(3);
      expect(result.totalExpected).toBe(600); // 100 + 200 + 300
      expect(result.totalActual).toBe(600); // 150 + 250 + 200
      expect(result.totalDelta).toBe(0); // 600 - 600
    });

    it("should handle all positive outcomes", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 120,
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 250,
        }),
        createCompletedItem({
          impactExpected: 150,
          actualOutcomeValue: 180,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(450);
      expect(result.totalActual).toBe(550);
      expect(result.totalDelta).toBe(100);
    });

    it("should handle all negative outcomes", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 80,
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 150,
        }),
        createCompletedItem({
          impactExpected: 150,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(450);
      expect(result.totalActual).toBe(330);
      expect(result.totalDelta).toBe(-120);
    });

    it("should handle mixed positive and negative outcomes", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // +50
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 100, // -100
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // +50
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(400);
      expect(result.totalActual).toBe(400);
      expect(result.totalDelta).toBe(0);
    });
  });

  describe("Rounding to 2 Decimals", () => {
    it("should round totals to 2 decimal places", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100.333,
          actualOutcomeValue: 150.666,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(100.33); // 100.333 → 100.33
      expect(result.totalActual).toBe(150.67); // 150.666 → 150.67
      expect(result.totalDelta).toBe(50.33); // 150.666 - 100.333 = 50.333 → 50.33
    });

    it("should handle currency rounding edge cases", () => {
      const items = [
        createCompletedItem({
          impactExpected: 10.005,
          actualOutcomeValue: 20.004,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(10.01); // 10.005 rounds to 10.01
      expect(result.totalActual).toBe(20.0); // 20.004 rounds to 20.00
      expect(result.totalDelta).toBe(10.0); // 20.00 - 10.01 = 9.99, but actual calc: 20.004 - 10.005 = 9.999 rounds to 10.00
    });
  });

  describe("Negative Impact Handling", () => {
    it("should handle negative expected impact", () => {
      const items = [
        createCompletedItem({
          impactExpected: -100,
          actualOutcomeValue: -50,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(-100);
      expect(result.totalActual).toBe(-50);
      expect(result.totalDelta).toBe(50); // -50 - (-100)
    });

    it("should handle mixed positive and negative expected impacts", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
        }),
        createCompletedItem({
          impactExpected: -50,
          actualOutcomeValue: -40,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(50); // 100 - 50
      expect(result.totalActual).toBe(110); // 150 - 40
      expect(result.totalDelta).toBe(60); // 110 - 50
    });
  });

  describe("Filtering Logic", () => {
    it("should only include items with status done", () => {
      const items = [
        createCompletedItem({
          status: "done",
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
        createCompletedItem({
          status: "in_progress",
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
        createCompletedItem({
          status: "pending",
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.itemsAnalyzed).toBe(1);
      expect(result.totalExpected).toBe(100);
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

      const result = calculateValue(items);

      expect(result.itemsAnalyzed).toBe(1);
      expect(result.totalActual).toBe(100);
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

      const result = calculateValue(items);

      expect(result.itemsAnalyzed).toBe(1);
      expect(result.totalExpected).toBe(100);
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle non-array input", () => {
      const result = calculateValue(null as unknown);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.totalExpected).toBe(0);
      expect(result.totalActual).toBe(0);
      expect(result.totalDelta).toBe(0);
    });

    it("should handle empty array", () => {
      const result = calculateValue([]);

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

      const result = calculateValue(items);

      expect(result.valid).toBe(false);
      expect(result.itemsAnalyzed).toBe(0);
    });

    it("should handle all items missing outcome data", () => {
      const items = [
        createCompletedItem({
          actualOutcomeValue: null,
        }),
      ];

      const result = calculateValue(items);

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
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 250,
        }),
      ];

      const result1 = calculateValue(items);
      const result2 = calculateValue(items);
      const result3 = calculateValue(items);

      expect(result1.totalExpected).toBe(result2.totalExpected);
      expect(result2.totalExpected).toBe(result3.totalExpected);
      expect(result1.totalActual).toBe(result2.totalActual);
      expect(result1.totalDelta).toBe(result2.totalDelta);
    });

    it("should be deterministic across large datasets", () => {
      const items = Array.from({ length: 100 }, (_, i) =>
        createCompletedItem({
          id: `item-${i}`,
          impactExpected: 100 + i,
          actualOutcomeValue: 150 + i,
        })
      );

      const result1 = calculateValue(items);
      const result2 = calculateValue(items);

      expect(result1.totalExpected).toBe(result2.totalExpected);
      expect(result1.totalActual).toBe(result2.totalActual);
      expect(result1.totalDelta).toBe(result2.totalDelta);
      expect(result1.itemsAnalyzed).toBe(result2.itemsAnalyzed);
    });
  });

  describe("ROI Calculation", () => {
    it("should calculate ROI when actual equals expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.roi).toBe(1.0); // 100 / 100
    });

    it("should calculate ROI when actual exceeds expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
        }),
      ];

      const result = calculateValue(items);

      expect(result.roi).toBe(1.5); // 150 / 100
    });

    it("should calculate ROI when actual is less than expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50,
        }),
      ];

      const result = calculateValue(items);

      expect(result.roi).toBe(0.5); // 50 / 100
    });

    it("should return null ROI when totalExpected is zero", () => {
      const items = [
        createCompletedItem({
          impactExpected: 0,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.roi).toBeNull();
    });

    it("should calculate ROI across multiple items", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 120,
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 80,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(200);
      expect(result.totalActual).toBe(200);
      expect(result.roi).toBe(1.0); // 200 / 200
    });

    it("should round ROI to 4 decimals", () => {
      const items = [
        createCompletedItem({
          impactExpected: 3,
          actualOutcomeValue: 1,
        }),
      ];

      const result = calculateValue(items);

      // 1 / 3 = 0.3333...
      expect(result.roi).toBe(0.3333);
    });
  });

  describe("Loss from Wrong Decisions", () => {
    it("should calculate zero loss when actual equals expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100,
        }),
      ];

      const result = calculateValue(items);

      expect(result.lossFromWrongDecisions).toBe(0);
    });

    it("should calculate zero loss when actual exceeds expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150,
        }),
      ];

      const result = calculateValue(items);

      expect(result.lossFromWrongDecisions).toBe(0);
    });

    it("should calculate loss when actual is less than expected", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50,
        }),
      ];

      const result = calculateValue(items);

      expect(result.lossFromWrongDecisions).toBe(50); // 100 - 50
    });

    it("should sum losses across multiple items", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 60, // loss of 40
        }),
        createCompletedItem({
          impactExpected: 200,
          actualOutcomeValue: 250, // no loss
        }),
        createCompletedItem({
          impactExpected: 150,
          actualOutcomeValue: 100, // loss of 50
        }),
      ];

      const result = calculateValue(items);

      // 40 + 0 + 50 = 90
      expect(result.lossFromWrongDecisions).toBe(90);
    });

    it("should round loss to 2 decimal places", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100.445,
          actualOutcomeValue: 50.223,
        }),
      ];

      const result = calculateValue(items);

      // 100.445 - 50.223 = 50.222 -> 50.22
      expect(result.lossFromWrongDecisions).toBe(50.22);
    });

    it("should handle mix of gains and losses", () => {
      const items = [
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 150, // gain: no loss
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 50, // loss: 50
        }),
        createCompletedItem({
          impactExpected: 100,
          actualOutcomeValue: 100, // break-even: no loss
        }),
      ];

      const result = calculateValue(items);

      expect(result.lossFromWrongDecisions).toBe(50);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should calculate ROI impact across portfolio", () => {
      const items = [
        createCompletedItem({
          id: "marketing-campaign",
          impactExpected: 50000,
          actualOutcomeValue: 75000,
        }),
        createCompletedItem({
          id: "cost-reduction",
          impactExpected: 20000,
          actualOutcomeValue: 18000,
        }),
        createCompletedItem({
          id: "new-feature",
          impactExpected: 30000,
          actualOutcomeValue: 35000,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(100000);
      expect(result.totalActual).toBe(128000);
      expect(result.totalDelta).toBe(28000);
      expect(result.itemsAnalyzed).toBe(3);
      expect(result.roi).toBe(1.28); // 128000 / 100000
      expect(result.lossFromWrongDecisions).toBe(2000); // cost-reduction: 20000 - 18000
    });

    it("should handle loss scenario", () => {
      const items = [
        createCompletedItem({
          id: "failed-initiative",
          impactExpected: 100000,
          actualOutcomeValue: 40000,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(100000);
      expect(result.totalActual).toBe(40000);
      expect(result.totalDelta).toBe(-60000);
      expect(result.roi).toBe(0.4); // 40000 / 100000
      expect(result.lossFromWrongDecisions).toBe(60000); // 100000 - 40000
    });

    it("should calculate break-even scenario", () => {
      const items = [
        createCompletedItem({
          id: "initiative-1",
          impactExpected: 50000,
          actualOutcomeValue: 60000,
        }),
        createCompletedItem({
          id: "initiative-2",
          impactExpected: 50000,
          actualOutcomeValue: 40000,
        }),
      ];

      const result = calculateValue(items);

      expect(result.totalExpected).toBe(100000);
      expect(result.totalActual).toBe(100000);
      expect(result.totalDelta).toBe(0);
      expect(result.roi).toBe(1.0); // 100000 / 100000
      expect(result.lossFromWrongDecisions).toBe(10000); // initiative-2: 50000 - 40000
    });
  });
});

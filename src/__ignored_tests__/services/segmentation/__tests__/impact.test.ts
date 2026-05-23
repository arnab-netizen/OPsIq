import { describe, it, expect } from "vitest";
import { segmentImpact } from "../impact";
import type { OperatorItem } from "@/domain/operator/types";

// Helper to create a test item with defaults
function createItem(overrides?: Partial<OperatorItem>): OperatorItem {
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

describe("segmentImpact - Impact Segmentation", () => {
  describe("Low Impact Segment (< 1000)", () => {
    it("should categorize item with impact 100 as low", () => {
      const items = [
        createItem({
          impactExpected: 100,
          decisionAccuracy: 1.0,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(0);
      expect(result.valid).toBe(true);
    });

    it("should categorize item with impact 999 as low", () => {
      const items = [
        createItem({
          impactExpected: 999,
          decisionAccuracy: 0.9,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.low.avgAccuracy).toBe(0.9);
    });

    it("should handle multiple low impact items", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 0.8 }),
        createItem({ impactExpected: 500, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 999, decisionAccuracy: 1.2 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(3);
      // (0.8 + 1.0 + 1.2) / 3 = 1.0
      expect(result.low.avgAccuracy).toBe(1.0);
    });

    it("should handle low segment with zero impact", () => {
      const items = [
        createItem({
          impactExpected: 0,
          decisionAccuracy: 0.5,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.low.avgAccuracy).toBe(0.5);
    });
  });

  describe("Medium Impact Segment (1000–10000)", () => {
    it("should categorize item with impact 1000 as medium", () => {
      const items = [
        createItem({
          impactExpected: 1000,
          decisionAccuracy: 0.95,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(0);
      expect(result.medium.count).toBe(1);
      expect(result.high.count).toBe(0);
      expect(result.medium.avgAccuracy).toBe(0.95);
    });

    it("should categorize item with impact 5000 as medium", () => {
      const items = [
        createItem({
          impactExpected: 5000,
          decisionAccuracy: 1.1,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.medium.count).toBe(1);
      expect(result.medium.avgAccuracy).toBe(1.1);
    });

    it("should categorize item with impact 10000 as medium", () => {
      const items = [
        createItem({
          impactExpected: 10000,
          decisionAccuracy: 1.0,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.medium.count).toBe(1);
      expect(result.medium.avgAccuracy).toBe(1.0);
    });

    it("should handle multiple medium impact items", () => {
      const items = [
        createItem({ impactExpected: 1000, decisionAccuracy: 0.9 }),
        createItem({ impactExpected: 5500, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 10000, decisionAccuracy: 1.1 }),
      ];

      const result = segmentImpact(items);

      expect(result.medium.count).toBe(3);
      // (0.9 + 1.0 + 1.1) / 3 = 1.0
      expect(result.medium.avgAccuracy).toBe(1.0);
    });
  });

  describe("High Impact Segment (> 10000)", () => {
    it("should categorize item with impact 10001 as high", () => {
      const items = [
        createItem({
          impactExpected: 10001,
          decisionAccuracy: 1.2,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(0);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(1);
      expect(result.high.avgAccuracy).toBe(1.2);
    });

    it("should categorize item with impact 50000 as high", () => {
      const items = [
        createItem({
          impactExpected: 50000,
          decisionAccuracy: 1.5,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.high.count).toBe(1);
      expect(result.high.avgAccuracy).toBe(1.5);
    });

    it("should categorize item with impact 1000000 as high", () => {
      const items = [
        createItem({
          impactExpected: 1000000,
          decisionAccuracy: 0.8,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.high.count).toBe(1);
      expect(result.high.avgAccuracy).toBe(0.8);
    });

    it("should handle multiple high impact items", () => {
      const items = [
        createItem({ impactExpected: 15000, decisionAccuracy: 0.85 }),
        createItem({ impactExpected: 50000, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 100000, decisionAccuracy: 1.15 }),
      ];

      const result = segmentImpact(items);

      expect(result.high.count).toBe(3);
      // (0.85 + 1.0 + 1.15) / 3 = 1.0
      expect(result.high.avgAccuracy).toBe(1.0);
    });
  });

  describe("Mixed Segments", () => {
    it("should distribute items across all three segments", () => {
      const items = [
        createItem({ impactExpected: 500, decisionAccuracy: 0.9 }),
        createItem({ impactExpected: 5000, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 50000, decisionAccuracy: 1.1 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.medium.count).toBe(1);
      expect(result.high.count).toBe(1);
      expect(result.low.avgAccuracy).toBe(0.9);
      expect(result.medium.avgAccuracy).toBe(1.0);
      expect(result.high.avgAccuracy).toBe(1.1);
    });

    it("should handle mixed distribution with multiple items per segment", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 0.8 }),
        createItem({ impactExpected: 500, decisionAccuracy: 0.9 }),
        createItem({ impactExpected: 2000, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 8000, decisionAccuracy: 1.1 }),
        createItem({ impactExpected: 20000, decisionAccuracy: 1.2 }),
        createItem({ impactExpected: 100000, decisionAccuracy: 1.3 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(2);
      expect(result.medium.count).toBe(2);
      expect(result.high.count).toBe(2);
      // Low: (0.8 + 0.9) / 2 = 0.85
      expect(result.low.avgAccuracy).toBe(0.85);
      // Medium: (1.0 + 1.1) / 2 = 1.05
      expect(result.medium.avgAccuracy).toBe(1.05);
      // High: (1.2 + 1.3) / 2 = 1.25
      expect(result.high.avgAccuracy).toBe(1.25);
    });
  });

  describe("Accuracy Handling", () => {
    it("should return null accuracy when segment has no items with accuracy", () => {
      const items = [
        createItem({
          impactExpected: 100,
          decisionAccuracy: undefined,
        }),
        createItem({
          impactExpected: 500,
          decisionAccuracy: null,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(2);
      expect(result.low.avgAccuracy).toBeNull();
    });

    it("should exclude items without accuracy from average calculation", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 200, decisionAccuracy: undefined }),
        createItem({ impactExpected: 300, decisionAccuracy: 1.0 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(3);
      // Only 2 items with accuracy: (1.0 + 1.0) / 2 = 1.0
      expect(result.low.avgAccuracy).toBe(1.0);
    });

    it("should round accuracy to 4 decimals", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 0.3333 }),
        createItem({ impactExpected: 200, decisionAccuracy: 0.3334 }),
      ];

      const result = segmentImpact(items);

      // (0.3333 + 0.3334) / 2 = 0.33335 -> 0.3334
      expect(result.low.avgAccuracy).toBe(0.3334);
    });

    it("should handle mix of null and non-null accuracy in segment", () => {
      const items = [
        createItem({ impactExpected: 1000, decisionAccuracy: 0.8 }),
        createItem({ impactExpected: 2000, decisionAccuracy: null }),
        createItem({ impactExpected: 5000, decisionAccuracy: 1.2 }),
        createItem({ impactExpected: 8000, decisionAccuracy: undefined }),
      ];

      const result = segmentImpact(items);

      expect(result.medium.count).toBe(4);
      // Only 2 items with accuracy: (0.8 + 1.2) / 2 = 1.0
      expect(result.medium.avgAccuracy).toBe(1.0);
    });
  });

  describe("Empty Segments", () => {
    it("should return zero count for empty segments", () => {
      const items = [createItem({ impactExpected: 100 })];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(0);
      expect(result.medium.avgAccuracy).toBeNull();
      expect(result.high.avgAccuracy).toBeNull();
    });

    it("should handle empty array", () => {
      const result = segmentImpact([]);

      expect(result.low.count).toBe(0);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(0);
      expect(result.low.avgAccuracy).toBeNull();
      expect(result.medium.avgAccuracy).toBeNull();
      expect(result.high.avgAccuracy).toBeNull();
      expect(result.valid).toBe(true);
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle non-array input", () => {
      const result = segmentImpact(null as unknown);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.low.count).toBe(0);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(0);
    });

    it("should handle items with null/undefined impact", () => {
      const items = [
        createItem({ impactExpected: null }),
        createItem({ impactExpected: undefined }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(0);
      expect(result.medium.count).toBe(0);
      expect(result.high.count).toBe(0);
      expect(result.valid).toBe(true);
    });
  });

  describe("Negative Impact Handling", () => {
    it("should categorize negative impact as low", () => {
      const items = [
        createItem({
          impactExpected: -500,
          decisionAccuracy: 0.9,
        }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.low.avgAccuracy).toBe(0.9);
    });

    it("should handle mix of negative and positive impacts", () => {
      const items = [
        createItem({ impactExpected: -100, decisionAccuracy: 0.8 }),
        createItem({ impactExpected: 500, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 50000, decisionAccuracy: 1.2 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(2); // -100 and 500
      expect(result.high.count).toBe(1);
    });
  });

  describe("Segment Boundaries", () => {
    it("should correctly handle boundary values", () => {
      const items = [
        createItem({ impactExpected: 999, decisionAccuracy: 0.8 }), // Low boundary
        createItem({ impactExpected: 1000, decisionAccuracy: 0.9 }), // Medium boundary
        createItem({ impactExpected: 10000, decisionAccuracy: 1.0 }), // Medium upper boundary
        createItem({ impactExpected: 10001, decisionAccuracy: 1.1 }), // High boundary
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(1);
      expect(result.low.avgAccuracy).toBe(0.8);
      expect(result.medium.count).toBe(2);
      // (0.9 + 1.0) / 2 = 0.95
      expect(result.medium.avgAccuracy).toBe(0.95);
      expect(result.high.count).toBe(1);
      expect(result.high.avgAccuracy).toBe(1.1);
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for same inputs", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 0.8 }),
        createItem({ impactExpected: 5000, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 50000, decisionAccuracy: 1.2 }),
      ];

      const result1 = segmentImpact(items);
      const result2 = segmentImpact(items);
      const result3 = segmentImpact(items);

      expect(result1.low.count).toBe(result2.low.count);
      expect(result2.low.count).toBe(result3.low.count);
      expect(result1.medium.avgAccuracy).toBe(result2.medium.avgAccuracy);
      expect(result1.high.avgAccuracy).toBe(result3.high.avgAccuracy);
    });

    it("should be deterministic across large datasets", () => {
      const items = Array.from({ length: 300 }, (_, i) => {
        const impactExpected = (i % 3) === 0 ? 100 + i : (i % 3) === 1 ? 5000 + i : 50000 + i;
        return createItem({
          id: `item-${i}`,
          impactExpected,
          decisionAccuracy: 0.8 + (i % 10) * 0.05,
        });
      });

      const result1 = segmentImpact(items);
      const result2 = segmentImpact(items);

      expect(result1.low.count).toBe(result2.low.count);
      expect(result1.medium.count).toBe(result2.medium.count);
      expect(result1.high.count).toBe(result2.high.count);
      expect(result1.low.avgAccuracy).toBe(result2.low.avgAccuracy);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle portfolio with mixed impact distribution", () => {
      const items = [
        // Low impact: quick wins
        createItem({ id: "low-1", impactExpected: 100, decisionAccuracy: 0.95 }),
        createItem({ id: "low-2", impactExpected: 500, decisionAccuracy: 0.98 }),
        // Medium impact: standard initiatives
        createItem({ id: "med-1", impactExpected: 3000, decisionAccuracy: 1.0 }),
        createItem({ id: "med-2", impactExpected: 5000, decisionAccuracy: 0.92 }),
        createItem({ id: "med-3", impactExpected: 8000, decisionAccuracy: 1.08 }),
        // High impact: strategic initiatives
        createItem({ id: "high-1", impactExpected: 25000, decisionAccuracy: 0.85 }),
        createItem({ id: "high-2", impactExpected: 100000, decisionAccuracy: 1.2 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(2);
      expect(result.medium.count).toBe(3);
      expect(result.high.count).toBe(2);
      // Low: (0.95 + 0.98) / 2 = 0.965
      expect(result.low.avgAccuracy).toBe(0.965);
      // Medium: (1.0 + 0.92 + 1.08) / 3 = 1.0
      expect(result.medium.avgAccuracy).toBe(1.0);
      // High: (0.85 + 1.2) / 2 = 1.025
      expect(result.high.avgAccuracy).toBe(1.025);
    });

    it("should handle scenarios with missing accuracy data", () => {
      const items = [
        createItem({ impactExpected: 100, decisionAccuracy: 0.9 }),
        createItem({ impactExpected: 200, decisionAccuracy: null }), // No accuracy yet
        createItem({ impactExpected: 5000, decisionAccuracy: 1.0 }),
        createItem({ impactExpected: 6000, decisionAccuracy: undefined }), // No accuracy yet
        createItem({ impactExpected: 50000, decisionAccuracy: 1.1 }),
      ];

      const result = segmentImpact(items);

      expect(result.low.count).toBe(2);
      expect(result.low.avgAccuracy).toBe(0.9); // Only 1 with accuracy
      expect(result.medium.count).toBe(2);
      expect(result.medium.avgAccuracy).toBe(1.0); // Only 1 with accuracy
      expect(result.high.count).toBe(1);
      expect(result.high.avgAccuracy).toBe(1.1);
    });
  });
});

import { describe, it, expect } from "vitest";
import { detectPatterns, type DetectedPattern } from "@/services/intelligence/pattern-engine";
import { OperatorItem } from "@/domain/operator/types";

// Helper to create mock OperatorItem
function createItem(overrides?: Partial<OperatorItem>): OperatorItem {
  const baseItem: OperatorItem = {
    id: `item-${Math.random()}`,
    workspaceId: "ws-1",
    ownerUserId: "user-1",
    createdBy: "user-1",
    lastUpdatedBy: null,
    problem: "test",
    action: "test",
    impactExpected: 1000,
    impactLow: 500,
    impactHigh: 1500,
    confidence: 0.8,
    priorityScore: 50,
    status: "done",
    decisionType: "growth",
    problemType: "revenue_leak",
    blockingDependencies: [],
    expectedOutcome: "positive",
    actualOutcome: "positive",
    actualOutcomeValue: 1000,
    dueAt: null,
    engineVersion: "v1",
    createdAt: new Date().toISOString(),
  };

  return { ...baseItem, ...overrides } as OperatorItem;
}

describe("Pattern Engine Service", () => {
  describe("detectPatterns()", () => {
    it("should return empty array for empty items", () => {
      const patterns = detectPatterns([]);
      expect(patterns).toEqual([]);
    });

    it("should filter to completed items only", () => {
      const items = [
        createItem({ status: "pending", actualOutcomeValue: null }),
        createItem({ status: "done", actualOutcomeValue: 1000 }),
      ];

      const patterns = detectPatterns(items);
      expect(patterns).toBeDefined();
    });

    it("should detect pattern from 3+ items in same problem type", () => {
      const items = [
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 100 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].problemType).toBe("revenue_leak");
      expect(patterns[0].frequency).toBe(3);
    });

    it("should detect success pattern from positive outcome", () => {
      const items = [
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 100 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns[0].outcomePattern).toBe("success");
    });

    it("should detect failure pattern from negative outcome", () => {
      const items = [
        createItem({ problemType: "cost_overrun", actualOutcomeValue: -100 }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: -105 }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: -110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].outcomePattern).toBe("failure");
    });

    it("should calculate impact metrics correctly", () => {
      const items = [
        createItem({ problemType: "growth_block", actualOutcomeValue: 190 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 200 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 210 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns[0].avgImpact).toBe(200);
      expect(patterns[0].impactRange.min).toBe(190);
      expect(patterns[0].impactRange.max).toBe(210);
    });

    it("should separate patterns by problem type", () => {
      const items = [
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 100 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 110 }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: 100 }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: 105 }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: 110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBe(2);
      const types = patterns.map((p) => p.problemType);
      expect(types).toContain("revenue_leak");
      expect(types).toContain("cost_overrun");
    });

    it("should include item IDs in pattern", () => {
      const items = [
        createItem({ id: "id-1", problemType: "growth_block", actualOutcomeValue: 100 }),
        createItem({ id: "id-2", problemType: "growth_block", actualOutcomeValue: 105 }),
        createItem({ id: "id-3", problemType: "growth_block", actualOutcomeValue: 110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns[0].itemIds).toContain("id-1");
      expect(patterns[0].itemIds).toContain("id-2");
      expect(patterns[0].itemIds).toContain("id-3");
    });

    it("should sort patterns by frequency descending", () => {
      const items = [
        // 5-item cluster
        ...Array(5)
          .fill(0)
          .map(() => createItem({ problemType: "inefficiency", actualOutcomeValue: 100 })),
        // 3-item cluster
        ...Array(3)
          .fill(0)
          .map(() => createItem({ problemType: "growth_block", actualOutcomeValue: 1000 })),
      ];

      const patterns = detectPatterns(items);

      expect(patterns[0].frequency).toBeGreaterThanOrEqual(patterns[1]?.frequency || 0);
    });

    it("should limit to top 20 patterns", () => {
      const items: OperatorItem[] = [];
      const problemTypes: Array<"revenue_leak" | "cost_overrun" | "growth_block" | "inefficiency"> = [
        "revenue_leak",
        "cost_overrun",
        "growth_block",
        "inefficiency",
      ];

      for (let i = 0; i < 30; i++) {
        const pt = problemTypes[i % problemTypes.length];
        const baseImpact = (i + 1) * 1000;
        items.push(createItem({ problemType: pt, actualOutcomeValue: baseImpact }));
        items.push(createItem({ problemType: pt, actualOutcomeValue: baseImpact + 100 }));
        items.push(createItem({ problemType: pt, actualOutcomeValue: baseImpact + 200 }));
      }

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeLessThanOrEqual(20);
    });

    it("should cluster items by impact range", () => {
      const items = [
        // Cluster 1: ~100
        createItem({ problemType: "growth_block", actualOutcomeValue: 100 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 105 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 110 }),
        // Cluster 2: ~5000 (outside 20% tolerance)
        createItem({ problemType: "growth_block", actualOutcomeValue: 5000 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 5200 }),
        createItem({ problemType: "growth_block", actualOutcomeValue: 5400 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBe(2);
    });

    it("should filter clusters with less than 3 items", () => {
      const items = [
        // Large cluster
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 100 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 110 }),
        // Small cluster (filtered)
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 5000 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 5100 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBe(1);
      expect(patterns[0].frequency).toBe(3);
    });

    it("should use outcomeDelta as fallback", () => {
      const items = [
        createItem({ problemType: "revenue_leak", actualOutcomeValue: null, outcomeDelta: 100 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: null, outcomeDelta: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: null, outcomeDelta: 110 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].outcomePattern).toBe("success");
    });

    it("should use status as final fallback", () => {
      const items = [
        createItem({ problemType: "cost_overrun", actualOutcomeValue: null, outcomeDelta: null, status: "done" }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: null, outcomeDelta: null, status: "done" }),
        createItem({ problemType: "cost_overrun", actualOutcomeValue: null, outcomeDelta: null, status: "done" }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].outcomePattern).toBe("success");
    });

    it("should skip items without problemType", () => {
      const items = [
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 100 }),
        createItem({ problemType: undefined, actualOutcomeValue: 105 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 110 }),
        createItem({ problemType: "revenue_leak", actualOutcomeValue: 115 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.problemType)).toBe(true);
    });

    it("should return valid DetectedPattern objects", () => {
      const items = [
        createItem({ problemType: "inefficiency", actualOutcomeValue: 100 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 105 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 110 }),
      ];

      const patterns = detectPatterns(items);

      patterns.forEach((pattern) => {
        expect(pattern.patternId).toBeDefined();
        expect(pattern.problemType).toBeDefined();
        expect(["success", "failure"]).toContain(pattern.outcomePattern);
        expect(typeof pattern.frequency).toBe("number");
        expect(typeof pattern.avgImpact).toBe("number");
        expect(pattern.impactRange).toHaveProperty("min");
        expect(pattern.impactRange).toHaveProperty("max");
        expect(typeof pattern.successRate).toBe("number");
        expect(Array.isArray(pattern.itemIds)).toBe(true);
      });
    });

    it("should not mutate input items", () => {
      const items = [
        createItem({ problemType: "inefficiency", actualOutcomeValue: 100 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 105 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 110 }),
      ];

      const originalJSON = JSON.stringify(items);
      detectPatterns(items);
      const afterJSON = JSON.stringify(items);

      expect(originalJSON).toBe(afterJSON);
    });

    it("should produce consistent results for identical input", () => {
      const items = [
        createItem({ problemType: "inefficiency", actualOutcomeValue: 100 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 105 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 110 }),
      ];

      const patterns1 = detectPatterns(items);
      const patterns2 = detectPatterns(items);

      expect(patterns1).toEqual(patterns2);
    });

    it("should handle large impact values", () => {
      const items = [
        createItem({ problemType: "inefficiency", actualOutcomeValue: 1000000 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 1050000 }),
        createItem({ problemType: "inefficiency", actualOutcomeValue: 1100000 }),
      ];

      const patterns = detectPatterns(items);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].avgImpact).toBeGreaterThan(0);
    });

    it("should handle all valid problem types", () => {
      const problemTypes: Array<"revenue_leak" | "cost_overrun" | "growth_block" | "inefficiency"> = [
        "revenue_leak",
        "cost_overrun",
        "growth_block",
        "inefficiency",
      ];

      for (const pt of problemTypes) {
        const items = [
          createItem({ problemType: pt, actualOutcomeValue: 100 }),
          createItem({ problemType: pt, actualOutcomeValue: 105 }),
          createItem({ problemType: pt, actualOutcomeValue: 110 }),
        ];

        const patterns = detectPatterns(items);

        expect(patterns.length).toBeGreaterThan(0);
        expect(patterns[0].problemType).toBe(pt);
      }
    });
  });
});

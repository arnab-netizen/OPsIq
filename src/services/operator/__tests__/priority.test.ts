import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculatePriorityScore, calculatePriority } from "../priority";
import { OperatorItem } from "@/domain/operator/types";

describe("calculatePriorityScore - Deterministic Priority Scoring Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Calculation", () => {
    it("should calculate base score as impactExpected * confidence", () => {
      const input = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(80); // 100 * 0.8 * 1 (no urgency)
    });

    it("should return 0 when impactExpected is 0", () => {
      const input = {
        impactExpected: 0,
        confidence: 0.9,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(0);
    });

    it("should handle zero confidence", () => {
      const input = {
        impactExpected: 500,
        confidence: 0,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(0);
    });
  });

  describe("Urgency Multiplier - Hours Remaining", () => {
    it("should apply 1x multiplier for dueAt >= 24 hours (no urgent deadline)", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

      const input = {
        impactExpected: 100,
        confidence: 0.5,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(50); // 100 * 0.5 * 1 (default, no urgency)
    });

    it("should apply 1.5x multiplier for dueAt < 24 hours and >= 12 hours", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 18 * 60 * 60 * 1000); // 18 hours from now

      const input = {
        impactExpected: 100,
        confidence: 0.5,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(75); // 100 * 0.5 * 1.5
    });

    it("should apply 2x multiplier for dueAt < 12 hours and >= 6 hours", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 9 * 60 * 60 * 1000); // 9 hours from now

      const input = {
        impactExpected: 100,
        confidence: 0.5,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(100); // 100 * 0.5 * 2
    });

    it("should apply 3x multiplier for dueAt < 6 hours", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now

      const input = {
        impactExpected: 100,
        confidence: 0.5,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(150); // 100 * 0.5 * 3
    });

    it("should apply 1x multiplier (no urgency) when dueAt is null", () => {
      const input = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: null,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(80); // 100 * 0.8 * 1
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same score for same input (deterministic)", () => {
      const input = {
        impactExpected: 250,
        confidence: 0.75,
        dueAt: undefined,
      };

      const score1 = calculatePriorityScore(input);
      const score2 = calculatePriorityScore(input);

      expect(score1).toBe(score2);
      expect(score1).toBe(187.5); // 250 * 0.75 * 1
    });

    it("should produce deterministic scores even with urgency", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 10 * 60 * 60 * 1000); // 10 hours from now

      const input = {
        impactExpected: 200,
        confidence: 0.6,
        dueAt,
      };

      // Call multiple times
      const scores = [
        calculatePriorityScore(input),
        calculatePriorityScore(input),
        calculatePriorityScore(input),
      ];

      // All should be equal
      expect(scores[0]).toBe(scores[1]);
      expect(scores[1]).toBe(scores[2]);
    });
  });

  describe("Clamping and Rounding", () => {
    it("should clamp to max 10000", () => {
      const input = {
        impactExpected: 100000,
        confidence: 0.5,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(10000);
    });

    it("should clamp even with urgency multiplier", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now

      const input = {
        impactExpected: 50000,
        confidence: 0.75,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(10000); // Clamped (50000 * 0.75 * 3 = 112500 > 10000)
    });

    it("should round to 2 decimal places", () => {
      const input = {
        impactExpected: 333.33,
        confidence: 0.333,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      // 333.33 * 0.333 = 110.997... should round to 111.00
      expect(score).toBe(111);
    });

    it("should maintain precision with small numbers", () => {
      const input = {
        impactExpected: 10.5,
        confidence: 0.25,
        dueAt: undefined,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(2.63); // 10.5 * 0.25 = 2.625, rounds to 2.63
    });
  });

  describe("Urgency Ordering", () => {
    it("should order by urgency: high urgency > low urgency", () => {
      const now = new Date();
      const baseInput = {
        impactExpected: 100,
        confidence: 0.5,
      };

      // No urgency (>= 24 hours)
      const noUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      });

      // Low urgency (18 hours, < 24)
      const lowUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 18 * 60 * 60 * 1000),
      });

      // Medium urgency (9 hours, < 12)
      const mediumUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 9 * 60 * 60 * 1000),
      });

      // High urgency (3 hours, < 6)
      const highUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      });

      expect(noUrgency).toBe(50); // 100 * 0.5 * 1
      expect(lowUrgency).toBe(75); // 100 * 0.5 * 1.5
      expect(mediumUrgency).toBe(100); // 100 * 0.5 * 2
      expect(highUrgency).toBe(150); // 100 * 0.5 * 3

      // Verify ordering
      expect(noUrgency).toBeLessThan(lowUrgency);
      expect(lowUrgency).toBeLessThan(mediumUrgency);
      expect(mediumUrgency).toBeLessThan(highUrgency);
    });
  });
});

describe("calculatePriority - Legacy Function", () => {
  it("should work with OperatorItem and calculate deterministic priority", () => {
    const item: OperatorItem = {
      id: "test-1",
      problem: "Test problem",
      action: "Test action",
      impactExpected: 200,
      impactLow: 150,
      impactHigh: 250,
      confidence: 0.7,
      priorityScore: 0,
      status: "pending",
      dueAt: null,
      blockingDependencies: [],
      expectedOutcome: null,
      actualOutcome: null,
      engineVersion: "v1.0.0",
      createdAt: new Date().toISOString(),
    };

    const score = calculatePriority(item);
    expect(score).toBe(140); // 200 * 0.7 * 1
  });

  it("should return 0 for items with zero or negative impact", () => {
    const item: OperatorItem = {
      id: "test-1",
      problem: "Test problem",
      action: "Test action",
      impactExpected: 0,
      impactLow: 0,
      impactHigh: 0,
      confidence: 0.9,
      priorityScore: 0,
      status: "pending",
      dueAt: null,
      blockingDependencies: [],
      expectedOutcome: null,
      actualOutcome: null,
      engineVersion: "v1.0.0",
      createdAt: new Date().toISOString(),
    };

    const score = calculatePriority(item);
    expect(score).toBe(0);
  });
});

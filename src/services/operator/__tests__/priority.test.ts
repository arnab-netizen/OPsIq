import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculatePriorityScore, calculatePriority, getCalibrationMultiplier } from "../priority";
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

  describe("Age-based Priority Decay (v2 Formula)", () => {
    it("should ignore dueAt in v2 formula (only uses impact, confidence, age)", () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

      const input = {
        impactExpected: 100,
        confidence: 0.5,
        dueAt,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(50); // 100 * 0.5 * 1.0 (dueAt ignored, age=0)
    });

    it("should calculate priority independent of due date", () => {
      const now = new Date();
      const dueAtVeryUrgent = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours
      const dueAtNotUrgent = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours

      const urgentScore = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        dueAt: dueAtVeryUrgent,
      });

      const notUrgentScore = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        dueAt: dueAtNotUrgent,
      });

      // Both should be equal with v2 formula (no urgency multiplier)
      expect(urgentScore).toBe(notUrgentScore);
      expect(urgentScore).toBe(50); // 100 * 0.5 * 1.0
    });

    it("should ignore dueAt when null", () => {
      const input = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: null,
      };

      const score = calculatePriorityScore(input);
      expect(score).toBe(80); // 100 * 0.8 * 1.0
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

  describe("Due Date Irrelevance in v2 Formula", () => {
    it("should produce same priority regardless of due date (v2 formula)", () => {
      const now = new Date();
      const baseInput = {
        impactExpected: 100,
        confidence: 0.5,
      };

      // Various due dates - all should produce same priority
      const noUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48 hours away
      });

      const lowUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 18 * 60 * 60 * 1000), // 18 hours away
      });

      const mediumUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 9 * 60 * 60 * 1000), // 9 hours away
      });

      const highUrgency = calculatePriorityScore({
        ...baseInput,
        dueAt: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours away
      });

      // All should be equal with v2 formula (no urgency multiplier)
      expect(noUrgency).toBe(50); // 100 * 0.5 * 1.0
      expect(lowUrgency).toBe(50); // 100 * 0.5 * 1.0
      expect(mediumUrgency).toBe(50); // 100 * 0.5 * 1.0
      expect(highUrgency).toBe(50); // 100 * 0.5 * 1.0

      // Verify all are equal
      expect(noUrgency).toEqual(lowUrgency);
      expect(lowUrgency).toEqual(mediumUrgency);
      expect(mediumUrgency).toEqual(highUrgency);
    });
  });
});

describe("getCalibrationMultiplier - Adaptive Priority Based on Accuracy", () => {
  describe("Low Accuracy (< 0.5) - Reduce Priority Weight", () => {
    it("should return 0.5 for zero accuracy (worst case)", () => {
      const multiplier = getCalibrationMultiplier(0);
      expect(multiplier).toBe(0.5);
    });

    it("should return 0.75 for accuracy = 0.25", () => {
      const multiplier = getCalibrationMultiplier(0.25);
      expect(multiplier).toBe(0.75); // 0.5 + (0.25 / 0.5) * 0.5 = 0.75
    });

    it("should return 1.0 for accuracy = 0.5 (boundary)", () => {
      const multiplier = getCalibrationMultiplier(0.5);
      expect(multiplier).toBe(1.0); // 0.5 + (0.5 / 0.5) * 0.5 = 1.0
    });

    it("should scale linearly from 0.5 to 1.0 for accuracies 0 to 0.5", () => {
      const acc0 = getCalibrationMultiplier(0);
      const acc025 = getCalibrationMultiplier(0.25);
      const acc05 = getCalibrationMultiplier(0.5);

      expect(acc0).toBe(0.5);
      expect(acc025).toBe(0.75);
      expect(acc05).toBe(1.0);

      // Verify linear spacing
      expect(acc025 - acc0).toBeCloseTo(0.25, 4);
      expect(acc05 - acc025).toBeCloseTo(0.25, 4);
    });
  });

  describe("Normal Accuracy (0.5-0.8) - Keep Weight", () => {
    it("should return 1.0 for accuracy = 0.5", () => {
      const multiplier = getCalibrationMultiplier(0.5);
      expect(multiplier).toBe(1.0);
    });

    it("should return 1.0 for accuracy = 0.65", () => {
      const multiplier = getCalibrationMultiplier(0.65);
      expect(multiplier).toBe(1.0);
    });

    it("should return 1.0 for accuracy = 0.8", () => {
      const multiplier = getCalibrationMultiplier(0.8);
      expect(multiplier).toBe(1.0);
    });
  });

  describe("High Accuracy (> 0.8) - Increase Priority Weight", () => {
    it("should return 1.0 for accuracy = 0.8 (boundary)", () => {
      const multiplier = getCalibrationMultiplier(0.8);
      expect(multiplier).toBe(1.0);
    });

    it("should return ~1.143 for accuracy = 1.0 (perfect)", () => {
      const multiplier = getCalibrationMultiplier(1.0);
      // 1.0 + ((1.0 - 0.8) / 0.7) * 0.5 = 1.0 + (0.2/0.7)*0.5 ≈ 1.1429
      expect(multiplier).toBeCloseTo(1.1429, 4);
    });

    it("should return 1.25 for accuracy = 1.15", () => {
      const multiplier = getCalibrationMultiplier(1.15);
      // 1.0 + ((1.15 - 0.8) / 0.7) * 0.5 = 1.0 + (0.35/0.7)*0.5 = 1.25
      expect(multiplier).toBe(1.25);
    });

    it("should return 1.5 for accuracy = 1.5 (max bounded)", () => {
      const multiplier = getCalibrationMultiplier(1.5);
      expect(multiplier).toBe(1.5); // Capped at 1.5
    });

    it("should return 1.5 for accuracy = 2.0 (over-prediction, capped)", () => {
      const multiplier = getCalibrationMultiplier(2.0);
      expect(multiplier).toBe(1.5); // Capped at 1.5
    });

    it("should scale linearly from 1.0 to 1.5 for accuracies 0.8 to 1.5", () => {
      const acc08 = getCalibrationMultiplier(0.8);
      const acc115 = getCalibrationMultiplier(1.15);
      const acc15 = getCalibrationMultiplier(1.5);

      expect(acc08).toBe(1.0);
      expect(acc115).toBe(1.25);
      expect(acc15).toBe(1.5);

      // Verify equal spacing: each should add 0.25
      expect(acc115 - acc08).toBeCloseTo(0.25, 4);
      expect(acc15 - acc115).toBeCloseTo(0.25, 4);
    });
  });

  describe("Edge Cases and Null Safety", () => {
    it("should return 1.0 for null accuracy", () => {
      const multiplier = getCalibrationMultiplier(null);
      expect(multiplier).toBe(1.0);
    });

    it("should return 1.0 for undefined accuracy", () => {
      const multiplier = getCalibrationMultiplier(undefined);
      expect(multiplier).toBe(1.0);
    });

    it("should return 1.0 for negative accuracy (invalid)", () => {
      const multiplier = getCalibrationMultiplier(-0.5);
      expect(multiplier).toBe(1.0);
    });

    it("should return 1.0 for accuracy > 2.0 (invalid)", () => {
      const multiplier = getCalibrationMultiplier(3.0);
      expect(multiplier).toBe(1.0);
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same multiplier for same accuracy", () => {
      const mult1 = getCalibrationMultiplier(0.75);
      const mult2 = getCalibrationMultiplier(0.75);
      const mult3 = getCalibrationMultiplier(0.75);

      expect(mult1).toBe(mult2);
      expect(mult2).toBe(mult3);
    });
  });
});

describe("calculatePriorityScore with v2 Formula", () => {
  describe("Impact and Confidence Calculation", () => {
    it("should ignore historical accuracy in v2 formula", () => {
      const baseInput = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: undefined,
      };

      const noAccuracy = calculatePriorityScore(baseInput);
      const anyAccuracy = calculatePriorityScore({
        ...baseInput,
        historicalAccuracy: 0.25,
      });

      expect(noAccuracy).toBe(80); // 100 * 0.8 * 1.0
      expect(anyAccuracy).toBe(80); // 100 * 0.8 * 1.0 (accuracy ignored)
      expect(anyAccuracy).toEqual(noAccuracy);
    });

    it("should produce same priority regardless of historical accuracy", () => {
      const baseInput = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: undefined,
      };

      const lowAcc = calculatePriorityScore({
        ...baseInput,
        historicalAccuracy: 0.25,
      });

      const normalAcc = calculatePriorityScore({
        ...baseInput,
        historicalAccuracy: 0.65,
      });

      const highAcc = calculatePriorityScore({
        ...baseInput,
        historicalAccuracy: 1.15,
      });

      // All should be equal with v2 formula
      expect(lowAcc).toBe(80);
      expect(normalAcc).toBe(80);
      expect(highAcc).toBe(80);
    });

    it("should calculate priority with new v2 formula", () => {
      const baseInput = {
        impactExpected: 100,
        confidence: 0.8,
        dueAt: undefined,
      };

      const noAge = calculatePriorityScore(baseInput);
      const withAge = calculatePriorityScore({
        ...baseInput,
        ageInDays: 1,
      });

      expect(noAge).toBe(80); // 100 * 0.8 * 1.0 (age 0)
      expect(withAge).toBe(40); // 100 * 0.8 * 0.5 (age 1)
      expect(noAge).toBeGreaterThan(withAge);
    });
  });

  describe("Recency Weight Application", () => {
    it("should apply recency weight decay as items age", () => {
      const baseScore = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
      });

      const ageScore = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 7,
      });

      // 100 * 0.5 * 1/(1+0) = 50
      expect(baseScore).toBe(50);
      // 100 * 0.5 * 1/(1+7) = 6.25
      expect(ageScore).toBe(6.25);
      expect(baseScore).toBeGreaterThan(ageScore);
    });

    it("should reduce priority significantly as items age", () => {
      const day0 = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 0,
      });

      const day1 = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 1,
      });

      const day30 = calculatePriorityScore({
        impactExpected: 100,
        confidence: 0.5,
        ageInDays: 30,
      });

      // 100 * 0.5 * 1/(1+0) = 50
      expect(day0).toBe(50);
      // 100 * 0.5 * 1/(1+1) = 25
      expect(day1).toBe(25);
      // 100 * 0.5 * 1/(1+30) ≈ 1.61
      expect(day30).toBeCloseTo(1.61, 1);
    });
  });

  describe("Bounded Behavior (No Priority Explosion)", () => {
    it("should clamp to 10000 for very high impact", () => {
      const score = calculatePriorityScore({
        impactExpected: 100000,
        confidence: 0.2,
      });

      // Would be 100000 * 0.2 * 1.0 = 20000, clamped to 10000
      expect(score).toBe(10000);
    });

    it("should maintain bounds with high impact and confidence", () => {
      const score = calculatePriorityScore({
        impactExpected: 50000,
        confidence: 0.5,
      });

      // Would be 50000 * 0.5 * 1.0 = 25000, clamped to 10000
      expect(score).toBe(10000);
    });
  });
});

describe("calculatePriority - Legacy Function", () => {
  it("should work with OperatorItem and calculate deterministic priority", () => {
    const item: OperatorItem = {
      id: "test-1",
      workspaceId: "workspace-test",
      ownerUserId: "owner-test",
      createdBy: "user-test",
      lastUpdatedBy: null,
      decisionType: "operational",
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
    expect(score).toBe(140); // 200 * 0.7 * 1 (no historical accuracy)
  });

  it("should return 0 for items with zero or negative impact", () => {
    const item: OperatorItem = {
      id: "test-1",
      workspaceId: "workspace-test",
      ownerUserId: "owner-test",
      createdBy: "user-test",
      lastUpdatedBy: null,
      decisionType: "operational",
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

  it("should calculate priority with v2 formula (impact * confidence * recency)", () => {
    const itemWithAnyAccuracy: OperatorItem = {
      id: "test-1",
      workspaceId: "workspace-test",
      ownerUserId: "owner-test",
      createdBy: "user-test",
      lastUpdatedBy: null,
      decisionType: "operational",
      problem: "Test problem",
      action: "Test action",
      impactExpected: 100,
      impactLow: 50,
      impactHigh: 150,
      confidence: 0.8,
      priorityScore: 0,
      status: "pending",
      dueAt: null,
      blockingDependencies: [],
      expectedOutcome: null,
      actualOutcome: null,
      decisionAccuracy: 0.25,
      engineVersion: "v1.0.0",
      createdAt: new Date().toISOString(),
    };

    const score = calculatePriority(itemWithAnyAccuracy);
    expect(score).toBe(80); // 100 * 0.8 * 1.0 (no calibration multiplier, age=0)
  });

  it("should ignore decisionAccuracy in priority calculation (v2 formula)", () => {
    const itemWithHighAccuracy: OperatorItem = {
      id: "test-2",
      workspaceId: "workspace-test",
      ownerUserId: "owner-test",
      createdBy: "user-test",
      lastUpdatedBy: null,
      decisionType: "operational",
      problem: "Test problem",
      action: "Test action",
      impactExpected: 100,
      impactLow: 50,
      impactHigh: 150,
      confidence: 0.8,
      priorityScore: 0,
      status: "pending",
      dueAt: null,
      blockingDependencies: [],
      expectedOutcome: null,
      actualOutcome: null,
      decisionAccuracy: 1.15,
      engineVersion: "v1.0.0",
      createdAt: new Date().toISOString(),
    };

    const score = calculatePriority(itemWithHighAccuracy);
    expect(score).toBe(80); // 100 * 0.8 * 1.0 (accuracy not used in v2 formula)
  });
});

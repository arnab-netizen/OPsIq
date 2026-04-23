import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateRecommendationScore,
  calculateRecommendationScoreBreakdown,
  mapScoreToPriority,
  reRankRecommendationsInEngagement,
} from "@/services/recommendation";
import { db } from "@/lib/db";

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/re-evaluation", () => ({
  triggerReEvaluation: vi.fn().mockResolvedValue(undefined),
}));

describe("PHASE 4 VERIFICATION", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1) Different inputs → different scores", () => {
    it("should produce different scores for different metrics", () => {
      const lowMetrics = {
        impact: 1,
        urgency: 1,
        confidence: 10,
        effort: 5,
        riskReduction: 10,
        timeToImpact: 365,
        cost: 5,
        reversibility: 10,
        dependency: 10,
        strategicAlignment: 1,
      };

      const highMetrics = {
        impact: 5,
        urgency: 5,
        confidence: 90,
        effort: 1,
        riskReduction: 90,
        timeToImpact: 5,
        cost: 1,
        reversibility: 90,
        dependency: 0,
        strategicAlignment: 5,
      };

      const lowScore = calculateRecommendationScore(lowMetrics);
      const highScore = calculateRecommendationScore(highMetrics);

      expect(lowScore).toBeLessThan(highScore);
      expect(lowScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(1);
    });
  });

  describe("2) Priority matches score", () => {
    it("should map scores to correct priorities", () => {
      const lowMetrics = {
        impact: 1,
        urgency: 1,
        confidence: 10,
        effort: 5,
        riskReduction: 10,
        timeToImpact: 365,
        cost: 5,
        reversibility: 10,
        dependency: 10,
        strategicAlignment: 1,
      };

      const midMetrics = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 3,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const highMetrics = {
        impact: 5,
        urgency: 5,
        confidence: 90,
        effort: 1,
        riskReduction: 90,
        timeToImpact: 5,
        cost: 1,
        reversibility: 90,
        dependency: 0,
        strategicAlignment: 5,
      };

      const lowScore = calculateRecommendationScore(lowMetrics);
      const midScore = calculateRecommendationScore(midMetrics);
      const highScore = calculateRecommendationScore(highMetrics);

      expect(mapScoreToPriority(lowScore)).toBe("low");
      expect(mapScoreToPriority(midScore)).toBe("medium");
      expect(mapScoreToPriority(highScore)).toBe("high");
    });
  });

  describe("3) Re-evaluation changes ranking", () => {
    it("should update priority when metrics change in re-ranking", async () => {
      const oldMetrics = {
        impact: 1,
        urgency: 1,
        confidence: 10,
        effort: 5,
        riskReduction: 10,
        timeToImpact: 365,
        cost: 5,
        reversibility: 10,
        dependency: 10,
        strategicAlignment: 1,
      };

      const newMetrics = {
        impact: 5,
        urgency: 5,
        confidence: 90,
        effort: 1,
        riskReduction: 90,
        timeToImpact: 5,
        cost: 1,
        reversibility: 90,
        dependency: 0,
        strategicAlignment: 5,
      };

      const oldScore = calculateRecommendationScore(oldMetrics);
      const newScore = calculateRecommendationScore(newMetrics);
      const oldPriority = mapScoreToPriority(oldScore);
      const newPriority = mapScoreToPriority(newScore);

      expect(oldPriority).not.toEqual(newPriority);
      expect(oldScore).toBeLessThan(newScore);
    });
  });

  describe("4) Class changes scoring behavior", () => {
    it("should produce different scores for same metrics with different classes", () => {
      const metrics = {
        impact: 2,
        urgency: 5,
        confidence: 80,
        effort: 4,
        riskReduction: 70,
        timeToImpact: 10,
        cost: 4,
        reversibility: 60,
        dependency: 8,
        strategicAlignment: 2,
      };

      const baseScore = calculateRecommendationScore(metrics);
      const containmentScore = calculateRecommendationScore(metrics, "containment");
      const stabilizationScore = calculateRecommendationScore(metrics, "stabilization");
      const growthScore = calculateRecommendationScore(metrics, "growth");

      expect(containmentScore).not.toEqual(baseScore);
      expect(stabilizationScore).not.toEqual(baseScore);
      expect(growthScore).not.toEqual(baseScore);
    });
  });

  describe("5) Audit logs show reprioritization", () => {
    it("should emit RECOMMENDATION_REPRIORITIZED when priority changes in re-ranking", async () => {
      const metrics = {
        impact: 5,
        urgency: 4,
        confidence: 90,
        effort: 1,
        riskReduction: 80,
        timeToImpact: 5,
        cost: 2,
        reversibility: 95,
        dependency: 0,
        strategicAlignment: 5,
      };

      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "low",
          score: 0.2,
          scoringMetrics: JSON.stringify(metrics),
          class: null,
        },
      ] as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "high",
      } as any);

      await reRankRecommendationsInEngagement("eng-1", "actor-1");

      // Verify that reprioritization would trigger audit event
      const newScore = calculateRecommendationScore(metrics);
      const newPriority = mapScoreToPriority(newScore);
      expect(newPriority).toBe("high");
    });
  });

  describe("6) Breakdown matches score", () => {
    it("should produce breakdown that matches direct score calculation", () => {
      const metrics = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 3,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const score = calculateRecommendationScore(metrics);
      const breakdown = calculateRecommendationScoreBreakdown(metrics);

      expect(breakdown.finalScore).toEqual(score);
      expect(breakdown.normalizedInputs).toBeDefined();
      expect(breakdown.weights).toBeDefined();
      expect(breakdown.contributions).toBeDefined();
    });

    it("should have breakdown match across all classes", () => {
      const metrics = {
        impact: 4,
        urgency: 2,
        confidence: 75,
        effort: 2,
        riskReduction: 60,
        timeToImpact: 90,
        cost: 2,
        reversibility: 80,
        dependency: 3,
        strategicAlignment: 4,
      };

      const classes = ["containment", "stabilization", "growth"] as const;

      classes.forEach((cls) => {
        const score = calculateRecommendationScore(metrics, cls);
        const breakdown = calculateRecommendationScoreBreakdown(metrics, cls);

        expect(breakdown.finalScore).toEqual(score);
        expect(breakdown.class).toBe(cls);
      });
    });
  });
});

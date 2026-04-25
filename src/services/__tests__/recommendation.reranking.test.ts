import { describe, it, expect, vi, beforeEach } from "vitest";
import { reRankRecommendationsInEngagement } from "@/services/recommendation";
import { db } from "@/lib/db";

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Recommendation Re-ranking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reRankRecommendationsInEngagement", () => {
    it("should return empty result when no recommendations in engagement", async () => {
      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([]);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(0);
      expect(result.recommendations).toHaveLength(0);
    });

    it("should skip recommendations without scoring metrics", async () => {
      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "high",
          score: null,
          scoringMetrics: null,
        },
      ] as any);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(0);
    });

    it("should update priority when score requires change to HIGH", async () => {
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
        },
      ] as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "high",
        score: 0.8,
      } as any);

      vi.spyOn(await import("@/infra/audit"), "emitAuditEvent").mockResolvedValue(undefined);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(1);
      expect(result.recommendations[0].newPriority).toBe("high");
    });

    it("should update priority when score requires change to MEDIUM", async () => {
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

      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "high",
          score: 0.8,
          scoringMetrics: JSON.stringify(metrics),
        },
      ] as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "medium",
        score: 0.55,
      } as any);

      vi.spyOn(await import("@/infra/audit"), "emitAuditEvent").mockResolvedValue(undefined);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(1);
      expect(result.recommendations[0].newPriority).toBe("medium");
    });

    it("should update priority when score requires change to LOW", async () => {
      const metrics = {
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

      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "high",
          score: 0.9,
          scoringMetrics: JSON.stringify(metrics),
        },
      ] as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "low",
        score: 0.25,
      } as any);

      vi.spyOn(await import("@/infra/audit"), "emitAuditEvent").mockResolvedValue(undefined);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(1);
      expect(result.recommendations[0].newPriority).toBe("low");
    });

    it("should not update when priority matches score", async () => {
      const metrics = {
        impact: 5,
        urgency: 5,
        confidence: 100,
        effort: 1,
        riskReduction: 100,
        timeToImpact: 1,
        cost: 1,
        reversibility: 100,
        dependency: 0,
        strategicAlignment: 5,
      };

      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "high",
          score: 0.95,
          scoringMetrics: JSON.stringify(metrics),
        },
      ] as any);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(0);
    });

    it("should handle multiple recommendations with mixed results", async () => {
      const highMetrics = {
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

      vi.spyOn(db.recommendation, "findMany").mockResolvedValueOnce([
        {
          id: "rec-1",
          priority: "low",
          score: 0.2,
          scoringMetrics: JSON.stringify(highMetrics),
        },
        {
          id: "rec-2",
          priority: "high",
          score: 0.8,
          scoringMetrics: JSON.stringify(highMetrics),
        },
        {
          id: "rec-3",
          priority: "high",
          score: 0.1,
          scoringMetrics: JSON.stringify(lowMetrics),
        },
      ] as any);

      let updateCount = 0;
      vi.spyOn(db.recommendation, "update").mockImplementation(async () => {
        updateCount++;
        return { id: "rec-" + updateCount } as any;
      });

      vi.spyOn(await import("@/infra/audit"), "emitAuditEvent").mockResolvedValue(undefined);

      const result = await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(result.updated).toBe(2);
      expect(result.recommendations).toHaveLength(2);
    });

    it("should emit RECOMMENDATION_REPRIORITIZED audit event", async () => {
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
        },
      ] as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "high",
      } as any);

      const emitAuditEvent = vi.spyOn(await import("@/infra/audit"), "emitAuditEvent");

      await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(emitAuditEvent).toHaveBeenCalled();
      const call = emitAuditEvent.mock.calls[0][0];
      expect(call.eventName).toBe("RECOMMENDATION_REPRIORITIZED");
      expect(call.entityId).toBe("rec-1");
      expect(call.payload).toHaveProperty("oldPriority", "low");
      expect(call.payload).toHaveProperty("newPriority", "high");
      expect(call.payload).toHaveProperty("score");
    });

    it("should increment version on update", async () => {
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
        },
      ] as any);

      const updateSpy = vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        priority: "high",
      } as any);

      vi.spyOn(await import("@/infra/audit"), "emitAuditEvent").mockResolvedValue(undefined);

      await reRankRecommendationsInEngagement("eng-1", "actor-1");

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: { increment: 1 },
          }),
        })
      );
    });
  });
});

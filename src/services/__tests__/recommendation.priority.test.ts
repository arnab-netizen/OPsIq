import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapScoreToPriority, createRecommendation, updateRecommendationPriorityFromScore } from "@/services/recommendation";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/re-evaluation", () => ({
  triggerReEvaluation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireCapabilityForService: vi.fn(),
}));

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
const mockAuthContext = {
  session: {
    user: { id: "actor-1", email: "test@test.com", name: "Test", isActive: true },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: { userId: "actor-1", roles: [] },
};

describe("Recommendation Priority Mapping", () => {
  describe("mapScoreToPriority", () => {
    it("should map score >= 0.75 to HIGH", () => {
      expect(mapScoreToPriority(1.0)).toBe("high");
      expect(mapScoreToPriority(0.95)).toBe("high");
      expect(mapScoreToPriority(0.75)).toBe("high");
    });

    it("should map score >= 0.5 and < 0.75 to MEDIUM", () => {
      expect(mapScoreToPriority(0.74)).toBe("medium");
      expect(mapScoreToPriority(0.65)).toBe("medium");
      expect(mapScoreToPriority(0.5)).toBe("medium");
    });

    it("should map score < 0.5 to LOW", () => {
      expect(mapScoreToPriority(0.49)).toBe("low");
      expect(mapScoreToPriority(0.25)).toBe("low");
      expect(mapScoreToPriority(0.0)).toBe("low");
    });

    it("should handle edge cases exactly", () => {
      expect(mapScoreToPriority(0.7499)).toBe("medium");
      expect(mapScoreToPriority(0.7500)).toBe("high");
      expect(mapScoreToPriority(0.4999)).toBe("low");
      expect(mapScoreToPriority(0.5000)).toBe("medium");
    });
  });

  describe("createRecommendation with scoring", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should use provided priority when no scoring input", async () => {
      vi.spyOn(db.engagement, "findUnique").mockResolvedValueOnce({
        id: "eng-1",
      } as any);

      vi.spyOn(db.recommendation, "create").mockResolvedValueOnce({
        id: "rec-1",
        priority: "critical",
        score: null,
      } as any);

      const result = await createRecommendation(
        {
          engagementId: "eng-1",
          priority: "critical",
          title: "Test Recommendation",
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(result.priority).toBe("critical");
      expect(result.score).toBeNull();
    });

    it("should derive priority from score when scoring input provided", async () => {
      vi.spyOn(db.engagement, "findUnique").mockResolvedValueOnce({
        id: "eng-1",
      } as any);

      let createdData: any = {};
      vi.spyOn(db.recommendation, "create").mockImplementationOnce(({ data }) => {
        createdData = data;
        return Promise.resolve({
          id: "rec-1",
          ...data,
        } as any);
      });

      await createRecommendation(
        {
          engagementId: "eng-1",
          priority: "ignored",
          title: "Test Recommendation",
          scoringInput: {
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
          },
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(createdData.priority).toBe("high");
    });

    it("should calculate HIGH priority for high-scoring input", async () => {
      vi.spyOn(db.engagement, "findUnique").mockResolvedValueOnce({
        id: "eng-1",
      } as any);

      let priority = "";
      vi.spyOn(db.recommendation, "create").mockImplementationOnce(({ data }) => {
        priority = data.priority;
        return Promise.resolve({
          id: "rec-1",
          ...data,
        } as any);
      });

      await createRecommendation(
        {
          engagementId: "eng-1",
          priority: "ignored",
          title: "High Impact Recommendation",
          scoringInput: {
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
          },
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(priority).toBe("high");
    });

    it("should calculate MEDIUM priority for medium-scoring input", async () => {
      vi.spyOn(db.engagement, "findUnique").mockResolvedValueOnce({
        id: "eng-1",
      } as any);

      let priority = "";
      vi.spyOn(db.recommendation, "create").mockImplementationOnce(({ data }) => {
        priority = data.priority;
        return Promise.resolve({
          id: "rec-1",
          ...data,
        } as any);
      });

      await createRecommendation(
        {
          engagementId: "eng-1",
          priority: "ignored",
          title: "Medium Priority Recommendation",
          scoringInput: {
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
          },
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(priority).toBe("medium");
    });

    it("should calculate LOW priority for low-scoring input", async () => {
      vi.spyOn(db.engagement, "findUnique").mockResolvedValueOnce({
        id: "eng-1",
      } as any);

      let priority = "";
      vi.spyOn(db.recommendation, "create").mockImplementationOnce(({ data }) => {
        priority = data.priority;
        return Promise.resolve({
          id: "rec-1",
          ...data,
        } as any);
      });

      await createRecommendation(
        {
          engagementId: "eng-1",
          priority: "ignored",
          title: "Low Priority Recommendation",
          scoringInput: {
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
          },
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(priority).toBe("low");
    });
  });

  describe("updateRecommendationPriorityFromScore", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should update priority based on score", async () => {
      vi.spyOn(db.recommendation, "findUnique").mockResolvedValueOnce({
        id: "rec-1",
        priority: "low",
        score: 0.3,
      } as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        score: 0.8,
        priority: "high",
      } as any);

      const result = await updateRecommendationPriorityFromScore(
        "rec-1",
        {
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
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(result.priority).toBe("high");
      expect(result.score).toBeGreaterThan(0.75);
    });

    it("should throw NotFoundError if recommendation not found", async () => {
      vi.spyOn(db.recommendation, "findUnique").mockResolvedValueOnce(null);

      await expect(
        updateRecommendationPriorityFromScore(
          "nonexistent",
          {
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
          },
          mockAuthContext as any,
          mockWorkspaceId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("should update recommendation without error", async () => {
      vi.spyOn(db.recommendation, "findUnique").mockResolvedValueOnce({
        id: "rec-1",
      } as any);

      vi.spyOn(db.recommendation, "update").mockResolvedValueOnce({
        id: "rec-1",
        score: 0.75,
        priority: "high",
      } as any);

      const result = await updateRecommendationPriorityFromScore(
        "rec-1",
        {
          impact: 5,
          urgency: 3,
          confidence: 75,
          effort: 2,
          riskReduction: 75,
          timeToImpact: 60,
          cost: 2,
          reversibility: 80,
          dependency: 1,
          strategicAlignment: 4,
        },
        mockAuthContext as any,
        mockWorkspaceId
      );

      expect(result.id).toBe("rec-1");
    });
  });

  describe("Priority matches score invariant", () => {
    it("should ensure high priority only for score >= 0.75", () => {
      const highPriorities = [0.75, 0.8, 0.9, 1.0];
      highPriorities.forEach((score) => {
        expect(mapScoreToPriority(score)).toBe("high");
      });

      const notHighScores = [0.74, 0.5, 0.0];
      notHighScores.forEach((score) => {
        expect(mapScoreToPriority(score)).not.toBe("high");
      });
    });

    it("should ensure medium priority only for 0.5 <= score < 0.75", () => {
      const mediumScores = [0.5, 0.6, 0.7, 0.74];
      mediumScores.forEach((score) => {
        expect(mapScoreToPriority(score)).toBe("medium");
      });

      const notMediumScores = [0.49, 0.75, 1.0];
      notMediumScores.forEach((score) => {
        expect(mapScoreToPriority(score)).not.toBe("medium");
      });
    });

    it("should ensure low priority only for score < 0.5", () => {
      const lowScores = [0.0, 0.1, 0.49];
      lowScores.forEach((score) => {
        expect(mapScoreToPriority(score)).toBe("low");
      });

      const notLowScores = [0.5, 0.75, 1.0];
      notLowScores.forEach((score) => {
        expect(mapScoreToPriority(score)).not.toBe("low");
      });
    });
  });
});

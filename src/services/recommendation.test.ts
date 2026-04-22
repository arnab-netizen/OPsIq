import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_STATUSES,
} from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    finding: {
      findUnique: vi.fn(),
    },
    shockEvent: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    recommendation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Recommendation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Priority validation", () => {
    it("includes required priorities", () => {
      expect(RECOMMENDATION_PRIORITIES).toContain("high");
      expect(RECOMMENDATION_PRIORITIES).toContain("medium");
      expect(RECOMMENDATION_PRIORITIES).toContain("low");
    });
  });

  describe("Status validation", () => {
    it("includes required statuses", () => {
      expect(RECOMMENDATION_STATUSES).toContain("draft");
      expect(RECOMMENDATION_STATUSES).toContain("proposed");
      expect(RECOMMENDATION_STATUSES).toContain("approved");
    });
  });

  describe("Service creation", () => {
    it("creates recommendation with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        severity: "high",
      });
      mockDb.recommendation.findFirst.mockResolvedValue(null);
      mockDb.recommendation.create.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: "finding-1",
        shockEventId: null,
        priority: "high",
        title: "Improve system stability",
        description: "Add more monitoring",
        status: "draft",
        version: 1,
      });

      const { createRecommendation } = await import("./recommendation");
      const result = await createRecommendation(
        {
          engagementId: "eng-1",
          findingId: "finding-1",
          priority: "high",
          title: "Improve system stability",
          description: "Add more monitoring",
        },
        "user-1"
      );

      expect(result.id).toBe("rec-1");
      expect(result.priority).toBe("high");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "nonexistent",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Engagement not found");
      }
    });

    it("throws error if intervention phase is closed", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "closed",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });

    it("throws error if finding belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-2",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            findingId: "finding-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });

    it("throws error if shock event belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-2",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            shockEventId: "shock-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });

    it("throws error if neither finding nor shock event provided", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("must be linked to");
      }
    });

    it("throws error if duplicate recommendation exists for finding", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        severity: "high",
      });
      mockDb.recommendation.findFirst.mockResolvedValue({
        id: "rec-existing",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            findingId: "finding-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("already exists");
      }
    });

    it("throws error if duplicate recommendation exists for shock event", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        severity: "critical",
      });
      mockDb.recommendation.findFirst.mockResolvedValue({
        id: "rec-existing",
      });

      const { createRecommendation } = await import("./recommendation");

      try {
        await createRecommendation(
          {
            engagementId: "eng-1",
            shockEventId: "shock-1",
            priority: "high",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("already exists");
      }
    });
  });

  describe("List recommendations", () => {
    it("lists recommendations for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.recommendation.findMany.mockResolvedValue([
        {
          id: "rec-1",
          title: "Improve stability",
          priority: "high",
          status: "draft",
          createdAt: new Date(),
        },
      ]);
      mockDb.recommendation.count.mockResolvedValue(1);

      const { listRecommendations } = await import("./recommendation");
      const result = await listRecommendations("eng-1");

      expect(result.recommendations.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.recommendations[0].priority).toBe("high");
    });
  });

  describe("Get recommendation", () => {
    it("retrieves recommendation by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.recommendation.findUnique.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: null,
        shockEventId: null,
        priority: "high",
        title: "Improve stability",
        description: "Add monitoring",
        status: "draft",
        version: 1,
        createdBy: "user-1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      });

      const { getRecommendationById } = await import("./recommendation");
      const result = await getRecommendationById("rec-1");

      expect(result.id).toBe("rec-1");
      expect(result.priority).toBe("high");
      expect(result.status).toBe("draft");
    });

    it("rejects recommendation if engagementId doesn't match", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.recommendation.findUnique.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: null,
        shockEventId: null,
        priority: "high",
        title: "Test",
        description: null,
        status: "draft",
        version: 1,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { getRecommendationById } = await import("./recommendation");

      try {
        await getRecommendationById("rec-1", "eng-2");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits RECOMMENDATION_CREATED audit event with sourceType and payload", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        severity: "high",
      });
      mockDb.recommendation.findFirst.mockResolvedValue(null);
      mockDb.recommendation.create.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: "finding-1",
        shockEventId: null,
        priority: "high",
        title: "Test recommendation",
        description: null,
        status: "draft",
        version: 1,
      });

      const { createRecommendation } = await import("./recommendation");
      await createRecommendation(
        {
          engagementId: "eng-1",
          findingId: "finding-1",
          title: "Test recommendation",
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("recommendation.created");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.recommendationId).toBe("rec-1");
      expect(call.payload.priority).toBe("high");
      expect(call.payload.findingId).toBe("finding-1");
      expect(call.payload.shockEventId).toBeNull();
      expect(call.payload.sourceType).toBe("finding");
      expect(call.visibility).toBe("internal");
    });

    it("maps priority based on finding severity", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        severity: "critical",
        select: { severity: true },
      });
      mockDb.recommendation.findFirst.mockResolvedValue(null);
      mockDb.recommendation.create.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: "finding-1",
        shockEventId: null,
        priority: "high",
        title: "Test",
        description: null,
        status: "draft",
        version: 1,
      });

      const { createRecommendation } = await import("./recommendation");
      const result = await createRecommendation(
        {
          engagementId: "eng-1",
          findingId: "finding-1",
          title: "Test",
        },
        "user-1"
      );

      expect(result.priority).toBe("high");
    });

    it("maps priority based on shock event severity", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        severity: "low",
      });
      mockDb.recommendation.findFirst.mockResolvedValue(null);
      mockDb.recommendation.create.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
        findingId: null,
        shockEventId: "shock-1",
        priority: "low",
        title: "Test",
        description: null,
        status: "draft",
        version: 1,
      });

      const { createRecommendation } = await import("./recommendation");
      const result = await createRecommendation(
        {
          engagementId: "eng-1",
          shockEventId: "shock-1",
          title: "Test",
        },
        "user-1"
      );

      expect(result.priority).toBe("low");
    });
  });
});

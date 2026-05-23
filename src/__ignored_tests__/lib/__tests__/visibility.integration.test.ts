import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertEngagementAccess } from "@/lib/visibility";
import { ForbiddenError } from "@/infra/errors";
import { TEST_IDS } from "@/domain/constants/test-ids";

// Mock db before importing visibility
vi.mock("@/lib/db", () => ({
  db: {
    engagementMembership: {
      findFirst: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
    },
    evidence: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
    kPI: {
      findMany: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

describe("Cross-Engagement Isolation", () => {
  const userId_A = TEST_IDS.TEST_USER_A_ID;
  const userId_B = TEST_IDS.TEST_USER_B_ID;
  const engagementId_A = TEST_IDS.ENGAGEMENT_A_ID;
  const engagementId_B = TEST_IDS.ENGAGEMENT_B_ID;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("assertEngagementAccess", () => {
    it("should allow access when user is member of engagement", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      await expect(
        assertEngagementAccess(userId_A, engagementId_A)
      ).resolves.not.toThrow();
    });

    it("should deny access when user is not member of engagement", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      await expect(
        assertEngagementAccess(userId_A, engagementId_B)
      ).rejects.toThrow(ForbiddenError);
    });

    it("should deny access when membership is inactive", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      await expect(
        assertEngagementAccess(userId_A, engagementId_A)
      ).rejects.toThrow(ForbiddenError);
    });

    it("should prevent User A from accessing Engagement B", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await assertEngagementAccess(
        userId_A,
        engagementId_B
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
    });

    it("should prevent User B from accessing Engagement A", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await assertEngagementAccess(
        userId_B,
        engagementId_A
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
    });
  });

  describe("Service isolation - Findings", () => {
    it("should deny User A access to User B's findings", async () => {
      const { listFindingsForEngagement } = await import(
        "@/services/findings"
      );

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await listFindingsForEngagement(
        engagementId_B,
        userId_A
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it("should allow User A access to own findings", async () => {
      const { listFindingsForEngagement } = await import(
        "@/services/findings"
      );

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      (db.finding.findMany as unknown).mockResolvedValueOnce([]);

      const findings = await listFindingsForEngagement(
        engagementId_A,
        userId_A
      );

      expect(findings).toEqual([]);
    });
  });

  describe("Service isolation - Evidence", () => {
    it("should deny User A access to User B's evidence", async () => {
      const { listEvidence } = await import("@/services/evidence");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await listEvidence({
        engagementId: engagementId_B,
        userId: userId_A,
      }).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it("should allow User A access to own evidence", async () => {
      const { listEvidence } = await import("@/services/evidence");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      (db.evidence.findMany as unknown).mockResolvedValueOnce([]);
      (db.evidence.count as unknown).mockResolvedValueOnce(0);

      const result = await listEvidence({
        engagementId: engagementId_A,
        userId: userId_A,
      });

      expect(result.evidence).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("Service isolation - Actions", () => {
    it("should deny User A access to User B's actions", async () => {
      const { getActionsForEngagement } = await import("@/services/action");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await getActionsForEngagement(
        engagementId_B,
        userId_A
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it("should allow User A access to own actions", async () => {
      const { getActionsForEngagement } = await import("@/services/action");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      (db.action.findMany as unknown).mockResolvedValueOnce([]);

      const actions = await getActionsForEngagement(engagementId_A, userId_A);

      expect(actions).toEqual([]);
    });
  });

  describe("Service isolation - KPIs", () => {
    it("should deny User A access to User B's KPIs", async () => {
      const { getKPIsForEngagement } = await import("@/services/kpi");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await getKPIsForEngagement(
        engagementId_B,
        userId_A
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it("should allow User A access to own KPIs", async () => {
      const { getKPIsForEngagement } = await import("@/services/kpi");

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      (db.kPI.findMany as unknown).mockResolvedValueOnce([]);

      const kpis = await getKPIsForEngagement(engagementId_A, userId_A);

      expect(kpis).toEqual([]);
    });
  });

  describe("Service isolation - Recommendations", () => {
    it("should deny User A access to User B's recommendations", async () => {
      const { getRecommendationsForEngagement } = await import(
        "@/services/recommendation"
      );

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      const error = await getRecommendationsForEngagement(
        engagementId_B,
        userId_A
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it("should allow User A access to own recommendations", async () => {
      const { getRecommendationsForEngagement } = await import(
        "@/services/recommendation"
      );

      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce({
        id: "mem-1",
        userId: userId_A,
        engagementId: engagementId_A,
        role: "consultant",
        addedBy: null,
        addedAt: new Date(),
        removedAt: null,
        isActive: true,
      });

      (db.recommendation.findMany as unknown).mockResolvedValueOnce([]);

      const recommendations = await getRecommendationsForEngagement(
        engagementId_A,
        userId_A
      );

      expect(recommendations).toEqual([]);
    });
  });

  describe("Bidirectional isolation", () => {
    it("User B should not access User A engagement", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      await expect(
        assertEngagementAccess(userId_B, engagementId_A)
      ).rejects.toThrow(ForbiddenError);
    });

    it("User A should not access User B engagement", async () => {
      (db.engagementMembership.findFirst as unknown).mockResolvedValueOnce(null);

      await expect(
        assertEngagementAccess(userId_A, engagementId_B)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});

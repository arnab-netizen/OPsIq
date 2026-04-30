import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { GET as getSummary } from "../summary/route";
import { GET as getDecisionImpact } from "../decision/[id]/route";

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/middleware/workspace-enforcement", () => ({
  enforceWorkspaceScoping: vi.fn(),
}));

vi.mock("@/services/business-impact/decision-impact.service", () => ({
  calculateWorkspaceImpactSummary: vi.fn(),
  calculateDecisionImpact: vi.fn(),
}));

import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import {
  calculateWorkspaceImpactSummary,
  calculateDecisionImpact,
} from "@/services/business-impact/decision-impact.service";

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
const mockUserId = "user-123";

describe("Business Impact API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: mockUserId },
    } as any);
    vi.mocked(enforceWorkspaceScoping).mockResolvedValue({
      userId: mockUserId,
      role: "admin",
    } as any);
  });

  describe("GET /api/business-impact/summary", () => {
    it("should return workspace impact summary", async () => {
      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 10,
        totalExpectedImpact: 500000,
        totalRealizedImpact: 480000,
        totalVariance: -20000,
        totalAtRisk: 50000,
        totalBlockedAtRisk: 20000,
        totalFailedLoss: 0,
        totalCostOfDelay: 1666.67,
        averagePriorityScore: 75,
        averageRoiMultiple: 0.96,
        blockedCount: 2,
        failedCount: 0,
        succeededCount: 8,
        metrics: [],
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateWorkspaceImpactSummary).mockResolvedValueOnce(
        mockSummary
      );

      const request = new NextRequest(
        `http://localhost/api/business-impact/summary?workspaceId=${mockWorkspaceId}`
      );
      const response = await getSummary(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(mockWorkspaceId);
      expect(body.totalDecisions).toBe(10);
      expect(body.totalExpectedImpact).toBe(500000);
    });

    it("should fail closed when no session", async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const request = new NextRequest(
        `http://localhost/api/business-impact/summary?workspaceId=${mockWorkspaceId}`
      );
      const response = await getSummary(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should fail closed when workspace ID missing", async () => {
      const request = new NextRequest(
        "http://localhost/api/business-impact/summary"
      );
      const response = await getSummary(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Workspace ID required");
    });

    it("should fail closed when user not in workspace", async () => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce(null);

      const request = new NextRequest(
        `http://localhost/api/business-impact/summary?workspaceId=${mockWorkspaceId}`
      );
      const response = await getSummary(request);

      expect(response.status).toBe(403);
      expect(vi.mocked(calculateWorkspaceImpactSummary)).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/business-impact/decision/[id]", () => {
    it("should return decision impact metrics", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Revenue leak",
        status: "done",
        blockStage: null,
        expected: 100000,
        realized: 120000,
        variance: 20000,
        atRisk: 0,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 0,
        priorityScore: 85,
        roiMultiple: 1.2,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics);

      const request = new NextRequest(
        `http://localhost/api/business-impact/decision/${decisionId}?workspaceId=${mockWorkspaceId}`
      );
      const response = await getDecisionImpact(request, {
        params: Promise.resolve({ id: decisionId }),
      } as any);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.decisionId).toBe(decisionId);
      expect(body.realized).toBe(120000);
      expect(body.roiMultiple).toBe(1.2);
    });

    it("should fail closed when no session", async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const decisionId = uuidv4();
      const request = new NextRequest(
        `http://localhost/api/business-impact/decision/${decisionId}?workspaceId=${mockWorkspaceId}`
      );
      const response = await getDecisionImpact(request, {
        params: Promise.resolve({ id: decisionId }),
      } as any);

      expect(response.status).toBe(403);
    });

    it("should fail closed when workspace ID missing", async () => {
      const decisionId = uuidv4();
      const request = new NextRequest(
        `http://localhost/api/business-impact/decision/${decisionId}`
      );
      const response = await getDecisionImpact(request, {
        params: Promise.resolve({ id: decisionId }),
      } as any);

      expect(response.status).toBe(400);
    });

    it("should return 404 when decision not found", async () => {
      const decisionId = uuidv4();
      vi.mocked(calculateDecisionImpact).mockRejectedValueOnce(
        new Error("Decision not found or unauthorized")
      );

      const request = new NextRequest(
        `http://localhost/api/business-impact/decision/${decisionId}?workspaceId=${mockWorkspaceId}`
      );
      const response = await getDecisionImpact(request, {
        params: Promise.resolve({ id: decisionId }),
      } as any);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Decision not found");
    });

    it("should fail closed when user not in workspace", async () => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce(null);

      const decisionId = uuidv4();
      const request = new NextRequest(
        `http://localhost/api/business-impact/decision/${decisionId}?workspaceId=${mockWorkspaceId}`
      );
      const response = await getDecisionImpact(request, {
        params: Promise.resolve({ id: decisionId }),
      } as any);

      expect(response.status).toBe(403);
      expect(vi.mocked(calculateDecisionImpact)).not.toHaveBeenCalled();
    });
  });
});

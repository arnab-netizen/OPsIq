import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../today/route";

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/middleware/workspace-enforcement", () => ({
  enforceWorkspaceScoping: vi.fn(),
}));

vi.mock("@/services/decision-control/enforcement.service", () => ({
  getDailyControl: vi.fn(),
}));

import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { getDailyControl } from "@/services/decision-control/enforcement.service";

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
const mockUserId = "user-123";

describe("Daily Control API", () => {
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

  describe("GET /api/control/today", () => {
    it("should return daily control view", async () => {
      const mockControl = {
        workspaceId: mockWorkspaceId,
        date: "2026-04-30",
        topPriorities: [
          {
            decisionId: "d1",
            problem: "High priority",
            priorityScore: 85,
            expectedImpact: 100000,
          },
        ],
        risks: [
          {
            decisionId: "d2",
            problem: "Blocked decision",
            atRisk: 50000,
            reason: "Decision blocked with $50000 at risk",
          },
        ],
        totalBlockedValue: 50000,
        requiredActions: [
          {
            decisionId: "d2",
            problem: "Blocked decision",
            action: "Increase priority (current: 65)",
          },
        ],
        totalDecisions: 10,
        blockedCount: 1,
      };

      vi.mocked(getDailyControl).mockResolvedValueOnce(mockControl as any);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(mockWorkspaceId);
      expect(body.totalDecisions).toBe(10);
      expect(body.blockedCount).toBe(1);
      expect(body.topPriorities.length).toBe(1);
      expect(body.risks.length).toBe(1);
    });

    it("should fail closed when no session", async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should fail closed when workspace ID missing", async () => {
      const request = new NextRequest("http://localhost/api/control/today");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Workspace ID required");
    });

    it("should fail closed when user not in workspace", async () => {
      vi.mocked(enforceWorkspaceScoping).mockResolvedValueOnce(null);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(403);
      expect(vi.mocked(getDailyControl)).not.toHaveBeenCalled();
    });

    it("should include required actions for blocked decisions", async () => {
      const mockControl = {
        workspaceId: mockWorkspaceId,
        date: "2026-04-30",
        topPriorities: [],
        risks: [],
        totalBlockedValue: 30000,
        requiredActions: [
          {
            decisionId: "d1",
            problem: "Low priority decision",
            action: "Increase priority (current: 60)",
          },
          {
            decisionId: "d2",
            problem: "Low ROI decision",
            action: "Approve override (ROI: 0.75)",
          },
        ],
        totalDecisions: 5,
        blockedCount: 2,
      };

      vi.mocked(getDailyControl).mockResolvedValueOnce(mockControl as any);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.requiredActions.length).toBe(2);
      expect(body.blockedCount).toBe(2);
    });
  });
});

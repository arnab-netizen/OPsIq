import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../today/route";

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/middleware/workspace-enforcement", () => ({
  enforceWorkspaceScoping: vi.fn(),
}));

vi.mock("@/services/control/control-surface.service", () => ({
  getControlSurface: vi.fn(),
}));

import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { getControlSurface } from "@/services/control/control-surface.service";

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
    it("should return control surface", async () => {
      const mockSurface = {
        workspaceId: mockWorkspaceId,
        date: "2026-04-30",
        topActions: [
          {
            decisionId: "d1",
            problem: "High priority",
            expectedImpact: 100000,
            confidence: 0.9,
            priorityScore: 85,
            reason: "Critical priority - immediate execution required",
          },
        ],
        risks: [
          {
            decisionId: "d2",
            problem: "Blocked decision",
            atRisk: 50000,
            blockedAtRisk: 50000,
            reason: "Blocked decision with $50000 at risk - requires unblocking",
          },
        ],
        blockedValue: 50000,
        totalImpactToday: 100000,
        missedIfIgnored: 100000,
      };

      vi.mocked(getControlSurface).mockResolvedValueOnce(mockSurface as any);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.workspaceId).toBe(mockWorkspaceId);
      expect(body.blockedValue).toBe(50000);
      expect(body.totalImpactToday).toBe(100000);
      expect(body.missedIfIgnored).toBe(100000);
      expect(body.topActions.length).toBe(1);
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
      expect(vi.mocked(getControlSurface)).not.toHaveBeenCalled();
    });

    it("should include risks for blocked decisions", async () => {
      const mockSurface = {
        workspaceId: mockWorkspaceId,
        date: "2026-04-30",
        topActions: [],
        risks: [
          {
            decisionId: "d1",
            problem: "Low priority decision",
            atRisk: 30000,
            blockedAtRisk: 0,
            reason: "Moderate at-risk value ($30k) - monitor closely",
          },
          {
            decisionId: "d2",
            problem: "Low ROI decision",
            atRisk: 0,
            blockedAtRisk: 20000,
            reason: "Blocked decision with $20000 at risk - requires unblocking",
          },
        ],
        blockedValue: 20000,
        totalImpactToday: 0,
        missedIfIgnored: 50000,
      };

      vi.mocked(getControlSurface).mockResolvedValueOnce(mockSurface as any);

      const request = new NextRequest(
        `http://localhost/api/control/today?workspaceId=${mockWorkspaceId}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.risks.length).toBe(2);
      expect(body.blockedValue).toBe(20000);
      expect(body.missedIfIgnored).toBe(50000);
    });
  });
});

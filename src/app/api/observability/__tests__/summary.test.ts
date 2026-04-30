import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../summary/route";
import { NextRequest } from "next/server";

vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/audit/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/services/observability/statistics", () => ({
  getObservabilitySummary: vi.fn(),
}));

vi.mock("@/lib/observability/log", () => ({
  createEventLogger: vi.fn(),
}));

import { requireWorkspaceContext } from "@/services/workspace/context";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { createEventLogger } from "@/lib/observability/log";

describe("Observability Summary API", () => {
  const testWorkspaceId = "ws-test-123";
  const testUserId = "user-test-456";

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(requireWorkspaceContext).mockResolvedValue({
      workspaceId: testWorkspaceId,
    } as any);

    vi.mocked(getSession).mockResolvedValue({
      user: { id: testUserId },
    } as any);

    vi.mocked(createEventLogger).mockReturnValue({
      success: vi.fn(),
      error: vi.fn(),
    } as any);

    vi.mocked(logAuditEvent).mockResolvedValue(undefined);
  });

  describe("Authentication & Authorization", () => {
    it("should fail closed when workspace context is missing", async () => {
      vi.mocked(requireWorkspaceContext).mockRejectedValueOnce(
        new Error("Unauthorized")
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      const response = await GET(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("Empty state", () => {
    it("should return zeroed structure with no events", async () => {
      const emptySummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
          last7d: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        emptySummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.period.last24h.errorCount).toBe(0);
      expect(body.period.last24h.blockCount).toBe(0);
      expect(body.period.last24h.lifecycleCounts).toEqual([]);
    });
  });

  describe("Data retrieval", () => {
    it("should return observability summary with real data", async () => {
      const mockSummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [
              { stage: "RECEIVED", status: "success", count: 100 },
              { stage: "BLOCKED", status: "blocked", count: 10 },
            ],
            errorCount: 2,
            blockCount: 10,
            blockReasons: [
              { reason: "Guardrails violation", count: 6 },
              { reason: "Low confidence", count: 4 },
            ],
            stageDurations: [
              {
                stage: "RECEIVED",
                avgDurationMs: 5,
                minDurationMs: 1,
                maxDurationMs: 20,
                count: 100,
              },
            ],
            slowestStage: {
              stage: "NORMALIZED",
              avgDurationMs: 150,
              minDurationMs: 50,
              maxDurationMs: 500,
              count: 100,
            },
            recentFailures: [
              {
                id: "f1",
                stage: "BLOCKED",
                status: "blocked",
                reason: "Guardrails violation",
                occurredAt: new Date(),
                durationMs: 200,
              },
            ],
          },
          last7d: {
            lifecycleCounts: [
              { stage: "RECEIVED", status: "success", count: 700 },
              { stage: "BLOCKED", status: "blocked", count: 100 },
            ],
            errorCount: 20,
            blockCount: 100,
            blockReasons: [
              { reason: "Guardrails violation", count: 60 },
              { reason: "Low confidence", count: 40 },
            ],
            stageDurations: [
              {
                stage: "RECEIVED",
                avgDurationMs: 5,
                minDurationMs: 1,
                maxDurationMs: 20,
                count: 700,
              },
            ],
            slowestStage: {
              stage: "NORMALIZED",
              avgDurationMs: 150,
              minDurationMs: 50,
              maxDurationMs: 500,
              count: 700,
            },
            recentFailures: [
              {
                id: "f1",
                stage: "BLOCKED",
                status: "blocked",
                reason: "Guardrails violation",
                occurredAt: new Date(),
                durationMs: 200,
              },
            ],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        mockSummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.workspace.workspaceId).toBe(testWorkspaceId);
      expect(body.period.last24h.lifecycleCounts).toHaveLength(2);
      expect(body.period.last24h.errorCount).toBe(2);
      expect(body.period.last24h.blockCount).toBe(10);
      expect(body.period.last7d.errorCount).toBe(20);
    });
  });

  describe("Workspace isolation", () => {
    it("should query metrics for authorized workspace", async () => {
      const mockSummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
          last7d: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        mockSummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      await GET(request);

      expect(vi.mocked(getObservabilitySummary)).toHaveBeenCalledWith(
        testWorkspaceId
      );
    });
  });

  describe("Audit & Observability", () => {
    it("should emit OBSERVABILITY_SUMMARY_ACCESSED event", async () => {
      const mockSummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [{ stage: "RECEIVED", status: "success", count: 50 }],
            errorCount: 1,
            blockCount: 5,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
          last7d: {
            lifecycleCounts: [{ stage: "RECEIVED", status: "success", count: 350 }],
            errorCount: 5,
            blockCount: 50,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        mockSummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      await GET(request);

      expect(vi.mocked(logAuditEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "OBSERVABILITY_SUMMARY_ACCESSED",
          entityType: "ObservabilitySummary",
          entityId: testWorkspaceId,
          actorId: testUserId,
          metadata: expect.objectContaining({
            action: "view_observability_summary",
          }),
        })
      );
    });

    it("should include summary counts in audit metadata", async () => {
      const mockSummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [
              { stage: "RECEIVED", status: "success", count: 100 },
              { stage: "BLOCKED", status: "blocked", count: 10 },
            ],
            errorCount: 0,
            blockCount: 10,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
          last7d: {
            lifecycleCounts: [
              { stage: "RECEIVED", status: "success", count: 700 },
              { stage: "BLOCKED", status: "blocked", count: 100 },
            ],
            errorCount: 0,
            blockCount: 100,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        mockSummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      await GET(request);

      const auditCall = vi.mocked(logAuditEvent).mock.calls[0][0];
      expect(auditCall.metadata.last24h_events).toBe(110); // 100 + 10
      expect(auditCall.metadata.last7d_events).toBe(800); // 700 + 100
    });

    it("should not fail if audit logging fails", async () => {
      vi.mocked(logAuditEvent).mockRejectedValueOnce(new Error("Audit failed"));

      const mockSummary = {
        workspace: { workspaceId: testWorkspaceId },
        period: {
          last24h: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
          last7d: {
            lifecycleCounts: [],
            errorCount: 0,
            blockCount: 0,
            blockReasons: [],
            stageDurations: [],
            slowestStage: null,
            recentFailures: [],
          },
        },
      };

      vi.mocked(getObservabilitySummary).mockResolvedValueOnce(
        mockSummary as any
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      const response = await GET(request);

      // Should still return 200 despite audit failure
      expect(response.status).toBe(200);
    });
  });

  describe("Error handling", () => {
    it("should return 500 on internal errors", async () => {
      vi.mocked(getObservabilitySummary).mockRejectedValueOnce(
        new Error("Database error")
      );

      const request = new NextRequest("http://localhost/api/observability/summary", {
        method: "GET",
      });

      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Internal server error");
    });
  });
});

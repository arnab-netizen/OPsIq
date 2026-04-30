import { describe, it, expect, vi, beforeEach } from "vitest";
import { getObservabilitySummary } from "../statistics";

vi.mock("@/lib/db", () => ({
  db: {
    decisionLifecycle: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

describe("Observability Statistics Service", () => {
  const testWorkspaceId = "ws-test-123";
  const now = new Date();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty state", () => {
    it("should return zeroed structure with no events", async () => {
      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue([]);

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.workspace.workspaceId).toBe(testWorkspaceId);
      expect(summary.period.last24h.lifecycleCounts).toEqual([]);
      expect(summary.period.last24h.errorCount).toBe(0);
      expect(summary.period.last24h.blockCount).toBe(0);
      expect(summary.period.last24h.blockReasons).toEqual([]);
      expect(summary.period.last24h.stageDurations).toEqual([]);
      expect(summary.period.last24h.slowestStage).toBeNull();
      expect(summary.period.last24h.recentFailures).toEqual([]);
    });
  });

  describe("Lifecycle counts", () => {
    it("should count successful stages separately", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "VALIDATED",
          status: "success",
          reason: null,
          durationMs: 10,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.lifecycleCounts).toHaveLength(2);
      expect(summary.period.last24h.lifecycleCounts[0].stage).toBe("RECEIVED");
      expect(summary.period.last24h.lifecycleCounts[0].status).toBe("success");
      expect(summary.period.last24h.lifecycleCounts[0].count).toBe(1);
    });

    it("should aggregate counts by stage and status", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 6,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "RECEIVED",
          status: "error",
          reason: "Timeout",
          durationMs: 30000,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      const receivedSuccess = summary.period.last24h.lifecycleCounts.find(
        (c) => c.stage === "RECEIVED" && c.status === "success"
      );
      const receivedError = summary.period.last24h.lifecycleCounts.find(
        (c) => c.stage === "RECEIVED" && c.status === "error"
      );

      expect(receivedSuccess?.count).toBe(2);
      expect(receivedError?.count).toBe(1);
    });
  });

  describe("Error and block counts", () => {
    it("should count errors separately from blocks", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "NORMALIZED",
          status: "error",
          reason: "Invalid input",
          durationMs: 10,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Guardrails violation",
          durationMs: 50,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Low confidence",
          durationMs: 45,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.errorCount).toBe(1);
      expect(summary.period.last24h.blockCount).toBe(2);
    });
  });

  describe("Block reasons", () => {
    it("should count block reasons", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Guardrails violation",
          durationMs: 50,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Guardrails violation",
          durationMs: 45,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Low confidence",
          durationMs: 40,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.blockReasons).toHaveLength(2);
      const guardrailsReason = summary.period.last24h.blockReasons.find(
        (r) => r.reason === "Guardrails violation"
      );
      expect(guardrailsReason?.count).toBe(2);
    });

    it("should only count blocks with reasons", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "BLOCKED",
          status: "blocked",
          reason: "Reason 1",
          durationMs: 50,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "BLOCKED",
          status: "blocked",
          reason: null,
          durationMs: 45,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      // Only the event with a reason should be counted
      expect(summary.period.last24h.blockReasons).toHaveLength(1);
      expect(summary.period.last24h.blockReasons[0].reason).toBe("Reason 1");
    });
  });

  describe("Stage durations", () => {
    it("should calculate average, min, max durations per stage", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 10,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 20,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 30,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      const receivedStats = summary.period.last24h.stageDurations.find(
        (s) => s.stage === "RECEIVED"
      );

      expect(receivedStats?.avgDurationMs).toBe(20);
      expect(receivedStats?.minDurationMs).toBe(10);
      expect(receivedStats?.maxDurationMs).toBe(30);
      expect(receivedStats?.count).toBe(3);
    });

    it("should ignore null and negative durations", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 10,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: null,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: -5,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      const receivedStats = summary.period.last24h.stageDurations.find(
        (s) => s.stage === "RECEIVED"
      );

      expect(receivedStats?.count).toBe(1);
      expect(receivedStats?.avgDurationMs).toBe(10);
    });
  });

  describe("Slowest stage", () => {
    it("should identify slowest stage by average duration", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "NORMALIZED",
          status: "success",
          reason: null,
          durationMs: 100,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "VALIDATED",
          status: "success",
          reason: null,
          durationMs: 15,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.slowestStage?.stage).toBe("NORMALIZED");
      expect(summary.period.last24h.slowestStage?.avgDurationMs).toBe(100);
    });

    it("should return null for slowest stage when no durations available", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: null,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.slowestStage).toBeNull();
    });
  });

  describe("Recent failures", () => {
    it("should return up to 10 recent failures in reverse order", async () => {
      const mockEvents = Array.from({ length: 15 }, (_, i) => ({
        id: `e${i}`,
        stage: i % 2 === 0 ? "ERRORED" : "BLOCKED",
        status: i % 2 === 0 ? "error" : "blocked",
        reason: `Failure ${i}`,
        durationMs: 50 + i,
        occurredAt: new Date(now.getTime() - i * 60000),
        createdAt: now,
        workspaceId: testWorkspaceId,
        decisionId: null,
        actorId: null,
      }));

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.recentFailures).toHaveLength(10);
      expect(summary.period.last24h.recentFailures[0].id).toBe("e0");
      expect(summary.period.last24h.recentFailures[9].id).toBe("e9");
    });

    it("should only include error and blocked events in recent failures", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "ERRORED",
          status: "error",
          reason: "System error",
          durationMs: 1000,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e3",
          stage: "VALIDATED",
          status: "success",
          reason: null,
          durationMs: 10,
          occurredAt: new Date(now.getTime() - 3600000),
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValue(
        mockEvents as any
      );

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.recentFailures).toHaveLength(1);
      expect(summary.period.last24h.recentFailures[0].id).toBe("e2");
    });
  });

  describe("Time period separation", () => {
    it("should separate last24h and last7d statistics", async () => {
      const mockEvents = [
        {
          id: "e1",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 3600000), // 1h ago
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
        {
          id: "e2",
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(now.getTime() - 5 * 24 * 3600000), // 5 days ago
          createdAt: now,
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
        },
      ];

      let callCount = 0;
      vi.mocked(db.decisionLifecycle.findMany).mockImplementation(async () => {
        callCount++;
        // Return all events for 7d query, only first event for 24h query
        return callCount === 1 ? [mockEvents[0]] : mockEvents;
      });

      const summary = await getObservabilitySummary(testWorkspaceId);

      expect(summary.period.last24h.lifecycleCounts[0].count).toBe(1);
      expect(summary.period.last7d.lifecycleCounts[0].count).toBe(2);
    });
  });

  describe("Workspace isolation", () => {
    it("should only query events for the specified workspace", async () => {
      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce([]);

      await getObservabilitySummary(testWorkspaceId);

      const calls = vi.mocked(db.decisionLifecycle.findMany).mock.calls;
      expect(calls[0][0].where.workspaceId).toBe(testWorkspaceId);
      expect(calls[1][0].where.workspaceId).toBe(testWorkspaceId);
    });
  });
});

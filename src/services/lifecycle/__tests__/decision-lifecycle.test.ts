import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordLifecycleStage,
  getDecisionLifecycle,
  getWorkspaceLifecycleTrail,
} from "../decision-lifecycle";

vi.mock("@/lib/db", () => ({
  db: {
    decisionLifecycle: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

describe("Decision Lifecycle Service", () => {
  const testWorkspaceId = "ws-test-123";
  const testDecisionId = "dec-test-456";
  const testActorId = "user-test-789";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLifecycleStage", () => {
    it("should record a lifecycle stage with all fields", async () => {
      const now = new Date();
      await recordLifecycleStage({
        workspaceId: testWorkspaceId,
        decisionId: testDecisionId,
        actorId: testActorId,
        stage: "RECEIVED",
        status: "success",
        durationMs: 10,
        occurredAt: now,
      });

      expect(vi.mocked(db.decisionLifecycle.create)).toHaveBeenCalledWith({
        data: {
          workspaceId: testWorkspaceId,
          decisionId: testDecisionId,
          actorId: testActorId,
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 10,
          occurredAt: now,
        },
      });
    });

    it("should handle optional fields as null", async () => {
      await recordLifecycleStage({
        workspaceId: testWorkspaceId,
        stage: "VALIDATED",
        status: "success",
      });

      expect(vi.mocked(db.decisionLifecycle.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: testWorkspaceId,
          decisionId: null,
          actorId: null,
          stage: "VALIDATED",
          status: "success",
          reason: null,
          durationMs: null,
        }),
      });
    });

    it("should record blocked status with reason", async () => {
      await recordLifecycleStage({
        workspaceId: testWorkspaceId,
        stage: "BLOCKED",
        status: "blocked",
        reason: "Insufficient confidence",
      });

      expect(vi.mocked(db.decisionLifecycle.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stage: "BLOCKED",
          status: "blocked",
          reason: "Insufficient confidence",
        }),
      });
    });

    it("should record error status with error message", async () => {
      await recordLifecycleStage({
        workspaceId: testWorkspaceId,
        stage: "ERRORED",
        status: "error",
        reason: "System error occurred",
      });

      expect(vi.mocked(db.decisionLifecycle.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stage: "ERRORED",
          status: "error",
          reason: "System error occurred",
        }),
      });
    });

    it("should not throw when database write fails", async () => {
      vi.mocked(db.decisionLifecycle.create).mockRejectedValueOnce(
        new Error("DB error")
      );

      // Should not throw
      await expect(
        recordLifecycleStage({
          workspaceId: testWorkspaceId,
          stage: "RECEIVED",
          status: "success",
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("getDecisionLifecycle", () => {
    it("should retrieve lifecycle events for a decision", async () => {
      const mockEvents = [
        {
          id: "le-1",
          workspaceId: testWorkspaceId,
          decisionId: testDecisionId,
          actorId: testActorId,
          stage: "RECEIVED",
          status: "success",
          reason: null,
          durationMs: 5,
          occurredAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: "le-2",
          workspaceId: testWorkspaceId,
          decisionId: testDecisionId,
          actorId: testActorId,
          stage: "VALIDATED",
          status: "success",
          reason: null,
          durationMs: 15,
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getDecisionLifecycle(testWorkspaceId, testDecisionId);

      expect(vi.mocked(db.decisionLifecycle.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: testWorkspaceId,
          decisionId: testDecisionId,
        },
        orderBy: {
          occurredAt: "asc",
        },
      });

      expect(result).toEqual(mockEvents);
    });

    it("should return events in chronological order", async () => {
      const mockEvents = [
        {
          stage: "RECEIVED",
          occurredAt: new Date("2024-01-01T10:00:00"),
        },
        {
          stage: "VALIDATED",
          occurredAt: new Date("2024-01-01T10:00:05"),
        },
        {
          stage: "APPROVED",
          occurredAt: new Date("2024-01-01T10:00:20"),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getDecisionLifecycle(testWorkspaceId, testDecisionId);

      expect(result).toHaveLength(3);
      expect(result[0].stage).toBe("RECEIVED");
      expect(result[2].stage).toBe("APPROVED");
    });
  });

  describe("getWorkspaceLifecycleTrail", () => {
    it("should retrieve all lifecycle events for a workspace", async () => {
      const mockEvents = [
        {
          id: "le-1",
          workspaceId: testWorkspaceId,
          stage: "RECEIVED",
          status: "success",
          occurredAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: "le-2",
          workspaceId: testWorkspaceId,
          stage: "APPROVED",
          status: "success",
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getWorkspaceLifecycleTrail(testWorkspaceId);

      expect(vi.mocked(db.decisionLifecycle.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: testWorkspaceId,
        },
        orderBy: {
          occurredAt: "desc",
        },
      });

      expect(result).toEqual(mockEvents);
    });

    it("should filter by stage", async () => {
      const mockEvents = [
        {
          stage: "BLOCKED",
          status: "blocked",
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getWorkspaceLifecycleTrail(testWorkspaceId, {
        stage: "BLOCKED",
      });

      expect(vi.mocked(db.decisionLifecycle.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: testWorkspaceId,
          stage: "BLOCKED",
        },
        orderBy: {
          occurredAt: "desc",
        },
      });

      expect(result).toEqual(mockEvents);
    });

    it("should filter by status", async () => {
      const mockEvents = [
        {
          stage: "RECEIVED",
          status: "error",
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getWorkspaceLifecycleTrail(testWorkspaceId, {
        status: "error",
      });

      expect(vi.mocked(db.decisionLifecycle.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: testWorkspaceId,
          status: "error",
        },
        orderBy: {
          occurredAt: "desc",
        },
      });

      expect(result).toEqual(mockEvents);
    });

    it("should filter by date range", async () => {
      const since = new Date("2024-01-01");
      const until = new Date("2024-01-31");

      await getWorkspaceLifecycleTrail(testWorkspaceId, { since, until });

      expect(vi.mocked(db.decisionLifecycle.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: testWorkspaceId,
          occurredAt: {
            gte: since,
            lte: until,
          },
        },
        orderBy: {
          occurredAt: "desc",
        },
      });
    });

    it("should return events in reverse chronological order", async () => {
      const mockEvents = [
        {
          stage: "APPROVED",
          occurredAt: new Date("2024-01-01T10:00:20"),
        },
        {
          stage: "VALIDATED",
          occurredAt: new Date("2024-01-01T10:00:05"),
        },
        {
          stage: "RECEIVED",
          occurredAt: new Date("2024-01-01T10:00:00"),
        },
      ];

      vi.mocked(db.decisionLifecycle.findMany).mockResolvedValueOnce(
        mockEvents as any
      );

      const result = await getWorkspaceLifecycleTrail(testWorkspaceId);

      expect(result).toHaveLength(3);
      expect(result[0].stage).toBe("APPROVED");
      expect(result[2].stage).toBe("RECEIVED");
    });
  });

  describe("All lifecycle stages", () => {
    it("should support all defined lifecycle stages", async () => {
      const stages = [
        "RECEIVED",
        "VALIDATED",
        "NORMALIZED",
        "GATED",
        "GUARDRAIL_CHECKED",
        "APPROVED",
        "BLOCKED",
        "ERRORED",
      ] as const;

      for (const stage of stages) {
        await recordLifecycleStage({
          workspaceId: testWorkspaceId,
          stage,
          status: stage === "BLOCKED" ? "blocked" : stage === "ERRORED" ? "error" : "success",
        });
      }

      expect(vi.mocked(db.decisionLifecycle.create)).toHaveBeenCalledTimes(
        stages.length
      );
    });
  });
});

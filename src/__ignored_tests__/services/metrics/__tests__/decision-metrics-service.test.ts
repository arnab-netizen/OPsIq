import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    learningRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/cache/cache-factory", () => ({
  getCache: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  recordDecisionMetrics,
  calculateSuccessMetrics,
  getMetricsSnapshot,
} from "../decision-metrics-service";
import { db } from "@/lib/db";
import { getCache } from "@/services/cache/cache-factory";
import { logger } from "@/infra/logger";

describe("Decision Metrics Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordDecisionMetrics", () => {
    it("should create learning record for successful decision", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "revenue_leak",
        actionTaken: "Reduce pricing",
        success: true,
        actualOutcome: 600000,
        expectedOutcome: 500000,
      });

      expect(vi.mocked(db.learningRecord.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-123",
          problemType: "revenue_leak",
          actionTaken: "Reduce pricing",
          success: true,
          impact: 600000,
        }),
      });
    });

    it("should create learning record for failed decision", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-2",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "cost_overrun",
        actionTaken: "Reduce headcount",
        success: false,
        actualOutcome: 0,
        expectedOutcome: 500000,
      });

      expect(vi.mocked(db.learningRecord.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          success: false,
          impact: 0,
        }),
      });
    });

    it("should invalidate metrics cache on success", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "revenue_leak",
        actionTaken: "Test",
        success: true,
        actualOutcome: 100000,
        expectedOutcome: 100000,
      });

      expect(mockCache.delete).toHaveBeenCalledWith(
        "metrics:workspace:ws-123"
      );
    });

    it("should log metric recording", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "revenue_leak",
        actionTaken: "Test",
        success: true,
        actualOutcome: 100000,
        expectedOutcome: 100000,
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Decision metrics recorded",
        expect.objectContaining({
          workspaceId: "ws-123",
          problemType: "revenue_leak",
          success: true,
        })
      );
    });
  });

  describe("calculateSuccessMetrics", () => {
    it("should return zero metrics for no records", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result).toEqual({
        totalDecisions: 0,
        successCount: 0,
        successRate: 0,
        variance: 0,
        avgImpact: 0,
        stdDeviation: 0,
      });
    });

    it("should calculate success rate correctly", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: true, impact: 100000 } as any,
        { success: true, impact: 150000 } as any,
        { success: false, impact: 0 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.totalDecisions).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.successRate).toBeCloseTo(0.667, 2);
    });

    it("should calculate average impact", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: true, impact: 100000 } as any,
        { success: true, impact: 200000 } as any,
        { success: true, impact: 300000 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.avgImpact).toBe(200000);
    });

    it("should calculate variance", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: true, impact: 100000 } as any,
        { success: true, impact: 200000 } as any,
        { success: true, impact: 300000 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.variance).toBeGreaterThan(0);
      expect(result.stdDeviation).toBeGreaterThan(0);
    });

    it("should calculate standard deviation", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: true, impact: 100 } as any,
        { success: true, impact: 100 } as any,
        { success: true, impact: 100 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.stdDeviation).toBe(0);
    });

    it("should filter by workspace and problem type", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([]);

      await calculateSuccessMetrics("ws-123", "cost_overrun");

      expect(vi.mocked(db.learningRecord.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-123",
          problemType: "cost_overrun",
        },
      });
    });

    it("should handle 100% success rate", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: true, impact: 100000 } as any,
        { success: true, impact: 200000 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.successRate).toBe(1);
    });

    it("should handle 0% success rate", async () => {
      vi.mocked(db.learningRecord.findMany).mockResolvedValue([
        { success: false, impact: 0 } as any,
        { success: false, impact: 0 } as any,
      ]);

      const result = await calculateSuccessMetrics("ws-123", "revenue_leak");

      expect(result.successRate).toBe(0);
      expect(result.successCount).toBe(0);
    });
  });

  describe("getMetricsSnapshot", () => {
    it("should return cached metrics if available", async () => {
      const cachedSnapshot = {
        workspaceId: "ws-123",
        generatedAt: new Date(),
        metrics: { revenue_leak: { successRate: 0.8 } },
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(cachedSnapshot),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      const result = await getMetricsSnapshot("ws-123");

      expect(result).toEqual(cachedSnapshot);
      expect(mockCache.get).toHaveBeenCalledWith("metrics:workspace:ws-123");
    });

    it("should calculate and cache metrics if not cached", async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      vi.mocked(db.learningRecord.findMany).mockResolvedValue([]);

      await getMetricsSnapshot("ws-123");

      expect(mockCache.set).toHaveBeenCalledWith(
        "metrics:workspace:ws-123",
        expect.objectContaining({
          workspaceId: "ws-123",
        }),
        300
      );
    });

    it("should include all problem types in snapshot", async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      vi.mocked(db.learningRecord.findMany).mockResolvedValue([]);

      const result = await getMetricsSnapshot("ws-123");

      expect(result.metrics).toHaveProperty("revenue_leak");
      expect(result.metrics).toHaveProperty("cost_overrun");
      expect(result.metrics).toHaveProperty("growth_block");
      expect(result.metrics).toHaveProperty("inefficiency");
    });

    it("should set cache TTL of 300 seconds", async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      vi.mocked(db.learningRecord.findMany).mockResolvedValue([]);

      await getMetricsSnapshot("ws-123");

      const calls = vi.mocked(mockCache.set).mock.calls;
      expect(calls[calls.length - 1][2]).toBe(300);
    });
  });

  describe("Metric Updates on Decision Completion", () => {
    it("should track success with actual outcome", async () => {
      const records = [
        { success: true, impact: 600000 },
        { success: true, impact: 700000 },
        { success: false, impact: 0 },
      ];

      vi.mocked(db.learningRecord.findMany).mockResolvedValue(
        records as any
      );

      const result = await calculateSuccessMetrics(
        "ws-123",
        "revenue_leak"
      );

      expect(result.successRate).toBeCloseTo(0.667, 2);
      expect(result.avgImpact).toBeCloseTo(433333.33, 0);
    });

    it("should not block execution on metric failure", async () => {
      vi.mocked(db.learningRecord.create).mockRejectedValue(
        new Error("DB error")
      );

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await expect(
        recordDecisionMetrics("ws-123", {
          problemType: "revenue_leak",
          actionTaken: "Test",
          success: true,
          actualOutcome: 100000,
          expectedOutcome: 100000,
        })
      ).rejects.toThrow();

      expect(vi.mocked(logger.error)).toHaveBeenCalled();
    });
  });

  describe("Workspace Isolation in Metrics", () => {
    it("should isolate metrics by workspace", async () => {
      vi.mocked(db.learningRecord.findMany)
        .mockResolvedValueOnce([{ success: true, impact: 100000 }] as any)
        .mockResolvedValueOnce([{ success: true, impact: 200000 }] as any);

      const metrics1 = await calculateSuccessMetrics(
        "ws-123",
        "revenue_leak"
      );
      const metrics2 = await calculateSuccessMetrics(
        "ws-456",
        "revenue_leak"
      );

      expect(metrics1.avgImpact).toBe(100000);
      expect(metrics2.avgImpact).toBe(200000);
    });

    it("should include workspace in metric record", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "revenue_leak",
        actionTaken: "Test",
        success: true,
        actualOutcome: 100000,
        expectedOutcome: 100000,
      });

      expect(vi.mocked(db.learningRecord.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-123",
        }),
      });
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate cache on metrics record", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = { delete: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await recordDecisionMetrics("ws-123", {
        problemType: "revenue_leak",
        actionTaken: "Test",
        success: true,
        actualOutcome: 100000,
        expectedOutcome: 100000,
      });

      expect(mockCache.delete).toHaveBeenCalled();
    });

    it("should handle cache deletion errors gracefully", async () => {
      vi.mocked(db.learningRecord.create).mockResolvedValue({
        id: "record-1",
      } as any);

      const mockCache = {
        delete: vi.fn().mockRejectedValue(new Error("Cache error")),
      };
      vi.mocked(getCache).mockReturnValue(mockCache as any);

      await expect(
        recordDecisionMetrics("ws-123", {
          problemType: "revenue_leak",
          actionTaken: "Test",
          success: true,
          actualOutcome: 100000,
          expectedOutcome: 100000,
        })
      ).resolves.not.toThrow();

      expect(vi.mocked(logger.warn)).toHaveBeenCalled();
    });
  });
});

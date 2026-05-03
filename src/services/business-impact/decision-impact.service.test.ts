import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  calculateDecisionImpact,
  calculateWorkspaceImpactSummary,
} from "./decision-impact.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

describe("Decision Impact Service", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    mockDb = db;
  });

  describe("calculateDecisionImpact", () => {
    it("should calculate metrics for completed successful decision", async () => {
      const decisionId = uuidv4();
      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        problem: "Revenue leak",
        status: "done",
        blockStage: null,
        impactExpected: 100000,
        actualOutcomeValue: 120000,
        baselineValue: 500000,
        projectedWithoutAction: 480000,
        priorityScore: 85,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );

      const metrics = await calculateDecisionImpact(decisionId, mockWorkspaceId);

      expect(metrics.decisionId).toBe(decisionId);
      expect(metrics.expected).toBe(100000);
      expect(metrics.realized).toBe(120000);
      expect(metrics.variance).toBe(20000);
      expect(metrics.roiMultiple).toBe(1.2);
      expect(metrics.priorityScore).toBe(85);
    });

    it("should calculate atRisk and blockedAtRisk for blocked decision", async () => {
      const decisionId = uuidv4();
      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        problem: "Cost reduction",
        status: "blocked",
        blockStage: "decision_gate",
        impactExpected: 50000,
        actualOutcomeValue: null,
        baselineValue: 1000000,
        projectedWithoutAction: 950000,
        priorityScore: 75,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );

      const metrics = await calculateDecisionImpact(decisionId, mockWorkspaceId);

      expect(metrics.status).toBe("blocked");
      expect(metrics.blockedAtRisk).toBe(50000);
      expect(metrics.failedLoss).toBe(0);
      expect(metrics.realized).toBeNull();
    });

    it("should calculate failedLoss for failed decision", async () => {
      const decisionId = uuidv4();
      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        problem: "Growth initiative",
        status: "failed",
        blockStage: null,
        impactExpected: 200000,
        actualOutcomeValue: null,
        baselineValue: 2000000,
        projectedWithoutAction: 1800000,
        priorityScore: 90,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );

      const metrics = await calculateDecisionImpact(decisionId, mockWorkspaceId);

      expect(metrics.status).toBe("failed");
      expect(metrics.failedLoss).toBe(200000);
      expect(metrics.blockedAtRisk).toBe(0);
    });

    it("should handle missing data with fail-closed approach", async () => {
      const decisionId = uuidv4();
      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        problem: "Unknown impact",
        status: "pending",
        blockStage: null,
        impactExpected: null,
        actualOutcomeValue: null,
        baselineValue: null,
        projectedWithoutAction: null,
        priorityScore: null,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );

      const metrics = await calculateDecisionImpact(decisionId, mockWorkspaceId);

      expect(metrics.expected).toBe(0);
      expect(metrics.realized).toBeNull();
      expect(metrics.atRisk).toBe(0);
      expect(metrics.priorityScore).toBe(0);
      expect(metrics.roiMultiple).toBeNull();
    });

    it("should calculate costOfDelay based on atRisk", async () => {
      const decisionId = uuidv4();
      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        problem: "Delay impact",
        status: "in_progress",
        blockStage: null,
        impactExpected: 30000,
        actualOutcomeValue: null,
        baselineValue: 900000,
        projectedWithoutAction: 870000,
        priorityScore: 60,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );

      const metrics = await calculateDecisionImpact(decisionId, mockWorkspaceId);

      expect(metrics.atRisk).toBe(30000);
      expect(metrics.costOfDelay).toBe(1000); // 30000 / 30
    });

    it("should throw on workspace mismatch", async () => {
      const decisionId = uuidv4();
      const wrongWorkspaceId = uuidv4();

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(null);

      await expect(
        calculateDecisionImpact(decisionId, wrongWorkspaceId)
      ).rejects.toThrow("not found or unauthorized");
    });
  });

  describe("calculateWorkspaceImpactSummary", () => {
    it("should aggregate metrics from multiple decisions", async () => {
      const decision1Id = uuidv4();
      const decision2Id = uuidv4();

      mockDb.operatorItem.findMany.mockResolvedValueOnce([
        {
          id: decision1Id,
          workspaceId: mockWorkspaceId,
          problem: "Decision 1",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 120000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 85,
        },
        {
          id: decision2Id,
          workspaceId: mockWorkspaceId,
          problem: "Decision 2",
          status: "blocked",
          blockStage: "decision_gate",
          impactExpected: 50000,
          actualOutcomeValue: null,
          baselineValue: 1000000,
          projectedWithoutAction: 950000,
          priorityScore: 75,
        },
      ] as any);

      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          id: decision1Id,
          workspaceId: mockWorkspaceId,
          problem: "Decision 1",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 120000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 85,
        } as any)
        .mockResolvedValueOnce({
          id: decision2Id,
          workspaceId: mockWorkspaceId,
          problem: "Decision 2",
          status: "blocked",
          blockStage: "decision_gate",
          impactExpected: 50000,
          actualOutcomeValue: null,
          baselineValue: 1000000,
          projectedWithoutAction: 950000,
          priorityScore: 75,
        } as any);

      const summary = await calculateWorkspaceImpactSummary(mockWorkspaceId);

      expect(summary.workspaceId).toBe(mockWorkspaceId);
      expect(summary.totalDecisions).toBe(2);
      expect(summary.totalExpectedImpact).toBe(150000);
      expect(summary.totalRealizedImpact).toBe(120000);
      expect(summary.totalBlockedAtRisk).toBe(50000);
      expect(summary.blockedCount).toBe(1);
      expect(summary.succeededCount).toBe(1);
      expect(summary.averagePriorityScore).toBe(80);
    });

    it("should return empty summary for workspace with no decisions", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      const summary = await calculateWorkspaceImpactSummary(mockWorkspaceId);

      expect(summary.totalDecisions).toBe(0);
      expect(summary.totalExpectedImpact).toBe(0);
      expect(summary.totalRealizedImpact).toBe(0);
      expect(summary.metrics).toEqual([]);
    });

    it("should calculate average ROI multiple correctly", async () => {
      const decision1Id = uuidv4();
      const decision2Id = uuidv4();

      mockDb.operatorItem.findMany.mockResolvedValueOnce([
        {
          id: decision1Id,
          workspaceId: mockWorkspaceId,
          problem: "High ROI",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 150000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 90,
        },
        {
          id: decision2Id,
          workspaceId: mockWorkspaceId,
          problem: "Low ROI",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 100000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 70,
        },
      ] as any);

      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          id: decision1Id,
          workspaceId: mockWorkspaceId,
          problem: "High ROI",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 150000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 90,
        } as any)
        .mockResolvedValueOnce({
          id: decision2Id,
          workspaceId: mockWorkspaceId,
          problem: "Low ROI",
          status: "done",
          blockStage: null,
          impactExpected: 100000,
          actualOutcomeValue: 100000,
          baselineValue: 500000,
          projectedWithoutAction: 480000,
          priorityScore: 70,
        } as any);

      const summary = await calculateWorkspaceImpactSummary(mockWorkspaceId);

      // Average ROI: (1.5 + 1) / 2 = 1.25
      expect(summary.averageRoiMultiple).toBe(1.25);
    });
  });
});

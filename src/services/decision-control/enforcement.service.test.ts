import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  enforceDecisionControl,
  createEscalationIfNeeded,
  getDailyControl,
  triggerReEvaluationOnCompletion,
} from "./enforcement.service";

vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    alert: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/services/business-impact/decision-impact.service", () => ({
  calculateDecisionImpact: vi.fn(),
  calculateWorkspaceImpactSummary: vi.fn(),
}));

import {
  calculateDecisionImpact,
  calculateWorkspaceImpactSummary,
} from "@/services/business-impact/decision-impact.service";

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

describe("Decision Control Enforcement Service", () => {
  let mockDb: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    mockDb = db;
  });

  describe("enforceDecisionControl", () => {
    it("should allow execution for high priority, good ROI", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "High priority",
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

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId);

      expect(control.isBlocked).toBe(false);
      expect(control.blockReason).toBeNull();
      expect(control.requiresOverride).toBe(false);
    });

    it("should block execution if priority below threshold", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Low priority",
        status: "pending",
        blockStage: null,
        expected: 50000,
        realized: null,
        variance: null,
        atRisk: 45000,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 1500,
        priorityScore: 60,
        roiMultiple: null,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId);

      expect(control.isBlocked).toBe(true);
      expect(control.blockReason).toContain("below threshold");
      expect(control.priorityScore).toBe(60);
    });

    it("should require override for low ROI unless flag set", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Low ROI",
        status: "done",
        blockStage: null,
        expected: 100000,
        realized: 70000,
        variance: -30000,
        atRisk: 0,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 0,
        priorityScore: 75,
        roiMultiple: 0.7,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId, false);

      expect(control.isBlocked).toBe(true);
      expect(control.requiresOverride).toBe(true);
      expect(control.blockReason).toContain("Override required");
    });

    it("should allow execution with override flag for low ROI", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Low ROI with override",
        status: "done",
        blockStage: null,
        expected: 100000,
        realized: 70000,
        variance: -30000,
        atRisk: 0,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 0,
        priorityScore: 75,
        roiMultiple: 0.7,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId, true);

      expect(control.isBlocked).toBe(false);
      expect(control.requiresOverride).toBe(false);
    });

    it("should flag escalation for high atRisk", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "High risk",
        status: "in_progress",
        blockStage: null,
        expected: 100000,
        realized: null,
        variance: null,
        atRisk: 60000,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 2000,
        priorityScore: 80,
        roiMultiple: null,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId);

      expect(control.shouldEscalate).toBe(true);
      expect(control.escalationReason).toContain("At-risk");
    });

    it("should flag escalation for blocked decisions", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Blocked decision",
        status: "blocked",
        blockStage: "decision_gate",
        expected: 50000,
        realized: null,
        variance: null,
        atRisk: 50000,
        blockedAtRisk: 50000,
        failedLoss: 0,
        costOfDelay: 1666.67,
        priorityScore: 75,
        roiMultiple: null,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const control = await enforceDecisionControl(decisionId, mockWorkspaceId);

      expect(control.shouldEscalate).toBe(true);
      expect(control.escalationReason).toContain("blocked");
    });
  });

  describe("createEscalationIfNeeded", () => {
    it("should create alert for escalation threshold breach", async () => {
      const decisionId = uuidv4();
      const userId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Escalation needed",
        status: "blocked",
        blockStage: "decision_gate",
        expected: 60000,
        realized: null,
        variance: null,
        atRisk: 60000,
        blockedAtRisk: 60000,
        failedLoss: 0,
        costOfDelay: 2000,
        priorityScore: 70,
        roiMultiple: null,
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);
      mockDb.alert.create.mockResolvedValueOnce({} as any);

      const result = await createEscalationIfNeeded(decisionId, mockWorkspaceId, userId);

      expect(result).toBe(true);
      expect(mockDb.alert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: mockWorkspaceId,
            userId,
            type: "threshold_breach",
            entityType: "OperatorItem",
            entityId: decisionId,
          }),
        })
      );
    });

    it("should not create alert if no escalation needed", async () => {
      const decisionId = uuidv4();
      const userId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "No escalation",
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

      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);

      const result = await createEscalationIfNeeded(decisionId, mockWorkspaceId, userId);

      expect(result).toBe(false);
      expect(mockDb.alert.create).not.toHaveBeenCalled();
    });
  });

  describe("getDailyControl", () => {
    it("should aggregate daily control view", async () => {
      const decision1Id = uuidv4();
      const decision2Id = uuidv4();

      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 2,
        totalExpectedImpact: 150000,
        totalRealizedImpact: 120000,
        totalVariance: -30000,
        totalAtRisk: 50000,
        totalBlockedAtRisk: 50000,
        totalFailedLoss: 0,
        totalCostOfDelay: 1666.67,
        averagePriorityScore: 75,
        averageRoiMultiple: 0.96,
        blockedCount: 1,
        failedCount: 0,
        succeededCount: 1,
        metrics: [
          {
            decisionId: decision1Id,
            problem: "High priority",
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
          },
          {
            decisionId: decision2Id,
            problem: "Blocked decision",
            status: "blocked",
            blockStage: "decision_gate",
            expected: 50000,
            realized: null,
            variance: null,
            atRisk: 50000,
            blockedAtRisk: 50000,
            failedLoss: 0,
            costOfDelay: 1666.67,
            priorityScore: 65,
            roiMultiple: null,
            calculatedAt: new Date().toISOString(),
          },
        ],
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateWorkspaceImpactSummary).mockResolvedValueOnce(
        mockSummary as any
      );
      vi.mocked(calculateDecisionImpact)
        .mockResolvedValueOnce(mockSummary.metrics[0] as any)
        .mockResolvedValueOnce(mockSummary.metrics[1] as any);

      const control = await getDailyControl(mockWorkspaceId);

      expect(control.workspaceId).toBe(mockWorkspaceId);
      expect(control.totalDecisions).toBe(2);
      expect(control.totalBlockedValue).toBe(50000);
      expect(control.topPriorities.length).toBeGreaterThan(0);
    });
  });;

  describe("triggerReEvaluationOnCompletion", () => {
    it("should calculate delta on action completion", async () => {
      const decisionId = uuidv4();
      const mockMetrics = {
        decisionId,
        problem: "Completed action",
        status: "done",
        blockStage: null,
        expected: 100000,
        realized: 110000,
        variance: 10000,
        atRisk: 0,
        blockedAtRisk: 0,
        failedLoss: 0,
        costOfDelay: 0,
        priorityScore: 80,
        roiMultiple: 1.1,
        calculatedAt: new Date().toISOString(),
      };

      const mockDecision = {
        id: decisionId,
        workspaceId: mockWorkspaceId,
        outcomeDelta: null,
      };

      mockDb.operatorItem.findFirst.mockResolvedValueOnce(
        mockDecision as any
      );
      vi.mocked(calculateDecisionImpact).mockResolvedValueOnce(mockMetrics as any);
      mockDb.operatorItem.update.mockResolvedValueOnce({} as any);

      const result = await triggerReEvaluationOnCompletion(decisionId, mockWorkspaceId);

      expect(result).not.toBeNull();
      expect(result?.delta).toBe(10000);
      expect(result?.beforeImpact).toBe(100000);
      expect(result?.afterImpact).toBe(110000);
    });
  });
});

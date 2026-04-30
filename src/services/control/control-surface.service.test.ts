import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { getControlSurface } from "./control-surface.service";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/business-impact/decision-impact.service", () => ({
  calculateWorkspaceImpactSummary: vi.fn(),
}));

vi.mock("@/services/decision-control/enforcement.service", () => ({
  enforceDecisionControl: vi.fn(),
}));

import { calculateWorkspaceImpactSummary } from "@/services/business-impact/decision-impact.service";
import { enforceDecisionControl } from "@/services/decision-control/enforcement.service";

const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

describe("Control Surface Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getControlSurface", () => {
    it("should return unified control surface", async () => {
      const decision1Id = uuidv4();
      const decision2Id = uuidv4();

      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 2,
        totalExpectedImpact: 150000,
        totalRealizedImpact: 120000,
        totalVariance: -30000,
        totalAtRisk: 60000,
        totalBlockedAtRisk: 50000,
        totalFailedLoss: 0,
        totalCostOfDelay: 2000,
        averagePriorityScore: 75,
        averageRoiMultiple: 0.96,
        blockedCount: 1,
        failedCount: 0,
        succeededCount: 1,
        metrics: [
          {
            decisionId: decision1Id,
            problem: "High priority action",
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
            problem: "Blocked high-risk decision",
            status: "blocked",
            blockStage: "decision_gate",
            expected: 50000,
            realized: null,
            variance: null,
            atRisk: 60000,
            blockedAtRisk: 50000,
            failedLoss: 0,
            costOfDelay: 2000,
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

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
        {
          id: decision1Id,
          workspaceId: mockWorkspaceId,
          status: "done",
          confidence: 0.9,
        },
        {
          id: decision2Id,
          workspaceId: mockWorkspaceId,
          status: "blocked",
          confidence: 0.7,
        },
      ] as any);

      vi.mocked(enforceDecisionControl)
        .mockResolvedValueOnce({
          decisionId: decision1Id,
          problem: "High priority action",
          priorityScore: 85,
          isBlocked: false,
          blockReason: null,
          roiMultiple: 1.2,
          requiresOverride: false,
          atRisk: 0,
          blockedAtRisk: 0,
          shouldEscalate: false,
          escalationReason: null,
        } as any)
        .mockResolvedValueOnce({
          decisionId: decision2Id,
          problem: "Blocked high-risk decision",
          priorityScore: 65,
          isBlocked: true,
          blockReason: "Priority below threshold",
          roiMultiple: null,
          requiresOverride: false,
          atRisk: 60000,
          blockedAtRisk: 50000,
          shouldEscalate: true,
          escalationReason: "Decision blocked with $50000 at risk",
        } as any);

      const surface = await getControlSurface(mockWorkspaceId);

      expect(surface.workspaceId).toBe(mockWorkspaceId);
      expect(surface.topActions.length).toBeGreaterThan(0);
      expect(surface.risks.length).toBeGreaterThan(0);
      expect(surface.blockedValue).toBe(50000);
      expect(surface.totalImpactToday).toBe(100000);
      expect(surface.missedIfIgnored).toBe(110000); // 60000 + 50000
    });

    it("should generate deterministic action reasons", async () => {
      const decisionId = uuidv4();

      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 1,
        totalExpectedImpact: 150000,
        totalRealizedImpact: 0,
        totalVariance: 0,
        totalAtRisk: 0,
        totalBlockedAtRisk: 0,
        totalFailedLoss: 0,
        totalCostOfDelay: 0,
        averagePriorityScore: 85,
        averageRoiMultiple: 0,
        blockedCount: 0,
        failedCount: 0,
        succeededCount: 0,
        metrics: [
          {
            decisionId,
            problem: "Critical action",
            status: "pending",
            blockStage: null,
            expected: 150000,
            realized: null,
            variance: null,
            atRisk: 0,
            blockedAtRisk: 0,
            failedLoss: 0,
            costOfDelay: 0,
            priorityScore: 85,
            roiMultiple: null,
            calculatedAt: new Date().toISOString(),
          },
        ],
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateWorkspaceImpactSummary).mockResolvedValueOnce(
        mockSummary as any
      );

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
        {
          id: decisionId,
          workspaceId: mockWorkspaceId,
          status: "pending",
          confidence: 0.95,
        },
      ] as any);

      vi.mocked(enforceDecisionControl).mockResolvedValueOnce({
        decisionId,
        problem: "Critical action",
        priorityScore: 85,
        isBlocked: false,
        blockReason: null,
        roiMultiple: null,
        requiresOverride: false,
        atRisk: 0,
        shouldEscalate: false,
        escalationReason: null,
      } as any);

      const surface = await getControlSurface(mockWorkspaceId);

      expect(surface.topActions.length).toBe(1);
      expect(surface.topActions[0].reason).toBe(
        "Critical priority - immediate execution required"
      );
    });

    it("should generate deterministic risk reasons", async () => {
      const decisionId = uuidv4();

      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 1,
        totalExpectedImpact: 0,
        totalRealizedImpact: 0,
        totalVariance: 0,
        totalAtRisk: 60000,
        totalBlockedAtRisk: 60000,
        totalFailedLoss: 0,
        totalCostOfDelay: 2000,
        averagePriorityScore: 50,
        averageRoiMultiple: 0,
        blockedCount: 1,
        failedCount: 0,
        succeededCount: 0,
        metrics: [
          {
            decisionId,
            problem: "Blocked risky decision",
            status: "blocked",
            blockStage: "decision_gate",
            expected: 50000,
            realized: null,
            variance: null,
            atRisk: 60000,
            blockedAtRisk: 60000,
            failedLoss: 0,
            costOfDelay: 2000,
            priorityScore: 50,
            roiMultiple: null,
            calculatedAt: new Date().toISOString(),
          },
        ],
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateWorkspaceImpactSummary).mockResolvedValueOnce(
        mockSummary as any
      );

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
        {
          id: decisionId,
          workspaceId: mockWorkspaceId,
          status: "blocked",
          confidence: 0.6,
        },
      ] as any);

      vi.mocked(enforceDecisionControl).mockResolvedValueOnce({
        decisionId,
        problem: "Blocked risky decision",
        priorityScore: 50,
        isBlocked: true,
        blockReason: "Priority below threshold",
        roiMultiple: null,
        requiresOverride: false,
        atRisk: 60000,
        shouldEscalate: true,
        escalationReason: "Decision blocked with $60000 at risk",
      } as any);

      const surface = await getControlSurface(mockWorkspaceId);

      expect(surface.risks.length).toBe(1);
      expect(surface.risks[0].reason).toContain("Decision blocked");
    });

    it("should reuse engine calculations without duplication", async () => {
      const decisionId = uuidv4();

      const mockSummary = {
        workspaceId: mockWorkspaceId,
        totalDecisions: 1,
        totalExpectedImpact: 100000,
        totalRealizedImpact: 0,
        totalVariance: 0,
        totalAtRisk: 0,
        totalBlockedAtRisk: 0,
        totalFailedLoss: 0,
        totalCostOfDelay: 0,
        averagePriorityScore: 75,
        averageRoiMultiple: 0,
        blockedCount: 0,
        failedCount: 0,
        succeededCount: 0,
        metrics: [
          {
            decisionId,
            problem: "Reused metric",
            status: "pending",
            blockStage: null,
            expected: 100000,
            realized: null,
            variance: null,
            atRisk: 0,
            blockedAtRisk: 0,
            failedLoss: 0,
            costOfDelay: 0,
            priorityScore: 75,
            roiMultiple: null,
            calculatedAt: new Date().toISOString(),
          },
        ],
        calculatedAt: new Date().toISOString(),
      };

      vi.mocked(calculateWorkspaceImpactSummary).mockResolvedValueOnce(
        mockSummary as any
      );

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
        {
          id: decisionId,
          workspaceId: mockWorkspaceId,
          status: "pending",
          confidence: 0.85,
        },
      ] as any);

      vi.mocked(enforceDecisionControl).mockResolvedValueOnce({
        decisionId,
        problem: "Reused metric",
        priorityScore: 75,
        isBlocked: false,
        blockReason: null,
        roiMultiple: null,
        requiresOverride: false,
        atRisk: 0,
        shouldEscalate: false,
        escalationReason: null,
      } as any);

      const surface = await getControlSurface(mockWorkspaceId);

      // Verify calculateWorkspaceImpactSummary called only once
      expect(
        vi.mocked(calculateWorkspaceImpactSummary).mock.calls.length
      ).toBe(1);

      // Verify enforceDecisionControl called once per decision
      expect(vi.mocked(enforceDecisionControl).mock.calls.length).toBe(1);

      expect(surface.topActions[0].expectedImpact).toBe(100000);
    });
  });
});

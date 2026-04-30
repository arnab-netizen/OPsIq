import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateGovernanceMetrics } from "../metrics";

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

describe("PHASE 5.2: Governance Metrics Engine", () => {
  const testWorkspaceId = "ws-test-123";
  const now = new Date();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Metrics Calculation", () => {
    it("should calculate total decisions from approved and blocked", async () => {
      const mockDecisions = [
        {
          id: "d1",
          status: "done",
          blockStage: null,
          confidence: 0.8,
          impactExpected: 50000,
          actualOutcomeValue: 52000,
          outcomeDelta: null,
        },
        {
          id: "d2",
          status: "done",
          blockStage: null,
          confidence: 0.7,
          impactExpected: 30000,
          actualOutcomeValue: 28000,
          outcomeDelta: null,
        },
        {
          id: "d3",
          status: "blocked",
          blockStage: "guardrails",
          confidence: 0.4,
          impactExpected: 100000,
          actualOutcomeValue: null,
          outcomeDelta: null,
        },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
        days: 7,
      });

      expect(metrics.summary.totalDecisions).toBe(3);
      expect(metrics.summary.approvedCount).toBe(2);
      expect(metrics.summary.blockedCount).toBe(1);
    });

    it("should return zero metrics when no decisions exist", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.summary.totalDecisions).toBe(0);
      expect(metrics.summary.approvedCount).toBe(0);
      expect(metrics.summary.blockedCount).toBe(0);
      expect(metrics.blockRates.overallBlockRate).toBe(0);
      expect(metrics.confidence.avgConfidenceApproved).toBeNull();
      expect(metrics.confidence.avgConfidenceBlocked).toBeNull();
    });

    it("should enforce workspace isolation in queries", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
        days: 30,
      });

      expect(vi.mocked(db.operatorItem.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: testWorkspaceId,
          }),
        })
      );
    });
  });

  describe("Block Rate Calculations", () => {
    it("should calculate overall block rate correctly", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.7, impactExpected: 30000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "decision_gate", confidence: 0.3, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // 2 blocked out of 4 total = 50%
      expect(metrics.blockRates.overallBlockRate).toBe(50);
    });

    it("should calculate guardrail block rate from blocked decisions", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.3, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "decision_gate", confidence: 0.5, impactExpected: 75000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // 2 guardrail blocks out of 3 total blocks = 66.67%
      expect(metrics.blockRates.guardrailBlockRate).toBeCloseTo(66.67, 1);
    });

    it("should calculate decision gate block rate separately", async () => {
      const mockDecisions = [
        { status: "blocked", blockStage: "decision_gate", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "decision_gate", confidence: 0.3, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.5, impactExpected: 75000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // 2 decision gate blocks out of 3 total blocks = 66.67%
      expect(metrics.blockRates.decisionGateBlockRate).toBeCloseTo(66.67, 1);
    });

    it("should calculate dependency validation block rate", async () => {
      const mockDecisions = [
        { status: "blocked", blockStage: "dependency_validation", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.3, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.5, impactExpected: 75000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // 1 dependency validation block out of 3 total blocks = 33.33%
      expect(metrics.blockRates.dependencyValidationBlockRate).toBeCloseTo(33.33, 1);
    });
  });

  describe("Confidence Metrics", () => {
    it("should calculate average confidence for approved decisions only", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.6, impactExpected: 30000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.2, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // Average of approved: (0.8 + 0.6) / 2 = 0.7
      expect(metrics.confidence.avgConfidenceApproved).toBe(0.7);
      // Average of blocked: 0.2
      expect(metrics.confidence.avgConfidenceBlocked).toBe(0.2);
    });

    it("should handle null confidence values gracefully", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: null, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 30000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: null, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // Should treat null as 0
      expect(metrics.confidence.avgConfidenceApproved).toBe(0.4);
    });
  });

  describe("Impact Metrics", () => {
    it("should sum expected impact from approved and blocked decisions separately", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.7, impactExpected: 30000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.3, impactExpected: 75000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.impact.approvedExpectedImpact).toBe(80000); // 50k + 30k
      expect(metrics.impact.blockedExpectedImpact).toBe(175000); // 100k + 75k
    });

    it("should calculate realized impact from actual outcome values", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: 52000, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.7, impactExpected: 30000, actualOutcomeValue: 28000, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.9, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: 95000 },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // 52k + 28k + 95k = 175k
      expect(metrics.impact.realizedImpact).toBe(175000);
    });

    it("should track losses from negative actual outcomes", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: 52000, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.7, impactExpected: 30000, actualOutcomeValue: -15000, outcomeDelta: null },
        { status: "done", blockStage: null, confidence: 0.9, impactExpected: 100000, actualOutcomeValue: -30000, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      // Losses: 15k + 30k = 45k
      expect(metrics.impact.lossFromMisses).toBe(45000);
      // Realized: 52k - 15k - 30k = 7k
      expect(metrics.impact.realizedImpact).toBe(7000);
    });

    it("should prefer actualOutcomeValue over outcomeDelta", async () => {
      const mockDecisions = [
        {
          status: "done",
          blockStage: null,
          confidence: 0.8,
          impactExpected: 50000,
          actualOutcomeValue: 55000,
          outcomeDelta: 999999, // Should be ignored
        },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.impact.realizedImpact).toBe(55000); // Uses actualOutcomeValue, not outcomeDelta
    });
  });

  describe("Date Bounds and Parameters", () => {
    it("should respect days parameter with default of 30", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      const call = vi.mocked(db.operatorItem.findMany).mock.calls[0][0] as any;
      const startDate = call.where.createdAt.gte as Date;
      const endDate = call.where.createdAt.lte as Date;

      // Check that approximately 30 days difference
      const diff = endDate.getTime() - startDate.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      expect(days).toBe(30);
    });

    it("should cap days parameter at 90", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
        days: 365,
      });

      expect(metrics.period.days).toBe(90);
    });

    it("should enforce minimum of 1 day", async () => {
      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
        days: 0,
      });

      expect(metrics.period.days).toBe(1);
    });
  });

  describe("Data Integrity and No Hardcoded Values", () => {
    it("should use only persisted database values, no defaults", async () => {
      const mockDecisions = [
        {
          id: "d1",
          status: "done",
          blockStage: null,
          confidence: 0.75, // This exact value should be used, not defaulted
          impactExpected: 50000,
          actualOutcomeValue: 52000,
          outcomeDelta: null,
        },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.confidence.avgConfidenceApproved).toBe(0.75);
    });

    it("should include both approved and blocked in total decisions metric", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: 50000, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.4, impactExpected: 100000, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.summary.totalDecisions).toBe(2);
      expect(metrics.summary.approvedCount + metrics.summary.blockedCount).toBe(
        metrics.summary.totalDecisions
      );
    });

    it("should handle missing impact fields gracefully", async () => {
      const mockDecisions = [
        { status: "done", blockStage: null, confidence: 0.8, impactExpected: null, actualOutcomeValue: null, outcomeDelta: null },
        { status: "blocked", blockStage: "guardrails", confidence: 0.4, impactExpected: undefined, actualOutcomeValue: null, outcomeDelta: null },
      ];

      vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(
        mockDecisions as any
      );

      const metrics = await calculateGovernanceMetrics({
        workspaceId: testWorkspaceId,
      });

      expect(metrics.impact.approvedExpectedImpact).toBe(0);
      expect(metrics.impact.blockedExpectedImpact).toBe(0);
    });
  });
});

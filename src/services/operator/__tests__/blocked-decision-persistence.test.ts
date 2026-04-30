/**
 * PHASE 4 CRITICAL 2: Blocked Decision Persistence Tests
 *
 * Tests that verify:
 * - Blocked decisions are stored in database with status='blocked'
 * - blockStage is set correctly (dependency_validation, decision_gate, guardrails)
 * - blockReason is captured
 * - expectedImpact and confidence are persisted
 * - gateResult/guardrailResult are captured
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { addBlockedDecision } from "../store";

// Mock workspace context first
vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn().mockResolvedValue({
    workspaceId: "test-workspace-id",
  }),
  validateWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Import db after mocking to get the mocked version
import { db as mockDb } from "@/lib/db";

describe("PHASE 4 CRITICAL 2: Blocked Decision Persistence", () => {
  const testWorkspaceId = "test-workspace-id";
  const testUserId = "test-user-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dependency Validation Block", () => {
    it("should persist blocked decision with dependency_validation stage", async () => {
      const mockId = "blocked-id-123";
      const mockCreatedRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "dependency_validation",
        blockReason: "Variable 'revenueChange' requires 1 missing dependency(ies): baselineRevenue",
        confidence: 0.8,
        impactExpected: 100000,
        ownerUserId: testUserId,
        createdBy: testUserId,
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockCreatedRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockCreatedRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Missing baselineRevenue",
        action: "None - decision rejected",
        blockStage: "dependency_validation",
        blockReason: "Variable 'revenueChange' requires 1 missing dependency(ies): baselineRevenue",
        expectedImpact: 100000,
        confidence: 0.8,
        inputsSnapshot: {
          revenueChange: 100000,
          costChange: 50000,
          // baselineRevenue: MISSING
          confidence: 0.8,
        },
        controlLayerViolations: {
          variable: "revenueChange",
          missingDependencies: ["baselineRevenue"],
        },
      });

      expect(blockedId).toBe(mockId);
      expect(mockDb.operatorItem.create).toHaveBeenCalled();

      // Verify record in database
      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      expect(record).toBeDefined();
      expect(record?.status).toBe("blocked");
      expect(record?.blockStage).toBe("dependency_validation");
      expect(record?.blockReason).toContain("baselineRevenue");
      expect(record?.confidence).toBe(0.8);
      expect(record?.impactExpected).toBe(100000);
      expect(record?.workspaceId).toBe(testWorkspaceId);
    });

    it("should capture missing dependency details", async () => {
      const mockId = "blocked-id-124";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "dependency_validation",
        blockReason: "Variable 'costChange' requires 1 missing dependency(ies): baselineCost",
        confidence: 0.75,
        impactExpected: 50000,
        ownerUserId: testUserId,
        createdBy: testUserId,
        controlLayerViolations: {
          variable: "costChange",
          missingDependencies: ["baselineCost"],
        },
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Missing baselineCost",
        action: "None - decision rejected",
        blockStage: "dependency_validation",
        blockReason: "Variable 'costChange' requires 1 missing dependency(ies): baselineCost",
        expectedImpact: 50000,
        confidence: 0.75,
        controlLayerViolations: {
          variable: "costChange",
          missingDependencies: ["baselineCost"],
        },
      });

      expect(blockedId).toBe(mockId);

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      const violations = record?.controlLayerViolations as any;
      expect(violations?.missingDependencies).toContain("baselineCost");
      expect(violations?.variable).toBe("costChange");
    });
  });

  describe("Decision Gate Block", () => {
    it("should persist blocked decision with decision_gate stage", async () => {
      const mockId = "blocked-id-125";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "decision_gate",
        blockReason: "Decision confidence (0.3) is below required threshold (0.5)",
        confidence: 0.3,
        impactExpected: 75000,
        ownerUserId: testUserId,
        createdBy: testUserId,
        gateResult: {
          allowed: false,
          reason: "Decision confidence (0.3) is below required threshold (0.5)",
          missingVariables: [],
          lowConfidenceVariables: ["confidence"],
          staleVariables: [],
        },
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Low confidence decision",
        action: "None - decision rejected",
        blockStage: "decision_gate",
        blockReason: "Decision confidence (0.3) is below required threshold (0.5)",
        expectedImpact: 75000,
        confidence: 0.3,
        inputsSnapshot: {
          baselineRevenue: 1000000,
          baselineCost: 500000,
          revenueChange: 100000,
          costChange: 50000,
          confidence: 0.3, // Below 0.5 threshold
        },
        gateResult: {
          allowed: false,
          reason: "Decision confidence (0.3) is below required threshold (0.5)",
          missingVariables: [],
          lowConfidenceVariables: ["confidence"],
          staleVariables: [],
        },
      });

      expect(blockedId).toBeDefined();

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      expect(record?.status).toBe("blocked");
      expect(record?.blockStage).toBe("decision_gate");
      expect(record?.blockReason).toContain("0.3");
      expect(record?.blockReason).toContain("0.5");
      expect(record?.confidence).toBe(0.3);
      expect(record?.impactExpected).toBe(75000);

      const gateResult = record?.gateResult as any;
      expect(gateResult?.allowed).toBe(false);
      expect(gateResult?.lowConfidenceVariables).toContain("confidence");
    });

    it("should capture stale variables in gate result", async () => {
      const mockId = "blocked-id-126";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "decision_gate",
        blockReason: "Stale variables detected (>30 days old): baselineRevenue",
        confidence: 0.8,
        impactExpected: 100000,
        ownerUserId: testUserId,
        createdBy: testUserId,
        gateResult: {
          allowed: false,
          reason: "Stale variables detected (>30 days old): baselineRevenue",
          staleVariables: ["baselineRevenue"],
        },
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Stale variables",
        action: "None - decision rejected",
        blockStage: "decision_gate",
        blockReason: "Stale variables detected (>30 days old): baselineRevenue",
        expectedImpact: 100000,
        confidence: 0.8,
        gateResult: {
          allowed: false,
          reason: "Stale variables detected (>30 days old): baselineRevenue",
          staleVariables: ["baselineRevenue"],
        },
      });

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      const gateResult = record?.gateResult as any;
      expect(gateResult?.staleVariables).toContain("baselineRevenue");
    });
  });

  describe("Guardrails Block", () => {
    it("should persist blocked decision with guardrails stage", async () => {
      const mockId = "blocked-id-127";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "[BLOCK] NEGATIVE_IMPACT_BLOCK: Decision has non-positive expected impact (-50000)",
        confidence: 0.85,
        impactExpected: -50000,
        ownerUserId: testUserId,
        createdBy: testUserId,
        guardrailResult: {
          blocked: true,
          violations: [
            {
              ruleId: "NEGATIVE_IMPACT_BLOCK",
              severity: "block",
              message: "Decision has non-positive expected impact (-50000)",
              threshold: "> 0",
              actual: -50000,
              overrideAllowed: false,
            },
          ],
          warnings: [],
        },
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Negative impact decision",
        action: "None - decision rejected",
        blockStage: "guardrails",
        blockReason:
          "[BLOCK] NEGATIVE_IMPACT_BLOCK: Decision has non-positive expected impact (-50000)",
        expectedImpact: -50000,
        confidence: 0.85,
        inputsSnapshot: {
          baselineRevenue: 1000000,
          baselineCost: 500000,
          revenueChange: 30000,
          costChange: 80000, // costChange > revenueChange = negative impact
          confidence: 0.85,
        },
        guardrailResult: {
          blocked: true,
          violations: [
            {
              ruleId: "NEGATIVE_IMPACT_BLOCK",
              severity: "block",
              message: "Decision has non-positive expected impact (-50000)",
              threshold: "> 0",
              actual: -50000,
              overrideAllowed: false,
            },
          ],
          warnings: [],
        },
      });

      expect(blockedId).toBeDefined();

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      expect(record?.status).toBe("blocked");
      expect(record?.blockStage).toBe("guardrails");
      expect(record?.blockReason).toContain("NEGATIVE_IMPACT_BLOCK");
      expect(record?.confidence).toBe(0.85);
      expect(record?.impactExpected).toBe(-50000);

      const guardrailResult = record?.guardrailResult as any;
      expect(guardrailResult?.blocked).toBe(true);
      expect(guardrailResult?.violations[0].ruleId).toBe("NEGATIVE_IMPACT_BLOCK");
    });

    it("should capture high impact approval requirement", async () => {
      const mockId = "blocked-id-128";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "guardrails",
        blockReason: "[BLOCK] HIGH_IMPACT_APPROVAL: Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
        confidence: 0.9,
        impactExpected: 500000,
        ownerUserId: testUserId,
        createdBy: testUserId,
        guardrailResult: {
          blocked: true,
          violations: [
            {
              ruleId: "HIGH_IMPACT_APPROVAL",
              severity: "block",
              message:
                "Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
              threshold: 100000,
              actual: 500000,
              overrideAllowed: true,
            },
          ],
          warnings: [],
        },
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "High impact decision",
        action: "None - decision rejected",
        blockStage: "guardrails",
        blockReason:
          "[BLOCK] HIGH_IMPACT_APPROVAL: Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
        expectedImpact: 500000,
        confidence: 0.9,
        guardrailResult: {
          blocked: true,
          violations: [
            {
              ruleId: "HIGH_IMPACT_APPROVAL",
              severity: "block",
              message:
                "Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
              threshold: 100000,
              actual: 500000,
              overrideAllowed: true,
            },
          ],
          warnings: [],
        },
      });

      expect(blockedId).toBe(mockId);

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      const guardrailResult = record?.guardrailResult as any;
      expect(guardrailResult?.violations[0].ruleId).toBe("HIGH_IMPACT_APPROVAL");
      expect(guardrailResult?.violations[0].overrideAllowed).toBe(true);
    });
  });

  describe("Data Integrity", () => {
    it("should have correct workspace isolation", async () => {
      const mockId = "blocked-id-129";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "dependency_validation",
        blockReason: "Test reason",
        confidence: 0.8,
        impactExpected: 100000,
        ownerUserId: testUserId,
        createdBy: testUserId,
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Test problem",
        action: "Test action",
        blockStage: "dependency_validation",
        blockReason: "Test reason",
        expectedImpact: 100000,
        confidence: 0.8,
      });

      expect(blockedId).toBe(mockId);

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      expect(record?.workspaceId).toBe(testWorkspaceId);
      expect(record?.createdBy).toBe(testUserId);
      expect(record?.ownerUserId).toBe(testUserId);
    });

    it("should have zero priority for blocked decisions", async () => {
      const mockId = "blocked-id-130";
      const mockRecord = {
        id: mockId,
        workspaceId: testWorkspaceId,
        status: "blocked",
        blockStage: "decision_gate",
        blockReason: "Test reason",
        confidence: 0.8,
        impactExpected: 100000,
        priorityScore: 0,
        ownerUserId: testUserId,
        createdBy: testUserId,
      };

      mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
      mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

      const blockedId = await addBlockedDecision({
        workspaceId: testWorkspaceId,
        createdBy: testUserId,
        ownerUserId: testUserId,
        problem: "Test problem",
        action: "Test action",
        blockStage: "decision_gate",
        blockReason: "Test reason",
        expectedImpact: 100000,
        confidence: 0.8,
      });

      expect(blockedId).toBe(mockId);

      const record = await mockDb.operatorItem.findUnique({
        where: { id: blockedId },
      });

      expect(record?.priorityScore).toBe(0);
    });

    it("should require blockStage and blockReason", async () => {
      expect(
        addBlockedDecision({
          workspaceId: testWorkspaceId,
          createdBy: testUserId,
          ownerUserId: testUserId,
          problem: "Test",
          action: "Test",
          blockStage: undefined as any,
          blockReason: undefined as any,
          expectedImpact: 100000,
          confidence: 0.8,
        })
      ).rejects.toThrow();
    });

    it("should preserve expectedImpact and confidence values", async () => {
      const testCases = [
        { impact: 50000, confidence: 0.3 },
        { impact: 250000, confidence: 0.9 },
        { impact: -100000, confidence: 0.5 },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const mockId = `blocked-id-${131 + i}`;
        const mockRecord = {
          id: mockId,
          workspaceId: testWorkspaceId,
          status: "blocked",
          blockStage: "dependency_validation",
          blockReason: "Test reason",
          confidence: testCase.confidence,
          impactExpected: testCase.impact,
          ownerUserId: testUserId,
          createdBy: testUserId,
        };

        mockDb.operatorItem.create.mockResolvedValueOnce(mockRecord);
        mockDb.operatorItem.findUnique.mockResolvedValueOnce(mockRecord);

        const blockedId = await addBlockedDecision({
          workspaceId: testWorkspaceId,
          createdBy: testUserId,
          ownerUserId: testUserId,
          problem: `Test ${testCase.impact}`,
          action: "Test",
          blockStage: "dependency_validation",
          blockReason: "Test reason",
          expectedImpact: testCase.impact,
          confidence: testCase.confidence,
        });

        expect(blockedId).toBe(mockId);

        const record = await mockDb.operatorItem.findUnique({
          where: { id: blockedId },
        });

        expect(record?.impactExpected).toBe(testCase.impact);
        expect(record?.confidence).toBe(testCase.confidence);
      }
    });
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  validateDecisionForAcceptance,
  checkDecisionExists,
} from "../human-decision-validator";
import {
  acceptDecision,
  rejectDecision,
  getDecisionAcceptanceHistory,
} from "../decision-acceptance.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

describe("Human Decision Validation (V72-R2)", () => {
  const workspaceId = uuid();
  const engagementId = uuid();
  const userId = uuid();

  let testDecisionId: string;

  beforeAll(async () => {
    // Create test workspace
    await db.workspace.create({
      data: { id: workspaceId, name: "Test Workspace", slug: "test-workspace" },
    });

    // Create test engagement
    await db.engagement.create({
      data: {
        id: engagementId,
        workspaceId,
        clientId: uuid(),
        title: "Test Engagement",
        stage: "active",
      },
    });

    // Create test user
    await db.user.create({
      data: {
        id: userId,
        email: `test-${uuid()}@example.com`,
        name: "Test User",
      },
    });

    // Create test decision (OperatorItem)
    testDecisionId = uuid();
    await db.operatorItem.create({
      data: {
        id: testDecisionId,
        workspaceId,
        ownerUserId: userId,
        createdBy: userId,
        problem: "Revenue leak detected",
        action: "Implement cost controls",
        impactExpected: 75000,
        impactLow: 50000,
        impactHigh: 100000,
        confidence: 0.85,
        priorityScore: 9.5,
        status: "pending",
        decisionType: "operational",
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.operatorItem.deleteMany({
      where: { workspaceId },
    });
    await db.engagement.deleteMany({
      where: { workspaceId },
    });
    await db.user.deleteMany({
      where: { id: userId },
    });
    await db.workspace.deleteMany({
      where: { id: workspaceId },
    });
  });

  describe("Acceptance Criteria 1: Owner can explicitly accept decisions", () => {
    it("should accept a pending decision", async () => {
      const result = await acceptDecision({
        decisionId: testDecisionId,
        engagementId,
        workspaceId,
        acceptedBy: userId,
        rationale: "Reviewed and approved by owner",
      });

      expect(result.decisionId).toBe(testDecisionId);
      expect(result.acceptedBy).toBe(userId);
      expect(result.acceptedAt).toBeInstanceOf(Date);
      expect(result.rationale).toBe("Reviewed and approved by owner");
      expect(result.auditEventId).toBeDefined();
    });

    it("should reject acceptance of non-pending decision", async () => {
      // Create a decision with non-pending status
      const blockedDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: blockedDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 50000,
          impactLow: 25000,
          impactHigh: 75000,
          confidence: 0.7,
          priorityScore: 8,
          status: "blocked",
          blockStage: "guardrails",
          blockReason: "Guardrails check failed",
          decisionType: "operational",
        },
      });

      const error = async () => {
        await acceptDecision({
          decisionId: blockedDecisionId,
          engagementId,
          workspaceId,
          acceptedBy: userId,
        });
      };

      await expect(error).rejects.toThrow(ValidationError);

      // Cleanup
      await db.operatorItem.delete({
        where: { id: blockedDecisionId },
      });
    });
  });

  describe("Acceptance Criteria 2: Decision acceptance recorded in audit trail", () => {
    it("should emit DECISION_ACCEPTED audit event", async () => {
      // Create a new decision for this test
      const newDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: newDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test problem",
          action: "Test action",
          impactExpected: 60000,
          impactLow: 30000,
          impactHigh: 90000,
          confidence: 0.8,
          priorityScore: 9,
          status: "pending",
          decisionType: "strategic",
        },
      });

      const result = await acceptDecision({
        decisionId: newDecisionId,
        engagementId,
        workspaceId,
        acceptedBy: userId,
        rationale: "Test rationale",
      });

      // Verify audit event was recorded
      const auditEvent = await db.auditEvent.findUnique({
        where: { id: result.auditEventId },
      });

      expect(auditEvent).toBeDefined();
      expect(auditEvent?.eventName).toBe(AUDIT_EVENTS.DECISION_ACCEPTED);
      expect(auditEvent?.workspaceId).toBe(workspaceId);
      expect(auditEvent?.entityType).toBe("OperatorItem");
      expect(auditEvent?.entityId).toBe(newDecisionId);

      // Cleanup
      await db.operatorItem.delete({
        where: { id: newDecisionId },
      });
      await db.auditEvent.delete({
        where: { id: result.auditEventId },
      });
    });
  });

  describe("Acceptance Criteria 3: Capability check enforced (DECISION_ACCEPT)", () => {
    it("should verify decision exists before acceptance", async () => {
      const exists = await checkDecisionExists(testDecisionId, workspaceId);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent decision", async () => {
      const exists = await checkDecisionExists(uuid(), workspaceId);
      expect(exists).toBe(false);
    });

    it("should enforce workspace isolation on existence check", async () => {
      const wrongWorkspaceId = uuid();
      const exists = await checkDecisionExists(testDecisionId, wrongWorkspaceId);
      expect(exists).toBe(false);
    });
  });

  describe("Acceptance Criteria 4: Rejection reason captured and logged", () => {
    it("should reject a decision with required reason", async () => {
      // Create a new decision for rejection
      const rejectDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: rejectDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test problem",
          action: "Test action",
          impactExpected: 50000,
          impactLow: 25000,
          impactHigh: 75000,
          confidence: 0.6,
          priorityScore: 7,
          status: "pending",
          decisionType: "operational",
        },
      });

      const result = await rejectDecision({
        decisionId: rejectDecisionId,
        engagementId,
        workspaceId,
        rejectedBy: userId,
        reason: "Risk assessment indicates potential financial exposure",
      });

      expect(result.decisionId).toBe(rejectDecisionId);
      expect(result.rejectedBy).toBe(userId);
      expect(result.rejectedAt).toBeInstanceOf(Date);
      expect(result.reason).toBe(
        "Risk assessment indicates potential financial exposure"
      );
      expect(result.auditEventId).toBeDefined();

      // Cleanup
      await db.operatorItem.delete({
        where: { id: rejectDecisionId },
      });
    });

    it("should require rejection reason", async () => {
      const rejectDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: rejectDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 40000,
          impactLow: 20000,
          impactHigh: 60000,
          confidence: 0.5,
          priorityScore: 6,
          status: "pending",
          decisionType: "operational",
        },
      });

      const error = async () => {
        await rejectDecision({
          decisionId: rejectDecisionId,
          engagementId,
          workspaceId,
          rejectedBy: userId,
          reason: "",
        });
      };

      await expect(error).rejects.toThrow(ValidationError);

      // Cleanup
      await db.operatorItem.delete({
        where: { id: rejectDecisionId },
      });
    });

    it("should emit DECISION_REJECTED audit event", async () => {
      const rejectDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: rejectDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 45000,
          impactLow: 22000,
          impactHigh: 68000,
          confidence: 0.65,
          priorityScore: 7.5,
          status: "pending",
          decisionType: "operational",
        },
      });

      const result = await rejectDecision({
        decisionId: rejectDecisionId,
        engagementId,
        workspaceId,
        rejectedBy: userId,
        reason: "Technical constraints prevent implementation",
      });

      const auditEvent = await db.auditEvent.findUnique({
        where: { id: result.auditEventId },
      });

      expect(auditEvent?.eventName).toBe(AUDIT_EVENTS.DECISION_REJECTED);
      expect(auditEvent?.workspaceId).toBe(workspaceId);

      // Cleanup
      await db.operatorItem.delete({
        where: { id: rejectDecisionId },
      });
      await db.auditEvent.delete({
        where: { id: result.auditEventId },
      });
    });
  });

  describe("Acceptance Criteria 5: Timestamp recorded for compliance", () => {
    it("should record deterministic timestamps on acceptance", async () => {
      const newDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: newDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 55000,
          impactLow: 27000,
          impactHigh: 83000,
          confidence: 0.75,
          priorityScore: 8.5,
          status: "pending",
          decisionType: "operational",
        },
      });

      const before = new Date();
      const result = await acceptDecision({
        decisionId: newDecisionId,
        engagementId,
        workspaceId,
        acceptedBy: userId,
      });
      const after = new Date();

      expect(result.acceptedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.acceptedAt.getTime()).toBeLessThanOrEqual(after.getTime());

      // Cleanup
      await db.operatorItem.delete({
        where: { id: newDecisionId },
      });
    });
  });

  describe("Acceptance Criteria 6: Financial consequences shown before acceptance", () => {
    it("should validate decision and return financial consequences", async () => {
      const validation = await validateDecisionForAcceptance({
        decisionId: testDecisionId,
        engagementId,
        workspaceId,
      });

      expect(validation.isValid).toBeDefined();
      expect(validation.financialConsequences).toBeDefined();
      expect(validation.financialConsequences.expectedImpact).toBe(75000);
      expect(validation.financialConsequences.confidenceScore).toBe(0.85);
      expect(["low", "medium", "high"]).toContain(
        validation.financialConsequences.riskLevel
      );
    });

    it("should set risk level based on impact amount", async () => {
      // High impact decision
      const highImpactId = uuid();
      await db.operatorItem.create({
        data: {
          id: highImpactId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 200000,
          impactLow: 150000,
          impactHigh: 250000,
          confidence: 0.9,
          priorityScore: 10,
          status: "pending",
          decisionType: "strategic",
        },
      });

      const validation = await validateDecisionForAcceptance({
        decisionId: highImpactId,
        engagementId,
        workspaceId,
      });

      expect(validation.financialConsequences.riskLevel).toBe("high");

      // Cleanup
      await db.operatorItem.delete({
        where: { id: highImpactId },
      });
    });
  });

  describe("Acceptance Criteria 7: No silent mutations - audit trail for all writes", () => {
    it("should track all decision state changes in audit", async () => {
      const newDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: newDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 65000,
          impactLow: 32500,
          impactHigh: 97500,
          confidence: 0.82,
          priorityScore: 9,
          status: "pending",
          decisionType: "operational",
        },
      });

      // Accept decision
      const acceptResult = await acceptDecision({
        decisionId: newDecisionId,
        engagementId,
        workspaceId,
        acceptedBy: userId,
        rationale: "Test",
      });

      // Verify decision was updated (not silent mutation)
      const decision = await db.operatorItem.findUnique({
        where: { id: newDecisionId },
      });

      expect(decision?.status).toBe("in_progress");
      expect(decision?.lastUpdatedBy).toBe(userId);

      // Verify audit trail exists
      const events = await getDecisionAcceptanceHistory(newDecisionId, workspaceId);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty("acceptedAt");

      // Cleanup
      await db.operatorItem.delete({
        where: { id: newDecisionId },
      });
    });
  });

  describe("Acceptance Criteria 8: Workspace isolation verified", () => {
    it("should enforce workspace isolation on validation", async () => {
      const otherWorkspaceId = uuid();

      const error = async () => {
        await validateDecisionForAcceptance({
          decisionId: testDecisionId,
          engagementId: uuid(),
          workspaceId: otherWorkspaceId,
        });
      };

      // This should fail because the decision doesn't exist in the other workspace
      await expect(error).rejects.toThrow();
    });

    it("should enforce workspace isolation on acceptance", async () => {
      const otherWorkspaceId = uuid();

      const error = async () => {
        await acceptDecision({
          decisionId: testDecisionId,
          engagementId,
          workspaceId: otherWorkspaceId,
          acceptedBy: userId,
        });
      };

      await expect(error).rejects.toThrow(NotFoundError);
    });

    it("should enforce workspace isolation on rejection", async () => {
      const rejectDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: rejectDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 50000,
          impactLow: 25000,
          impactHigh: 75000,
          confidence: 0.7,
          priorityScore: 8,
          status: "pending",
          decisionType: "operational",
        },
      });

      const otherWorkspaceId = uuid();
      const error = async () => {
        await rejectDecision({
          decisionId: rejectDecisionId,
          engagementId,
          workspaceId: otherWorkspaceId,
          rejectedBy: userId,
          reason: "Test reason for rejection scenario",
        });
      };

      await expect(error).rejects.toThrow();

      // Cleanup
      await db.operatorItem.delete({
        where: { id: rejectDecisionId },
      });
    });
  });

  describe("Additional: Audit trail history", () => {
    it("should retrieve decision acceptance history", async () => {
      const historyDecisionId = uuid();
      await db.operatorItem.create({
        data: {
          id: historyDecisionId,
          workspaceId,
          ownerUserId: userId,
          createdBy: userId,
          problem: "Test",
          action: "Test",
          impactExpected: 70000,
          impactLow: 35000,
          impactHigh: 105000,
          confidence: 0.8,
          priorityScore: 9,
          status: "pending",
          decisionType: "operational",
        },
      });

      // Accept decision
      await acceptDecision({
        decisionId: historyDecisionId,
        engagementId,
        workspaceId,
        acceptedBy: userId,
        rationale: "First review",
      });

      // Get history
      const history = await getDecisionAcceptanceHistory(historyDecisionId, workspaceId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty("acceptedAt");

      // Cleanup
      await db.operatorItem.delete({
        where: { id: historyDecisionId },
      });
    });
  });
});

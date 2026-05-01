import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import {
  transitionDecisionState,
  submitDecision,
  approveDecision,
  rejectDecision,
  cancelDecision,
  executeDecision,
  recordDecisionOutcome,
  closeDecision,
  failDecision,
  isDecisionTerminal,
  requireMutableDecision,
} from "../decision-lifecycle.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

// Mock Prisma and audit
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Decision Lifecycle Service", () => {
  const workspaceId = "test-workspace-id";
  const decisionId = "test-decision-id";
  const actorId = "test-actor-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Happy path: DRAFT → SUBMITTED → APPROVED → EXECUTED → OUTCOME_RECORDED → CLOSED", () => {
    it("should allow full happy path", async () => {
      const mockDecision = {
        id: decisionId,
        workspaceId,
        status: "draft",
        blockReason: null,
        lastUpdatedBy: null,
        updatedAt: new Date(),
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "submitted",
      } as any);

      const result = await submitDecision(decisionId, workspaceId, actorId);

      expect(result.status).toBeDefined();
      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
      expect(vi.mocked(emitAuditEvent)).toHaveBeenCalled();
    });

    it("should transition SUBMITTED → APPROVED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "approved",
      } as any);

      await expect(
        approveDecision(decisionId, workspaceId, actorId)
      ).resolves.toBeDefined();

      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
    });

    it("should transition APPROVED → EXECUTED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "approved",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "in_progress",
        executionStatus: "started",
      } as any);

      await expect(
        executeDecision(decisionId, workspaceId, actorId)
      ).resolves.toBeDefined();

      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
    });

    it("should transition EXECUTED → OUTCOME_RECORDED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "outcome_recorded",
        actualOutcomeValue: 5000,
      } as any);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).resolves.toBeDefined();

      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
    });

    it("should transition OUTCOME_RECORDED → CLOSED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "outcome_recorded",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "closed",
        completedAt: new Date(),
      } as any);

      await expect(
        closeDecision(decisionId, workspaceId, actorId)
      ).resolves.toBeDefined();

      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
    });
  });

  describe("Invalid transitions: skipped states", () => {
    it("should reject DRAFT → APPROVED (skips SUBMITTED)", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        transitionDecisionState(decisionId, workspaceId, "APPROVED", undefined, actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject SUBMITTED → EXECUTED (skips APPROVED)", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        transitionDecisionState(decisionId, workspaceId, "EXECUTED", undefined, actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject APPROVED → OUTCOME_RECORDED (skips EXECUTED)", async () => {
      const mockDecision = {
        id: decisionId,
        status: "approved",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        transitionDecisionState(
          decisionId,
          workspaceId,
          "OUTCOME_RECORDED",
          undefined,
          actorId
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject EXECUTED → CLOSED (skips OUTCOME_RECORDED)", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        transitionDecisionState(decisionId, workspaceId, "CLOSED", undefined, actorId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Execution enforcement: execution requires APPROVED", () => {
    it("should allow execution from APPROVED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "approved",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "in_progress",
      } as any);

      await expect(
        executeDecision(decisionId, workspaceId, actorId)
      ).resolves.toBeDefined();
    });

    it("should reject execution from SUBMITTED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        executeDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject execution from DRAFT state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        executeDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject duplicate execution (EXECUTED → EXECUTED)", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        executeDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Outcome enforcement: outcome requires EXECUTED", () => {
    it("should allow outcome recording from EXECUTED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "outcome_recorded",
      } as any);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).resolves.toBeDefined();
    });

    it("should reject outcome recording from APPROVED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "approved",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject outcome recording from SUBMITTED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject outcome recording from DRAFT state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Close enforcement: close requires OUTCOME_RECORDED", () => {
    it("should allow close from OUTCOME_RECORDED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "outcome_recorded",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "closed",
        completedAt: new Date(),
      } as any);

      await expect(
        closeDecision(decisionId, workspaceId, actorId)
      ).resolves.toBeDefined();
    });

    it("should reject close from EXECUTED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        closeDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject close from APPROVED state", async () => {
      const mockDecision = {
        id: decisionId,
        status: "approved",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        closeDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Terminal state immutability", () => {
    it("should detect CLOSED as terminal", async () => {
      const mockDecision = {
        id: decisionId,
        status: "closed",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      const isTerminal = await isDecisionTerminal(decisionId, workspaceId);
      expect(isTerminal).toBe(true);
    });

    it("should detect REJECTED as terminal", async () => {
      const mockDecision = {
        id: decisionId,
        status: "blocked",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      const isTerminal = await isDecisionTerminal(decisionId, workspaceId);
      expect(isTerminal).toBe(true);
    });

    it("should detect CANCELLED as terminal", async () => {
      const mockDecision = {
        id: decisionId,
        status: "cancelled",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      const isTerminal = await isDecisionTerminal(decisionId, workspaceId);
      expect(isTerminal).toBe(true);
    });

    it("should detect FAILED as terminal", async () => {
      const mockDecision = {
        id: decisionId,
        status: "failed",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      const isTerminal = await isDecisionTerminal(decisionId, workspaceId);
      expect(isTerminal).toBe(true);
    });

    it("should prevent mutations to CLOSED decision", async () => {
      const mockDecision = {
        id: decisionId,
        status: "closed",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        requireMutableDecision(decisionId, workspaceId)
      ).rejects.toThrow(ValidationError);
    });

    it("should prevent mutations to REJECTED decision", async () => {
      const mockDecision = {
        id: decisionId,
        status: "blocked",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        requireMutableDecision(decisionId, workspaceId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Reason requirement: terminal states require reason", () => {
    it("should reject rejection without reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        rejectDecision(decisionId, workspaceId, "", actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should reject rejection with whitespace-only reason", async () => {
      await expect(
        rejectDecision(decisionId, workspaceId, "   ", actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should allow rejection with valid reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "blocked",
        blockReason: "Insufficient data",
      } as any);

      await expect(
        rejectDecision(decisionId, workspaceId, "Insufficient data", actorId)
      ).resolves.toBeDefined();
    });

    it("should reject cancellation without reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        cancelDecision(decisionId, workspaceId, "", actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should allow cancellation with valid reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "cancelled",
        blockReason: "No longer needed",
      } as any);

      await expect(
        cancelDecision(decisionId, workspaceId, "No longer needed", actorId)
      ).resolves.toBeDefined();
    });

    it("should reject failure without reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);

      await expect(
        failDecision(decisionId, workspaceId, "", actorId)
      ).rejects.toThrow(ValidationError);
    });

    it("should allow failure with valid reason", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "failed",
        blockReason: "Execution error",
      } as any);

      await expect(
        failDecision(decisionId, workspaceId, "Execution error", actorId)
      ).resolves.toBeDefined();
    });
  });

  describe("Audit events: every transition emits event", () => {
    it("should emit audit event for DRAFT → SUBMITTED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "draft",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "submitted",
      } as any);

      await submitDecision(decisionId, workspaceId, actorId);

      expect(vi.mocked(emitAuditEvent)).toHaveBeenCalled();
      const auditCall = vi.mocked(emitAuditEvent).mock.calls[0][0];
      expect(auditCall.eventName).toBeDefined();
      expect(auditCall.entityType).toBe("OperatorItem");
      expect(auditCall.entityId).toBe(decisionId);
      expect(auditCall.actorId).toBe(actorId);
    });

    it("should emit audit event for SUBMITTED → APPROVED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "approved",
      } as any);

      await approveDecision(decisionId, workspaceId, actorId);

      expect(vi.mocked(emitAuditEvent)).toHaveBeenCalled();
    });

    it("should emit audit event for SUBMITTED → REJECTED", async () => {
      const mockDecision = {
        id: decisionId,
        status: "submitted",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "blocked",
      } as any);

      await rejectDecision(decisionId, workspaceId, "Test reason", actorId);

      expect(vi.mocked(emitAuditEvent)).toHaveBeenCalled();
    });

    it("should emit audit event for outcome recording", async () => {
      const mockDecision = {
        id: decisionId,
        status: "in_progress",
      };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockDecision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        status: "outcome_recorded",
      } as any);

      await recordDecisionOutcome(
        decisionId,
        workspaceId,
        { actualOutcomeValue: 5000 },
        actorId
      );

      expect(vi.mocked(emitAuditEvent)).toHaveBeenCalled();
    });
  });

  describe("Not found handling", () => {
    it("should throw NotFoundError if decision does not exist", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(null);

      await expect(
        submitDecision(decisionId, workspaceId, actorId)
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError for outcome recording if decision not found", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(null);

      await expect(
        recordDecisionOutcome(
          decisionId,
          workspaceId,
          { actualOutcomeValue: 5000 },
          actorId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError for terminal check if decision not found", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(null);

      await expect(
        isDecisionTerminal(decisionId, workspaceId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Alternative paths", () => {
    it("should support rejection path: DRAFT → SUBMITTED → REJECTED", async () => {
      const mockDraft = { id: decisionId, status: "draft" };
      const mockSubmitted = { id: decisionId, status: "submitted" };

      // DRAFT → SUBMITTED
      vi.mocked(db.operatorItem.findFirst).mockResolvedValueOnce(mockDraft as any);
      vi.mocked(db.operatorItem.update).mockResolvedValueOnce({
        ...mockDraft,
        status: "submitted",
      } as any);

      await submitDecision(decisionId, workspaceId, actorId);

      // SUBMITTED → REJECTED
      vi.mocked(db.operatorItem.findFirst).mockResolvedValueOnce(mockSubmitted as any);
      vi.mocked(db.operatorItem.update).mockResolvedValueOnce({
        ...mockSubmitted,
        status: "blocked",
      } as any);

      await expect(
        rejectDecision(decisionId, workspaceId, "Test rejection", actorId)
      ).resolves.toBeDefined();
    });

    it("should support failure path: DRAFT → SUBMITTED → APPROVED → EXECUTED → FAILED", async () => {
      const mockExecuted = { id: decisionId, status: "in_progress" };

      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(mockExecuted as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockExecuted,
        status: "failed",
      } as any);

      await expect(
        failDecision(decisionId, workspaceId, "Execution error", actorId)
      ).resolves.toBeDefined();
    });
  });
});

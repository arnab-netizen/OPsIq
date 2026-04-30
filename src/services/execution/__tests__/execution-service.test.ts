import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db and audit before importing the service
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/infra", () => ({
  emitAuditEvent: vi.fn(),
}));

import {
  executeDecision,
  markSuccess,
  markFailure,
} from "../execution-service";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra";

describe("Execution Service", () => {
  const mockDecision = {
    id: "d1",
    workspaceId: "ws-123",
    executionStatus: "pending",
    impactExpected: 500000,
    startedAt: null,
    completedAt: null,
    executedAt: null,
    executedBy: null,
    actualOutcomeValue: null,
    decisionAccuracy: null,
    blockReason: null,
    lastUpdatedBy: "user-001",
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeDecision", () => {
    it("should transition from pending to running", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      const result = await executeDecision("d1", "ws-123", "user-001");

      expect(result.executionStatus).toBe("running");
      expect(db.operatorItem.update).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: expect.objectContaining({
          executionStatus: "running",
        }),
      });
    });

    it("should emit audit event on start", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      await executeDecision("d1", "ws-123", "user-001");

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "decision.execution_started",
          workspaceId: "ws-123",
          entityId: "d1",
        })
      );
    });

    it("should prevent execution from non-pending state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow("Cannot execute decision with status");
    });

    it("should enforce workspace scoping", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(null);

      await expect(
        executeDecision("d1", "ws-456", "user-001")
      ).rejects.toThrow("Decision not found or access denied");
    });
  });

  describe("markSuccess", () => {
    it("should transition from running to success", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
        actualOutcomeValue: 600000,
        decisionAccuracy: 1.2,
      } as any);

      const result = await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(result.executionStatus).toBe("success");
      expect(result.actualOutcomeValue).toBe(600000);
    });

    it("should calculate decision accuracy", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
        impactExpected: 500000,
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
        actualOutcomeValue: 600000,
        decisionAccuracy: 1.2,
      } as any);

      const result = await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(result.decisionAccuracy).toBe(1.2);
    });

    it("should emit audit event with outcome details", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "decision.execution_success",
          payload: expect.objectContaining({
            actualOutcomeValue: 600000,
          }),
        })
      );
    });

    it("should prevent success from non-running state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "pending",
      } as any);

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow("Cannot mark success");
    });
  });

  describe("markFailure", () => {
    it("should transition from running to failed", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
      } as any);

      const result = await markFailure(
        "d1",
        "ws-123",
        "user-001",
        "Implementation blocked by vendor issue"
      );

      expect(result.executionStatus).toBe("failed");
    });

    it("should record failure reason", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
        blockReason: "Test reason",
      } as any);

      const result = await markFailure(
        "d1",
        "ws-123",
        "user-001",
        "Test reason"
      );

      expect(result.blockReason).toBe("Test reason");
    });

    it("should emit audit event on failure", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
      } as any);

      await markFailure("d1", "ws-123", "user-001", "Test failure reason");

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "decision.execution_failed",
          payload: expect.objectContaining({
            reason: "Test failure reason",
          }),
        })
      );
    });

    it("should require failure reason", async () => {
      await expect(
        markFailure("d1", "ws-123", "user-001", "")
      ).rejects.toThrow("Failure reason is required");

      await expect(
        markFailure("d1", "ws-123", "user-001", "   ")
      ).rejects.toThrow("Failure reason is required");
    });

    it("should prevent failure from non-running state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await expect(
        markFailure("d1", "ws-123", "user-001", "Failure reason")
      ).rejects.toThrow("Cannot mark failure");
    });
  });

  describe("Execution Lifecycle", () => {
    it("should flow: pending -> running -> success", async () => {
      // Start execution
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      const running = await executeDecision("d1", "ws-123", "user-001");
      expect(running.executionStatus).toBe("running");

      // Mark success
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...running,
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...running,
        executionStatus: "success",
        actualOutcomeValue: 600000,
      } as any);

      const success = await markSuccess("d1", "ws-123", "user-001", 600000);
      expect(success.executionStatus).toBe("success");
    });

    it("should flow: pending -> running -> failed", async () => {
      // Start execution
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      const running = await executeDecision("d1", "ws-123", "user-001");
      expect(running.executionStatus).toBe("running");

      // Mark failure
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...running,
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...running,
        executionStatus: "failed",
      } as any);

      const failed = await markFailure(
        "d1",
        "ws-123",
        "user-001",
        "Execution blocked"
      );
      expect(failed.executionStatus).toBe("failed");
    });
  });

  describe("Audit Logging", () => {
    it("should emit audit events with workspace scoping", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      await executeDecision("d1", "ws-123", "user-001");

      const auditCall = vi.mocked(emitAuditEvent).mock.calls[0][0];
      expect(auditCall.workspaceId).toBe("ws-123");
      expect(auditCall.entityId).toBe("d1");
      expect(auditCall.actorId).toBe("user-001");
    });

    it("should record before and after states in audit", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
        actualOutcomeValue: 600000,
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      const auditCall = vi.mocked(emitAuditEvent).mock.calls[0][0];
      expect(auditCall.payload).toEqual(
        expect.objectContaining({
          status: "success",
          actualOutcomeValue: 600000,
        })
      );
    });
  });
});

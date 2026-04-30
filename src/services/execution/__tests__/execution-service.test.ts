import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db and audit before importing the service
vi.mock("@/lib/db", () => {
  const mockFindFirst = vi.fn();
  const mockUpdateMany = vi.fn();

  return {
    db: {
      operatorItem: {
        findFirst: mockFindFirst,
        update: vi.fn(),
        updateMany: mockUpdateMany,
      },
      $transaction: vi.fn((callback: any) => {
        const mockTx = {
          operatorItem: {
            updateMany: mockUpdateMany,
            findFirst: mockFindFirst,
          },
        };
        return callback(mockTx);
      }),
    },
  };
});

vi.mock("@/infra", () => ({
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/services/metrics/decision-metrics-service", () => ({
  recordDecisionMetrics: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  executeDecision,
  markSuccess,
  markFailure,
} from "../execution-service";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra";
import { recordDecisionMetrics } from "@/services/metrics/decision-metrics-service";
import { logger } from "@/infra/logger";

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
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      const result = await executeDecision("d1", "ws-123", "user-001");

      expect(result.executionStatus).toBe("running");
      expect(vi.mocked(db.operatorItem.updateMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            executionStatus: "pending",
          }),
          data: expect.objectContaining({
            executionStatus: "running",
          }),
        })
      );
    });

    it("should emit audit event on start", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
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
      ).rejects.toThrow("Cannot execute decision: execution status must be 'pending'");
    });

    it("should enforce workspace scoping", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(null);

      await expect(
        executeDecision("d1", "ws-456", "user-001")
      ).rejects.toThrow("Decision not found or access denied");
    });
  });

  describe("markSuccess", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should transition from running to success", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          actualOutcomeValue: 600000,
          decisionAccuracy: 1.2,
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      const result = await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(result.executionStatus).toBe("success");
      expect(result.actualOutcomeValue).toBe(600000);
    });

    it("should calculate decision accuracy", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          impactExpected: 500000,
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          actualOutcomeValue: 600000,
          decisionAccuracy: 1.2,
          impactExpected: 500000,
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      const result = await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(result.decisionAccuracy).toBe(1.2);
    });

    it("should emit audit event with outcome details", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
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
      ).rejects.toThrow("Cannot mark success: execution status must be 'running'");
    });
  });

  describe("markFailure", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should transition from running to failed", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "failed",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
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
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "failed",
          blockReason: "Test reason",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
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
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "failed",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
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
      ).rejects.toThrow("Cannot mark failure: execution status must be 'running'");
    });
  });

  describe("Execution Lifecycle", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should flow: pending -> running -> success", async () => {
      // Start execution
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          actualOutcomeValue: 600000,
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      const running = await executeDecision("d1", "ws-123", "user-001");
      expect(running.executionStatus).toBe("running");

      // Mark success
      const success = await markSuccess("d1", "ws-123", "user-001", 600000);
      expect(success.executionStatus).toBe("success");
    });

    it("should flow: pending -> running -> failed", async () => {
      // Start execution
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "failed",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      const running = await executeDecision("d1", "ws-123", "user-001");
      expect(running.executionStatus).toBe("running");

      // Mark failure
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
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      await executeDecision("d1", "ws-123", "user-001");

      const auditCall = vi.mocked(emitAuditEvent).mock.calls[0][0];
      expect(auditCall.workspaceId).toBe("ws-123");
      expect(auditCall.entityId).toBe("d1");
      expect(auditCall.actorId).toBe("user-001");
    });

    it("should record before and after states in audit", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);

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

  describe("Metrics Recording", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should record metrics on successful execution", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          problemType: "revenue_leak",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          problemType: "revenue_leak",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(vi.mocked(recordDecisionMetrics)).toHaveBeenCalledWith(
        "ws-123",
        expect.objectContaining({
          success: true,
          actualOutcome: 600000,
          expectedOutcome: 500000,
        })
      );
    });

    it("should record metrics on failed execution", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          problemType: "cost_overrun",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "failed",
          problemType: "cost_overrun",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);

      await markFailure("d1", "ws-123", "user-001", "Execution blocked");

      expect(vi.mocked(recordDecisionMetrics)).toHaveBeenCalledWith(
        "ws-123",
        expect.objectContaining({
          success: false,
          actualOutcome: 0,
        })
      );
    });

    it("should include problem type in metrics", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          problemType: "growth_block",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          problemType: "growth_block",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(vi.mocked(recordDecisionMetrics)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          problemType: "growth_block",
        })
      );
    });

    it("should include action taken in metrics", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          action: "Reduce pricing",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          action: "Reduce pricing",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(vi.mocked(recordDecisionMetrics)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          actionTaken: "Reduce pricing",
        })
      );
    });

    it("should not block execution if metrics recording fails", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);
      vi.mocked(recordDecisionMetrics).mockRejectedValue(
        new Error("Metrics error")
      );

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).resolves.not.toThrow();

      expect(vi.mocked(logger.warn)).toHaveBeenCalled();
    });

    it("should use default problem type if missing", async () => {
      vi.mocked(db.operatorItem.findFirst)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "running",
          problemType: null,
        } as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          executionStatus: "success",
          problemType: null,
        } as any);
      vi.mocked(db.operatorItem.updateMany).mockResolvedValue({
        count: 1,
      } as any);

      await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(vi.mocked(recordDecisionMetrics)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          problemType: "general",
        })
      );
    });
  });

  describe("Execution Locking (Concurrency Control)", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should use atomic transaction for executeDecision", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );

      let transactionCallback: any;
      vi.mocked(db.$transaction).mockImplementation((cb: any) => {
        transactionCallback = cb;
        return cb({
          operatorItem: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findFirst: vi.fn().mockResolvedValue({
              ...mockDecision,
              executionStatus: "running",
            }),
          },
        });
      });

      const result = await executeDecision("d1", "ws-123", "user-001");

      expect(result.executionStatus).toBe("running");
      expect(vi.mocked(db.$transaction)).toHaveBeenCalled();
    });

    it("should reject duplicate executeDecision if lock acquired by another request", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        mockDecision as any
      );

      vi.mocked(db.$transaction).mockImplementation((cb: any) => {
        return cb({
          operatorItem: {
            updateMany: vi
              .fn()
              .mockResolvedValue({ count: 0 }),
            findFirst: vi.fn(),
          },
        });
      });

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow("Execution lock acquired by another request");
    });

    it("should use atomic transaction for markSuccess", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      vi.mocked(db.$transaction).mockImplementation((cb: any) => {
        return cb({
          operatorItem: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findFirst: vi.fn().mockResolvedValue({
              ...mockDecision,
              executionStatus: "success",
              actualOutcomeValue: 600000,
            }),
          },
        });
      });

      const result = await markSuccess("d1", "ws-123", "user-001", 600000);

      expect(result.executionStatus).toBe("success");
      expect(vi.mocked(db.$transaction)).toHaveBeenCalled();
    });

    it("should reject duplicate markSuccess if state changed", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      vi.mocked(db.$transaction).mockImplementation((cb: any) => {
        return cb({
          operatorItem: {
            updateMany: vi
              .fn()
              .mockResolvedValue({ count: 0 }),
            findFirst: vi.fn(),
          },
        });
      });

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow("Execution already completed");
    });

    it("should reject duplicate markFailure if state changed", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      vi.mocked(db.$transaction).mockImplementation((cb: any) => {
        return cb({
          operatorItem: {
            updateMany: vi
              .fn()
              .mockResolvedValue({ count: 0 }),
            findFirst: vi.fn(),
          },
        });
      });

      await expect(
        markFailure("d1", "ws-123", "user-001", "Failure reason")
      ).rejects.toThrow("Execution already completed");
    });
  });

  describe("State Machine Enforcement", () => {
    beforeEach(() => {
      vi.mocked(recordDecisionMetrics).mockResolvedValue({} as any);
    });

    it("should strictly require 'pending' status for executeDecision", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "not_started",
      } as any);

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow(
        "Cannot execute decision: execution status must be 'pending', got 'not_started'"
      );
    });

    it("should reject executeDecision from running state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "running",
      } as any);

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow("Cannot execute decision");
    });

    it("should reject executeDecision from success state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow("Cannot execute decision");
    });

    it("should reject executeDecision from failed state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
      } as any);

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow("Cannot execute decision");
    });

    it("should strictly require 'running' status for markSuccess", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "pending",
      } as any);

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow(
        "Cannot mark success: execution status must be 'running', got 'pending'"
      );
    });

    it("should strictly require 'running' status for markFailure", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "pending",
      } as any);

      await expect(
        markFailure("d1", "ws-123", "user-001", "Failure reason")
      ).rejects.toThrow(
        "Cannot mark failure: execution status must be 'running', got 'pending'"
      );
    });

    it("should reject markSuccess from success state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow("Cannot mark success");
    });

    it("should reject markSuccess from failed state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
      } as any);

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow("Cannot mark success");
    });

    it("should reject markFailure from success state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "success",
      } as any);

      await expect(
        markFailure("d1", "ws-123", "user-001", "Failure reason")
      ).rejects.toThrow("Cannot mark failure");
    });

    it("should reject markFailure from failed state", async () => {
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue({
        ...mockDecision,
        executionStatus: "failed",
      } as any);

      await expect(
        markFailure("d1", "ws-123", "user-001", "Failure reason")
      ).rejects.toThrow("Cannot mark failure");
    });

    it("should prevent reversal of transitions", async () => {
      const successDecision = { ...mockDecision, executionStatus: "success" };
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(
        successDecision as any
      );

      await expect(
        executeDecision("d1", "ws-123", "user-001")
      ).rejects.toThrow();

      await expect(
        markSuccess("d1", "ws-123", "user-001", 600000)
      ).rejects.toThrow();

      await expect(
        markFailure("d1", "ws-123", "user-001", "Reason")
      ).rejects.toThrow();
    });
  });
});

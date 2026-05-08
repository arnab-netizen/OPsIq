import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAction, updateActionStatus } from "@/services/action";
import { ValidationError, ConflictError } from "@/infra/errors";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { TEST_IDS } from "@/domain/constants/test-ids";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    action: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("Action Service", () => {
  const mockAction = {
    id: "action-1",
    engagementId: "engagement-1",
    title: "Test Action",
    status: "draft" as const,
    version: 1,
    blockerReason: null,
  };

  const actorId = TEST_IDS.TEST_ACTOR_ID;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateActionStatus", () => {
    it("should reject invalid status", async () => {
      (db.action.findUnique as any).mockResolvedValue(mockAction);

      const promise = updateActionStatus(
        mockAction.id,
        {
          status: "invalid_status" as any,
          version: 1,
        },
        actorId
      );

      await expect(promise).rejects.toThrow(ValidationError);
      await expect(promise).rejects.toThrow(/Invalid action status/);
    });

    it("should reject invalid transition", async () => {
      (db.action.findUnique as any).mockResolvedValue(mockAction);

      const promise = updateActionStatus(
        mockAction.id,
        {
          status: "completed", // Can't go from draft to completed directly
          version: 1,
        },
        actorId
      );

      await expect(promise).rejects.toThrow(ValidationError);
      await expect(promise).rejects.toThrow(/Invalid action transition/);
    });

    it("should reject stale version", async () => {
      (db.action.findUnique as any).mockResolvedValue({
        ...mockAction,
        version: 2, // Current version is 2
      });

      const promise = updateActionStatus(
        mockAction.id,
        {
          status: "assigned",
          version: 1, // Trying to update with stale version 1
        },
        actorId
      );

      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow(/Current version: 2/);
    });

    it("should succeed with valid transition and version", async () => {
      (db.action.findUnique as any)
        .mockResolvedValueOnce(mockAction) // Initial lookup
        .mockResolvedValueOnce({
          ...mockAction,
          status: "assigned",
          version: 2,
        }); // After update

      (db.action.updateMany as any).mockResolvedValue({ count: 1 });

      const result = await updateActionStatus(
        mockAction.id,
        {
          status: "assigned",
          version: 1,
        },
        actorId
      );

      expect(result.status).toBe("assigned");
      expect(result.version).toBe(2);
      expect(db.action.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockAction.id,
          version: 1,
        },
        data: {
          status: "assigned",
          blockerReason: null,
          version: { increment: 1 },
        },
      });
    });

    it("should emit audit event on successful update", async () => {
      (db.action.findUnique as any)
        .mockResolvedValueOnce(mockAction)
        .mockResolvedValueOnce({
          ...mockAction,
          status: "assigned",
          version: 2,
        });

      (db.action.updateMany as any).mockResolvedValue({ count: 1 });

      await updateActionStatus(
        mockAction.id,
        {
          status: "assigned",
          version: 1,
        },
        actorId
      );

      await expect(emitAuditEvent).toHaveBeenCalledWith({
        eventName: expect.anything(),
        actorId,
        entityType: "action",
        entityId: mockAction.id,
        payload: {
          previousStatus: "draft",
          newStatus: "assigned",
          blockerReason: undefined,
        },
        visibility: "internal",
      });
    });

    it("should throw conflict error if optimistic lock fails", async () => {
      (db.action.findUnique as any).mockResolvedValue(mockAction);
      (db.action.updateMany as any).mockResolvedValue({ count: 0 }); // No rows updated

      const promise = updateActionStatus(
        mockAction.id,
        {
          status: "assigned",
          version: 1,
        },
        actorId
      );

      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow(/modified by another process/);
    });

    it("should preserve blockerReason on transition", async () => {
      const actionWithBlockage = {
        ...mockAction,
        status: "blocked" as const,
        version: 2,
        blockerReason: "Waiting for client",
      };

      (db.action.findUnique as any)
        .mockResolvedValueOnce(actionWithBlockage)
        .mockResolvedValueOnce({
          ...actionWithBlockage,
          status: "assigned",
          version: 3,
        });

      (db.action.updateMany as any).mockResolvedValue({ count: 1 });

      await updateActionStatus(
        mockAction.id,
        {
          status: "assigned",
          version: 2,
        },
        actorId
      );

      expect(db.action.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockAction.id,
          version: 2,
        },
        data: {
          status: "assigned",
          blockerReason: "Waiting for client",
          version: { increment: 1 },
        },
      });
    });

    it("should allow noop transition (same status)", async () => {
      (db.action.findUnique as any)
        .mockResolvedValueOnce(mockAction)
        .mockResolvedValueOnce({
          ...mockAction,
          version: 2,
        });

      (db.action.updateMany as any).mockResolvedValue({ count: 1 });

      const result = await updateActionStatus(
        mockAction.id,
        {
          status: "draft", // Same as current
          version: 1,
        },
        actorId
      );

      expect(result.status).toBe("draft");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    auditEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { emitAuditEvent } from "../audit";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

describe("Audit Fail-Safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock findFirst to return null (no previous event in chain)
    vi.mocked(db.auditEvent.findFirst).mockResolvedValue(null);
  });

  describe("Missing workspaceId Guard", () => {
    it("should fail-safe when workspaceId is missing", async () => {
      const result = await emitAuditEvent({
        eventName: "user.logged_in",
        actorId: "user-001",
        entityType: "User",
      });

      expect(result).toBe("fail-safe-no-workspace-id");
    });

    it("should log warning when workspaceId is missing", async () => {
      await emitAuditEvent({
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        "Audit event emitted without workspaceId - fail-safe activated",
        expect.objectContaining({
          eventName: "user.logged_in",
          reason: "workspaceId is required for workspace isolation",
        })
      );
    });

    it("should not create audit event when workspaceId is missing", async () => {
      await emitAuditEvent({
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      expect(vi.mocked(db.auditEvent.create)).not.toHaveBeenCalled();
    });

    it("should not throw when workspaceId is missing (fail-safe continues)", async () => {
      const call = async () => {
        await emitAuditEvent({
          eventName: "user.logged_in",
          actorId: "user-001",
        });
      };

      await expect(call()).resolves.not.toThrow();
    });
  });

  describe("Successful Audit with workspaceId", () => {
    it("should create audit event when workspaceId is provided", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-123",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
        entityType: "User",
      });

      expect(vi.mocked(db.auditEvent.create)).toHaveBeenCalled();
    });

    it("should log info when audit event created", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-123",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
        entityType: "User",
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Audit event emitted with hash chain",
        expect.objectContaining({
          eventName: "user.logged_in",
          auditEventId: "event-123",
        })
      );
    });

    it("should return audit event ID", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-456",
      } as any);

      const result = await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      expect(result).toBe("event-456");
    });

    it("should include workspaceId in database create call", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-789",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      expect(vi.mocked(db.auditEvent.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-123",
        }),
      });
    });
  });

  describe("Workspace Isolation", () => {
    it("should track different workspaces separately", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-1",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      await emitAuditEvent({
        workspaceId: "ws-456",
        eventName: "user.logged_in",
        actorId: "user-002",
      });

      const calls = vi.mocked(db.auditEvent.create).mock.calls;
      expect(calls[0][0].data.workspaceId).toBe("ws-123");
      expect(calls[1][0].data.workspaceId).toBe("ws-456");
    });

    it("should preserve workspace isolation when workspaceId omitted", async () => {
      // First call with workspace
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-1",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
      });

      // Second call without workspace (fail-safe)
      const result = await emitAuditEvent({
        eventName: "user.logged_in",
        actorId: "user-002",
      });

      // Should have created only one event (first one)
      expect(vi.mocked(db.auditEvent.create)).toHaveBeenCalledTimes(1);
      expect(result).toBe("fail-safe-no-workspace-id");
    });
  });

  describe("Backwards Compatibility", () => {
    it("should accept all optional fields except workspaceId", async () => {
      vi.mocked(db.auditEvent.create).mockResolvedValue({
        id: "event-123",
      } as any);

      await emitAuditEvent({
        workspaceId: "ws-123",
        eventName: "user.logged_in",
        actorId: "user-001",
        actorType: "user",
        entityType: "User",
        entityId: "user-001",
        payload: { ip: "127.0.0.1" },
        correlationId: "corr-123",
        visibility: "internal",
      });

      expect(vi.mocked(db.auditEvent.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-123",
          eventName: "user.logged_in",
          actorId: "user-001",
          actorType: "user",
          entityType: "User",
          entityId: "user-001",
          correlationId: "corr-123",
          visibility: "internal",
        }),
      });
    });
  });

  describe("Fail-Safe Logging Details", () => {
    it("should log eventName in warning", async () => {
      await emitAuditEvent({
        eventName: "decision.execution_started",
        actorId: "user-001",
      });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          eventName: "decision.execution_started",
        })
      );
    });

    it("should log entityType in warning", async () => {
      await emitAuditEvent({
        eventName: "decision.execution_started",
        entityType: "OperatorItem",
        actorId: "user-001",
      });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entityType: "OperatorItem",
        })
      );
    });

    it("should log entityId in warning", async () => {
      await emitAuditEvent({
        eventName: "decision.execution_started",
        entityId: "d-123",
        actorId: "user-001",
      });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entityId: "d-123",
        })
      );
    });
  });
});

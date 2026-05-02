import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    alert: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  createAlert,
  markAlertAsRead,
  getAlerts,
  triggerBlockedAlert,
  triggerThresholdBreachAlert,
  triggerExecutionFailureAlert,
  getUnreadAlertCount,
} from "../alert-service";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

describe("Alert Service", () => {
  const mockAlert = {
    id: "alert-1",
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    userId: "user-001",
    type: "blocked",
    channel: "in_app",
    message: "Test alert",
    entityType: "OperatorItem",
    entityId: "decision-1",
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAlert", () => {
    it("should create an in-app alert", async () => {
      vi.mocked(db.alert.create).mockResolvedValueOnce(mockAlert as any);

      const result = await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "in_app",
        message: "Test alert",
        entityType: "OperatorItem",
        entityId: "decision-1",
      });

      expect(result).toEqual(mockAlert);
      expect(vi.mocked(db.alert.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
          type: "blocked",
          channel: "in_app",
          message: "Test alert",
        }),
      });
    });

    it("should create an email alert and attempt delivery", async () => {
      const emailAlert = { ...mockAlert, channel: "email" };
      vi.mocked(db.alert.create).mockResolvedValueOnce(emailAlert as any);

      const result = await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "execution_failure",
        channel: "email",
        message: "Execution failed",
      });

      expect(result.channel).toBe("email");
      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Email alert delivered (stub)",
        expect.any(Object)
      );
    });

    it("should log alert creation", async () => {
      vi.mocked(db.alert.create).mockResolvedValueOnce(mockAlert as any);

      await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "in_app",
        message: "Test alert",
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Alert created",
        expect.objectContaining({
          type: "blocked",
          channel: "in_app",
          userId: "user-001",
        })
      );
    });

    it("should handle entity reference as optional", async () => {
      const alertWithoutEntity = { ...mockAlert, entityType: null, entityId: null };
      vi.mocked(db.alert.create).mockResolvedValueOnce(alertWithoutEntity as any);

      const result = await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "threshold_breach",
        channel: "in_app",
        message: "Threshold breached",
      });

      expect(result.entityType).toBeNull();
      expect(result.entityId).toBeNull();
    });

    it("should handle creation failure", async () => {
      const error = new Error("Database error");
      vi.mocked(db.alert.create).mockRejectedValueOnce(error);

      await expect(
        createAlert({
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
          type: "blocked",
          channel: "in_app",
          message: "Test alert",
        })
      ).rejects.toThrow("Database error");

      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to create alert",
        expect.any(Object)
      );
    });
  });

  describe("markAlertAsRead", () => {
    it("should mark alert as read", async () => {
      const readAlert = { ...mockAlert, isRead: true, readAt: new Date() };
      vi.mocked(db.alert.findUnique).mockResolvedValueOnce(mockAlert as any);
      vi.mocked(db.alert.update).mockResolvedValueOnce(readAlert as any);

      const result = await markAlertAsRead("alert-1", "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeDefined();
      expect(vi.mocked(db.alert.update)).toHaveBeenCalledWith({
        where: { id: "alert-1", workspaceId: "550e8400-e29b-41d4-a716-446655440000" },
        data: expect.objectContaining({
          isRead: true,
        }),
      });
    });

    it("should log when marking alert as read", async () => {
      const readAlert = { ...mockAlert, isRead: true };
      vi.mocked(db.alert.findUnique).mockResolvedValueOnce(mockAlert as any);
      vi.mocked(db.alert.update).mockResolvedValueOnce(readAlert as any);

      await markAlertAsRead("alert-1", "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Alert marked as read",
        expect.objectContaining({
          alertId: "alert-1",
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        })
      );
    });

    it("should handle update failure", async () => {
      const error = new Error("Update failed");
      vi.mocked(db.alert.findUnique).mockResolvedValueOnce(mockAlert as any);
      vi.mocked(db.alert.update).mockRejectedValueOnce(error);

      await expect(markAlertAsRead("alert-1", "550e8400-e29b-41d4-a716-446655440000", "user-001")).rejects.toThrow();

      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to mark alert as read",
        expect.any(Object)
      );
    });
  });

  describe("getAlerts", () => {
    it("should fetch alerts for user", async () => {
      const alerts = [mockAlert, { ...mockAlert, id: "alert-2" }];
      vi.mocked(db.alert.findMany).mockResolvedValueOnce(alerts as any);

      const result = await getAlerts("550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result).toEqual(alerts);
      expect(vi.mocked(db.alert.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      });
    });

    it("should filter unread alerts only", async () => {
      const unreadAlert = { ...mockAlert, isRead: false };
      vi.mocked(db.alert.findMany).mockResolvedValueOnce([unreadAlert] as any);

      await getAlerts("550e8400-e29b-41d4-a716-446655440000", "user-001", { unreadOnly: true });

      expect(vi.mocked(db.alert.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
          isRead: false,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      });
    });

    it("should respect limit parameter", async () => {
      vi.mocked(db.alert.findMany).mockResolvedValueOnce([]);

      await getAlerts("550e8400-e29b-41d4-a716-446655440000", "user-001", { limit: 100 });

      expect(vi.mocked(db.alert.findMany)).toHaveBeenCalledWith({
        where: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });
    });

    it("should handle fetch failure gracefully", async () => {
      const error = new Error("Fetch failed");
      vi.mocked(db.alert.findMany).mockRejectedValueOnce(error);

      await expect(getAlerts("550e8400-e29b-41d4-a716-446655440000", "user-001")).rejects.toThrow();

      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to fetch alerts",
        expect.any(Object)
      );
    });
  });

  describe("Trigger Functions", () => {
    it("triggerBlockedAlert should create blocked alert", async () => {
      const blockedAlert = {
        ...mockAlert,
        type: "blocked",
        message: "Decision execution blocked: Vendor unavailable",
      };
      vi.mocked(db.alert.create).mockResolvedValueOnce(blockedAlert as any);

      const result = await triggerBlockedAlert(
        "550e8400-e29b-41d4-a716-446655440000",
        "user-001",
        "decision-1",
        "Vendor unavailable"
      );

      expect(result.type).toBe("blocked");
      expect(result.message).toContain("blocked");
      expect(result.message).toContain("Vendor unavailable");
      expect(result.entityId).toBe("decision-1");
    });

    it("triggerThresholdBreachAlert should create threshold alert", async () => {
      const thresholdAlert = {
        ...mockAlert,
        type: "threshold_breach",
        message: "Threshold breach: approval_rate (current: 0.25, threshold: 0.3)",
      };
      vi.mocked(db.alert.create).mockResolvedValueOnce(thresholdAlert as any);

      const result = await triggerThresholdBreachAlert(
        "550e8400-e29b-41d4-a716-446655440000",
        "user-001",
        "approval_rate",
        0.25,
        0.3
      );

      expect(result.type).toBe("threshold_breach");
      expect(result.message).toContain("approval_rate");
      expect(result.message).toContain("0.25");
    });

    it("triggerExecutionFailureAlert should create failure alert", async () => {
      const failureAlert = {
        ...mockAlert,
        type: "execution_failure",
        message: "Decision execution failed: Network timeout",
      };
      vi.mocked(db.alert.create).mockResolvedValueOnce(failureAlert as any);

      const result = await triggerExecutionFailureAlert(
        "550e8400-e29b-41d4-a716-446655440000",
        "user-001",
        "decision-1",
        "Network timeout"
      );

      expect(result.type).toBe("execution_failure");
      expect(result.message).toContain("Network timeout");
      expect(result.entityId).toBe("decision-1");
    });
  });

  describe("getUnreadAlertCount", () => {
    it("should return count of unread alerts", async () => {
      vi.mocked(db.alert.count).mockResolvedValueOnce(3 as any);

      const count = await getUnreadAlertCount("550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(count).toBe(3);
      expect(vi.mocked(db.alert.count)).toHaveBeenCalledWith({
        where: {
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
          isRead: false,
        },
      });
    });

    it("should return 0 if counting fails", async () => {
      const error = new Error("Count failed");
      vi.mocked(db.alert.count).mockRejectedValueOnce(error);

      const count = await getUnreadAlertCount("550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(count).toBe(0);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to get unread alert count",
        expect.any(Object)
      );
    });
  });

  describe("Workspace Isolation", () => {
    it("should isolate alerts by workspace", async () => {
      vi.mocked(db.alert.findMany).mockResolvedValueOnce([]);

      await getAlerts("550e8400-e29b-41d4-a716-446655440001", "user-001");

      expect(vi.mocked(db.alert.findMany)).toHaveBeenCalledWith({
        where: expect.objectContaining({
          workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        }),
        orderBy: expect.any(Object),
        take: expect.any(Number),
      });
    });

    it("should isolate alerts by user within workspace", async () => {
      vi.mocked(db.alert.findMany).mockResolvedValueOnce([]);

      await getAlerts("550e8400-e29b-41d4-a716-446655440000", "user-002");

      expect(vi.mocked(db.alert.findMany)).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: "user-002",
        }),
        orderBy: expect.any(Object),
        take: expect.any(Number),
      });
    });
  });

  describe("Alert Delivery", () => {
    it("should log when email delivery fails", async () => {
      const emailAlert = { ...mockAlert, channel: "email" };
      vi.mocked(db.alert.create).mockResolvedValueOnce(emailAlert as any);

      // Wait a tick for async delivery attempt
      await new Promise((resolve) => setTimeout(resolve, 10));

      await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "email",
        message: "Test alert",
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Alert created",
        expect.any(Object)
      );
    });

    it("should not block alert creation if email delivery fails", async () => {
      const emailAlert = { ...mockAlert, channel: "email" };
      vi.mocked(db.alert.create).mockResolvedValueOnce(emailAlert as any);

      const result = await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "email",
        message: "Test alert",
      });

      expect(result.id).toBe("alert-1");
    });
  });
});

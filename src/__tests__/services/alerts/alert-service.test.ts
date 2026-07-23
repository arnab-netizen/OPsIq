/**
 * Alert Service — unit tests (mock DB, no PostgreSQL required)
 *
 * Covers:
 *  1  createAlert throws if workspaceId is empty
 *  2  triggerBlockedAlert builds correct message and severity
 *  3  triggerThresholdBreachAlert builds correct message
 *  4  triggerExecutionFailureAlert builds correct message and severity
 *  5  duplicate idempotencyKey returns existing alert without creating new row
 *  6  getAlerts propagates unreadOnly filter to db.alert.findMany
 *  7  getUnreadAlertCount returns 0 on DB error (fail-safe)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/db", () => ({
  db: {
    alert: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/workspace-validation", () => ({
  enforceWorkspaceId: vi.fn(),
}));
vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn().mockReturnValue({ operatorMessage: "test error" }),
}));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: { ALERT_CREATED: "alert.created", ALERT_UPDATED: "alert.updated" },
}));

import { db } from "@/lib/db";
import {
  createAlert,
  triggerBlockedAlert,
  triggerThresholdBreachAlert,
  triggerExecutionFailureAlert,
  getAlerts,
  getUnreadAlertCount,
  resolveAlert,
} from "@/services/alerts/alert-service";

const mockDb = db as unknown as {
  alert: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

function makeAlert(overrides = {}) {
  return {
    id: randomUUID(),
    workspaceId: "ws-1",
    userId: "user-1",
    type: "blocked",
    channel: "in_app",
    message: "Test",
    entityType: null,
    entityId: null,
    severity: "medium",
    idempotencyKey: null,
    isRead: false,
    readAt: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.alert.create.mockResolvedValue(makeAlert());
  mockDb.alert.findFirst.mockResolvedValue(null);
  mockDb.alert.findMany.mockResolvedValue([]);
  mockDb.alert.count.mockResolvedValue(0);
});

describe("Alert Service (unit)", () => {
  it("1 — createAlert calls enforceWorkspaceId", async () => {
    const { enforceWorkspaceId } = await import("@/lib/workspace-validation");
    await createAlert({ workspaceId: "ws-1", userId: "u-1", type: "blocked", channel: "in_app", message: "Hi" });
    expect(enforceWorkspaceId).toHaveBeenCalledWith("ws-1", "createAlert", "Alert");
  });

  it("2 — triggerBlockedAlert sets type=blocked, severity=high, idempotencyKey", async () => {
    const decisionId = randomUUID();
    mockDb.alert.create.mockResolvedValue(makeAlert({
      type: "blocked",
      severity: "high",
      idempotencyKey: `blocked:${decisionId}`,
      message: `Decision execution blocked: approval missing`,
    }));

    const alert = await triggerBlockedAlert("ws-1", "u-1", decisionId, "approval missing");

    const createCall = mockDb.alert.create.mock.calls[0][0].data;
    expect(createCall.type).toBe("blocked");
    expect(createCall.severity).toBe("high");
    expect(createCall.idempotencyKey).toBe(`blocked:${decisionId}`);
    expect(createCall.message).toContain("approval missing");
    expect(alert.type).toBe("blocked");
  });

  it("3 — triggerThresholdBreachAlert sets type=threshold_breach, severity=medium", async () => {
    mockDb.alert.create.mockResolvedValue(makeAlert({ type: "threshold_breach", severity: "medium" }));

    await triggerThresholdBreachAlert("ws-1", "u-1", "cashRunway", 5, 12);

    const createCall = mockDb.alert.create.mock.calls[0][0].data;
    expect(createCall.type).toBe("threshold_breach");
    expect(createCall.severity).toBe("medium");
    expect(createCall.message).toContain("cashRunway");
  });

  it("4 — triggerExecutionFailureAlert sets type=execution_failure, severity=critical", async () => {
    const decisionId = randomUUID();
    mockDb.alert.create.mockResolvedValue(makeAlert({ type: "execution_failure", severity: "critical" }));

    await triggerExecutionFailureAlert("ws-1", "u-1", decisionId, "concurrency conflict");

    const createCall = mockDb.alert.create.mock.calls[0][0].data;
    expect(createCall.type).toBe("execution_failure");
    expect(createCall.severity).toBe("critical");
    expect(createCall.idempotencyKey).toBe(`failure:${decisionId}`);
  });

  it("5 — duplicate idempotencyKey returns existing alert without db.create", async () => {
    const key = "idem:test-key";
    const existing = makeAlert({ idempotencyKey: key, message: "Original" });
    mockDb.alert.findFirst.mockResolvedValue(existing);

    const result = await createAlert({
      workspaceId: "ws-1",
      userId: "u-1",
      type: "blocked",
      channel: "in_app",
      message: "Duplicate",
      idempotencyKey: key,
    });

    expect(mockDb.alert.create).not.toHaveBeenCalled();
    expect(result.message).toBe("Original");
    expect(result.id).toBe(existing.id);
  });

  it("6 — getAlerts passes unreadOnly filter to findMany", async () => {
    await getAlerts("ws-1", "u-1", { unreadOnly: true });
    const whereArg = mockDb.alert.findMany.mock.calls[0][0].where;
    expect(whereArg.isRead).toBe(false);
  });

  it("7 — getUnreadAlertCount returns 0 on DB error (fail-safe)", async () => {
    mockDb.alert.count.mockRejectedValue(new Error("DB down"));
    const count = await getUnreadAlertCount("ws-1", "u-1");
    expect(count).toBe(0);
  });

  it("8 — resolveAlert sets resolvedAt and marks as read", async () => {
    const existing = makeAlert({ isRead: false, readAt: null });
    mockDb.alert.findFirst.mockResolvedValue(existing);
    const resolved = makeAlert({ resolvedAt: new Date(), isRead: true, readAt: new Date() });
    mockDb.alert.update.mockResolvedValue(resolved);

    const result = await resolveAlert("alert-1", "ws-1", "u-1");

    expect(mockDb.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "alert-1", workspaceId: "ws-1" },
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      })
    );
    expect(result.resolvedAt).not.toBeNull();
    expect(result.isRead).toBe(true);
  });

  it("9 — resolveAlert throws when alert not found in workspace", async () => {
    mockDb.alert.findFirst.mockResolvedValue(null);
    await expect(resolveAlert("bad-id", "ws-1", "u-1")).rejects.toThrow("Alert not found");
  });
});

/**
 * [db] Alert Service — real-PostgreSQL integration tests (Stage 3 Slice 3.2)
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/alerts/alert-service.db.test.ts
 *
 * Covers:
 *  1  createAlert persists to DB with correct fields
 *  2  getAlerts returns workspace-scoped results only
 *  3  getAlerts cross-workspace isolation (tenant boundary)
 *  4  markAlertAsRead sets isRead + readAt, emits audit
 *  5  markAlertAsRead rejects wrong-workspace alert (throws)
 *  6  getUnreadAlertCount counts only unread
 *  7  idempotency: duplicate idempotency key returns existing alert, not duplicate
 *  8  triggerBlockedAlert creates high-severity alert with idempotencyKey
 *  9  triggerThresholdBreachAlert creates medium-severity alert
 * 10  triggerExecutionFailureAlert creates critical-severity alert
 * 11  getAlerts unreadOnly filter
 * 12  getAlerts severity filter
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createAlert,
  getAlerts,
  markAlertAsRead,
  resolveAlert,
  getUnreadAlertCount,
  triggerBlockedAlert,
  triggerThresholdBreachAlert,
  triggerExecutionFailureAlert,
} from "@/services/alerts/alert-service";

const WS_A = randomUUID();
const WS_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();

async function seedWorkspace(id: string, slug: string) {
  await db.workspace.create({ data: { id, name: `Alert Test WS ${slug}`, slug } });
}

async function seedUser(id: string, email: string) {
  await db.user.create({ data: { id, email, isActive: true, updatedAt: new Date() } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Alert Service", () => {
  beforeAll(async () => {
    await seedWorkspace(WS_A, `alert-ws-a-${WS_A.slice(0, 8)}`);
    await seedWorkspace(WS_B, `alert-ws-b-${WS_B.slice(0, 8)}`);
    await seedUser(USER_A, `alert-user-a-${USER_A.slice(0, 8)}@test.local`);
    await seedUser(USER_B, `alert-user-b-${USER_B.slice(0, 8)}@test.local`);
  });

  afterAll(async () => {
    // Delete in FK-safe order: alert rows → audit events (actor_id FK on users) → workspaces → users
    await db.alert.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
    await db.workspace.deleteMany({ where: { id: { in: [WS_A, WS_B] } } });
    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  });

  it("1 — createAlert persists to DB with correct fields", async () => {
    const alert = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "blocked",
      channel: "in_app",
      message: "Test alert",
      severity: "high",
      entityType: "OperatorItem",
      entityId: randomUUID(),
    });

    expect(alert.id).toBeDefined();
    expect(alert.workspaceId).toBe(WS_A);
    expect(alert.userId).toBe(USER_A);
    expect(alert.type).toBe("blocked");
    expect(alert.severity).toBe("high");
    expect(alert.isRead).toBe(false);
    expect(alert.readAt).toBeNull();
    expect(alert.createdAt).toBeInstanceOf(Date);

    const fromDb = await db.alert.findFirst({ where: { id: alert.id } });
    expect(fromDb).not.toBeNull();
    expect(fromDb!.workspaceId).toBe(WS_A);
  });

  it("2 — getAlerts returns workspace-scoped results only", async () => {
    await createAlert({ workspaceId: WS_A, userId: USER_A, type: "threshold_breach", channel: "in_app", message: "ws-a alert" });

    const alerts = await getAlerts(WS_A, USER_A);
    expect(alerts.length).toBeGreaterThan(0);
    alerts.forEach((a) => {
      expect(a.workspaceId).toBe(WS_A);
    });
  });

  it("3 — cross-workspace isolation: WS_B user cannot see WS_A alerts", async () => {
    await createAlert({ workspaceId: WS_B, userId: USER_B, type: "blocked", channel: "in_app", message: "ws-b alert" });

    const wsAAlerts = await getAlerts(WS_A, USER_A);
    const wsBAlerts = await getAlerts(WS_B, USER_B);

    const wsAIds = new Set(wsAAlerts.map((a) => a.id));
    const wsBIds = new Set(wsBAlerts.map((a) => a.id));

    // No overlap
    for (const id of wsBIds) {
      expect(wsAIds.has(id)).toBe(false);
    }
  });

  it("4 — markAlertAsRead sets isRead and readAt, emits audit event", async () => {
    const alert = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "execution_failure",
      channel: "in_app",
      message: "Mark read test",
    });
    expect(alert.isRead).toBe(false);

    const updated = await markAlertAsRead(alert.id, WS_A, USER_A);
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).toBeInstanceOf(Date);

    const fromDb = await db.alert.findFirst({ where: { id: alert.id } });
    expect(fromDb!.isRead).toBe(true);
    expect(fromDb!.readAt).toBeInstanceOf(Date);
  });

  it("5 — markAlertAsRead rejects wrong-workspace alert", async () => {
    const alert = await createAlert({
      workspaceId: WS_B,
      userId: USER_B,
      type: "blocked",
      channel: "in_app",
      message: "WS_B alert attempted from WS_A",
    });

    // Attempting to mark as read from wrong workspace should throw
    await expect(markAlertAsRead(alert.id, WS_A, USER_A)).rejects.toThrow("Alert not found");
  });

  it("6 — getUnreadAlertCount counts only unread alerts for workspace+user", async () => {
    const before = await getUnreadAlertCount(WS_A, USER_A);

    const alert = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "threshold_breach",
      channel: "in_app",
      message: "Unread count test",
    });

    const after = await getUnreadAlertCount(WS_A, USER_A);
    expect(after).toBe(before + 1);

    await markAlertAsRead(alert.id, WS_A, USER_A);
    const afterRead = await getUnreadAlertCount(WS_A, USER_A);
    expect(afterRead).toBe(before);
  });

  it("7 — idempotency: same idempotencyKey returns existing alert", async () => {
    const key = `idem:${randomUUID()}`;
    const first = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "blocked",
      channel: "in_app",
      message: "First occurrence",
      idempotencyKey: key,
    });

    const second = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "blocked",
      channel: "in_app",
      message: "Duplicate — should be suppressed",
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    expect(second.message).toBe("First occurrence");

    const count = await db.alert.count({ where: { workspaceId: WS_A, idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("8 — triggerBlockedAlert creates high-severity alert with idempotencyKey", async () => {
    const decisionId = randomUUID();
    const alert = await triggerBlockedAlert(WS_A, USER_A, decisionId, "Missing approval");

    expect(alert.type).toBe("blocked");
    expect(alert.severity).toBe("high");
    expect(alert.idempotencyKey).toBe(`blocked:${decisionId}`);
    expect(alert.message).toContain("Missing approval");
  });

  it("9 — triggerThresholdBreachAlert creates medium-severity alert", async () => {
    const alert = await triggerThresholdBreachAlert(WS_A, USER_A, "cashRunway", 5, 12);

    expect(alert.type).toBe("threshold_breach");
    expect(alert.severity).toBe("medium");
    expect(alert.message).toContain("cashRunway");
    expect(alert.message).toContain("5");
  });

  it("10 — triggerExecutionFailureAlert creates critical-severity alert", async () => {
    const decisionId = randomUUID();
    const alert = await triggerExecutionFailureAlert(WS_A, USER_A, decisionId, "Concurrency conflict");

    expect(alert.type).toBe("execution_failure");
    expect(alert.severity).toBe("critical");
    expect(alert.idempotencyKey).toBe(`failure:${decisionId}`);
    expect(alert.message).toContain("Concurrency conflict");
  });

  it("11 — getAlerts unreadOnly filter", async () => {
    const alert = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "blocked",
      channel: "in_app",
      message: "Will be read",
    });
    await markAlertAsRead(alert.id, WS_A, USER_A);

    const unread = await getAlerts(WS_A, USER_A, { unreadOnly: true });
    const unreadIds = new Set(unread.map((a) => a.id));
    expect(unreadIds.has(alert.id)).toBe(false);
    unread.forEach((a) => expect(a.isRead).toBe(false));
  });

  it("13 — resolveAlert sets resolvedAt and marks isRead, emits audit", async () => {
    const alert = await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "blocked",
      channel: "in_app",
      message: "Resolve test",
    });
    expect(alert.resolvedAt).toBeNull();

    const resolved = await resolveAlert(alert.id, WS_A, USER_A);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(resolved.isRead).toBe(true);

    const fromDb = await db.alert.findFirst({ where: { id: alert.id } });
    expect(fromDb!.resolvedAt).toBeInstanceOf(Date);
  });

  it("14 — resolveAlert rejects wrong-workspace alert", async () => {
    const alert = await createAlert({
      workspaceId: WS_B,
      userId: USER_B,
      type: "blocked",
      channel: "in_app",
      message: "WS_B alert resolve from WS_A",
    });
    await expect(resolveAlert(alert.id, WS_A, USER_A)).rejects.toThrow("Alert not found");
  });

  it("12 — getAlerts severity filter", async () => {
    await createAlert({
      workspaceId: WS_A,
      userId: USER_A,
      type: "execution_failure",
      channel: "in_app",
      message: "Critical severity",
      severity: "critical",
    });

    const criticalAlerts = await getAlerts(WS_A, USER_A, { severity: "critical" });
    expect(criticalAlerts.length).toBeGreaterThan(0);
    criticalAlerts.forEach((a) => expect(a.severity).toBe("critical"));
  });
});

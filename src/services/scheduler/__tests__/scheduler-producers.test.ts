/**
 * P0-08 — producer unit tests (mocked db + scheduler; no real Postgres needed).
 *
 * Proves each producer scans the correct domain-state gap query and enqueues
 * exactly one ScheduledTask per candidate, with an idempotency key that
 * changes between logically-distinct attempts (never permanently blocking a
 * future legitimate retry via the hard DB-unique idempotencyKey constraint —
 * proven end-to-end against real Postgres in
 * src/__tests__/stage8/scheduler-p0-08-hostile.db.test.ts, case 7).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const alertFindMany = vi.fn();
const verificationFindMany = vi.fn();
const schedule = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    alert: { findMany: (...args: unknown[]) => alertFindMany(...args) },
    ownerFinanceVerification: { findMany: (...args: unknown[]) => verificationFindMany(...args) },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/scheduler", () => ({
  DatabaseSchedulerProvider: class {
    schedule = schedule;
  },
}));

import {
  enqueueDueEmailRetryTasks,
  EMAIL_RETRY_MIN_SPACING_MS,
  enqueueDueFinanceLearningBridgeTasks,
} from "@/services/scheduler/scheduler-producers";
import { TASK_NAME_ALERT_EMAIL_RETRY, TASK_NAME_FINANCE_LEARNING_BRIDGE } from "@/infra/scheduler-handlers";

beforeEach(() => {
  vi.clearAllMocks();
  schedule.mockResolvedValue("task-id");
});

describe("enqueueDueEmailRetryTasks", () => {
  it("enqueues one task per retriable alert, scoped to workspace and attempt-count idempotency", async () => {
    alertFindMany.mockResolvedValue([
      { id: "alert-1", workspaceId: "ws-1", emailAttemptCount: 1 },
      { id: "alert-2", workspaceId: "ws-2", emailAttemptCount: 0 },
    ]);

    const result = await enqueueDueEmailRetryTasks();

    expect(result).toEqual({ candidatesFound: 2, enqueued: 2 });
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        taskName: TASK_NAME_ALERT_EMAIL_RETRY,
        payload: { alertId: "alert-1" },
        workspaceId: "ws-1",
        idempotencyKey: `${TASK_NAME_ALERT_EMAIL_RETRY}:alert-1:1`,
      })
    );
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        taskName: TASK_NAME_ALERT_EMAIL_RETRY,
        payload: { alertId: "alert-2" },
        workspaceId: "ws-2",
        idempotencyKey: `${TASK_NAME_ALERT_EMAIL_RETRY}:alert-2:0`,
      })
    );
  });

  it("queries only FAILED alerts below max attempts", async () => {
    alertFindMany.mockResolvedValue([]);
    await enqueueDueEmailRetryTasks();

    expect(alertFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailDeliveryStatus: "FAILED",
          emailAttemptCount: { lt: 3 },
        }),
      })
    );
  });

  it("enforces a minimum spacing between attempts so cron cadence cannot compress retries", async () => {
    alertFindMany.mockResolvedValue([]);
    const before = Date.now();
    await enqueueDueEmailRetryTasks();
    const after = Date.now();

    expect(EMAIL_RETRY_MIN_SPACING_MS).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    const where = (alertFindMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } }).where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ emailLastAttemptAt: null });
    const cutoff = (where.OR[1].emailLastAttemptAt as { lte: Date }).lte.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - EMAIL_RETRY_MIN_SPACING_MS);
    expect(cutoff).toBeLessThanOrEqual(after - EMAIL_RETRY_MIN_SPACING_MS);
  });

  it("produces a fresh idempotency key once the alert's attempt count advances (no permanent block)", async () => {
    alertFindMany.mockResolvedValueOnce([{ id: "alert-1", workspaceId: "ws-1", emailAttemptCount: 0 }]);
    await enqueueDueEmailRetryTasks();
    const firstKey = schedule.mock.calls[0][0].idempotencyKey;

    alertFindMany.mockResolvedValueOnce([{ id: "alert-1", workspaceId: "ws-1", emailAttemptCount: 1 }]);
    await enqueueDueEmailRetryTasks();
    const secondKey = schedule.mock.calls[1][0].idempotencyKey;

    expect(firstKey).not.toBe(secondKey);
  });

  it("returns zero enqueued when there are no candidates", async () => {
    alertFindMany.mockResolvedValue([]);
    const result = await enqueueDueEmailRetryTasks();
    expect(result).toEqual({ candidatesFound: 0, enqueued: 0 });
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("enqueueDueFinanceLearningBridgeTasks", () => {
  it("enqueues one task per distinct workspace with an un-bridged verification, day-scoped idempotency", async () => {
    verificationFindMany.mockResolvedValue([{ workspaceId: "ws-1" }, { workspaceId: "ws-2" }]);

    const result = await enqueueDueFinanceLearningBridgeTasks();

    expect(result).toEqual({ candidatesFound: 2, enqueued: 2 });
    expect(schedule).toHaveBeenCalledTimes(2);
    const call1 = schedule.mock.calls.find((c) => c[0].workspaceId === "ws-1")![0];
    expect(call1.taskName).toBe(TASK_NAME_FINANCE_LEARNING_BRIDGE);
    expect(call1.idempotencyKey).toMatch(
      new RegExp(`^${TASK_NAME_FINANCE_LEARNING_BRIDGE}:ws-1:\\d{4}-\\d{2}-\\d{2}$`)
    );
  });

  it("queries only bridgeable statuses with no outcome signal, distinct by workspace", async () => {
    verificationFindMany.mockResolvedValue([]);
    await enqueueDueFinanceLearningBridgeTasks();

    expect(verificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["verified_improved", "verified_not_improved", "disputed"] },
          outcomeSignal: null,
        },
        distinct: ["workspaceId"],
      })
    );
  });

  it("returns zero enqueued when there are no gap workspaces", async () => {
    verificationFindMany.mockResolvedValue([]);
    const result = await enqueueDueFinanceLearningBridgeTasks();
    expect(result).toEqual({ candidatesFound: 0, enqueued: 0 });
    expect(schedule).not.toHaveBeenCalled();
  });
});

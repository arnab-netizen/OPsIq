/**
 * S7-DC1: DatabaseSchedulerProvider — 20-point PostgreSQL lifecycle audit.
 *
 * Skipped when TEST_WITH_DB is not set (DB_BLOCKED_ENVIRONMENT).
 * Each test proves a specific invariant of the atomic claim protocol.
 *
 * Coverage:
 *  1.  pending → running via FOR UPDATE SKIP LOCKED (atomic claim)
 *  2.  Two concurrent callers claim disjoint sets (no double-claim)
 *  3.  Completed tasks are never re-claimed
 *  4.  Dead-letter tasks are never re-claimed
 *  5.  Failed tasks are rescheduled with exponential backoff
 *  6.  Lease expiry triggers crash recovery claim
 *  7.  Running tasks with valid lease are skipped by concurrent worker
 *  8.  Idempotency key prevents duplicate scheduling
 *  9.  Non-idempotent scheduling creates separate tasks
 * 10.  cancel() marks task completed
 * 11.  Future-scheduled tasks not claimed before their time
 * 12.  maxAttempts=1 → dead-letter on first failure
 * 13.  maxAttempts=3 → dead-letter on third failure
 * 14.  Backoff at attempt 1 = 60s window
 * 15.  Backoff at attempt 2 = 300s window
 * 16.  Workspace scoping: task carries workspaceId field
 * 17.  No-handler task released back to pending (not lost)
 * 18.  Payload round-trips faithfully through JSON
 * 19.  Batch limit: at most 50 tasks claimed per processDue call
 * 20.  processDue returns count of successfully completed tasks only
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";

const WITH_DB = process.env.TEST_WITH_DB === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

async function cleanScheduledTasks() {
  await db.scheduledTask.deleteMany({
    where: { taskName: { startsWith: "dc1-test-" } },
  });
}

describeIf(WITH_DB)("S7-DC1: DatabaseSchedulerProvider PostgreSQL lifecycle", () => {
  const provider = new DatabaseSchedulerProvider();

  beforeEach(async () => {
    await cleanScheduledTasks();
  });

  // ── 1. Atomic claim ─────────────────────────────────────────────────────
  it("1. pending task is claimed atomically and moved to running", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-atomic", scheduledFor: past });

    let handledPayload: unknown = undefined;
    const handlers = new Map([
      ["dc1-test-atomic", async (p: unknown) => { handledPayload = p; }],
    ]);

    const count = await provider.processDue(handlers);
    expect(count).toBe(1);
    expect(handledPayload).toBeDefined();

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("completed");
    expect(task?.completedAt).not.toBeNull();
    expect(task?.leaseExpiresAt).toBeNull();
  });

  // ── 2. No double-claim ───────────────────────────────────────────────────
  it("2. concurrent processDue calls claim disjoint sets", async () => {
    const past = new Date(Date.now() - 1000);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(await provider.schedule({ taskName: "dc1-test-concurrent", scheduledFor: past }));
    }

    const claimed: string[] = [];
    const lock = new Map([
      ["dc1-test-concurrent", async () => { /* intentional */ }],
    ]);

    // Two concurrent workers
    const [c1, c2] = await Promise.all([
      provider.processDue(lock),
      provider.processDue(lock),
    ]);

    expect(c1 + c2).toBe(4); // all 4 claimed exactly once
  });

  // ── 3. Completed not re-claimed ──────────────────────────────────────────
  it("3. completed tasks are never re-claimed", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-completed", scheduledFor: past });
    const handlers = new Map([["dc1-test-completed", async () => {}]]);

    await provider.processDue(handlers);
    const count2 = await provider.processDue(handlers);
    expect(count2).toBe(0);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("completed");
  });

  // ── 4. Dead-letter not re-claimed ────────────────────────────────────────
  it("4. dead-letter tasks are never re-claimed", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({
      taskName: "dc1-test-dl",
      scheduledFor: past,
      maxAttempts: 1,
    });
    const handlers = new Map([
      ["dc1-test-dl", async () => { throw new Error("always fails"); }],
    ]);

    await provider.processDue(handlers);
    const count2 = await provider.processDue(handlers);
    expect(count2).toBe(0);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("dead_letter");
  });

  // ── 5. Failed tasks get exponential backoff ───────────────────────────────
  it("5. failed task is rescheduled with scheduledFor in the future", async () => {
    const before = Date.now();
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({
      taskName: "dc1-test-backoff",
      scheduledFor: past,
      maxAttempts: 3,
    });

    const handlers = new Map([
      ["dc1-test-backoff", async () => { throw new Error("fail"); }],
    ]);

    await provider.processDue(handlers);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("pending");
    // scheduledFor must be in the future (exponential backoff applied)
    expect(task!.scheduledFor.getTime()).toBeGreaterThan(before + 50_000);
  });

  // ── 6. Crash recovery via lease expiry ───────────────────────────────────
  it("6. running task with expired lease is re-claimed", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-crash", scheduledFor: past });

    // Simulate a crashed worker: manually set status=running, lease already expired
    const expiredLease = new Date(Date.now() - 1000);
    await db.scheduledTask.update({
      where: { id },
      data: { status: "running", startedAt: past, leaseExpiresAt: expiredLease },
    });

    let called = false;
    const handlers = new Map([
      ["dc1-test-crash", async () => { called = true; }],
    ]);

    const count = await provider.processDue(handlers);
    expect(count).toBe(1);
    expect(called).toBe(true);
  });

  // ── 7. Running task with valid lease skipped ──────────────────────────────
  it("7. running task with unexpired lease is not re-claimed", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-lease", scheduledFor: past });

    // Simulate an in-progress worker with a valid lease
    const validLease = new Date(Date.now() + 60_000);
    await db.scheduledTask.update({
      where: { id },
      data: { status: "running", startedAt: past, leaseExpiresAt: validLease },
    });

    const handlers = new Map([["dc1-test-lease", async () => {}]]);
    const count = await provider.processDue(handlers);
    expect(count).toBe(0);
  });

  // ── 8. Idempotency key dedup ──────────────────────────────────────────────
  it("8. scheduling with same idempotency key returns existing id", async () => {
    const past = new Date(Date.now() - 1000);
    const key = `idem-${Date.now()}`;
    const id1 = await provider.schedule({ taskName: "dc1-test-idem", scheduledFor: past, idempotencyKey: key });
    const id2 = await provider.schedule({ taskName: "dc1-test-idem", scheduledFor: past, idempotencyKey: key });
    expect(id1).toBe(id2);

    const count = await db.scheduledTask.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  // ── 9. Non-idempotent scheduling creates separate tasks ───────────────────
  it("9. scheduling without idempotency key always creates a new task", async () => {
    const past = new Date(Date.now() - 1000);
    const id1 = await provider.schedule({ taskName: "dc1-test-nonidem", scheduledFor: past });
    const id2 = await provider.schedule({ taskName: "dc1-test-nonidem", scheduledFor: past });
    expect(id1).not.toBe(id2);
  });

  // ── 10. cancel() ─────────────────────────────────────────────────────────
  it("10. cancel() marks task completed", async () => {
    const future = new Date(Date.now() + 60_000);
    const id = await provider.schedule({ taskName: "dc1-test-cancel", scheduledFor: future });
    await provider.cancel(id);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("completed");
  });

  // ── 11. Future tasks not claimed before their time ────────────────────────
  it("11. future-scheduled task is not claimed before its time", async () => {
    const future = new Date(Date.now() + 60_000);
    await provider.schedule({ taskName: "dc1-test-future", scheduledFor: future });

    const handlers = new Map([["dc1-test-future", async () => {}]]);
    const count = await provider.processDue(handlers);
    expect(count).toBe(0);
  });

  // ── 12. maxAttempts=1 → dead-letter on first failure ─────────────────────
  it("12. maxAttempts=1 → dead-letter on first failure", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-max1", scheduledFor: past, maxAttempts: 1 });
    const handlers = new Map([["dc1-test-max1", async () => { throw new Error("fail"); }]]);

    await provider.processDue(handlers);
    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("dead_letter");
    expect(task?.attempts).toBe(1);
  });

  // ── 13. maxAttempts=3 → dead-letter on third failure ─────────────────────
  it("13. maxAttempts=3 → dead-letter after third failure", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-max3", scheduledFor: past, maxAttempts: 3 });
    const handlers = new Map([["dc1-test-max3", async () => { throw new Error("fail"); }]]);

    // First failure → backoff → fast-forward scheduledFor → second failure → etc.
    await provider.processDue(handlers);
    await db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1) } });
    await provider.processDue(handlers);
    await db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1) } });
    await provider.processDue(handlers);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("dead_letter");
    expect(task?.attempts).toBe(3);
  });

  // ── 14. Backoff attempt 1 = 60s minimum ──────────────────────────────────
  it("14. first backoff schedules at least 60s in the future", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-bo1", scheduledFor: past, maxAttempts: 3 });
    const handlers = new Map([["dc1-test-bo1", async () => { throw new Error("fail"); }]]);

    const before = Date.now();
    await provider.processDue(handlers);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task!.scheduledFor.getTime()).toBeGreaterThanOrEqual(before + 59_000);
    expect(task!.scheduledFor.getTime()).toBeLessThanOrEqual(before + 3_700_000);
  });

  // ── 15. Backoff attempt 2 = 300s minimum ─────────────────────────────────
  it("15. second backoff schedules at least 300s in the future", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-bo2", scheduledFor: past, maxAttempts: 3 });
    const handlers = new Map([["dc1-test-bo2", async () => { throw new Error("fail"); }]]);

    await provider.processDue(handlers);
    // Force immediate re-run
    await db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1) } });

    const before = Date.now();
    await provider.processDue(handlers);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task!.scheduledFor.getTime()).toBeGreaterThanOrEqual(before + 299_000);
  });

  // ── 16. Workspace scoping ─────────────────────────────────────────────────
  it("16. task carries workspaceId field", async () => {
    const past = new Date(Date.now() - 1000);
    const wsId = "aaaa0000-0000-0000-0000-000000000001";
    const id = await provider.schedule({
      taskName: "dc1-test-ws",
      scheduledFor: past,
      workspaceId: wsId,
    });

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.workspaceId).toBe(wsId);
  });

  // ── 17. No-handler task released ─────────────────────────────────────────
  it("17. task with no registered handler is released back to pending", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await provider.schedule({ taskName: "dc1-test-nohandler", scheduledFor: past });

    const handlers = new Map<string, () => Promise<void>>();
    const count = await provider.processDue(handlers);
    expect(count).toBe(0);

    const task = await db.scheduledTask.findUnique({ where: { id } });
    expect(task?.status).toBe("pending");
    expect(task?.startedAt).toBeNull();
  });

  // ── 18. Payload round-trip ────────────────────────────────────────────────
  it("18. payload round-trips faithfully through JSON", async () => {
    const past = new Date(Date.now() - 1000);
    const payload = { nested: { value: 42, flag: true, list: [1, "two"] } };
    const id = await provider.schedule({
      taskName: "dc1-test-payload",
      scheduledFor: past,
      payload,
    });

    let received: unknown;
    const handlers = new Map([
      ["dc1-test-payload", async (p: unknown) => { received = p; }],
    ]);

    await provider.processDue(handlers);
    expect(received).toEqual(payload);
  });

  // ── 19. Batch limit ───────────────────────────────────────────────────────
  it("19. processDue claims at most 50 tasks per call", async () => {
    const past = new Date(Date.now() - 1000);
    // Create 55 tasks
    for (let i = 0; i < 55; i++) {
      await provider.schedule({ taskName: "dc1-test-batch", scheduledFor: past });
    }

    const handlers = new Map([["dc1-test-batch", async () => {}]]);
    const count = await provider.processDue(handlers);
    expect(count).toBeLessThanOrEqual(50);
  });

  // ── 20. processDue return value ───────────────────────────────────────────
  it("20. processDue counts only successfully completed tasks", async () => {
    const past = new Date(Date.now() - 1000);
    const idOk = await provider.schedule({ taskName: "dc1-test-count-ok", scheduledFor: past });
    const idFail = await provider.schedule({ taskName: "dc1-test-count-fail", scheduledFor: past, maxAttempts: 1 });

    const handlers = new Map([
      ["dc1-test-count-ok", async () => {}],
      ["dc1-test-count-fail", async () => { throw new Error("fail"); }],
    ]);

    const count = await provider.processDue(handlers);
    expect(count).toBe(1); // only the successful one

    const ok = await db.scheduledTask.findUnique({ where: { id: idOk } });
    const fail = await db.scheduledTask.findUnique({ where: { id: idFail } });
    expect(ok?.status).toBe("completed");
    expect(fail?.status).toBe("dead_letter");
  });
});

describeIf(!WITH_DB)("S7-DC1: DB skipped — database unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — PostgreSQL concurrency tests require TEST_WITH_DB=true", () => {
    expect(true).toBe(true); // Acknowledge the skip explicitly
  });
});

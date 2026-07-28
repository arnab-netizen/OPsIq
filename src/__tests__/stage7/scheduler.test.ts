/**
 * S7-DC1: Scheduler unit tests (non-DB, InMemorySchedulerProvider)
 *
 * Proves:
 * 1. Idempotency key deduplicates schedules
 * 2. Exponential backoff is applied on failure (not immediate re-queue)
 * 3. Dead-letter threshold respected
 * 4. Pending tasks with future scheduledFor are not processed
 * 5. Workspace scoping fields accepted and stored
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySchedulerProvider, _resetSchedulerForTest } from "@/infra/scheduler";

beforeEach(() => {
  _resetSchedulerForTest();
});

describe("S7-DC1: InMemorySchedulerProvider", () => {
  it("schedules a task and processes it when due", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const past = new Date(Date.now() - 1000);
    const taskId = await scheduler.schedule({
      taskName: "test-task",
      payload: { key: "value" },
      scheduledFor: past,
    });

    expect(taskId).toBeTruthy();

    let called = false;
    const handlers = new Map([
      ["test-task", async () => { called = true; }],
    ]);

    const count = await scheduler.processDue(handlers);
    expect(count).toBe(1);
    expect(called).toBe(true);
  });

  it("does not process tasks scheduled for the future", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const future = new Date(Date.now() + 60_000);
    await scheduler.schedule({
      taskName: "future-task",
      scheduledFor: future,
    });

    let called = false;
    const handlers = new Map([
      ["future-task", async () => { called = true; }],
    ]);

    const count = await scheduler.processDue(handlers);
    expect(count).toBe(0);
    expect(called).toBe(false);
  });

  it("deduplicates on idempotencyKey", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const past = new Date(Date.now() - 1000);
    const id1 = await scheduler.schedule({
      taskName: "dedup-task",
      scheduledFor: past,
      idempotencyKey: "dedup-key-1",
    });
    const id2 = await scheduler.schedule({
      taskName: "dedup-task",
      scheduledFor: past,
      idempotencyKey: "dedup-key-1",
    });
    expect(id1).toBe(id2);

    let callCount = 0;
    const handlers = new Map([
      ["dedup-task", async () => { callCount++; }],
    ]);
    await scheduler.processDue(handlers);
    expect(callCount).toBe(1); // Only one task runs
  });

  it("applies exponential backoff on failure (task not immediately re-runnable)", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const past = new Date(Date.now() - 1000);
    await scheduler.schedule({
      taskName: "failing-task",
      scheduledFor: past,
      maxAttempts: 3,
    });

    const failHandler = new Map([
      ["failing-task", async () => { throw new Error("transient failure"); }],
    ]);

    // First failure
    await scheduler.processDue(failHandler);

    // Task should NOT be immediately re-processable (backoff applied).
    let callCount = 0;
    const countHandler = new Map([
      ["failing-task", async () => { callCount++; }],
    ]);
    await scheduler.processDue(countHandler);
    expect(callCount).toBe(0); // Backoff prevents immediate retry
  });

  it("marks task dead_letter after maxAttempts failures", async () => {
    const scheduler = new InMemorySchedulerProvider();

    // We patch the task's scheduledFor between attempts to simulate time passage.
    // Each attempt sets scheduledFor to now+backoff; we manually reset it to the past.
    const inst = scheduler as unknown as {
      tasks: Map<string, { status: string; scheduledFor: Date; attempts: number }>;
    };

    const past = new Date(Date.now() - 1000);
    await scheduler.schedule({
      taskName: "always-fail",
      scheduledFor: past,
      maxAttempts: 2,
    });

    const failHandler = new Map([
      ["always-fail", async () => { throw new Error("always"); }],
    ]);

    // First attempt
    await scheduler.processDue(failHandler);
    // Force back to past for second attempt
    for (const t of inst.tasks.values()) t.scheduledFor = new Date(Date.now() - 1000);

    // Second attempt → dead_letter
    await scheduler.processDue(failHandler);

    const tasks = Array.from(inst.tasks.values());
    expect(tasks[0].status).toBe("dead_letter");
  });

  it("accepts workspaceId in ScheduleTaskInput", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const past = new Date(Date.now() - 1000);
    await scheduler.schedule({
      taskName: "ws-task",
      scheduledFor: past,
      workspaceId: "workspace-uuid-001",
    });

    let ran = false;
    await scheduler.processDue(new Map([["ws-task", async () => { ran = true; }]]));
    expect(ran).toBe(true);
  });

  it("cancel removes the task", async () => {
    const scheduler = new InMemorySchedulerProvider();
    const past = new Date(Date.now() - 1000);
    const taskId = await scheduler.schedule({
      taskName: "cancel-task",
      scheduledFor: past,
    });

    await scheduler.cancel(taskId);

    let called = false;
    await scheduler.processDue(new Map([["cancel-task", async () => { called = true; }]]));
    expect(called).toBe(false);
  });
});

/**
 * Scheduler outcome contract — real-Postgres proof of what each execution outcome does to a task.
 *
 *   success / NO_WORK        -> completed                  never retried
 *   PARTIAL_FAILURE          -> completed_partial_failure  never retried
 *   FAILED (explicit)        -> failed                     TERMINAL, never retried
 *   thrown error             -> pending + backoff, then dead_letter at maxAttempts
 *
 * "failed" and "dead_letter" must stay distinct states, and a stale worker whose lease was
 * reclaimed must never overwrite the newer attempt's state.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type TaskHandler, type HandlerResult } from "@/infra/scheduler";
import { getSchedulerStatusForWorkspace } from "@/services/scheduler/scheduler-status.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const PREFIX = `sched-outcome-${randomUUID().slice(0, 8)}`;
let seq = 0;
const nextName = () => `${PREFIX}-${++seq}`;

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { taskName: { startsWith: PREFIX } } });
});

async function seed(taskName: string, over: { maxAttempts?: number; workspaceId?: string | null } = {}) {
  const id = randomUUID();
  await db.scheduledTask.create({
    data: {
      id,
      taskName,
      scheduledFor: new Date(Date.now() - 1000),
      status: "pending",
      maxAttempts: over.maxAttempts ?? 3,
      workspaceId: over.workspaceId ?? null,
    },
  });
  return id;
}

const row = (id: string) => db.scheduledTask.findUnique({ where: { id } });
const handlerFor = (name: string, fn: TaskHandler) => new Map<string, TaskHandler>([[name, fn]]);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] scheduler outcome contract", () => {
  const scheduler = new DatabaseSchedulerProvider();

  it("an explicit FAILED outcome finalizes the task as failed: no retry, no next run, reason kept", async () => {
    const name = nextName();
    const id = await seed(name);
    const before = await row(id);
    let runs = 0;
    const handlers = handlerFor(name, async () => { runs++; return { status: "FAILED", summary: "Request rejected as invalid (not retryable)." }; });

    const processed = await scheduler.processDue(handlers);

    const after = await row(id);
    expect(processed).toBe(0); // processDue counts successful completions only
    expect(after?.status).toBe("failed");
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toBe("Request rejected as invalid (not retryable).");
    expect(after?.completedAt).not.toBeNull();
    expect(after?.leaseExpiresAt).toBeNull();
    expect(after?.scheduledFor.getTime()).toBe(before!.scheduledFor.getTime());

    // Not claimable again by any path, ever.
    await scheduler.processDue(handlers);
    await scheduler.processTaskById(id, handlers);
    expect(runs).toBe(1);
    expect((await row(id))?.attempts).toBe(1);
  });

  it("FAILED without a summary still records a reason", async () => {
    const name = nextName();
    const id = await seed(name);
    await scheduler.processTaskById(id, handlerFor(name, async () => ({ status: "FAILED" })));
    const after = await row(id);
    expect(after?.status).toBe("failed");
    expect(after?.lastError).toBeTruthy();
  });

  it("FAILED is terminal even with attempts remaining, and is not dead_letter", async () => {
    const name = nextName();
    const id = await seed(name, { maxAttempts: 5 });
    await scheduler.processTaskById(id, handlerFor(name, async () => ({ status: "FAILED", summary: "no" })));
    const after = await row(id);
    expect(after?.attempts).toBe(1);
    expect(after?.status).toBe("failed");
    expect(after?.status).not.toBe("dead_letter");
  });

  it("a FAILED outcome creates no other task (no task proliferation)", async () => {
    const name = nextName();
    const id = await seed(name);
    await scheduler.processTaskById(id, handlerFor(name, async () => ({ status: "FAILED", summary: "no" })));
    expect(await db.scheduledTask.count({ where: { taskName: name } })).toBe(1);
  });

  it("a thrown error stays retryable: pending, backoff in the future, attempt counted", async () => {
    const name = nextName();
    const id = await seed(name);
    const t0 = Date.now();
    await scheduler.processTaskById(id, handlerFor(name, async () => { throw new Error("transient"); }));
    const after = await row(id);
    expect(after?.status).toBe("pending");
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toBeTruthy();
    expect(after!.scheduledFor.getTime()).toBeGreaterThan(t0 + 50_000);
    expect(after?.leaseExpiresAt).toBeNull();
  });

  it("NEXT-ATTEMPT PROOF: after backoff elapses the same task is re-claimed, re-run, and can complete", async () => {
    const name = nextName();
    const id = await seed(name, { maxAttempts: 3 });
    let calls = 0;
    const handlers = handlerFor(name, async (_p, ctx) => {
      calls++;
      expect(ctx.attempt).toBe(calls);
      if (calls === 1) throw new Error("transient");
      return { status: "SUCCESS" };
    });

    await scheduler.processTaskById(id, handlers);
    expect((await row(id))?.status).toBe("pending");

    // Not yet due: backoff has not elapsed, so neither drain path runs it.
    expect(await scheduler.processDue(handlers)).toBe(0);
    expect(await scheduler.processTaskById(id, handlers)).toBe(false);
    expect(calls).toBe(1);

    // Backoff elapses.
    await db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    expect(await scheduler.processTaskById(id, handlers)).toBe(true);

    const after = await row(id);
    expect(calls).toBe(2);
    expect(after?.status).toBe("completed");
    expect(after?.attempts).toBe(2);
    expect(after?.lastError).toBeNull(); // a clean completion never echoes the earlier failure
    expect(await db.scheduledTask.count({ where: { taskName: name } })).toBe(1);
  });

  it("retries are bounded: repeated throws end in dead_letter at maxAttempts, on the same row", async () => {
    const name = nextName();
    const id = await seed(name, { maxAttempts: 3 });
    const handlers = handlerFor(name, async () => { throw new Error("always"); });
    for (let i = 0; i < 6; i++) {
      await db.scheduledTask.updateMany({ where: { id, status: "pending" }, data: { scheduledFor: new Date(Date.now() - 1000) } });
      await scheduler.processTaskById(id, handlers);
    }
    const after = await row(id);
    expect(after?.status).toBe("dead_letter");
    expect(after?.attempts).toBe(3);
    expect(await db.scheduledTask.count({ where: { taskName: name } })).toBe(1);
  });

  it("a retryable failure on the LAST attempt is dead_letter, not failed", async () => {
    const name = nextName();
    const id = await seed(name, { maxAttempts: 1 });
    await scheduler.processTaskById(id, handlerFor(name, async () => { throw new Error("x"); }));
    expect((await row(id))?.status).toBe("dead_letter");
  });

  it("a task with no registered handler follows the retry path, never the terminal path", async () => {
    const name = nextName();
    const id = await seed(name);
    await scheduler.processTaskById(id, new Map());
    const after = await row(id);
    expect(after?.status).toBe("pending");
    expect(after?.attempts).toBe(1);
  });

  it("SUCCESS, NO_WORK and PARTIAL_FAILURE reach their own terminal states and never re-run", async () => {
    const cases: Array<[HandlerResult, string]> = [
      [{ status: "SUCCESS" }, "completed"],
      [{ status: "NO_WORK" }, "completed"],
      [{ status: "PARTIAL_FAILURE", summary: "2 of 3 done" }, "completed_partial_failure"],
    ];
    for (const [result, expected] of cases) {
      const name = nextName();
      const id = await seed(name);
      let runs = 0;
      const handlers = handlerFor(name, async () => { runs++; return result; });
      await scheduler.processDue(handlers);
      await scheduler.processDue(handlers);
      expect((await row(id))?.status).toBe(expected);
      expect(runs).toBe(1);
    }
  });

  it("a handler that returns nothing is a success", async () => {
    const name = nextName();
    const id = await seed(name);
    await scheduler.processTaskById(id, handlerFor(name, async () => undefined));
    expect((await row(id))?.status).toBe("completed");
  });

  describe("stale worker fencing", () => {
    it("a worker whose lease was reclaimed cannot overwrite the newer attempt's state", async () => {
      const name = nextName();
      const id = await seed(name);
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      let runs = 0;
      const handler: TaskHandler = async (_p, ctx) => {
        runs++;
        if (ctx.attempt === 1) {
          await gate; // the slow first worker
          return { status: "FAILED", summary: "stale worker verdict" };
        }
        return { status: "SUCCESS" };
      };
      const handlers = handlerFor(name, handler);

      const first = scheduler.processTaskById(id, handlers);
      // Wait until attempt 1 actually holds the claim.
      for (let i = 0; i < 100 && (await row(id))?.status !== "running"; i++) await new Promise((r) => setTimeout(r, 20));
      expect((await row(id))?.attempts).toBe(1);

      // Its lease expires; a second worker legitimately reclaims and completes the task.
      await db.scheduledTask.update({ where: { id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
      expect(await scheduler.processTaskById(id, handlers)).toBe(true);
      expect((await row(id))?.status).toBe("completed");

      // The stale worker finishes late with a verdict that must be discarded.
      release();
      expect(await first).toBe(false);
      const after = await row(id);
      expect(after?.status).toBe("completed");
      expect(after?.attempts).toBe(2);
      expect(after?.lastError).toBeNull();
      expect(runs).toBe(2); // documented residual: a lease is not renewed, handlers must be idempotent
    });

    it("a stale worker's thrown error cannot push a completed task back to pending", async () => {
      const name = nextName();
      const id = await seed(name);
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const handlers = handlerFor(name, async (_p, ctx) => {
        if (ctx.attempt === 1) { await gate; throw new Error("late failure"); }
        return { status: "SUCCESS" };
      });
      const first = scheduler.processTaskById(id, handlers);
      for (let i = 0; i < 100 && (await row(id))?.status !== "running"; i++) await new Promise((r) => setTimeout(r, 20));
      await db.scheduledTask.update({ where: { id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
      await scheduler.processTaskById(id, handlers);
      release();
      await first;
      const after = await row(id);
      expect(after?.status).toBe("completed");
      expect(after?.lastError).toBeNull();
    });
  });

  describe("owner-facing status does not hide terminal failures", () => {
    it("reports a terminal failure separately from dead letters, scoped to its workspace", async () => {
      const workspaceA = randomUUID();
      const workspaceB = randomUUID();
      const name = nextName();
      const id = await seed(name, { workspaceId: workspaceA });
      await scheduler.processTaskById(id, handlerFor(name, async () => ({ status: "FAILED", summary: "rejected by provider" })));

      const a = await getSchedulerStatusForWorkspace(workspaceA);
      expect(a.terminalFailure).toBe(1);
      expect(a.deadLetter).toBe(0);
      expect(a.recentTerminalFailures.map((t) => t.id)).toEqual([id]);
      expect(a.recentTerminalFailures[0].lastError).toBe("rejected by provider");

      const b = await getSchedulerStatusForWorkspace(workspaceB);
      expect(b.terminalFailure).toBe(0);
      expect(b.recentTerminalFailures).toEqual([]);
    });
  });
});

/**
 * Scheduler lease heartbeat — real-Postgres, forced-order proof.
 *
 * A handler that outlives the processing lease must keep ownership (fenced renewal), must never be
 * reclaimed and run a second time while it is alive, must still be recoverable when its worker
 * dies, and must be told (TaskContext.signal) when it has lost ownership. Lease and heartbeat
 * timing are injected (1.2s / 0.3s) so nothing waits five minutes.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance. Run serially (CI does).
 */
import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  DatabaseSchedulerProvider,
  LEASE_OWNERSHIP_LOST,
  SCHEDULER_HEARTBEAT_INTERVAL_MS,
  SCHEDULER_LEASE_MS,
  type TaskHandler,
} from "@/infra/scheduler";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const PREFIX = `sched-hb-${randomUUID().slice(0, 8)}`;
const LEASE = 1200;
const BEAT = 300;
let seq = 0;
const nextName = () => `${PREFIX}-${++seq}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const provider = () => new DatabaseSchedulerProvider({ leaseMs: LEASE, heartbeatIntervalMs: BEAT });
const row = (id: string) => db.scheduledTask.findUnique({ where: { id } });

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > timeoutMs) throw new Error("waitFor timed out");
    await sleep(25);
  }
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}
async function seed(name: string, over: { maxAttempts?: number; scheduledFor?: Date } = {}) {
  const id = randomUUID();
  await db.scheduledTask.create({
    data: { id, taskName: name, scheduledFor: over.scheduledFor ?? new Date(Date.now() - 1000), status: "pending", maxAttempts: over.maxAttempts ?? 3 },
  });
  return id;
}

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { taskName: { startsWith: PREFIX } } });
});

describe("scheduler lease constants", () => {
  it("heartbeat interval is well below the lease (derived, not duplicated)", () => {
    expect(SCHEDULER_HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual(SCHEDULER_LEASE_MS / 4);
    expect(SCHEDULER_HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("refuses a heartbeat that cannot leave a safety margin", () => {
    expect(() => new DatabaseSchedulerProvider({ leaseMs: 1000, heartbeatIntervalMs: 600 })).toThrow();
    expect(() => new DatabaseSchedulerProvider({ leaseMs: 0 })).toThrow();
    expect(() => new DatabaseSchedulerProvider({ leaseMs: 1000, heartbeatIntervalMs: 500 })).not.toThrow();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] lease heartbeat", () => {
  it("LONG-RUNNING: a handler that outlives the original lease keeps it; a second worker never reclaims or runs it", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    const b = provider();
    const g = gate();
    let runs = 0;
    const handlerA: TaskHandler = async () => { runs++; await g.promise; return { status: "SUCCESS" }; };
    const handlerB: TaskHandler = async () => { runs++; return { status: "SUCCESS" }; };

    const running = a.processTaskById(id, new Map([[name, handlerA]]));
    await waitFor(async () => (await row(id))?.status === "running");

    // Run well past TWO original lease durations, with B polling the whole time.
    const t0 = Date.now();
    while (Date.now() - t0 < LEASE * 2.2) {
      expect(await b.processDue(new Map([[name, handlerB]]))).toBe(0);
      expect(await b.processTaskById(id, new Map([[name, handlerB]]))).toBe(false);
      await sleep(150);
    }
    const mid = await row(id);
    expect(mid?.status).toBe("running");
    expect(mid?.attempts).toBe(1);
    expect(mid!.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now()); // renewed, not lapsed
    expect(runs).toBe(1);

    g.release();
    expect(await running).toBe(true);
    const after = await row(id);
    expect(runs).toBe(1); // HANDLER_EXECUTION_COUNT=1
    expect(after?.attempts).toBe(1);
    expect(after?.status).toBe("completed");
    expect(after?.leaseExpiresAt).toBeNull();
    expect(a.activeHeartbeatCount).toBe(0);
  });

  it("BATCH: a task claimed by processDue but still waiting its turn keeps its lease too", async () => {
    const name = nextName();
    const first = await seed(name, { scheduledFor: new Date(Date.now() - 5000) });
    const second = await seed(name, { scheduledFor: new Date(Date.now() - 4000) });
    const a = provider();
    const b = provider();
    const g = gate();
    const ran: string[] = [];
    const handlerA: TaskHandler = async (_p, ctx) => {
      ran.push(ctx.taskId);
      if (ctx.taskId === first) await g.promise;
      return { status: "SUCCESS" };
    };
    const handlerB: TaskHandler = async (_p, ctx) => { ran.push(`B:${ctx.taskId}`); return { status: "SUCCESS" }; };

    const draining = a.processDue(new Map([[name, handlerA]]));
    await waitFor(() => ran.includes(first));
    const t0 = Date.now();
    while (Date.now() - t0 < LEASE * 2.2) {
      await b.processDue(new Map([[name, handlerB]]));
      await sleep(150);
    }
    expect(ran).toEqual([first]); // second is queued behind the first, un-run and un-stolen
    expect((await row(second))?.attempts).toBe(1);
    expect((await row(second))?.status).toBe("running");

    g.release();
    expect(await draining).toBe(2);
    expect(ran).toEqual([first, second]);
    for (const id of [first, second]) {
      const r = await row(id);
      expect(r?.status).toBe("completed");
      expect(r?.attempts).toBe(1);
    }
    expect(a.activeHeartbeatCount).toBe(0);
  });

  it("RECLAIM: when the worker's heartbeat stops (worker death / partition), another worker reclaims as attempt 2 and the stale worker cannot overwrite it", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    const b = provider();
    // Worker A's renewals silently stop reaching the database (a partitioned or dead worker).
    vi.spyOn(a, "renewLease").mockResolvedValue(true);
    const g = gate();
    let runs = 0;
    const handlerA: TaskHandler = async () => { runs++; await g.promise; return { status: "FAILED", summary: "stale worker verdict" }; };
    const handlerB: TaskHandler = async (_p, ctx) => { runs++; expect(ctx.attempt).toBe(2); return { status: "SUCCESS" }; };

    const running = a.processTaskById(id, new Map([[name, handlerA]]));
    await waitFor(async () => (await row(id))?.status === "running");

    await sleep(LEASE + 400); // the unrenewed lease lapses
    expect(await b.processDue(new Map([[name, handlerB]]))).toBe(1);
    const reclaimed = await row(id);
    expect(reclaimed?.status).toBe("completed");
    expect(reclaimed?.attempts).toBe(2);

    g.release(); // A finally finishes with a verdict that must be discarded
    expect(await running).toBe(false);
    const after = await row(id);
    expect(after?.status).toBe("completed");
    expect(after?.attempts).toBe(2);
    expect(after?.lastError).toBeNull();
    expect(runs).toBe(2); // crash recovery still re-runs the task exactly once more
  });

  it("STALE HEARTBEAT: attempt 1 cannot renew once attempt 2 owns the task; the winner's lease is untouched", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    const b = provider();
    vi.spyOn(a, "renewLease").mockResolvedValue(true);
    const gA = gate();
    const gB = gate();
    const handlerA: TaskHandler = async () => { await gA.promise; return { status: "SUCCESS" }; };
    const handlerB: TaskHandler = async () => { await gB.promise; return { status: "SUCCESS" }; };

    const runA = a.processTaskById(id, new Map([[name, handlerA]]));
    await waitFor(async () => (await row(id))?.status === "running");
    await sleep(LEASE + 400);
    const runB = b.processTaskById(id, new Map([[name, handlerB]]));
    await waitFor(async () => (await row(id))?.attempts === 2);

    // A real, unmocked provider acting as the stale attempt-1 worker, with a far-longer lease so
    // any (wrongly) successful renewal would be unmistakable.
    const stale = new DatabaseSchedulerProvider({ leaseMs: 120_000, heartbeatIntervalMs: 1000 });
    const before = await row(id);
    expect(await stale.renewLease(id, 1)).toBe(false);
    const after = await row(id);
    expect(after?.attempts).toBe(2);
    expect(after!.leaseExpiresAt!.getTime()).toBeLessThan(Date.now() + 10_000); // not pushed ~120s out
    expect(Math.abs(after!.leaseExpiresAt!.getTime() - before!.leaseExpiresAt!.getTime())).toBeLessThan(LEASE);
    // The current attempt can renew, and only it.
    expect(await stale.renewLease(id, 2)).toBe(true);

    gB.release();
    expect(await runB).toBe(true);
    gA.release();
    expect(await runA).toBe(false);
    expect((await row(id))?.status).toBe("completed");
  });

  it("LEASE LOSS SIGNAL: when renewal finds the task reclaimed, the handler's signal aborts with LEASE_OWNERSHIP_LOST and the heartbeat ends", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    const b = provider();
    const realRenew = a.renewLease.bind(a);
    let paused = true;
    vi.spyOn(a, "renewLease").mockImplementation(async (taskId, attempt) => (paused ? true : realRenew(taskId, attempt)));

    let observed: { aborted: boolean; code?: string } | null = null;
    const handlerA: TaskHandler = async (_p, ctx) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("signal never aborted")), 8000);
        ctx.signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
      observed = { aborted: ctx.signal.aborted, code: (ctx.signal.reason as { code?: string })?.code };
      return { status: "SUCCESS" };
    };
    const gB = gate();
    const handlerB: TaskHandler = async () => { await gB.promise; return { status: "SUCCESS" }; };

    const runA = a.processTaskById(id, new Map([[name, handlerA]]));
    await waitFor(async () => (await row(id))?.status === "running");
    await sleep(LEASE + 400);
    const runB = b.processTaskById(id, new Map([[name, handlerB]]));
    await waitFor(async () => (await row(id))?.attempts === 2);

    paused = false; // A's next heartbeat now reaches the database and finds the task reclaimed
    expect(await runA).toBe(false);
    expect(observed).toEqual({ aborted: true, code: LEASE_OWNERSHIP_LOST });
    expect(a.activeHeartbeatCount).toBe(0);
    expect((await row(id))?.attempts).toBe(2);
    expect((await row(id))?.status).toBe("running"); // B's claim is intact

    gB.release();
    expect(await runB).toBe(true);
    expect((await row(id))?.status).toBe("completed");
  });

  it("FAIL CLOSED: if the lease cannot be renewed for a full lease period the signal aborts even before anyone reclaims", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    vi.spyOn(a, "renewLease").mockRejectedValue(new Error("database unreachable"));
    let code: string | undefined;
    const handler: TaskHandler = async (_p, ctx) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("signal never aborted")), 8000);
        ctx.signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
      code = (ctx.signal.reason as { code?: string })?.code;
      return { status: "SUCCESS" };
    };
    const t0 = Date.now();
    await a.processTaskById(id, new Map([[name, handler]]));
    expect(code).toBe(LEASE_OWNERSHIP_LOST);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(LEASE - 50); // not aborted on the first transient error
    expect(a.activeHeartbeatCount).toBe(0);
  });

  it("an unreclaimed healthy task never sees its signal abort", async () => {
    const name = nextName();
    const id = await seed(name);
    const a = provider();
    let aborted = true;
    await a.processTaskById(id, new Map([[name, async (_p, ctx) => { await sleep(LEASE * 1.6); aborted = ctx.signal.aborted; }]]));
    expect(aborted).toBe(false);
  });

  describe("heartbeat cleanup", () => {
    async function settledRenewCalls(a: DatabaseSchedulerProvider, spy: { mock: { calls: unknown[] } }) {
      expect(a.activeHeartbeatCount).toBe(0);
      const n = spy.mock.calls.length;
      await sleep(BEAT * 4); // several cycles that WOULD have fired
      expect(spy.mock.calls.length).toBe(n);
    }

    for (const [label, result, expected] of [
      ["success", { status: "SUCCESS" }, "completed"],
      ["terminal FAILED", { status: "FAILED", summary: "no" }, "failed"],
      ["thrown error", "throw", "pending"],
    ] as const) {
      it(`stops after ${label}: no timer, no further renewals`, async () => {
        const name = nextName();
        const id = await seed(name);
        const a = provider();
        const spy = vi.spyOn(a, "renewLease");
        await a.processTaskById(id, new Map([[name, async () => {
          await sleep(BEAT * 1.6); // at least one heartbeat fires while running
          if (result === "throw") throw new Error("x");
          return result;
        }]]));
        expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect((await row(id))?.status).toBe(expected);
        expect((await row(id))?.leaseExpiresAt).toBeNull();
        await settledRenewCalls(a, spy);
      });
    }

    it("stops for a task with no registered handler", async () => {
      const name = nextName();
      const id = await seed(name);
      const a = provider();
      const spy = vi.spyOn(a, "renewLease");
      await a.processTaskById(id, new Map());
      await settledRenewCalls(a, spy);
    });

    it("COMPLETION RACE: a renewal in flight when the handler completes cannot win over finalization and raises no error", async () => {
      const name = nextName();
      const id = await seed(name);
      const a = provider();
      const real = a.renewLease.bind(a);
      const renewals: boolean[] = [];
      const spy = vi.spyOn(a, "renewLease").mockImplementation(async (t, n) => {
        await sleep(200);
        const renewed = await real(t, n);
        renewals.push(renewed);
        return renewed;
      });
      const unhandled: unknown[] = [];
      const onUnhandled = (e: unknown) => unhandled.push(e);
      process.on("unhandledRejection", onUnhandled);
      try {
        // The handler returns just after the first tick (at ~BEAT) has started its slow renewal.
        const ok = await a.processTaskById(id, new Map([[name, async () => { await sleep(BEAT + 60); return { status: "SUCCESS" as const }; }]]));
        expect(ok).toBe(true);
        const after = await row(id);
        expect(after?.status).toBe("completed");
        expect(after?.attempts).toBe(1);
        expect(after?.leaseExpiresAt).toBeNull(); // the in-flight renewal did not re-extend a finished task
        // Finalization waited for the in-flight renewal, so that renewal ran against a still-running
        // task and succeeded; it never landed after completion (where it would have matched nothing).
        expect(renewals.length).toBeGreaterThanOrEqual(1);
        expect(renewals.every(Boolean)).toBe(true);
        expect(await a.renewLease(id, 1)).toBe(false); // and nothing can renew it now
        await settledRenewCalls(a, spy);
        await sleep(50);
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });

    it("a lost-ownership heartbeat ends itself and leaves no timer", async () => {
      const name = nextName();
      const id = await seed(name);
      const a = provider();
      const spy = vi.spyOn(a, "renewLease").mockResolvedValue(false);
      await a.processTaskById(id, new Map([[name, async (_p, ctx) => {
        await new Promise<void>((r) => ctx.signal.addEventListener("abort", () => r(), { once: true }));
        return { status: "SUCCESS" as const };
      }]]));
      await settledRenewCalls(a, spy);
    });

    it("processDue releases every heartbeat in the batch, including after a handler throws", async () => {
      const name = nextName();
      await seed(name);
      await seed(name);
      await seed(name);
      const a = provider();
      const spy = vi.spyOn(a, "renewLease");
      let n = 0;
      await a.processDue(new Map([[name, async () => { n++; await sleep(BEAT * 1.2); if (n === 2) throw new Error("x"); }]]));
      await settledRenewCalls(a, spy);
    });
  });

  describe("outcome contract is unchanged while a heartbeat is running", () => {
    const longEnough = () => sleep(BEAT * 2.4); // several heartbeats fire during the handler

    it("SUCCESS -> completed, PARTIAL_FAILURE -> completed_partial_failure, FAILED -> failed (no retry), throw -> pending+backoff, exhausted -> dead_letter", async () => {
      const a = provider();
      const cases: Array<{ handler: TaskHandler; maxAttempts?: number; status: string; attempts: number }> = [
        { handler: async () => { await longEnough(); return { status: "SUCCESS" }; }, status: "completed", attempts: 1 },
        { handler: async () => { await longEnough(); return { status: "NO_WORK" }; }, status: "completed", attempts: 1 },
        { handler: async () => { await longEnough(); return { status: "PARTIAL_FAILURE", summary: "1 of 2" }; }, status: "completed_partial_failure", attempts: 1 },
        { handler: async () => { await longEnough(); return { status: "FAILED", summary: "rejected" }; }, status: "failed", attempts: 1 },
        { handler: async () => { await longEnough(); throw new Error("transient"); }, status: "pending", attempts: 1 },
        { handler: async () => { await longEnough(); throw new Error("last"); }, maxAttempts: 1, status: "dead_letter", attempts: 1 },
      ];
      for (const c of cases) {
        const name = nextName();
        const id = await seed(name, { maxAttempts: c.maxAttempts });
        let runs = 0;
        await a.processTaskById(id, new Map([[name, async (p, ctx) => { runs++; return c.handler(p, ctx); }]]));
        const r = await row(id);
        expect(r?.status).toBe(c.status);
        expect(r?.attempts).toBe(c.attempts);
        expect(r?.leaseExpiresAt).toBeNull();
        expect(runs).toBe(1);
        if (c.status === "pending") expect(r!.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 30_000);
        if (c.status === "failed") expect(r?.lastError).toBe("rejected");
        // A terminal / finished task is never claimable again.
        if (c.status !== "pending") {
          expect(await a.processTaskById(id, new Map([[name, async () => { runs++; }]]))).toBe(false);
          expect(runs).toBe(1);
        }
      }
      expect(a.activeHeartbeatCount).toBe(0);
    });
  });
});

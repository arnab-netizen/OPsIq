/**
 * DatabaseSchedulerProvider.processTaskById — real-Postgres proof that the targeted claim has
 * exactly processDue's claim / lease / retry semantics and can never double-execute.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const PREFIX = `sched-byid-${randomUUID().slice(0, 8)}`;
let seq = 0;
const nextName = () => `${PREFIX}-${++seq}`;

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { taskName: { startsWith: PREFIX } } });
});

async function seed(taskName: string, over: { scheduledFor?: Date; status?: string; leaseExpiresAt?: Date | null; maxAttempts?: number } = {}) {
  const id = randomUUID();
  await db.scheduledTask.create({
    data: {
      id,
      taskName,
      scheduledFor: over.scheduledFor ?? new Date(Date.now() - 1000),
      status: over.status ?? "pending",
      leaseExpiresAt: over.leaseExpiresAt ?? null,
      maxAttempts: over.maxAttempts ?? 3,
    },
  });
  return id;
}
const row = (id: string) => db.scheduledTask.findUnique({ where: { id } });
const ok: TaskHandler = async () => ({ status: "SUCCESS" });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] processTaskById", () => {
  const scheduler = new DatabaseSchedulerProvider();

  it("claims and completes only the named task, leaving other due tasks untouched", async () => {
    const name = nextName();
    const target = await seed(name);
    const other = await seed(name);
    const seen: string[] = [];
    const handler: TaskHandler = async (_p, ctx) => { seen.push(ctx.taskId); return { status: "SUCCESS" }; };

    expect(await scheduler.processTaskById(target, new Map([[name, handler]]))).toBe(true);

    expect(seen).toEqual([target]);
    expect((await row(target))?.status).toBe("completed");
    expect((await row(target))?.attempts).toBe(1);
    expect((await row(other))?.status).toBe("pending");
    expect((await row(other))?.attempts).toBe(0);
  });

  it("passes the task's payload, workspace and attempt to the handler (same context as processDue)", async () => {
    const name = nextName();
    const id = randomUUID();
    const workspaceId = randomUUID();
    await db.scheduledTask.create({ data: { id, taskName: name, scheduledFor: new Date(Date.now() - 1000), payload: { a: 1 }, workspaceId } });
    let ctxSeen: unknown;
    let payloadSeen: unknown;
    await scheduler.processTaskById(id, new Map([[name, async (p, ctx) => { payloadSeen = p; ctxSeen = ctx; }]]));
    expect(payloadSeen).toEqual({ a: 1 });
    expect(ctxSeen).toEqual({ taskId: id, taskName: name, workspaceId, attempt: 1 });
  });

  it("returns false and runs nothing for an unknown task id", async () => {
    let runs = 0;
    expect(await scheduler.processTaskById(randomUUID(), new Map([[nextName(), async () => { runs++; }]]))).toBe(false);
    expect(runs).toBe(0);
  });

  it("returns false (does not throw) for a malformed task id", async () => {
    expect(await scheduler.processTaskById("not-a-uuid", new Map())).toBe(false);
    expect(await scheduler.processTaskById("'; DROP TABLE scheduled_tasks; --", new Map())).toBe(false);
    expect(await scheduler.processTaskById("", new Map())).toBe(false);
  });

  for (const status of ["completed", "failed", "dead_letter", "completed_partial_failure"] as const) {
    it(`never runs a ${status} task`, async () => {
      const name = nextName();
      const id = await seed(name, { status });
      let runs = 0;
      expect(await scheduler.processTaskById(id, new Map([[name, async () => { runs++; }]]))).toBe(false);
      expect(runs).toBe(0);
      const after = await row(id);
      expect(after?.status).toBe(status);
      expect(after?.attempts).toBe(0);
    });
  }

  it("does not claim a task that is not yet due", async () => {
    const name = nextName();
    const id = await seed(name, { scheduledFor: new Date(Date.now() + 60_000) });
    expect(await scheduler.processTaskById(id, new Map([[name, ok]]))).toBe(false);
    expect((await row(id))?.status).toBe("pending");
  });

  it("does not claim a running task whose lease is still live (no bypass of lease semantics)", async () => {
    const name = nextName();
    const id = await seed(name, { status: "running", leaseExpiresAt: new Date(Date.now() + 60_000) });
    let runs = 0;
    expect(await scheduler.processTaskById(id, new Map([[name, async () => { runs++; }]]))).toBe(false);
    expect(runs).toBe(0);
    expect((await row(id))?.status).toBe("running");
  });

  it("reclaims a running task whose lease has expired, consuming an attempt", async () => {
    const name = nextName();
    const id = await seed(name, { status: "running", leaseExpiresAt: new Date(Date.now() - 1000) });
    await db.scheduledTask.update({ where: { id }, data: { attempts: 1 } });
    expect(await scheduler.processTaskById(id, new Map([[name, ok]]))).toBe(true);
    const after = await row(id);
    expect(after?.status).toBe("completed");
    expect(after?.attempts).toBe(2);
  });

  it("routes a throwing handler through the retry path", async () => {
    const name = nextName();
    const id = await seed(name);
    expect(await scheduler.processTaskById(id, new Map([[name, async () => { throw new Error("boom"); }]]))).toBe(false);
    const after = await row(id);
    expect(after?.status).toBe("pending");
    expect(after?.attempts).toBe(1);
    expect(after!.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("runs the handler exactly once when several callers race for the same task", async () => {
    const name = nextName();
    const id = await seed(name);
    let runs = 0;
    const handler: TaskHandler = async () => { runs++; await new Promise((r) => setTimeout(r, 200)); return { status: "SUCCESS" }; };
    const map = new Map([[name, handler]]);
    const results = await Promise.all(Array.from({ length: 8 }, () => scheduler.processTaskById(id, map)));
    expect(runs).toBe(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await row(id))?.attempts).toBe(1);
  });

  it("runs the handler exactly once when processDue and processTaskById race for the same task", async () => {
    const name = nextName();
    const id = await seed(name);
    let runs = 0;
    const handler: TaskHandler = async () => { runs++; await new Promise((r) => setTimeout(r, 200)); return { status: "SUCCESS" }; };
    const map = new Map([[name, handler]]);
    await Promise.all([scheduler.processDue(map), scheduler.processTaskById(id, map), scheduler.processDue(map), scheduler.processTaskById(id, map)]);
    expect(runs).toBe(1);
    expect((await row(id))?.status).toBe("completed");
  });

  it("a second call after completion does not re-run the task", async () => {
    const name = nextName();
    const id = await seed(name);
    let runs = 0;
    const map = new Map([[name, async () => { runs++; }]]);
    expect(await scheduler.processTaskById(id, map)).toBe(true);
    expect(await scheduler.processTaskById(id, map)).toBe(false);
    expect(runs).toBe(1);
  });
});

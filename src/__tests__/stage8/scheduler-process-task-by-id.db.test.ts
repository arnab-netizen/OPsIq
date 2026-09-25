/**
 * DatabaseSchedulerProvider.processTaskById — real-DB proof that the targeted
 * claim uses exactly processDue's claim/lease/retry semantics:
 *  - claims ONLY the named task (never another due task);
 *  - never claims a task that is not yet due or is held under a live lease;
 *  - a claimed task whose handler throws goes through the retry path;
 *  - two concurrent calls for the same task run its handler exactly once.
 * workspaceId is left null so no audit rows / workspace FKs are involved.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const TASK = `process-by-id-test-${randomUUID().slice(0, 8)}`;
const created: string[] = [];

async function makeTask(over: { scheduledFor?: Date; status?: string; leaseExpiresAt?: Date | null } = {}) {
  const id = randomUUID();
  created.push(id);
  await db.scheduledTask.create({
    data: {
      id,
      taskName: TASK,
      scheduledFor: over.scheduledFor ?? new Date(Date.now() - 1000),
      status: over.status ?? "pending",
      leaseExpiresAt: over.leaseExpiresAt ?? null,
      maxAttempts: 3,
    },
  });
  return id;
}

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { id: { in: created } } });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("processTaskById [db]", () => {
  const scheduler = new DatabaseSchedulerProvider();

  it("claims and completes only the named task", async () => {
    const target = await makeTask();
    const other = await makeTask();
    const seen: string[] = [];
    const handler: TaskHandler = async (_p, ctx) => { seen.push(ctx.taskId); return { status: "SUCCESS" }; };

    const ok = await scheduler.processTaskById(target, new Map([[TASK, handler]]));

    expect(ok).toBe(true);
    expect(seen).toEqual([target]);
    const [t, o] = await Promise.all([
      db.scheduledTask.findUnique({ where: { id: target } }),
      db.scheduledTask.findUnique({ where: { id: other } }),
    ]);
    expect(t?.status).toBe("completed");
    expect(t?.attempts).toBe(1);
    expect(o?.status).toBe("pending");
    expect(o?.attempts).toBe(0);
  });

  it("does not claim a task that is not yet due", async () => {
    const future = await makeTask({ scheduledFor: new Date(Date.now() + 60_000) });
    const handler: TaskHandler = async () => ({ status: "SUCCESS" });
    expect(await scheduler.processTaskById(future, new Map([[TASK, handler]]))).toBe(false);
    expect((await db.scheduledTask.findUnique({ where: { id: future } }))?.status).toBe("pending");
  });

  it("does not claim a running task whose lease is still live", async () => {
    const held = await makeTask({ status: "running", leaseExpiresAt: new Date(Date.now() + 60_000) });
    const handler: TaskHandler = async () => ({ status: "SUCCESS" });
    expect(await scheduler.processTaskById(held, new Map([[TASK, handler]]))).toBe(false);
    expect((await db.scheduledTask.findUnique({ where: { id: held } }))?.status).toBe("running");
  });

  it("routes a throwing handler through the retry path", async () => {
    const id = await makeTask();
    const handler: TaskHandler = async () => { throw new Error("boom"); };
    expect(await scheduler.processTaskById(id, new Map([[TASK, handler]]))).toBe(false);
    const row = await db.scheduledTask.findUnique({ where: { id } });
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(row?.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("runs the handler exactly once under concurrent calls for the same task", async () => {
    const id = await makeTask();
    let runs = 0;
    const handler: TaskHandler = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 200));
      return { status: "SUCCESS" };
    };
    const map = new Map([[TASK, handler]]);
    const results = await Promise.all([1, 2, 3, 4].map(() => scheduler.processTaskById(id, map)));
    expect(runs).toBe(1);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

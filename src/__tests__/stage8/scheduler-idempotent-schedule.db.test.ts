/**
 * Scheduler idempotent scheduling — real-Postgres proof.
 *
 * The idempotencyKey UNIQUE constraint is the only arbiter. These tests prove that concurrent
 * callers converge on ONE row, that the loser of the insert race (P2002) resolves to the winner
 * instead of throwing, that a key is a permanent identity regardless of the row's status, and
 * that a key can never hand a caller another workspace's or another task type's row.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const PREFIX = `sched-idem-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { taskName: { startsWith: PREFIX } } });
});

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 1000);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] scheduleIdempotent", () => {
  it("two simultaneous callers with the same key: one creator, one row, same id for both", async () => {
    const key = `${PREFIX}:two:${randomUUID()}`;
    const input = { taskName: `${PREFIX}-two`, scheduledFor: future(), idempotencyKey: key };
    const [a, b] = await Promise.all([
      new DatabaseSchedulerProvider().scheduleIdempotent(input),
      new DatabaseSchedulerProvider().scheduleIdempotent(input),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("40 simultaneous callers: no rejection, exactly one creator, exactly one row", async () => {
    const key = `${PREFIX}:many:${randomUUID()}`;
    const input = { taskName: `${PREFIX}-many`, scheduledFor: future(), idempotencyKey: key };
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => new DatabaseSchedulerProvider().scheduleIdempotent(input)),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    const values = results.map((r) => (r as PromiseFulfilledResult<{ id: string; created: boolean }>).value);
    expect(new Set(values.map((v) => v.id)).size).toBe(1);
    expect(values.filter((v) => v.created)).toHaveLength(1);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("the handler runs once for N concurrent schedules of the same key (no duplicate work)", async () => {
    const key = `${PREFIX}:work:${randomUUID()}`;
    const taskName = `${PREFIX}-work`;
    const scheduler = new DatabaseSchedulerProvider();
    const ids = await Promise.all(
      Array.from({ length: 12 }, () => scheduler.schedule({ taskName, scheduledFor: past(), idempotencyKey: key })),
    );
    expect(new Set(ids).size).toBe(1);
    let runs = 0;
    const handler: TaskHandler = async () => { runs++; };
    await Promise.all([scheduler.processDue(new Map([[taskName, handler]])), scheduler.processDue(new Map([[taskName, handler]]))]);
    expect(runs).toBe(1);
  });

  it("schedule() keeps its string contract and returns the existing id on replay", async () => {
    const key = `${PREFIX}:str:${randomUUID()}`;
    const scheduler = new DatabaseSchedulerProvider();
    const a = await scheduler.schedule({ taskName: `${PREFIX}-str`, scheduledFor: future(), idempotencyKey: key });
    const b = await scheduler.schedule({ taskName: `${PREFIX}-str`, scheduledFor: future(), idempotencyKey: key });
    expect(typeof a).toBe("string");
    expect(b).toBe(a);
  });

  it("different keys create distinct tasks", async () => {
    const scheduler = new DatabaseSchedulerProvider();
    const taskName = `${PREFIX}-diff`;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        scheduler.scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: `${PREFIX}:diff:${i}:${randomUUID()}` }),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(6);
    expect(results.every((r) => r.created)).toBe(true);
  });

  it("calls without a key never deduplicate", async () => {
    const scheduler = new DatabaseSchedulerProvider();
    const taskName = `${PREFIX}-nokey`;
    const [a, b] = await Promise.all([
      scheduler.scheduleIdempotent({ taskName, scheduledFor: future() }),
      scheduler.scheduleIdempotent({ taskName, scheduledFor: future() }),
    ]);
    expect(a.id).not.toBe(b.id);
    expect(a.created && b.created).toBe(true);
  });

  describe("a key is a permanent identity, whatever the existing row's status (pinned contract)", () => {
    for (const status of ["completed", "failed", "dead_letter", "completed_partial_failure", "running"] as const) {
      it(`replaying a key held by a ${status} task returns that task and creates nothing`, async () => {
        const key = `${PREFIX}:status:${status}:${randomUUID()}`;
        const taskName = `${PREFIX}-status`;
        const id = randomUUID();
        await db.scheduledTask.create({
          data: { id, taskName, scheduledFor: past(), status, idempotencyKey: key, completedAt: status === "running" ? null : new Date() },
        });
        const result = await new DatabaseSchedulerProvider().scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key });
        expect(result).toEqual({ id, created: false });
        const row = await db.scheduledTask.findUnique({ where: { id } });
        expect(row?.status).toBe(status);
        expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
      });
    }

    it("a terminally failed task is NOT re-run by replaying its key; a new generation needs a new key", async () => {
      const taskName = `${PREFIX}-gen`;
      const key = `${PREFIX}:gen:${randomUUID()}`;
      const scheduler = new DatabaseSchedulerProvider();
      const first = await scheduler.scheduleIdempotent({ taskName, scheduledFor: past(), idempotencyKey: key });
      let runs = 0;
      const handlers = new Map<string, TaskHandler>([[taskName, async () => { runs++; return { status: "FAILED", summary: "rejected" }; }]]);
      await scheduler.processTaskById(first.id, handlers);
      expect((await db.scheduledTask.findUnique({ where: { id: first.id } }))?.status).toBe("failed");

      const replay = await scheduler.scheduleIdempotent({ taskName, scheduledFor: past(), idempotencyKey: key });
      expect(replay).toEqual({ id: first.id, created: false });
      await scheduler.processDue(handlers);
      expect(runs).toBe(1);

      const next = await scheduler.scheduleIdempotent({ taskName, scheduledFor: past(), idempotencyKey: `${key}:gen2` });
      expect(next.created).toBe(true);
      expect(next.id).not.toBe(first.id);
    });
  });

  describe("tenant and task-type isolation", () => {
    it("the same key from a different workspace is refused, never resolved to the other workspace's task", async () => {
      const key = `${PREFIX}:ws:${randomUUID()}`;
      const taskName = `${PREFIX}-ws`;
      const wsA = randomUUID();
      const wsB = randomUUID();
      const scheduler = new DatabaseSchedulerProvider();
      const a = await scheduler.scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key, workspaceId: wsA });
      await expect(scheduler.scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key, workspaceId: wsB })).rejects.toMatchObject({ statusCode: 409 });
      await expect(scheduler.scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key })).rejects.toMatchObject({ statusCode: 409 });
      const row = await db.scheduledTask.findUnique({ where: { id: a.id } });
      expect(row?.workspaceId).toBe(wsA);
      expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it("the loser of a concurrent cross-workspace race is refused too (P2002 path), not handed the winner's id", async () => {
      const key = `${PREFIX}:wsrace:${randomUUID()}`;
      const taskName = `${PREFIX}-wsrace`;
      const results = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((workspaceId) =>
          new DatabaseSchedulerProvider().scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key, workspaceId }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ statusCode: 409 });
      expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it("the same key for a different task type is refused", async () => {
      const key = `${PREFIX}:type:${randomUUID()}`;
      const scheduler = new DatabaseSchedulerProvider();
      await scheduler.scheduleIdempotent({ taskName: `${PREFIX}-type-a`, scheduledFor: future(), idempotencyKey: key });
      await expect(
        scheduler.scheduleIdempotent({ taskName: `${PREFIX}-type-b`, scheduledFor: future(), idempotencyKey: key }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("the refusal does not reveal the other task's workspace or id", async () => {
      const key = `${PREFIX}:leak:${randomUUID()}`;
      const taskName = `${PREFIX}-leak`;
      const wsA = randomUUID();
      const scheduler = new DatabaseSchedulerProvider();
      const a = await scheduler.scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key, workspaceId: wsA });
      const err = await scheduler
        .scheduleIdempotent({ taskName, scheduledFor: future(), idempotencyKey: key, workspaceId: randomUUID() })
        .catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      const text = JSON.stringify({ message: (err as Error).message, details: (err as { details?: unknown }).details });
      expect(text).not.toContain(wsA);
      expect(text).not.toContain(a.id);
    });
  });
});

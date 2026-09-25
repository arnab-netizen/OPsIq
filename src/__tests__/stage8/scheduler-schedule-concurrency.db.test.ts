/**
 * DatabaseSchedulerProvider.schedule — real-DB proof that concurrent callers
 * with the same idempotencyKey converge on ONE row: the loser of the create
 * race (P2002) resolves to the winner's id instead of throwing a raw
 * constraint error, and exactly one caller is reported as the creator.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const TASK = `schedule-concurrency-test-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.scheduledTask.deleteMany({ where: { taskName: TASK } });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("schedule idempotency under concurrency [db]", () => {
  it("10 concurrent identical requests all fulfil with the same id and create one row", async () => {
    const key = `${TASK}:${randomUUID()}`;
    const scheduledFor = new Date(Date.now() + 60_000);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        new DatabaseSchedulerProvider().scheduleIdempotent({ taskName: TASK, scheduledFor, idempotencyKey: key }),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const values = results.map((r) => (r as PromiseFulfilledResult<{ id: string; created: boolean }>).value);
    expect(new Set(values.map((v) => v.id)).size).toBe(1);
    expect(values.filter((v) => v.created)).toHaveLength(1);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("schedule() keeps its string contract and returns the existing id on replay", async () => {
    const key = `${TASK}:${randomUUID()}`;
    const scheduler = new DatabaseSchedulerProvider();
    const scheduledFor = new Date(Date.now() + 60_000);
    const a = await scheduler.schedule({ taskName: TASK, scheduledFor, idempotencyKey: key });
    const b = await scheduler.schedule({ taskName: TASK, scheduledFor, idempotencyKey: key });
    expect(typeof a).toBe("string");
    expect(b).toBe(a);
  });

  it("non-idempotent schedules are unaffected (distinct rows)", async () => {
    const scheduler = new DatabaseSchedulerProvider();
    const scheduledFor = new Date(Date.now() + 60_000);
    const [a, b] = await Promise.all([scheduler.schedule({ taskName: TASK, scheduledFor }), scheduler.schedule({ taskName: TASK, scheduledFor })]);
    expect(a).not.toBe(b);
  });
});

/**
 * IDEM-01 regression [db]: withIdempotency must be DURABLE, not a no-op.
 *
 * Before the fix it always ran the operation and returned {isNew:true}, so duplicate
 * submissions with the same key executed twice. Now a repeated key replays the original
 * result without re-running the operation, a different payload on the same key is rejected,
 * and an in-flight duplicate is rejected.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { withIdempotency } from "@/infra/idempotency";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] IDEM-01 withIdempotency is durable", () => {
  const keys: string[] = [];

  afterEach(async () => {
    if (keys.length) {
      await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: { in: keys } } });
      keys.length = 0;
    }
  });

  it("runs the operation once and replays the result on a duplicate key", async () => {
    const key = randomUUID();
    keys.push(key);
    let calls = 0;
    const op = async () => {
      calls += 1;
      return { value: 42, ranOn: calls };
    };

    const first = await withIdempotency(key, "test.op", op, { a: 1 });
    const second = await withIdempotency(key, "test.op", op, { a: 1 });

    expect(first.isNew).toBe(true);
    expect(first.result).toEqual({ value: 42, ranOn: 1 });
    expect(second.isNew).toBe(false);
    expect(second.result).toEqual({ value: 42, ranOn: 1 }); // replayed, not re-run
    expect(calls).toBe(1); // operation executed exactly once
  });

  it("rejects the same key reused with a different payload", async () => {
    const key = randomUUID();
    keys.push(key);
    await withIdempotency(key, "test.op", async () => ({ ok: true }), { a: 1 });
    await expect(
      withIdempotency(key, "test.op", async () => ({ ok: true }), { a: 2 })
    ).rejects.toThrow(/different payload/i);
  });

  it("persists a record so duplicates survive across calls (not in-memory)", async () => {
    const key = randomUUID();
    keys.push(key);
    await withIdempotency(key, "persist.op", async () => ({ done: true }), {});
    const row = await db.idempotencyRecord.findFirst({ where: { idempotencyKey: key } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("completed");
  });
});

/**
 * F-PROD-STARTUP-COLDSTART — hostile real-Postgres proof for the
 * withStatementTimeout() maxWait fix (src/lib/db.ts).
 *
 * Root cause being closed: withStatementTimeout() used to call
 * prisma.$transaction(fn) with NO options object, silently inheriting
 * Prisma's own default maxWait (2000ms) — the time allowed to ACQUIRE a
 * connection before the transaction body even starts. Against this app's
 * production-equivalent max:1 connection pool, any transaction attempt that
 * has to wait more than 2s for the pool's sole connection to free up
 * (exactly what a concurrent cold-start burst or a slow-to-wake Neon compute
 * produces) threw PrismaClientKnownRequestError P2028 even though nothing
 * was actually broken — the connection simply wasn't free YET. The fix sets
 * an explicit, longer maxWait (TRANSACTION_ACQUIRE_MAX_WAIT_MS, 10s) and a
 * derived `timeout` so Prisma's own execution clock can never fire before
 * the function's own Postgres-side statement_timeout would.
 *
 * This suite forces REAL contention on the shared max:1 pool (a raw
 * `pg_sleep` query holds the pool's only connection) rather than mocking
 * Prisma, so the proof is against actual acquisition-queueing behavior, not
 * a simulation of it.
 *
 * Requires: TEST_WITH_DB=true and a reachable PostgreSQL instance.
 */
import { describe, it, expect } from "vitest";
import { db, withStatementTimeout, TRANSACTION_ACQUIRE_MAX_WAIT_MS } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const SKIP = !SHOULD_RUN_DB_TESTS;

/**
 * Fire a pg_sleep that occupies the pool's sole connection for `ms`.
 *
 * Deliberately NOT `async` and returns the bare query promise unawaited —
 * an async wrapper that itself `await`s the query before returning would
 * have JS's promise-flattening wait for the WHOLE sleep before the caller
 * ever gets control back, defeating the point of concurrent contention.
 *
 * `pg_sleep()`'s own return type is `void`, which Prisma's raw-query
 * deserializer cannot represent — the sleep is wrapped in a FROM-clause
 * subquery so the void column itself is never part of the top-level
 * SELECT list Prisma tries to deserialize.
 *
 * Prisma's query methods return a lazily-dispatched `PrismaPromise`, not a
 * plain eagerly-executing Promise — the actual query is not sent over the
 * wire until something calls `.then()`/`.catch()`/`.finally()` on it (this
 * is what lets `$transaction([...])` batch un-started queries). Returning
 * the bare PrismaPromise here without ever `.then()`-ing it until the
 * caller's own trailing `await hold` would leave the connection genuinely
 * un-acquired for the entire "contention window" this test is trying to
 * create — verified directly: an identical query left un-`.then()`'d for
 * 250ms measurably did not yet hold the pool's connection. Attaching a
 * no-op `.then()` immediately forces real dispatch now, while still
 * returning (not awaiting) the promise so the caller regains control
 * immediately.
 */
function holdSoleConnection(ms: number): Promise<unknown> {
  const p = db.$queryRawUnsafe(`SELECT 1 AS ok FROM (SELECT pg_sleep(${(ms / 1000).toFixed(3)})) AS _sleep`);
  void p.then(undefined, undefined); // force immediate dispatch, ignore here — caller awaits `p` itself later
  return p;
}

/** Give a just-fired query a moment to actually acquire the pool's
 *  connection before the caller starts its own competing acquisition. */
function settle(ms = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe.skipIf(SKIP)("[db] F-PROD-STARTUP-COLDSTART — withStatementTimeout maxWait hostile proof", () => {
  it(
    "succeeds once the sole connection frees up within the new maxWait, even though the wait exceeds the OLD 2000ms default that would have failed here",
    async () => {
      const holdMs = 3500; // > old default maxWait (2000ms); comfortably < new maxWait (10000ms)
      const hold = holdSoleConnection(holdMs);
      await settle();

      const start = Date.now();
      const result = await withStatementTimeout(db, 1000, (tx) => tx.$queryRaw`SELECT 1 as one`);
      const elapsed = Date.now() - start;

      expect(result).toEqual([{ one: 1 }]);
      // Proves it genuinely waited past the point the OLD default would have thrown.
      expect(elapsed).toBeGreaterThan(2000);
      expect(elapsed).toBeLessThan(TRANSACTION_ACQUIRE_MAX_WAIT_MS);
      await hold;
    },
    20_000
  );

  it(
    "still fails within a deliberate finite upper bound when contention outlasts the new maxWait — it never hangs forever, and the failure is a genuine rejection, not a false-success value",
    async () => {
      const holdMs = TRANSACTION_ACQUIRE_MAX_WAIT_MS + 4000; // deliberately outlasts the new bound
      const hold = holdSoleConnection(holdMs);
      await settle();

      const start = Date.now();
      let caught: unknown = null;
      let resolvedValue: unknown = "SENTINEL_NOT_SET";
      try {
        resolvedValue = await withStatementTimeout(db, 1000, (tx) => tx.$queryRaw`SELECT 1`);
      } catch (err) {
        caught = err;
      }
      const elapsed = Date.now() - start;

      // The core false-success mechanism this closes: on genuine timeout, the call must
      // REJECT (something a caller cannot mistake for a successful query result) — it must
      // not resolve to undefined/null/a truthy placeholder that downstream code could read
      // as "the check passed."
      expect(caught).not.toBeNull();
      expect(resolvedValue).toBe("SENTINEL_NOT_SET"); // never resolved
      expect(elapsed).toBeGreaterThan(TRANSACTION_ACQUIRE_MAX_WAIT_MS - 1500); // bounded near the new maxWait...
      expect(elapsed).toBeLessThan(TRANSACTION_ACQUIRE_MAX_WAIT_MS + 4000); // ...not indefinite

      await hold; // let the sleeper finish so it doesn't leak connection state into the next test
    },
    20_000
  );

  it(
    "the pool connection remains reusable immediately after a maxWait failure — the failed acquisition attempt does not poison or leak the pool",
    async () => {
      const holdMs = TRANSACTION_ACQUIRE_MAX_WAIT_MS + 3000;
      const hold = holdSoleConnection(holdMs);
      await settle();

      await expect(
        withStatementTimeout(db, 1000, (tx) => tx.$queryRaw`SELECT 1`)
      ).rejects.toThrow();

      await hold; // sole connection now free again

      const after = await db.$queryRaw`SELECT 2 as two`;
      expect(after).toEqual([{ two: 2 }]);
    },
    20_000
  );
});

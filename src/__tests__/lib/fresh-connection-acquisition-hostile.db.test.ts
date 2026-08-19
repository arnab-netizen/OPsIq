/**
 * [db] F-PROD-STARTUP-COLDSTART second-mechanism forensic — fresh-connection
 * acquisition timing, per the owner's explicit item 4 requirement:
 *
 *   "Prove the relationship between: pg connectionTimeoutMillis = 90000,
 *    Prisma transaction maxWait = 10000. Specifically determine whether a
 *    fresh physical connection taking >10s but <90s causes Prisma P2028
 *    even though the underlying pg connection attempt would otherwise have
 *    succeeded."
 *
 * PR #322's fix (a process-local acquisition queue) targets SAME-PROCESS
 * contention -- multiple withStatementTimeout() callers competing for one
 * already-initialized pool's connection. The first post-merge production
 * observation found a P2028 recurrence with NO AcquisitionQueueTimeoutError
 * anywhere in the logs, on a deployment where raw logs show every ~60s poll
 * re-triggering instrumentation.ts's register() and constructing a BRAND
 * NEW pg.Pool -- i.e. a genuinely fresh, never-before-used pool/connection,
 * not a same-process contention case at all.
 *
 * This suite tests a DIFFERENT, second candidate mechanism directly: does
 * Prisma's $transaction({maxWait: 10_000}) race its own maxWait clock
 * against the FIRST-EVER connection attempt on a freshly-constructed pool,
 * independent of whether that connection would have succeeded well within
 * the pool's own much longer connectionTimeoutMillis (90_000)? If so, any
 * fresh pool whose first physical connection takes somewhere between 10s
 * and 90s to establish -- e.g. genuine network/TLS/auth latency to Neon,
 * unrelated to compute wake or same-process queuing -- would produce the
 * exact same P2028 signature, entirely independent of PR #322's fix.
 *
 * Method: construct a real pg.Pool against local Postgres, but wrap its
 * `connect()` method so the FIRST call is artificially delayed before
 * delegating to the real implementation (which still succeeds normally).
 * This is a test-only wrapper around a test-only pool -- it does not
 * change any production code path or semantics. Wire the delayed pool into
 * a real PrismaPg adapter and a real PrismaClient, then call the actual
 * production withStatementTimeout() (src/lib/db.ts) against it -- the
 * exact function every production call site uses.
 *
 * Requires: TEST_WITH_DB=true, a migrated local PostgreSQL.
 */

import { describe, it, expect, afterEach } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { withStatementTimeout, TRANSACTION_ACQUIRE_MAX_WAIT_MS } from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS;

function assertLocalUrl(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[fresh-connection-acquisition] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[fresh-connection-acquisition] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

const pools: Pool[] = [];

/**
 * Real pg.Pool against local Postgres, with its connect() wrapped so the
 * FIRST call is delayed by exactly `delayMs` before delegating to the real
 * connect() -- which still succeeds normally. Every subsequent call (there
 * shouldn't be one in these single-shot tests) goes straight through.
 */
function createFreshPoolWithDelayedFirstConnect(delayMs: number): Pool {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  assertLocalUrl(url);

  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 90_000,
  });
  pools.push(pool);

  const realConnect = pool.connect.bind(pool);
  let firstCallConsumed = false;
  (pool as unknown as { connect: typeof pool.connect }).connect = ((...args: unknown[]) => {
    if (!firstCallConsumed) {
      firstCallConsumed = true;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
          (realConnect as any)(...args).then(resolve, reject);
        }, delayMs);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
    return (realConnect as any)(...args);
  }) as typeof pool.connect;

  return pool;
}

async function createFreshPrismaClient(delayMs: number) {
  const pool = createFreshPoolWithDelayedFirstConnect(delayMs);
  const adapter = new PrismaPg(pool);
  const { PrismaClient } = await import("@/generated/prisma/client");
  const client = new PrismaClient({ adapter });
  return client;
}

describe.skipIf(SKIP)("[db] second-mechanism forensic: fresh-pool first-connection acquisition timing", () => {
  afterEach(async () => {
    while (pools.length) {
      const p = pools.pop()!;
      await p.end().catch(() => undefined);
    }
  });

  it(
    "sanity: TRANSACTION_ACQUIRE_MAX_WAIT_MS (10s) is well inside pg connectionTimeoutMillis (90s) -- the gap this test probes",
    () => {
      expect(TRANSACTION_ACQUIRE_MAX_WAIT_MS).toBe(10_000);
    },
  );

  it(
    "PROVEN/DISPROVEN: a fresh pool whose first physical connection takes 12s (>maxWait, <connectionTimeoutMillis) produces Prisma P2028 even though the connection itself would have succeeded",
    async () => {
      const client = await createFreshPrismaClient(12_000);

      const start = Date.now();
      let caught: unknown;
      try {
        await withStatementTimeout(client, 2_000, (tx) => tx.$queryRaw`SELECT 1 AS one`);
      } catch (err) {
        caught = err;
      }
      const elapsed = Date.now() - start;

      expect(caught).toBeDefined();
      const message = caught instanceof Error ? caught.message : String(caught);
      expect(message).toMatch(/Unable to start a transaction|P2028/i);
      // Failed close to the 10s maxWait boundary -- well before the 12s
      // mark, at which point the underlying connection would actually have
      // succeeded. This is the decisive evidence: Prisma's maxWait clock
      // races the FIRST connection attempt itself, independent of whether
      // that attempt would eventually succeed within the pool's own much
      // longer connectionTimeoutMillis.
      expect(elapsed).toBeGreaterThan(9_000);
      expect(elapsed).toBeLessThan(11_500);

      await client.$disconnect().catch(() => undefined);
    },
    20_000,
  );

  it(
    "control: a fresh pool whose first connection takes 3s (<maxWait) succeeds normally",
    async () => {
      const client = await createFreshPrismaClient(3_000);

      const start = Date.now();
      const result = await withStatementTimeout(client, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`);
      const elapsed = Date.now() - start;

      expect(result).toEqual([{ one: 1 }]);
      expect(elapsed).toBeGreaterThan(2_500);
      expect(elapsed).toBeLessThan(6_000);

      await client.$disconnect().catch(() => undefined);
    },
    15_000,
  );

  it(
    "control: a fresh pool with NO artificial delay (genuinely instant local connection) succeeds well within maxWait",
    async () => {
      const client = await createFreshPrismaClient(0);

      const start = Date.now();
      const result = await withStatementTimeout(client, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`);
      const elapsed = Date.now() - start;

      expect(result).toEqual([{ one: 1 }]);
      expect(elapsed).toBeLessThan(2_000);

      await client.$disconnect().catch(() => undefined);
    },
    10_000,
  );
});

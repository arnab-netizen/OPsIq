/**
 * F-PGBOUNCER-TXN-SAFETY -- real PgBouncer (transaction-pool mode) proof.
 *
 * MISSION: make withRawStatementTimeout() safe under Neon Production's real
 * pooled-connection topology: PgBouncer in `pool_mode = transaction`. Neon's
 * own docs state "Neon uses PgBouncer in transaction mode
 * (`pool_mode=transaction`)"; both Neon's and PgBouncer's own docs list
 * `SET`/`RESET` (session variables) as "Never" supported / not supported on
 * a transaction-pooled connection, because PgBouncer may hand the client a
 * DIFFERENT backend server connection for its next statement.
 *
 * This file runs against a REAL local PgBouncer instance (see
 * ../test-helpers/pgbouncer-harness.ts), not a mock -- gated on
 * TEST_WITH_PGBOUNCER=true and the `pgbouncer` binary actually being
 * resolvable. CI does not install PgBouncer: SHOULD_RUN_PGBOUNCER_TESTS is
 * expected to be false there, which this file reports honestly rather than
 * faking transaction-pooling behavior with a mock (mission Phase 4:
 * "Do NOT fake PgBouncer behavior with a mock and call that
 * Production-equivalent proof... If a true transaction-mode reproduction
 * cannot be constructed: report PGBouncer_REPRODUCTION=BLOCKED").
 *
 * Requires: TEST_WITH_DB=true, TEST_WITH_PGBOUNCER=true, a migrated local
 * PostgreSQL instance, and a locally resolvable `pgbouncer` binary
 * (`brew install pgbouncer` on macOS).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import {
  SHOULD_RUN_PGBOUNCER_TESTS,
  startPgBouncer,
  type PgBouncerHandle,
} from "@/__tests__/test-helpers/pgbouncer-harness";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { withRawStatementTimeout } from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS || !SHOULD_RUN_PGBOUNCER_TESTS;

function directPostgresUrl(): string {
  return process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
}

function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\//, "");
}

function assertLocalUrl(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[pgbouncer-transaction-safety-hostile] DATABASE_URL is not a valid URL");
  }
  const isLocal = hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[pgbouncer-transaction-safety-hostile] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

describe.skipIf(SKIP)("[db][pgbouncer] withRawStatementTimeout() is safe under real PgBouncer transaction pooling", () => {
  let bouncer: PgBouncerHandle;
  const pools: Pool[] = [];

  beforeAll(() => {
    const directUrl = directPostgresUrl();
    assertLocalUrl(directUrl);
    bouncer = startPgBouncer(directUrl, databaseNameFromUrl(directUrl));
  });

  afterAll(() => {
    bouncer?.stop();
  });

  afterEach(async () => {
    while (pools.length) {
      const p = pools.pop()!;
      await p.end().catch(() => undefined);
    }
  });

  function freshPool(): Pool {
    const p = new Pool({ connectionString: bouncer.proxyUrl, max: 1 });
    pools.push(p);
    return p;
  }

  /** Forces a fresh, unpoisoned backend baseline before a RED/leak-sensitive test, by restarting the proxy. */
  function resetBouncer(): void {
    bouncer.stop();
    const directUrl = directPostgresUrl();
    bouncer = startPgBouncer(directUrl, databaseNameFromUrl(directUrl));
  }

  describe("Phase 5 RED proof: the OLD (pre-fix) plain session-level SET pattern leaks across unrelated connections", () => {
    it(
      "RED: a plain `SET statement_timeout` (no transaction) on one connection leaks onto a completely separate, later client's untimed query",
      async () => {
        resetBouncer();
        // Client A: reproduces withRawStatementTimeout()'s OLD (pre-fix)
        // behavior directly -- a plain, non-transactional SET -- then fully
        // disconnects. This is NOT calling production code (which is
        // already fixed); it is a standalone reproduction of the exact
        // pattern the fix replaces, proving the DEFECT CLASS is real under
        // real PgBouncer transaction pooling, independent of this
        // repository's own code.
        const poolA = freshPool();
        const clientA = await poolA.connect();
        await clientA.query("SET statement_timeout = 300");
        clientA.release();
        await poolA.end();
        pools.splice(pools.indexOf(poolA), 1);

        // Client B: a completely separate connection, no SET of its own.
        const poolB = freshPool();
        const clientB = await poolB.connect();
        const start = Date.now();
        let caught: unknown;
        try {
          await clientB.query("SELECT pg_sleep(2)");
        } catch (e) {
          caught = e;
        }
        const elapsed = Date.now() - start;
        clientB.release();

        // The leak: B's untimed query was wrongly cancelled by A's leftover
        // 300ms setting, on a backend B never configured anything on.
        expect(caught).toBeDefined();
        expect((caught as { code?: unknown } | null)?.code).toBe("57014");
        expect(elapsed).toBeLessThan(1_000);
      },
      15_000,
    );
  });

  describe("Phase 9 Test A: success -- BEGIN; SET LOCAL; fast query; COMMIT", () => {
    it("a fast query inside the fixed primitive succeeds normally through the real proxy", async () => {
      const pool = freshPool();
      const result = await withRawStatementTimeout(
        pool,
        5_000,
        (client) => client.query<{ one: number }>("SELECT 1 AS one"),
        "pgbouncer-test-a-success",
      );
      expect(result.rows).toEqual([{ one: 1 }]);
    }, 15_000);
  });

  describe("Phase 9 Test B: timeout -- a blocking query exceeding the bound is cancelled with SQLSTATE 57014", () => {
    it("a query past statement_timeout is genuinely cancelled server-side (57014), not merely abandoned client-side", async () => {
      const pool = freshPool();
      let caught: unknown;
      try {
        await withRawStatementTimeout(pool, 300, (client) => client.query("SELECT pg_sleep(2)"), "pgbouncer-test-b-timeout");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      expect((caught as { code?: unknown } | null)?.code).toBe("57014");
    }, 15_000);
  });

  describe("Phase 9 Test C: reuse -- the next call on the same application-side pool succeeds normally after a cancellation", () => {
    it("pool recovery after Test B's cancellation", async () => {
      const pool = freshPool();
      await expect(
        withRawStatementTimeout(pool, 300, (client) => client.query("SELECT pg_sleep(2)"), "pgbouncer-test-c-setup"),
      ).rejects.toMatchObject({ code: "57014" });

      const result = await withRawStatementTimeout(
        pool,
        5_000,
        (client) => client.query<{ one: number }>("SELECT 1 AS one"),
        "pgbouncer-test-c-reuse",
      );
      expect(result.rows).toEqual([{ one: 1 }]);
    }, 15_000);
  });

  describe("Phase 9 Test D: the fixed primitive's SET LOCAL does not leak to a later, unrelated connection", () => {
    it(
      "GREEN: withRawStatementTimeout()'s real (fixed) BEGIN/SET LOCAL/COMMIT does NOT leak onto a separate later client's untimed query",
      async () => {
        resetBouncer();
        const poolA = freshPool();
        await withRawStatementTimeout(
          poolA,
          300,
          (client) => client.query("SELECT 1"),
          "pgbouncer-test-d-fixed-no-leak",
        );
        await poolA.end();
        pools.splice(pools.indexOf(poolA), 1);

        const poolB = freshPool();
        const clientB = await poolB.connect();
        const start = Date.now();
        await clientB.query("SELECT pg_sleep(2)");
        const elapsed = Date.now() - start;
        clientB.release();

        // No leak: B's untimed 2s query succeeded in full, proving A's
        // transaction-scoped SET LOCAL correctly reverted at COMMIT and
        // never touched the backend B happened to receive.
        expect(elapsed).toBeGreaterThan(1_900);
      },
      15_000,
    );
  });

  describe("Phase 9 Test E: concurrent clients through the same transaction-pooled proxy do not leak state between each other", () => {
    it(
      "a short-timeout caller's cancellation never affects a concurrent long-timeout caller's own, unrelated query",
      async () => {
        resetBouncer();
        const poolShort = freshPool();
        const poolLong = freshPool();

        const shortCaller = withRawStatementTimeout(
          poolShort,
          300,
          (client) => client.query("SELECT pg_sleep(2)"),
          "pgbouncer-test-e-short",
        ).catch((e) => ({ failed: true, code: (e as { code?: unknown })?.code }));

        const longCaller = withRawStatementTimeout(
          poolLong,
          5_000,
          (client) => client.query<{ one: number }>("SELECT 1 AS one, pg_sleep(1)"),
          "pgbouncer-test-e-long",
        );

        const [shortResult, longResult] = await Promise.all([shortCaller, longCaller]);
        expect(shortResult).toMatchObject({ failed: true, code: "57014" });
        expect(longResult.rows[0]?.one).toBe(1);
      },
      15_000,
    );
  });

  describe("Phase 11 write safety: a cancelled statement never commits a partial write", () => {
    const testTable = "pgbouncer_txn_safety_write_test";

    beforeAll(async () => {
      const pool = freshPool();
      await pool.query(`CREATE TABLE IF NOT EXISTS "${testTable}" (id text primary key)`);
      await pool.end();
      pools.splice(pools.indexOf(pool), 1);
    });

    afterAll(async () => {
      const directUrl = directPostgresUrl();
      const cleanupPool = new Pool({ connectionString: directUrl, max: 1 });
      await cleanupPool.query(`DROP TABLE IF EXISTS "${testTable}"`).catch(() => undefined);
      await cleanupPool.end();
    });

    it(
      "an INSERT followed by a statement that gets cancelled is fully rolled back -- the row never persists",
      async () => {
        const rowId = `write-safety-${Date.now()}`;
        const pool = freshPool();
        let caught: unknown;
        try {
          await withRawStatementTimeout(
            pool,
            300,
            async (client) => {
              await client.query(`INSERT INTO "${testTable}" (id) VALUES ($1)`, [rowId]);
              // This second statement in the SAME transaction blocks past
              // the 300ms bound, forcing a 57014 cancellation -- the
              // transaction must then roll back, undoing the INSERT above
              // too, since both ran in the same unconfirmed transaction.
              await client.query("SELECT pg_sleep(2)");
            },
            "pgbouncer-test-write-safety",
          );
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeDefined();
        expect((caught as { code?: unknown } | null)?.code).toBe("57014");

        // Verify from a totally separate, fresh connection -- not the one
        // the primitive just used -- that the row was never actually
        // committed.
        const directUrl = directPostgresUrl();
        const verifyPool = new Pool({ connectionString: directUrl, max: 1 });
        const verify = await verifyPool.query(`SELECT id FROM "${testTable}" WHERE id = $1`, [rowId]);
        await verifyPool.end();
        expect(verify.rows.length).toBe(0);
      },
      15_000,
    );
  });
});

/**
 * F-ROOT-ROUTE-FAST-FAIL: end-to-end wiring proof for getPublicReadPool()
 * (db.ts) against a real PgBouncer transaction-pooled proxy. Does NOT
 * re-prove the BEGIN/SET LOCAL/COMMIT-or-ROLLBACK transaction-safety
 * mechanism itself -- that is already proven generically above (and this
 * fix does not modify withRawStatementTimeout() at all, so every invariant
 * proven above transfers unconditionally to any pool passed into it,
 * including this one). What IS new here, and not covered above: that
 * getPublicReadPool()'s own construction (env-URL resolution, pg.Pool
 * config) actually produces a working pool when pointed at a real
 * transaction-mode PgBouncer proxy, exercised through the real call site
 * (getPublicAdmissionMode()), not a hand-constructed pool.
 */
describe.skipIf(SKIP)("[db][pgbouncer] getPublicReadPool() dedicated pool works end-to-end through real PgBouncer transaction pooling", () => {
  let bouncer: PgBouncerHandle;
  let originalDatabaseUrl: string | undefined;
  const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;

  beforeAll(() => {
    const directUrl = directPostgresUrl();
    assertLocalUrl(directUrl);
    bouncer = startPgBouncer(directUrl, databaseNameFromUrl(directUrl));
  });

  afterAll(() => {
    bouncer?.stop();
  });

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
      pgPublicReadPool: { end?: () => Promise<void> } | undefined;
      pgPublicReadPoolPromise: unknown;
    };
    // Santa-loop review finding: this pool was constructed against the
    // bouncer proxy, which `afterAll` stops -- end() it explicitly here
    // rather than leaking it, and clear BOTH the resolved-pool and
    // in-flight-promise slots so a later test in a different file (or a
    // re-run of this one) never silently inherits a pool pointed at an
    // already-stopped proxy.
    await globalForPrisma.pgPublicReadPool?.end?.().catch(() => undefined);
    globalForPrisma.pgPublicReadPool = undefined;
    globalForPrisma.pgPublicReadPoolPromise = undefined;
    vi.resetModules();
  });

  it(
    "getPublicAdmissionMode() succeeds through the dedicated pool routed via a real transaction-pooled PgBouncer proxy",
    async () => {
      originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = bouncer.proxyUrl;
      delete process.env.PUBLIC_BETA_ENABLED;
      const globalForPrisma = globalThis as unknown as {
        prisma: unknown;
        prismaPromise: unknown;
        pgPool: unknown;
        pgPublicReadPool: unknown;
        pgPublicReadPoolPromise: unknown;
      };
      globalForPrisma.pgPublicReadPool = undefined;
      globalForPrisma.pgPublicReadPoolPromise = undefined;
      vi.resetModules();

      const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");
      const mode = await getPublicAdmissionMode();
      // No platform_settings row in this disposable DB / PUBLIC_BETA_ENABLED
      // unset -- deterministic legacy fallback, proving a real query
      // actually ran through the proxy rather than silently failing closed.
      expect(mode).toBe("INVITE_ONLY");

      // A second call reuses the same dedicated pool -- proves the
      // connection PgBouncer handed back is reusable for a follow-up
      // transaction-pooled statement, not a one-shot fluke.
      const mode2 = await getPublicAdmissionMode();
      expect(mode2).toBe("INVITE_ONLY");
    },
    15_000,
  );
});

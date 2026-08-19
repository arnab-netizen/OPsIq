/**
 * [db] withRawStatementTimeout() shared-primitive hostile hardening.
 *
 * F-PROD-STARTUP-COLDSTART second-mechanism forensic: withRawStatementTimeout()
 * (src/lib/db.ts) is now production infrastructure shared by claimStartup(),
 * checkDatabase(), checkMigrationReadiness(), and getSession(). This suite
 * audits the helper itself, against real PostgreSQL, per the owner's exact
 * "RAW HELPER FAMILY HOSTILE SWEEP" requirements:
 *
 *   - SET statement_timeout is actually applied before fn runs
 *   - RESET on success
 *   - RESET after a genuine SQLSTATE 57014 (query_canceled) cancellation
 *   - discard (not reuse) the connection for an unknown/connection-level error
 *   - client.release() is called exactly once per invocation
 *   - no checked-out-client leak — the pool's connection count returns to
 *     baseline after every outcome (success, cancellation, unknown error)
 *   - no session-level statement_timeout leaks across borrowers sharing the
 *     same physical connection (the decisive regression this suite adds):
 *     borrow, set a short timeout, return; borrow the SAME pooled connection
 *     again, run a query that would exceed the PREVIOUS timeout but is well
 *     under its own — must succeed, proving the reset actually took effect.
 *   - timeoutMs is never string-interpolated from unvalidated input — only a
 *     Math.trunc()'d, Number.isFinite()-checked positive integer ever reaches
 *     the SQL text.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Pool } from "pg";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { withRawStatementTimeout } from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS;

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[db-raw-statement-timeout-hostile] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[db-raw-statement-timeout-hostile] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

describe.skipIf(SKIP)("[db] withRawStatementTimeout() shared-primitive hostile hardening", () => {
  let pool: Pool;

  beforeAll(() => {
    assertLocalUrl();
  });

  afterEach(async () => {
    if (pool) await pool.end().catch(() => undefined);
  });

  function freshPool(): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 90_000 });
    return pool;
  }

  it("SET statement_timeout is actually applied before fn runs -- a query past the bound is server-cancelled", async () => {
    const p = freshPool();
    const start = Date.now();
    await expect(
      withRawStatementTimeout(p, 300, (client) => client.query("SELECT pg_sleep(5)"), "applied-check"),
    ).rejects.toThrow();
    const elapsed = Date.now() - start;
    // Cancelled close to the 300ms bound, not the query's natural 5s duration.
    expect(elapsed).toBeLessThan(2_000);
  });

  it("RESETs statement_timeout on success -- the SAME pooled connection can later run a query the previous bound would have killed", async () => {
    const p = freshPool();

    const fast = await withRawStatementTimeout(
      p,
      300,
      (client) => client.query<{ one: number }>("SELECT 1 AS one"),
      "fast-success",
    );
    expect(fast.rows).toEqual([{ one: 1 }]);

    // Same max:1 pool, same physical connection. If the 300ms timeout from
    // the previous borrow leaked, this 800ms sleep would be killed too.
    const slow = await withRawStatementTimeout(
      p,
      5_000,
      (client) => client.query("SELECT pg_sleep(0.8)"),
      "no-leak-check",
    );
    expect(slow.rows).toBeDefined();
  });

  it("RESETs statement_timeout after a genuine SQLSTATE 57014 cancellation -- no leak to the next borrower on the same connection", async () => {
    const p = freshPool();

    let caught: unknown;
    try {
      await withRawStatementTimeout(p, 300, (client) => client.query("SELECT pg_sleep(5)"), "cancel-then-reuse");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: unknown } | null)?.code).toBe("57014");

    // Decisive regression: borrow the SAME pooled connection again with a
    // GENEROUS bound and run a query that would exceed the PREVIOUS (300ms)
    // timeout but is comfortably under this one -- proving the reset after
    // cancellation actually took effect rather than leaving a stale 300ms
    // session-level timeout in place for the next borrower.
    const result = await withRawStatementTimeout(
      p,
      5_000,
      (client) => client.query<{ ok: number }>("SELECT 1 AS ok FROM pg_sleep(0.8) t(x) UNION ALL SELECT 1"),
      "post-cancellation-borrower",
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("discards (does not reuse) the connection for an unknown/connection-level error, and the pool remains healthy via a fresh connection", async () => {
    const p = freshPool();

    let caught: unknown;
    try {
      // A genuine SQL error (not a timeout, not SQLSTATE 57014) -- the
      // client's session state after this is not trusted, so the helper
      // must release(err) to discard it rather than return it to the pool.
      await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT * FROM this_table_does_not_exist"), "unknown-error");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: unknown } | null)?.code).not.toBe("57014");

    // Pool (max: 1) must still produce a healthy, working connection for the
    // next caller -- proves the discarded connection didn't poison the pool
    // or leave it exhausted.
    const result = await withRawStatementTimeout(
      p,
      5_000,
      (client) => client.query<{ one: number }>("SELECT 1 AS one"),
      "after-discard",
    );
    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it("client.release() is called exactly once per invocation, on every outcome", async () => {
    const p = freshPool();
    const realConnect = p.connect.bind(p);
    const releaseCalls: number[] = [];
    let callIndex = -1;

    (p as unknown as { connect: typeof p.connect }).connect = (async (...args: unknown[]) => {
      callIndex += 1;
      const idx = callIndex;
      releaseCalls[idx] = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
      const client = await (realConnect as any)(...args);
      const realRelease = client.release.bind(client);
      client.release = ((...releaseArgs: unknown[]) => {
        releaseCalls[idx] = (releaseCalls[idx] ?? 0) + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.PoolClient.release overload forwarding
        return (realRelease as any)(...releaseArgs);
      }) as typeof client.release;
      return client;
    }) as typeof p.connect;

    await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT 1"), "release-once-success");
    await expect(
      withRawStatementTimeout(p, 300, (client) => client.query("SELECT pg_sleep(5)"), "release-once-cancel"),
    ).rejects.toThrow();
    await expect(
      withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT * FROM nonexistent_xyz"), "release-once-error"),
    ).rejects.toThrow();

    expect(releaseCalls).toEqual([1, 1, 1]);
  });

  it("no checked-out-client leak -- pool idle count returns to baseline after success, cancellation, and unknown error", async () => {
    const p = freshPool();

    await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT 1"), "leak-check-success");
    expect(p.idleCount).toBe(p.totalCount);
    expect(p.waitingCount).toBe(0);

    await withRawStatementTimeout(p, 300, (client) => client.query("SELECT pg_sleep(5)"), "leak-check-cancel").catch(() => undefined);
    expect(p.idleCount).toBe(p.totalCount);
    expect(p.waitingCount).toBe(0);

    await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT * FROM nonexistent_xyz"), "leak-check-error").catch(
      () => undefined,
    );
    expect(p.waitingCount).toBe(0);
  });

  it("timeoutMs is never string-interpolated from unvalidated input -- non-finite/non-positive values are rejected before touching SQL", async () => {
    const p = freshPool();

    await expect(withRawStatementTimeout(p, NaN, (client) => client.query("SELECT 1"), "nan")).rejects.toThrow(
      /positive finite number/,
    );
    await expect(withRawStatementTimeout(p, Infinity, (client) => client.query("SELECT 1"), "inf")).rejects.toThrow(
      /positive finite number/,
    );
    await expect(withRawStatementTimeout(p, 0, (client) => client.query("SELECT 1"), "zero")).rejects.toThrow(
      /positive finite number/,
    );
    await expect(withRawStatementTimeout(p, -100, (client) => client.query("SELECT 1"), "negative")).rejects.toThrow(
      /positive finite number/,
    );
  });
});

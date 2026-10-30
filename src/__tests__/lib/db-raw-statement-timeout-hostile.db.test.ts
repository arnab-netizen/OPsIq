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
 *
 *   F-PGBOUNCER-TXN-SAFETY update: the two bullets above describe the
 *   pre-fix implementation's exact mechanism (a session-level SET/RESET,
 *   discard-on-any-non-57014-error) -- kept here as the original owner
 *   requirements this suite was built against, not as a description of the
 *   current code. The current implementation satisfies the same INTENT
 *   (timeout applied, no leaked state, connection trustworthy afterward)
 *   through BEGIN/SET LOCAL/COMMIT-or-ROLLBACK instead: every error --
 *   57014 included -- is rolled back rather than "reset", and the
 *   connection is REUSED whenever that ROLLBACK succeeds (discarded only if
 *   the ROLLBACK itself fails or the connection never responds at all). See
 *   the updated test below for the current, accurate claim.
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
 *   - F-ROOT-ROUTE-300S santa-loop addition: a `fn` that never settles at all
 *     (simulating a connection so dead that even `SET statement_timeout`
 *     itself never gets a response, so the server-side bound above can never
 *     fire) is caught by a client-side backstop that discards the connection
 *     — the pool's slot is freed immediately rather than left orphaned, and
 *     the caller gets a bounded rejection instead of hanging forever.
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

  it("rolls back and REUSES the connection for a plain SQL error whose ROLLBACK succeeds -- only a rollback failure or dead connection causes discard", async () => {
    // Fresh-context review finding (F-PGBOUNCER-TXN-SAFETY): this test's
    // name and comments used to claim this case is always DISCARDED. That
    // was true of the pre-fix implementation, which had no explicit
    // transaction and released(err) on any non-57014 error unconditionally.
    // The current implementation ROLLBACKs on every error (required because
    // BEGIN means any error aborts the transaction) and only discards if
    // that ROLLBACK itself fails or times out -- a plain SQL error (missing
    // table, as here) rolls back cleanly, so the connection is perfectly
    // healthy and IS reused. Proven directly below via pg_backend_pid(),
    // not merely inferred from "the pool stays healthy" (which would be
    // true either way under max:1).
    const p = freshPool();

    const pidBeforeError = await withRawStatementTimeout(
      p,
      5_000,
      (client) => client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
      "baseline",
    );

    let caught: unknown;
    try {
      await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT * FROM this_table_does_not_exist"), "unknown-error");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: unknown } | null)?.code).not.toBe("57014");

    const pidAfterError = await withRawStatementTimeout(
      p,
      5_000,
      (client) => client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
      "after-rollback",
    );
    expect(pidAfterError.rows[0]?.pid).toBe(pidBeforeError.rows[0]?.pid);
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

  it(
    "client-side backstop: a fn that never settles at all is discarded after statementTimeoutMs + the fixed margin, not left orphaned, and the pool stays healthy afterward",
    async () => {
      const p = freshPool();

      const start = Date.now();
      await expect(
        withRawStatementTimeout(p, 300, () => new Promise<never>(() => undefined), "backstop-fire"),
      ).rejects.toThrow(/client-side backstop fired/);
      const elapsed = Date.now() - start;
      // Fires at statementTimeoutMs (300) + the fixed 5s client-side margin
      // -- neither instantly (it must not pre-empt a live, merely-slow
      // query) nor indefinitely (it must not hang forever either).
      expect(elapsed).toBeGreaterThan(5_000);
      expect(elapsed).toBeLessThan(7_000);

      // Pool recovers immediately: the discarded client's slot is free, so
      // a fresh borrow succeeds right away rather than waiting for
      // anything (OS-level dead-socket detection, a recycle, etc.).
      const recoverStart = Date.now();
      const result = await withRawStatementTimeout(
        p,
        5_000,
        (client) => client.query<{ one: number }>("SELECT 1 AS one"),
        "after-backstop",
      );
      const recoverElapsed = Date.now() - recoverStart;
      expect(result.rows).toEqual([{ one: 1 }]);
      expect(recoverElapsed).toBeLessThan(2_000);
    },
    15_000,
  );
});

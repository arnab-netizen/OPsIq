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
import { withRawStatementTimeout, ClientSideExecutionTimeoutError } from "@/lib/db";

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

  /**
   * Process-level error collector. A node-postgres 'error' event with no
   * listener is an EventEmitter throw, i.e. an uncaughtException -- which
   * vitest reports as a run-level "Unhandled Error" even when every
   * assertion passes (the exact CI signature of F-IDLE-TXN-CLIENT-ERROR).
   * Tests below assert this stays empty instead of relying on the runner.
   */
  function collectProcessErrors(): { errors: unknown[]; stop: () => void } {
    const errors: unknown[] = [];
    const onUncaught = (e: unknown) => errors.push(e);
    process.on("uncaughtException", onUncaught);
    process.on("unhandledRejection", onUncaught);
    return {
      errors,
      stop: () => {
        process.off("uncaughtException", onUncaught);
        process.off("unhandledRejection", onUncaught);
      },
    };
  }

  function freshPool(): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 90_000 });
    // Every production pool that reaches withRawStatementTimeout() carries a
    // pool-level 'error' listener (getPublicReadPool() installs its own; the
    // shared pool gets one from PrismaPg). The harness pool must too, or a
    // late FATAL on an already-discarded client would surface as an
    // uncaughtException that production could never produce -- a harness
    // artefact, distinct from the checked-out-client defect fixed in db.ts.
    pool.on("error", () => undefined);
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
      const processErrors = collectProcessErrors();

      const start = Date.now();
      const rejection = await withRawStatementTimeout(
        p,
        300,
        () => new Promise<never>(() => undefined),
        "backstop-fire",
      ).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(rejection).toBeInstanceOf(ClientSideExecutionTimeoutError);
      expect((rejection as Error).message).toMatch(/client-side backstop fired/);
      // The server's own idle_in_transaction_session_timeout is set to the
      // SAME margin as this backstop, so the two race by a few ms. Whichever
      // wins, the outcome must be the same typed rejection, and a server-first
      // termination may only be attributed as SQLSTATE 25P03 -- never escape.
      expect([undefined, "25P03"]).toContain((rejection as ClientSideExecutionTimeoutError).connectionErrorCode);
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

      // Let any late FATAL/socket-close from the discarded backend arrive
      // before judging: nothing may have escaped as an uncaught error.
      await new Promise((r) => setTimeout(r, 500));
      processErrors.stop();
      expect(processErrors.errors).toEqual([]);
    },
    15_000,
  );

  // ---------------------------------------------------------------------------
  // F-IDLE-TXN-CLIENT-ERROR regression suite.
  //
  // Root cause (reproduced against real PostgreSQL; pg 8.21.0 / pg-pool 3.14.0):
  // pg-pool removes its 'error' listener from a client while it is checked
  // out, so a backend-initiated FATAL (here: 25P03, the server's
  // idle_in_transaction_session_timeout that withRawStatementTimeout() itself
  // configures) arriving while no query is active was emitted on a client with
  // ZERO listeners -> uncaughtException, even though every assertion passed.
  // ---------------------------------------------------------------------------

  it("F-IDLE-TXN-CLIENT-ERROR: a server-side idle-in-transaction termination (25P03) while the client is checked out does NOT escape as an uncaughtException, and the pool recovers", async () => {
    const p = freshPool();
    const processErrors = collectProcessErrors();

    // Force the server to terminate the idle-in-transaction backend FAR before
    // the client-side backstop (200ms vs 5.3s), so the FATAL deterministically
    // arrives while the client is checked out and fn is merely waiting.
    const err = await withRawStatementTimeout(
      p,
      300,
      async (client) => {
        await client.query("SET LOCAL idle_in_transaction_session_timeout = 200");
        await new Promise((r) => setTimeout(r, 900));
        return client.query("SELECT 1");
      },
      "server-terminated-while-checked-out",
    ).then(
      () => undefined,
      (e: unknown) => e,
    );

    // The caller still gets a bounded, real failure -- it is not swallowed.
    expect(err).toBeInstanceOf(Error);
    await new Promise((r) => setTimeout(r, 500));
    processErrors.stop();
    expect(processErrors.errors).toEqual([]);

    // The dead connection was discarded, not returned to the pool as healthy.
    const recoverStart = Date.now();
    const ok = await withRawStatementTimeout(p, 5_000, (client) => client.query<{ one: number }>("SELECT 1 AS one"), "after-25P03");
    expect(ok.rows).toEqual([{ one: 1 }]);
    expect(Date.now() - recoverStart).toBeLessThan(2_000);
    expect(p.waitingCount).toBe(0);
  }, 20_000);

  it("F-IDLE-TXN-CLIENT-ERROR: a hung fn whose backend the server already terminated (25P03 first) still rejects with the typed backstop error, attributed to SQLSTATE 25P03 -- deterministic server-first ordering", async () => {
    const p = freshPool();
    const processErrors = collectProcessErrors();

    const start = Date.now();
    const rejection = await withRawStatementTimeout(
      p,
      300,
      async (client) => {
        await client.query("SET LOCAL idle_in_transaction_session_timeout = 200");
        return new Promise<never>(() => undefined);
      },
      "server-first-then-backstop",
    ).then(
      () => undefined,
      (e: unknown) => e,
    );
    const elapsed = Date.now() - start;

    expect(rejection).toBeInstanceOf(ClientSideExecutionTimeoutError);
    expect((rejection as Error).message).toMatch(/client-side backstop fired/);
    expect((rejection as ClientSideExecutionTimeoutError).connectionErrorCode).toBe("25P03");
    // Protection is NOT weakened: the backstop still bounds the call at
    // statementTimeoutMs + the fixed margin, not earlier and not unbounded.
    expect(elapsed).toBeGreaterThan(5_000);
    expect(elapsed).toBeLessThan(7_000);

    await new Promise((r) => setTimeout(r, 500));
    processErrors.stop();
    expect(processErrors.errors).toEqual([]);

    const ok = await withRawStatementTimeout(p, 5_000, (client) => client.query<{ one: number }>("SELECT 1 AS one"), "after-server-first");
    expect(ok.rows).toEqual([{ one: 1 }]);
  }, 20_000);

  it("F-IDLE-TXN-CLIENT-ERROR: the checked-out client owns exactly one 'error' listener during fn, and a REUSED client never accumulates listeners across success, 57014 cancellation and plain SQL errors", async () => {
    const p = freshPool();
    type Emitter = { listenerCount: (event: string) => number };
    let captured: Emitter | undefined;
    const realConnect = p.connect.bind(p);
    (p as unknown as { connect: typeof p.connect }).connect = (async (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
      const client = await (realConnect as any)(...args);
      captured = client as Emitter;
      return client;
    }) as typeof p.connect;

    let duringFn = -1;
    await withRawStatementTimeout(
      p,
      5_000,
      async (client) => {
        duringFn = (client as unknown as Emitter).listenerCount("error");
        return client.query("SELECT 1");
      },
      "listener-during-fn",
    );
    expect(duringFn).toBe(1);

    // 12 > Node's default MaxListeners (10): an accumulating listener would
    // also emit a MaxListenersExceededWarning on the same client.
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on("warning", onWarning);
    for (let i = 0; i < 4; i += 1) {
      await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT 1"), `reuse-success-${i}`);
      await withRawStatementTimeout(p, 300, (client) => client.query("SELECT pg_sleep(5)"), `reuse-cancel-${i}`).catch(() => undefined);
      await withRawStatementTimeout(p, 5_000, (client) => client.query("SELECT * FROM nonexistent_xyz"), `reuse-error-${i}`).catch(
        () => undefined,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
    process.off("warning", onWarning);

    // Only pg-pool's own idle listener remains on the pooled client.
    expect(captured!.listenerCount("error")).toBe(1);
    expect(p.totalCount).toBe(1);
    expect(warnings).not.toContain("MaxListenersExceededWarning");
  }, 30_000);
});

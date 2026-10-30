/**
 * F-ROOT-ROUTE-300S / F-ROOT-ROUTE-FAST-FAIL proof, against real disposable
 * PostgreSQL, that the root route's public-admission read is bounded --
 * corrected and extended across multiple rounds of santa-loop adversarial
 * review. This file now contains THREE describe blocks covering two
 * related but distinct missions; read each block's own doc comment for
 * specifics. This header covers what's common to all three.
 *
 * BLOCK 1 (acquisition-bound under max:1 contention, F-ROOT-ROUTE-300S):
 * proves a queued pool.connect() behind an already-busy sole connection
 * rejects once connectionTimeoutMillis elapses, rather than waiting
 * indefinitely. It deliberately does NOT claim to reproduce the exact
 * Production mechanism byte-for-byte: Production logs show the `GET /` /
 * `HEAD /` timeouts but carry no query-level tracing, so whether any
 * individual incident was dominated by acquisition contention or by a
 * stalled query on an already-acquired connection cannot be distinguished
 * from that evidence alone. What IS proven by code-reading (see the doc
 * comment on readPublicAdmissionModeBounded() in
 * src/services/beta/public-presentation.service.ts) is that the OLD plain
 * Prisma read had NO Postgres-side statement_timeout at all for the
 * EXECUTION phase once a connection was acquired -- that gap is real and
 * unconditional, independent of acquisition timing, and is the same class
 * of gap getSession()'s own session-lookup query was already hardened
 * against. The EXECUTION-cancellation mechanism itself (SET statement_timeout
 * / SQLSTATE 57014 / clean connection reuse) is already proven generically
 * against withRawStatementTimeout() in
 * src/__tests__/lib/db-raw-statement-timeout-hostile.db.test.ts; re-proving
 * it here would be redundant, not additive. Rather than waiting out
 * Production's real acquisition ceiling, this block injects a pg.Pool with
 * the SAME max:1 but a short, test-controlled `connectionTimeoutMillis` --
 * as of F-ROOT-ROUTE-FAST-FAIL, into `globalForPrisma.pgPublicReadPool`
 * (the public read's own DEDICATED pool slot, real Production value
 * PUBLIC_READ_POOL_ACQUISITION_TIMEOUT_MS=3_000ms -- it previously injected
 * into the SHARED `pgPool` slot against the shared pool's 90s ceiling,
 * before that fix existed). Same injection technique already established
 * in src/__tests__/auth/get-session-fresh-connection-hostile.db.test.ts's
 * `goColdWithPool()`; verified empirically (outside this test suite,
 * against a throwaway pool, not asserted here) that a pool.connect() call
 * queued behind an already-busy max:1 connection DOES reject once
 * connectionTimeoutMillis elapses, not just for a brand-new/never-connected
 * client, so a short injected value genuinely exercises the same
 * acquisition-bound mechanism the real production value provides, just on
 * a fast, deterministic timescale.
 *
 * BLOCK 2 (execution-bound statement_timeout applies to this call site):
 * see its own doc comment below.
 *
 * BLOCK 3 (F-ROOT-ROUTE-FAST-FAIL RED-before/GREEN-after, added later):
 * unlike block 1's injected-pool technique, this block DOES run a genuine
 * before/after timing comparison -- see its own doc comment for why that
 * is valid here even though an earlier attempt at a before/after
 * comparison for block 1's OLD-vs-NEW acquisition mechanism was tried and
 * discarded as invalid (resetting globalForPrisma.prisma/prismaPromise to
 * force a fresh module import made the OLD code's `db` Prisma-Proxy
 * auto-reinitialize its OWN pool on first access, silently overwriting and
 * clobbering the injected one before the OLD code ever contended with the
 * holder -- a test-harness artifact specific to that injection technique,
 * not evidence about the OLD code's real behavior either way). Block 3's
 * comparison is different in kind: it compares the FIXED code's own
 * behavior when the SHARED pool is starved (which the fixed code no longer
 * reads at all) against what the UNFIXED code's behavior would be under
 * the same starvation (since the unfixed code DID read that shared slot
 * via getRawPool()'s normal, un-reset fast path) -- no module
 * reinitialization or Prisma-Proxy race is involved on either side of that
 * comparison, so the artifact that invalidated the earlier attempt does
 * not apply here.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { POOL_CONNECTION_TIMEOUT_MS } from "@/lib/db";
import {
  PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS,
  PUBLIC_ADMISSION_READ_WORST_CASE_MS,
} from "@/services/beta/public-presentation.service";

const SKIP = !SHOULD_RUN_DB_TESTS;

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[root-route-admission-pool-starvation-hostile] DATABASE_URL is not a valid URL");
  }
  const isLocal = hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[root-route-admission-pool-starvation-hostile] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

const SHORT_CONNECTION_TIMEOUT_MS = 3_000;
// Exceeds SHORT_CONNECTION_TIMEOUT_MS by a wide margin, so the holder is
// still occupying the sole connection when the fixed call's own acquisition
// bound fires -- proving the fixed call does not wait for the holder.
const HOLD_SECONDS = 10;
const TEST_TIMEOUT_MS = 30_000;

describe.skipIf(SKIP)("[db] root route admission-mode read under max:1 pool starvation", () => {
  const pools: Pool[] = [];
  const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;

  beforeEach(() => {
    // Pins legacyEffectiveSettings()'s fallback to a known, deterministic
    // value (INVITE_ONLY) so the pool-recovery assertion below can require
    // an exact result instead of merely "did not throw".
    delete process.env.PUBLIC_BETA_ENABLED;
  });

  afterEach(async () => {
    if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
    while (pools.length) {
      const p = pools.pop()!;
      await p.end().catch(() => undefined);
    }
  });

  /**
   * F-ROOT-ROUTE-FAST-FAIL: injects a fresh pg.Pool (max:1, short
   * connectionTimeoutMillis) as the module-global pool getPublicReadPool()
   * returns -- the public-admission read's own DEDICATED pool slot, not
   * the shared getRawPool()/pgPool slot getSession() etc. use -- then
   * resets the module registry so a subsequent dynamic import of
   * public-presentation.service picks it up via getPublicReadPool()'s
   * existing-pool fast path. Mirrors get-session-fresh-connection-hostile
   * .db.test.ts's goColdWithPool(), retargeted to the new dedicated slot.
   */
  function goColdWithShortTimeoutPool(): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: SHORT_CONNECTION_TIMEOUT_MS });
    pools.push(pool);
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
      pgPublicReadPool: unknown;
      pgPublicReadPoolPromise: unknown;
    };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPublicReadPool = pool;
    // Also clears the promise slot: getPublicReadPool() checks
    // pgPublicReadPool first, so this alone would still work, but leaving
    // a stale resolved promise behind is inconsistent with every other
    // reset point in this suite and risks silently reusing a prior
    // describe block's pool if this helper's injection order ever changes.
    globalForPrisma.pgPublicReadPoolPromise = undefined;
    vi.resetModules();
    return pool;
  }

  it(
    "getPublicAdmissionMode() fails closed to null bounded by the pool's own connectionTimeoutMillis, not by how long a holder occupies the sole connection, and the pool recovers afterward",
    async () => {
      assertLocalUrl();
      const pool = goColdWithShortTimeoutPool();
      const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");

      // Occupy the injected max:1 pool's sole connection with a real, long
      // query. No await happens between acquiring it and starting the
      // sleep, so pg's pool synchronously books the sole slot for the
      // holder before the admission read's own connection attempt is ever
      // made.
      const holder = await pool.connect();
      const holderDone = holder.query(`SELECT pg_sleep(${HOLD_SECONDS})`).finally(() => holder.release());

      const start = Date.now();
      const mode = await getPublicAdmissionMode();
      const elapsed = Date.now() - start;

      // Resolved on the order of the pool's OWN connectionTimeoutMillis
      // (3s), not the holder's 10s sleep -- proves acquisition is genuinely
      // bounded by the real pool mechanism, not merely "happened to finish
      // first".
      expect(elapsed).toBeLessThan(SHORT_CONNECTION_TIMEOUT_MS + 4_000);
      expect(elapsed).toBeGreaterThan(SHORT_CONNECTION_TIMEOUT_MS - 500);
      // Fails closed: never returns a mode read while starved. No
      // connection was ever acquired on this path (pool.connect() itself
      // rejected), so there is nothing to release/orphan here -- the
      // acquisition-queue timeout case is inherently clean, unlike a
      // timeout that fires after a connection was already checked out.
      expect(mode).toBeNull();

      await holderDone;

      // Pool recovery: the timed-out acquisition attempt above must not
      // have left the pool's sole slot permanently booked. A fresh call
      // after the holder legitimately releases succeeds promptly AND
      // returns the exact deterministic legacy fallback (not merely "did
      // not throw") -- proving the pool actually served a real query, not
      // just that the function degraded to its own catch-all null again.
      const start2 = Date.now();
      const after = await getPublicAdmissionMode();
      const elapsed2 = Date.now() - start2;
      expect(elapsed2).toBeLessThan(2_000);
      expect(after).toBe("INVITE_ONLY");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "getPublicBetaPresentation() also fails closed to the INVITE_ONLY copy (never OPEN_BETA) under the same starvation",
    async () => {
      assertLocalUrl();
      const pool = goColdWithShortTimeoutPool();
      const { getPublicBetaPresentation } = await import("@/services/beta/public-presentation.service");

      const holder = await pool.connect();
      const holderDone = holder.query(`SELECT pg_sleep(${HOLD_SECONDS})`).finally(() => holder.release());

      const start = Date.now();
      const presentation = await getPublicBetaPresentation();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(SHORT_CONNECTION_TIMEOUT_MS + 4_000);
      // INVITE_ONLY_PRESENTATION is the fail-closed copy: openRegistration
      // must be false and the CTA must be the invite-only wording, never
      // the open-beta "Start free" copy -- a starved/failed read must never
      // silently present OPEN_BETA to a real visitor.
      expect(presentation.openRegistration).toBe(false);
      expect(presentation.primaryCtaLabel).toBe("Request beta access");

      await holderDone;
    },
    TEST_TIMEOUT_MS,
  );
});

/**
 * Discriminating EXECUTION-level proof (santa-loop round-2 addition): the
 * tests above prove the ACQUISITION-bound layer. This proves the
 * EXECUTION-bound layer actually applies to THIS call site's own query and
 * statement_timeout value (PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS),
 * not just the shared primitive generically -- by locking the real
 * `platform_settings` table ACCESS EXCLUSIVE from a second, independent
 * connection so the admission read's own SELECT genuinely blocks on a live,
 * responsive backend (not a dead socket) until Postgres's statement_timeout
 * cancels it (SQLSTATE 57014), then releasing the lock and proving
 * recovery. Runs against the real, unmodified getPublicReadPool()-managed
 * dedicated pool (no injected short-timeout pool here), so a fresh module
 * state is forced first to avoid picking up a prior test's injected pool
 * from this file.
 */
describe.skipIf(SKIP)("[db] root route admission-mode read: execution-level statement_timeout actually applies to this call site", () => {
  let lockHolderPool: Pool | undefined;
  const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;

  function goCold(): void {
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
      pgPublicReadPool: unknown;
      pgPublicReadPoolPromise: unknown;
    };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPool = undefined;
    globalForPrisma.pgPublicReadPool = undefined;
    // Also clears the promise slot -- getPublicReadPool() checks it before
    // attempting real construction, so leaving a prior describe block's
    // resolved promise here would silently reuse ITS pool instead of
    // genuinely constructing a fresh one (santa-loop review finding).
    globalForPrisma.pgPublicReadPoolPromise = undefined;
    vi.resetModules();
  }

  afterEach(async () => {
    if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
    if (lockHolderPool) {
      await lockHolderPool.end().catch(() => undefined);
      lockHolderPool = undefined;
    }
    // Santa-loop review finding (round 2): this test's own goCold()
    // forces a real getPublicReadPool() construction (test-env
    // connectionTimeoutMillis: 0) -- end() it here before the next
    // describe block's reset helper overwrites the slot, matching the
    // pgbouncer test file's already-correct pattern. Without this, the
    // real pg.Pool connection it opened is orphaned, not closed.
    const globalForPrisma = globalThis as unknown as {
      pgPublicReadPool: { end?: () => Promise<void> } | undefined;
    };
    await globalForPrisma.pgPublicReadPool?.end?.().catch(() => undefined);
  });

  it(
    "a real ACCESS EXCLUSIVE lock on platform_settings forces a genuine statement_timeout cancellation (SQLSTATE 57014) on the admission read's own SELECT, and the pool recovers to a verified-working connection after the lock is released",
    async () => {
      assertLocalUrl();
      // Pins the deterministic legacy fallback (see the acquisition-bound
      // describe block above) so recovery can be proven with an exact
      // expected value, not merely "did not throw".
      delete process.env.PUBLIC_BETA_ENABLED;
      goCold();
      const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");
      const { getPublicReadPool, withRawStatementTimeout } = await import("@/lib/db");

      const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
      lockHolderPool = new Pool({ connectionString: url, max: 1 });
      const lockClient = await lockHolderPool.connect();
      await lockClient.query("BEGIN");
      await lockClient.query("LOCK TABLE platform_settings IN ACCESS EXCLUSIVE MODE");

      const start = Date.now();
      const mode = await getPublicAdmissionMode();
      const elapsed = Date.now() - start;

      // PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS is 2000 (F-ROOT-ROUTE-
      // FAST-FAIL) -- cancelled close to that bound, not left waiting for
      // the lock indefinitely.
      expect(elapsed).toBeGreaterThan(1_500);
      expect(elapsed).toBeLessThan(5_000);
      expect(mode).toBeNull();

      // Directly confirm the cancellation was the real, expected server-side
      // mechanism (SQLSTATE 57014), not inferred from timing alone: the
      // same query, same timeout, against the still-locked table.
      let caught: unknown;
      try {
        const pool = await getPublicReadPool();
        await withRawStatementTimeout(
          pool,
          PUBLIC_ADMISSION_READ_STATEMENT_TIMEOUT_MS,
          (client) => client.query(`SELECT admission_mode FROM platform_settings WHERE id = 'global'`),
          "direct-57014-check",
        );
      } catch (err) {
        caught = err;
      }
      expect((caught as { code?: unknown } | null)?.code).toBe("57014");

      await lockClient.query("ROLLBACK");
      lockClient.release();

      // Pool recovery on the SAME dedicated public-read pool (not the
      // shared getRawPool() pool -- see the F-ROOT-ROUTE-FAST-FAIL doc
      // comment above): the SELECT that was just cancelled server-side
      // must not have poisoned this connection for the next caller. Exact
      // expected value, not merely "did not throw" -- proves a real query
      // actually ran and returned data.
      const start2 = Date.now();
      const after = await getPublicAdmissionMode();
      const elapsed2 = Date.now() - start2;
      expect(elapsed2).toBeLessThan(2_000);
      expect(after).toBe("INVITE_ONLY");
    },
    20_000,
  );
});

/**
 * F-ROOT-ROUTE-FAST-FAIL (RED-before-fix / GREEN-after-fix proof).
 *
 * THE GAP THIS TEST DEMONSTRATES, PRE-FIX: before this mission, the
 * anonymous public-admission read had NO route-specific acquisition bound
 * at all -- it was governed by the exact same single pool
 * (globalForPrisma.pgPool / POOL_CONNECTION_TIMEOUT_MS = 90_000 in real
 * Production) that getSession()/checkDatabase()/checkMigrationReadiness()/
 * claimStartup() all share. A public landing page should fail closed to
 * INVITE_ONLY far faster than that. An acquisition delay well under
 * Production's real 90s ceiling (20s here, representative, not the
 * literal 90s -- waiting out 90s in a unit test is impractical) still blew
 * straight through a reasonable public-page budget
 * (PUBLIC_ADMISSION_READ_WORST_CASE_MS = 15_000, the bound this mission
 * derives and implements -- see public-presentation.service.ts's doc
 * comment for the full derivation and why a 15s bound is a mathematically
 * justified target for this fix, not an arbitrary one).
 *
 * This test's assertions are written so that, run unchanged against the
 * code both BEFORE and AFTER this mission's fix, they demonstrate exactly
 * the RED-to-GREEN transition: BEFORE the fix, the call waited for the
 * holder's full 20s (nothing was route-specific yet) and the assertions
 * FAILED (RED); AFTER the fix (the current state of this file), the call
 * succeeds near-instantly via its own dedicated, route-scoped pool, never
 * waiting for the holder at all (starving the SHARED pool has no effect
 * on a genuinely separate connection), and the SAME assertions PASS
 * (GREEN).
 *
 * Injection technique: this block deliberately starves `globalForPrisma
 * .pgPool` (the SHARED slot -- same override mechanism as the
 * acquisition-starvation block above, which now instead injects
 * `pgPublicReadPool`, the DEDICATED slot, to test that pool's own
 * acquisition bound). Starving `pgPool` here is the whole point: it
 * proves the public-admission read no longer reads that slot at all,
 * which is exactly what distinguishes the fixed call site from
 * getSession()/checkDatabase()/checkMigrationReadiness()/claimStartup(),
 * none of which this test touches.
 */
describe.skipIf(SKIP)("[db] F-ROOT-ROUTE-FAST-FAIL: public-admission read must succeed within a route-specific budget, independent of the shared pool's state", () => {
  const pools: Pool[] = [];
  const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;
  // Production's real shared-pool acquisition ceiling (POOL_CONNECTION_
  // TIMEOUT_MS in db.ts) -- used here as-is, not shortened, since the
  // holder below releases voluntarily well before this would ever fire;
  // what actually keeps this test fast is HOLD_SECONDS, deliberately far
  // shorter than this ceiling but still well above
  // PUBLIC_ADMISSION_READ_WORST_CASE_MS, so a call bounded by the shared
  // pool's 90s ceiling (the pre-fix behavior) would still be waiting when
  // the holder releases, while a call bounded by the dedicated pool's own
  // much smaller budget (the post-fix behavior, asserted below) would not.
  // Imported from db.ts, not hand-typed -- closes the same drift risk the
  // PUBLIC_ADMISSION_READ_WORST_CASE_MS import below already addresses
  // (santa-loop review finding).
  const SHARED_POOL_TIMEOUT_MS = POOL_CONNECTION_TIMEOUT_MS;
  const HOLD_SECONDS = 20;
  const TEST_TIMEOUT_MS = 30_000;

  afterEach(async () => {
    if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
    while (pools.length) {
      const p = pools.pop()!;
      await p.end().catch(() => undefined);
    }
    // Santa-loop review finding (round 2): this block's own real
    // getPublicReadPool() call (via the actual fixed code path, not an
    // injected pool) opens a real connection that `pools` above never
    // tracks -- end() it here instead of leaking it when the next reset
    // helper overwrites the global slot.
    const globalForPrisma = globalThis as unknown as {
      pgPublicReadPool: { end?: () => Promise<void> } | undefined;
    };
    await globalForPrisma.pgPublicReadPool?.end?.().catch(() => undefined);
  });

  function goColdStarvingOnlyTheSharedPool(): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: SHARED_POOL_TIMEOUT_MS });
    pools.push(pool);
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
      pgPublicReadPool: unknown;
      pgPublicReadPoolPromise: unknown;
    };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPool = pool;
    // Clears BOTH the resolved-pool and in-flight-promise slots -- without
    // clearing the promise too (santa-loop review finding), a prior
    // describe block's already-resolved getPublicReadPool() promise would
    // still be cached here, and this reset would silently reuse ITS pool
    // instead of genuinely forcing fresh construction. With both cleared,
    // this forces getPublicReadPool()'s own normal construction path
    // (which, under Vitest, uses connectionTimeoutMillis: 0 -- the same
    // test-env convenience the shared pool gets -- not Production's real
    // 3_000ms value). That is fine here: this test exercises whether the
    // public read depends on the STARVED SHARED pool at all, not the
    // dedicated pool's own acquisition timing, which is exercised
    // elsewhere in this file via a hand-constructed Pool injected directly
    // into this same global slot.
    globalForPrisma.pgPublicReadPool = undefined;
    globalForPrisma.pgPublicReadPoolPromise = undefined;
    vi.resetModules();
    return pool;
  }

  it(
    "succeeds well within the route-specific fast-fail budget even though the SHARED pool is starved for far longer than that budget",
    async () => {
      assertLocalUrl();
      delete process.env.PUBLIC_BETA_ENABLED;
      const pool = goColdStarvingOnlyTheSharedPool();
      const { getPublicAdmissionMode } = await import("@/services/beta/public-presentation.service");

      const holder = await pool.connect();
      const holderDone = holder.query(`SELECT pg_sleep(${HOLD_SECONDS})`).finally(() => holder.release());

      const start = Date.now();
      const mode = await getPublicAdmissionMode();
      const elapsed = Date.now() - start;

      // Stronger than merely "fails closed within budget": the dedicated
      // pool is a genuinely separate connection, so starving the SHARED
      // pool has NO effect on it at all -- the read succeeds normally and
      // fast (not merely under budget, but near-instant), returning the
      // real deterministic legacy fallback, not a failure value. This is
      // the actual GREEN behavior; a test asserting `mode` ends up `null`
      // here would be testing the OLD (shared-pool-contending) behavior,
      // not what this fix provides.
      expect(elapsed).toBeLessThan(2_000);
      // Imported from the implementation's own derived constant, not a
      // hand-typed copy of "15_000" -- closes the exact drift risk
      // withRawStatementTimeoutWorstCaseMs()'s own doc comment warns
      // against, and a database-review finding flagged this constant as
      // defined but previously unconsumed by any test.
      expect(elapsed).toBeLessThan(PUBLIC_ADMISSION_READ_WORST_CASE_MS);
      expect(mode).toBe("INVITE_ONLY");

      await holderDone;
    },
    TEST_TIMEOUT_MS,
  );
});

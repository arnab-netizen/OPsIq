/**
 * F-ROOT-ROUTE-300S proof, against real disposable PostgreSQL, that the
 * root route's public-admission read is bounded under `max:1` pool
 * contention -- corrected after santa-loop adversarial review.
 *
 * SCOPE OF THIS FILE: this proves the ACQUISITION-bound layer specifically
 * (a queued pool.connect() behind an already-busy sole connection rejects
 * once connectionTimeoutMillis elapses, rather than waiting indefinitely).
 * It deliberately does NOT claim to reproduce the exact Production
 * mechanism byte-for-byte: Production logs show the `GET /` / `HEAD /`
 * timeouts but carry no query-level tracing, so whether any individual
 * incident was dominated by acquisition contention or by a stalled query on
 * an already-acquired connection cannot be distinguished from that evidence
 * alone. What IS proven by code-reading (see the doc comment on
 * readPublicAdmissionModeBounded() in
 * src/services/beta/public-presentation.service.ts) is that the OLD plain
 * Prisma read had NO Postgres-side statement_timeout at all for the
 * EXECUTION phase once a connection was acquired -- that gap is real and
 * unconditional, independent of acquisition timing, and is the same class
 * of gap getSession()'s own session-lookup query was already hardened
 * against. The EXECUTION-cancellation mechanism itself (SET statement_timeout
 * / SQLSTATE 57014 / clean connection reuse) is already proven generically
 * against withRawStatementTimeout() in
 * src/__tests__/lib/db-raw-statement-timeout-hostile.db.test.ts; re-proving
 * it here would be redundant, not additive. This file's job is narrower:
 * prove the NEW code's acquisition path is genuinely bounded (not merely
 * "finished before a holder released by chance"), fails closed, and leaves
 * the shared pool healthy afterward.
 *
 * TEST DESIGN: rather than waiting out production's real 90-second
 * POOL_CONNECTION_TIMEOUT_MS, this injects a pg.Pool with the SAME max:1 but
 * a short, test-controlled `connectionTimeoutMillis` via
 * globalForPrisma.pgPool -- the exact technique already established in
 * src/__tests__/auth/get-session-fresh-connection-hostile.db.test.ts's
 * `goColdWithPool()`. Verified empirically (outside this test suite, against
 * a throwaway pool, not asserted here) before relying on it: a pool.connect()
 * call queued behind an already-busy max:1 connection DOES reject once
 * connectionTimeoutMillis elapses -- not just a brand-new/never-connected
 * client -- so a short injected value genuinely exercises the same
 * acquisition-bound mechanism production's real 90s value provides, just on
 * a fast, deterministic timescale. This file intentionally does NOT attempt
 * to also run the OLD (pre-fix) code against this same injected pool: doing
 * so was tried and discarded as invalid -- resetting
 * globalForPrisma.prisma/prismaPromise (required to force a fresh module
 * import) makes the OLD code's `db` Prisma-Proxy auto-reinitialize its OWN
 * pool on first access (db.ts's getDb()/createPrismaClient()), silently
 * overwriting and clobbering the injected one before the OLD code ever
 * contends with the holder -- a test-harness artifact, not evidence about
 * the OLD code's real behavior either way. The OLD code's true, documented
 * gap (no statement_timeout) is covered by code-reading plus the already-
 * generic cancellation proof cited above, not by a before/after timing
 * comparison in this file.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

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
   * Injects a fresh pg.Pool (max:1, short connectionTimeoutMillis) as the
   * module-global pool getRawPool() returns, then resets the module
   * registry so a subsequent dynamic import of public-presentation.service
   * picks it up via getRawPool()'s existing-pool fast path. Mirrors
   * get-session-fresh-connection-hostile.db.test.ts's goColdWithPool().
   */
  function goColdWithShortTimeoutPool(): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: SHORT_CONNECTION_TIMEOUT_MS });
    pools.push(pool);
    const globalForPrisma = globalThis as unknown as { prisma: unknown; prismaPromise: unknown; pgPool: unknown };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPool = pool;
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

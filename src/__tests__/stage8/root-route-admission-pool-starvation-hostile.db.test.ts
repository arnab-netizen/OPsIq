/**
 * F-ROOT-ROUTE-300S root-cause proof, against real disposable PostgreSQL.
 *
 * PROVEN ROOT CAUSE of the long-standing Production `GET /` / `HEAD /`
 * "Vercel Runtime Timeout Error: Task timed out after 300 seconds":
 *
 *   src/app/page.tsx calls getPublicAdmissionMode() for every anonymous
 *   visitor (every request with no session cookie -- including the regular
 *   `GET /` / `HEAD /` uptime-monitor traffic observed in Production logs
 *   timing out on a fixed ~5-11 minute cadence). That function's DB read
 *   used to run as a plain, non-transactional Prisma query: NO
 *   statement_timeout, and NO bound on connection ACQUISITION. Production's
 *   pg.Pool is `max: 1` (one shared physical connection per function
 *   instance -- src/lib/db.ts's P0-15 doc comment). Once the pool's one
 *   connection was held by ANY stalled caller, every subsequent anonymous
 *   `/` request queued behind it with nothing to stop it except Vercel's
 *   platform-level 300-second function ceiling.
 *
 * Fix proven here: getPublicAdmissionMode()/getPublicBetaPresentation() now
 * read via getRawPool()/withRawStatementTimeout() -- the SAME primitive
 * getSession()'s own session-lookup query actually uses (deliberately NOT
 * withStatementTimeout()/Prisma's `$transaction({maxWait})`, which races a
 * narrow client-side clock against the pool's real connection behavior --
 * see the doc comment on readPublicAdmissionModeBounded() in
 * src/services/beta/public-presentation.service.ts for why).
 *
 * THIS TEST'S DESIGN: rather than waiting out production's real 90-second
 * POOL_CONNECTION_TIMEOUT_MS (which also applies to the outer JS-side race
 * in the fixed code, making a real-bound test slow), it injects a pg.Pool
 * with the SAME max:1 but a short, test-controlled `connectionTimeoutMillis`
 * via globalForPrisma.pgPool -- the exact technique already established in
 * src/__tests__/auth/get-session-fresh-connection-hostile.db.test.ts's
 * `goColdWithPool()`. This was verified empirically (outside this test
 * suite) before relying on it: a pool.connect() call queued behind an
 * already-busy max:1 connection DOES reject once connectionTimeoutMillis
 * elapses -- not just a brand-new/never-connected client -- so a short
 * injected value genuinely exercises the same acquisition-bound mechanism
 * production's real 90s value provides, just on a fast, deterministic
 * timescale.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
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

  afterEach(async () => {
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
      // Fails closed: never returns a mode read while starved, and the
      // function's own try/catch guarantees null rather than throwing.
      expect(mode).toBeNull();

      await holderDone;

      // Pool recovery: the connection the fixed call's own timeout
      // abandoned must not have poisoned the pool. A fresh call after the
      // holder legitimately releases succeeds promptly.
      const start2 = Date.now();
      const after = await getPublicAdmissionMode();
      const elapsed2 = Date.now() - start2;
      expect(elapsed2).toBeLessThan(2_000);
      // Legacy fallback (no platform_settings row has been bootstrapped in
      // this disposable DB) -- any non-throwing result proves the pool is
      // healthy again.
      expect(after === null || typeof after === "string").toBe(true);
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

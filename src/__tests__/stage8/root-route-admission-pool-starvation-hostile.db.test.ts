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
 *   (readEffectiveSettings(), default `client = db`) ran as a plain,
 *   non-transactional Prisma query: NO statement_timeout, and NO bound on
 *   connection ACQUISITION. Production's pg.Pool is `max: 1` (one shared
 *   physical connection per function instance -- src/lib/db.ts's P0-15
 *   doc comment). node-postgres has no built-in "acquire timeout" for a
 *   caller queued behind an already-busy sole connection: that wait is
 *   unbounded by anything except Prisma's own `$transaction({maxWait})`,
 *   which a plain (non-transactional) query never uses. So once the pool's
 *   one connection was held by ANY stalled caller in the process -- for any
 *   reason, including a genuinely slow query elsewhere entirely unrelated to
 *   this route -- every subsequent anonymous `/` request queued behind it
 *   with nothing to stop it except Vercel's platform-level 300-second
 *   function ceiling. This test reproduces exactly that: it holds the
 *   shared pool's sole connection with a real, long-running query and
 *   measures whether the root route's own public-admission read waits for
 *   it or fails closed well before it.
 *
 * Fix proven here: getPublicAdmissionMode()/getPublicBetaPresentation() now
 * route the read through withStatementTimeout() -- the SAME governed
 * primitive getSession()'s own session-lookup query already uses. It bounds
 * acquisition via Prisma's own `maxWait` (a client-side clock independent of
 * node-postgres's pool, which has none) AND bounds execution with a real
 * Postgres-side `SET LOCAL statement_timeout`, so on timeout/cancellation
 * the connection is returned to the pool instead of being orphaned there --
 * the exact failure mode a naive client-side `Promise.race` would NOT fix.
 *
 * Existing coverage: src/__tests__/services/beta/platform-settings.service.test.ts
 * covers readEffectiveSettings()'s read-with-fallback logic against a fully
 * mocked client -- no pool/timeout behavior at all. This file is the first
 * to exercise the public-admission read path against a real, contended
 * max:1 pool.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getRawPool, withRawStatementTimeout } from "@/lib/db";
import { getPublicAdmissionMode, getPublicBetaPresentation } from "@/services/beta/public-presentation.service";

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

// Exceeds withStatementTimeout's own worst-case end-to-end bound
// (ACQUISITION_QUEUE_WAIT_MS 10s + TRANSACTION_ACQUIRE_MAX_WAIT_MS 10s + the
// derived txn timeout ~7s = ~27s) by a safety margin, so the fixed call is
// GUARANTEED to hit its own ceiling before this holder ever releases the
// connection -- proving the fixed call does not wait for the holder at all,
// not merely that it happened to finish first by chance.
const HOLD_MS = 32_000;
const TEST_TIMEOUT_MS = 60_000;

describe.skipIf(SKIP)("[db] root route admission-mode read under max:1 pool starvation", () => {
  let holderPromise: Promise<unknown> | undefined;

  afterEach(async () => {
    if (holderPromise) {
      await holderPromise.catch(() => undefined);
      holderPromise = undefined;
    }
  });

  it(
    "getPublicAdmissionMode() fails closed to null well before a holder releases the pool's sole connection, and the pool recovers afterward",
    async () => {
      assertLocalUrl();
      const pool = await getRawPool();

      // Occupy the shared max:1 pool's sole connection with a real, long
      // query. No await happens between this call and the call under test,
      // so pg's pool synchronously books the sole slot for the holder
      // before the admission read's own connection attempt is ever made.
      holderPromise = withRawStatementTimeout(
        pool,
        HOLD_MS + 5_000,
        (client) => client.query(`SELECT pg_sleep(${HOLD_MS / 1000})`),
        "holder",
      );

      const start = Date.now();
      const mode = await getPublicAdmissionMode();
      const elapsed = Date.now() - start;

      // Resolved well before the holder could possibly have released the
      // connection -- proves the read did not simply wait out the holder.
      expect(elapsed).toBeLessThan(HOLD_MS - 2_000);
      // Fails closed: never returns a mode read while starved, and the
      // function's own try/catch guarantees null rather than throwing.
      expect(mode).toBeNull();

      await holderPromise;
      holderPromise = undefined;

      // Pool recovery: the connection the fixed call's own timeout
      // abandoned must not have poisoned the shared pool. A fresh call
      // after the holder legitimately releases succeeds promptly.
      const start2 = Date.now();
      const after = await getPublicAdmissionMode();
      const elapsed2 = Date.now() - start2;
      expect(elapsed2).toBeLessThan(2_000);
      // Legacy fallback (no platform_settings row has been bootstrapped in
      // this disposable DB) -- any non-throwing result proves the pool is
      // healthy again (null only on a genuine subsequent error, which this
      // is not expected to be).
      expect(after === null || typeof after === "string").toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "getPublicBetaPresentation() also fails closed to the INVITE_ONLY copy (never OPEN_BETA) under the same starvation",
    async () => {
      assertLocalUrl();
      const pool = await getRawPool();

      holderPromise = withRawStatementTimeout(
        pool,
        HOLD_MS + 5_000,
        (client) => client.query(`SELECT pg_sleep(${HOLD_MS / 1000})`),
        "holder",
      );

      const start = Date.now();
      const presentation = await getPublicBetaPresentation();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(HOLD_MS - 2_000);
      // INVITE_ONLY_PRESENTATION is the fail-closed copy: openRegistration
      // must be false and the CTA must be the invite-only wording, never
      // the open-beta "Start free" copy -- a starved/failed read must never
      // silently present OPEN_BETA to a real visitor.
      expect(presentation.openRegistration).toBe(false);
      expect(presentation.primaryCtaLabel).toBe("Request beta access");

      await holderPromise;
      holderPromise = undefined;
    },
    TEST_TIMEOUT_MS,
  );
});

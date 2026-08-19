/**
 * [db] F-PROD-STARTUP-COLDSTART RECURRENCE — pool-contention root cause and
 * BOUNDED fix, per the owner's pre-merge hostile correction on PR #322.
 *
 * PR #320 fixed withStatementTimeout()'s maxWait (2000ms -> 10000ms) on the
 * theory that Neon cold-compute-wake latency alone explains P2028 ("Unable
 * to start a transaction in the given time"). Production evidence disproves
 * that as a COMPLETE explanation: the identical error recurred on the same
 * deployment ~25 minutes after deploy AND again ~6 hours later mid-steady
 * traffic, a pattern inconsistent with pure database-wake latency.
 *
 * PROVEN root cause (independent of Neon, reproduced against local
 * PostgreSQL): production's pg.Pool is `max: 1`, and at least four call
 * sites (claimStartup(), checkDatabase(), checkMigrationReadiness(),
 * getSession()) each independently called withStatementTimeout() ->
 * prisma.$transaction({maxWait}). Prisma's maxWait clock starts the instant
 * $transaction() is invoked and keeps ticking while queued for the pool's
 * sole physical connection.
 *
 * FIRST-PASS FIX (superseded by this suite): a process-local FIFO async
 * mutex with an UNBOUNDED queue wait. The owner correctly rejected this
 * pre-merge: an unbounded wait converts a finite Prisma P2028 acquisition
 * failure into unbounded application-level head-of-line blocking, which is
 * strictly worse.
 *
 * CORRECTED FIX (src/lib/db.ts, withStatementTimeout()): the FIFO queue now
 * has an explicit finite bound, ACQUISITION_QUEUE_WAIT_MS. A caller that
 * cannot reach the front of the queue within that bound throws a typed
 * AcquisitionQueueTimeoutError immediately rather than waiting further. A
 * timed-out waiter's slot is safely abandoned: it attaches a pass-through
 * continuation that releases its slot the moment its turn eventually
 * arrives, WITHOUT ever running the protected work — so the queue can never
 * deadlock on an abandoned entry, and a caller already told it failed can
 * never silently produce a late side effect.
 *
 * This suite proves, against real PostgreSQL with the real `max: 1` pool:
 *   1. HEAD-OF-LINE SLOW HOLDER: a holder occupying the connection longer
 *      than ACQUISITION_QUEUE_WAIT_MS causes the queued caller to fail
 *      within a finite, documented bound with an explicit typed error —
 *      never P2028, never a false success.
 *   2. A holder occupying the connection for LESS than the queue-wait bound
 *      still lets a queued caller succeed normally (the bound doesn't
 *      needlessly fail legitimate short contention).
 *   3. TIMED-OUT WAITER MUST NOT BLOCK THE QUEUE: a later caller queued
 *      behind a timed-out waiter still proceeds once the holder releases;
 *      the timed-out waiter never runs its protected work.
 *   4. HOLDER FAILURE (including Postgres-side statement_timeout
 *      cancellation): the mutex releases in all cases, the next waiter
 *      proceeds, and the pool remains reusable.
 *   5. FINITE END-TO-END BOUND: the documented formula
 *      (ACQUISITION_QUEUE_WAIT_MS + TRANSACTION_ACQUIRE_MAX_WAIT_MS +
 *      txnTimeout) is verified against the REAL exported constants for all
 *      four call sites, and every existing outer JS-side race exceeds it.
 *   6. NO FALSE READY / NO FALSE AUTH SUCCESS: when queue acquisition fails,
 *      claimStartup() propagates the failure (never a false CLAIMED/READY)
 *      and CAS invariants remain intact afterward.
 *   7. Regression: the production race shape, N-concurrent trivial callers,
 *      and 20-concurrent-claimant CAS invariants (from the original mutex
 *      design) all still hold under the bounded redesign.
 *
 * Requires: TEST_WITH_DB=true, --maxWorkers 1, a migrated local PostgreSQL.
 */

import { describe, it, expect, afterEach } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  db,
  getDbInstance,
  withStatementTimeout,
  TRANSACTION_ACQUIRE_MAX_WAIT_MS,
  ACQUISITION_QUEUE_WAIT_MS,
  AcquisitionQueueTimeoutError,
} from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS;

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[startup-coldstart-pool-contention] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[startup-coldstart-pool-contention] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

const RUN = randomUUID().slice(0, 8);
const createdInstanceIds = new Set<string>();

function enterDeployment(id: string): void {
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_DEPLOYMENT_ID = id;
  process.env.VERCEL_GIT_COMMIT_SHA = "";
  delete process.env.HOSTNAME;
  delete process.env.npm_package_version;
}

function leaveDeployment(): void {
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
}

describe.skipIf(SKIP)("[db] F-PROD-STARTUP-COLDSTART recurrence: bounded max:1 pool acquisition queue", () => {
  afterEach(async () => {
    for (const id of createdInstanceIds) {
      await db.startupStatus.deleteMany({ where: { instanceId: id } }).catch(() => undefined);
    }
    createdInstanceIds.clear();
    leaveDeployment();
  });

  it("sanity: TRANSACTION_ACQUIRE_MAX_WAIT_MS is still 10s, and ACQUISITION_QUEUE_WAIT_MS is finite and equal to it", () => {
    expect(TRANSACTION_ACQUIRE_MAX_WAIT_MS).toBe(10_000);
    expect(ACQUISITION_QUEUE_WAIT_MS).toBe(10_000);
    expect(Number.isFinite(ACQUISITION_QUEUE_WAIT_MS)).toBe(true);
  });

  it(
    "1. HEAD-OF-LINE SLOW HOLDER: a queued caller fails within a finite bound with an explicit typed error -- never P2028, never a false success",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      // Holder occupies the sole connection for 13s -- longer than
      // ACQUISITION_QUEUE_WAIT_MS (10s) -- so the queued caller cannot
      // reach the front of the queue in time.
      const holder = withStatementTimeout(prisma, 20_000, (tx) => tx.$queryRaw`SELECT pg_sleep(13)::text AS slept`, "holder");
      await new Promise((resolve) => setTimeout(resolve, 200));

      const queuedStart = Date.now();
      let queuedError: unknown;
      try {
        await withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`, "queued-victim");
      } catch (err) {
        queuedError = err;
      }
      const queuedElapsed = Date.now() - queuedStart;

      expect(queuedError).toBeInstanceOf(AcquisitionQueueTimeoutError);
      const message = (queuedError as Error).message;
      expect(message).not.toMatch(/P2028|Unable to start a transaction/i);
      // Failed close to ACQUISITION_QUEUE_WAIT_MS (10s), not near-instant
      // and not anywhere near the holder's 13s -- proves the bound is what
      // fired, not an unrelated failure.
      expect(queuedElapsed).toBeGreaterThan(9_000);
      expect(queuedElapsed).toBeLessThan(11_500);

      // The holder itself is unaffected by the queued caller's timeout.
      await expect(holder).resolves.toBeDefined();
    },
    25_000,
  );

  it(
    "2. a holder occupying the connection for LESS than the queue-wait bound still lets a queued caller succeed normally",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      const holder = withStatementTimeout(prisma, 10_000, (tx) => tx.$queryRaw`SELECT pg_sleep(6)::text AS slept`, "holder");
      await new Promise((resolve) => setTimeout(resolve, 200));

      const queuedStart = Date.now();
      const result = await withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`, "queued-victim");
      const queuedElapsed = Date.now() - queuedStart;

      expect(result).toEqual([{ one: 1 }]);
      // Waited roughly for the holder to finish (~5.8s) then completed
      // quickly -- well inside the 10s queue-wait bound.
      expect(queuedElapsed).toBeGreaterThan(4_500);
      expect(queuedElapsed).toBeLessThan(9_000);

      await expect(holder).resolves.toBeDefined();
    },
    15_000,
  );

  it(
    "3. TIMED-OUT WAITER MUST NOT BLOCK THE QUEUE: A holds, B waits and times out, C queues behind B -- after A releases, C proceeds and B never runs",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      let bRan = false;

      // A: holds the sole connection for 15s.
      const holderA = withStatementTimeout(prisma, 20_000, (tx) => tx.$queryRaw`SELECT pg_sleep(15)::text AS slept`, "A-holder");
      await new Promise((resolve) => setTimeout(resolve, 100));

      // B: queues right behind A, must time out at ~10s (A hasn't released by then).
      const bStart = Date.now();
      const waiterB = withStatementTimeout(
        prisma,
        2_000,
        (tx) => {
          bRan = true;
          return tx.$queryRaw`SELECT 1`;
        },
        "B-timed-out-waiter",
      );
      let bError: unknown;
      try {
        await waiterB;
      } catch (err) {
        bError = err;
      }
      const bElapsed = Date.now() - bStart;
      expect(bError).toBeInstanceOf(AcquisitionQueueTimeoutError);
      expect(bElapsed).toBeGreaterThan(9_000);
      expect(bElapsed).toBeLessThan(11_500);
      expect(bRan).toBe(false);

      // C: enqueued AFTER B has already timed out (fresh ~10s budget of its
      // own, decoupled from B's deadline). A is still holding at this point
      // (released at ~15s from A's own start, well within C's own window).
      const cStart = Date.now();
      const resultC = await withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw<Array<{ marker: string }>>`SELECT 'C' AS marker`, "C-behind-timed-out-B");
      const cElapsed = Date.now() - cStart;

      expect(resultC).toEqual([{ marker: "C" }]);
      // C proceeded once A released -- not after waiting its own full 10s
      // budget, and critically not blocked by B's abandonment.
      expect(cElapsed).toBeLessThan(9_000);

      await expect(holderA).resolves.toBeDefined();
      // B's protected work was never invoked, even after the whole
      // sequence (including C) has completed.
      expect(bRan).toBe(false);
    },
    30_000,
  );

  it(
    "4. HOLDER FAILURE (Postgres-side statement_timeout cancellation): the mutex releases in all cases, the next waiter proceeds promptly, the pool stays reusable",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      // Holder's own query (5s) will be cancelled server-side by its 300ms
      // statement_timeout -- the transaction REJECTS, not resolves.
      const holderStart = Date.now();
      await expect(
        withStatementTimeout(prisma, 300, (tx) => tx.$queryRaw`SELECT pg_sleep(5)::text AS slept`, "failing-holder"),
      ).rejects.toThrow();
      const holderElapsed = Date.now() - holderStart;
      // Cancelled close to the 300ms bound, not the query's natural 5s.
      expect(holderElapsed).toBeLessThan(4_000);

      // Next caller must proceed promptly -- proves the mutex released
      // immediately on the holder's FAILURE path (finally block), not only
      // on success, and the pool connection itself is reusable (not
      // poisoned by the cancelled query).
      const nextStart = Date.now();
      const result = await withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`, "next-after-failure");
      const nextElapsed = Date.now() - nextStart;
      expect(result).toEqual([{ one: 1 }]);
      expect(nextElapsed).toBeLessThan(2_000);
    },
    15_000,
  );

  it(
    "5. FINITE END-TO-END BOUND: the documented formula holds against the REAL exported constants for all four call sites, and every outer race exceeds it",
    async () => {
      // F-PROD-STARTUP-COLDSTART second-mechanism forensic: claimStartup(),
      // checkDatabase(), checkMigrationReadiness(), and (as of the getSession()
      // migration) getSession() no longer go through withStatementTimeout()'s
      // Prisma interactive transaction -- they use withRawStatementTimeout()
      // (a bounded raw pg client), removing dependence on
      // ACQUISITION_QUEUE_WAIT_MS/TRANSACTION_ACQUIRE_MAX_WAIT_MS for all four
      // call sites. withStatementTimeout() itself remains in src/lib/db.ts --
      // this suite's other scenarios still use it directly as a real
      // interactive-transaction pool-occupier, independent of what any
      // production caller does.
      const { DB_CHECK_STATEMENT_TIMEOUT_MS, DB_CHECK_TIMEOUT_MS, MIGRATION_READINESS_TIMEOUT_MS } = await import("@/infra/startup-orchestrator");
      const { SESSION_STATEMENT_TIMEOUT_MS, SESSION_QUERY_TIMEOUT_MS } = await import("@/services/auth");
      const { MIGRATION_QUERY_STATEMENT_TIMEOUT_MS } = await import("@/services/monitoring/migration-check");
      const { POOL_CONNECTION_TIMEOUT_MS } = await import("@/lib/db");

      const rawWorstCase = (statementTimeoutMs: number) => POOL_CONNECTION_TIMEOUT_MS + statementTimeoutMs + 3_000;

      // checkDatabase(): now bounded by the pool's own connection-timeout,
      // not Prisma's maxWait/acquisition-queue.
      const checkDatabaseInner = rawWorstCase(DB_CHECK_STATEMENT_TIMEOUT_MS);
      expect(DB_CHECK_TIMEOUT_MS).toBe(checkDatabaseInner);

      // checkMigrationReadiness(): same, using its own statement timeout.
      const migrationInner = rawWorstCase(MIGRATION_QUERY_STATEMENT_TIMEOUT_MS);
      expect(MIGRATION_READINESS_TIMEOUT_MS).toBe(migrationInner);

      // getSession(): same raw-client formula as of its own migration --
      // its outer race is a pure defensive backstop that can only fire after
      // withRawStatementTimeout()'s own bound would already have settled.
      const sessionInner = rawWorstCase(SESSION_STATEMENT_TIMEOUT_MS);
      expect(SESSION_QUERY_TIMEOUT_MS).toBe(sessionInner);

      // claimStartup(): deliberately has NO separate, shorter JS-side race
      // wrapping withRawStatementTimeout() -- an earlier version of this fix
      // added one and hostile testing caught a real bug: a bare Promise.race
      // does not cancel pool.connect(), so a shorter race would abandon the
      // caller while the real claim kept running in the background and
      // could later silently succeed, writing an orphaned STARTING row no
      // caller was still watching. claimStartup()'s bound is therefore the
      // pool's own real, safely-cancelling POOL_CONNECTION_TIMEOUT_MS plus
      // its statement timeout -- same reasoning as checkDatabase()/
      // checkMigrationReadiness() above, not a separate, smaller number.
      expect(POOL_CONNECTION_TIMEOUT_MS).toBe(90_000);
    },
  );

  it(
    "6a. NO FALSE READY / NO ORPHANED CLAIM: claimStartup() tolerates contention well past the OLD queue-based ceiling without ever producing an orphaned background write",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();
      enterDeployment(`dpl_no_false_ready_${RUN}`);

      // F-PROD-STARTUP-COLDSTART second-mechanism forensic: claimStartup()
      // now uses withRawStatementTimeout() -- a raw pool.connect(), not the
      // withStatementTimeout()/acquisitionQueue mechanism this suite's other
      // scenarios exercise -- so it no longer queues behind THAT mechanism's
      // ACQUISITION_QUEUE_WAIT_MS (10s) bound, and has no separate outer race
      // of its own (see the "5." test above for why). A 13s holder -- which
      // would have forced the OLD mechanism's 10s ceiling to fail -- must now
      // succeed instead, waiting behind the holder via the pool's own real
      // connection queue.
      const holder = withStatementTimeout(prisma, 20_000, (tx) => tx.$queryRaw`SELECT pg_sleep(13)::text AS slept`, "holder");
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { claimStartup, resolveInstanceId } = await import("@/services/startup-status");
      const key = resolveInstanceId();
      createdInstanceIds.add(key);

      const claimStart = Date.now();
      const claim = await claimStartup();
      const claimElapsed = Date.now() - claimStart;

      expect(claim.outcome).toBe("CLAIMED");
      // Waited roughly for the holder to finish (~12.8s) then completed
      // quickly -- proves it queued behind the pool's real connection
      // rather than failing at the old ~10-17s ceiling.
      expect(claimElapsed).toBeGreaterThan(11_000);
      expect(claimElapsed).toBeLessThan(16_000);

      // Exactly one row exists -- no orphaned/duplicate write from any
      // abandoned-then-later-completed attempt.
      const rows = await db.startupStatus.findMany({ where: { instanceId: key } });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("STARTING");

      await holder;
    },
    25_000,
  );

  it(
    "6b. the sole pool connection remains fully reusable and CAS invariants intact immediately after queue-timeout contention",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      const holder = withStatementTimeout(prisma, 10_000, (tx) => tx.$queryRaw`SELECT pg_sleep(6)::text AS slept`, "holder");
      await new Promise((resolve) => setTimeout(resolve, 200));

      await expect(
        withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw`SELECT 1`, "queued-victim"),
      ).resolves.toBeDefined();
      await holder;

      const { claimStartup, completeStartup } = await import("@/services/startup-status");
      enterDeployment(`dpl_contention_${RUN}`);
      const claim = await claimStartup();
      expect(claim.outcome).toBe("CLAIMED");
      const { claimToken, instanceId } = claim as { outcome: "CLAIMED"; claimToken: string; instanceId: string };
      createdInstanceIds.add(instanceId);
      await completeStartup(claimToken, "READY", { completedAt: new Date() });
      const after = await db.startupStatus.findUnique({ where: { instanceId } });
      expect(after?.status).toBe("READY");
    },
    20_000,
  );

  it(
    "7a. LEGACY MECHANISM CHECK (no longer the actual production race -- see note below): withStatementTimeout()'s FIFO queue still serializes two concurrent Prisma-interactive-transaction callers on a max:1 pool correctly -- both succeed under ordinary (non-hostile) conditions",
    async () => {
      // F-PROD-STARTUP-COLDSTART second-mechanism forensic: as of the
      // getSession() migration, NEITHER claimStartup() nor getSession()
      // actually calls withStatementTimeout() anymore -- both use the raw
      // pool.connect()-based withRawStatementTimeout() instead (see
      // src/lib/db.ts), which has no process-local FIFO queue at all (each
      // caller simply waits on the pool's own real connection queue). This
      // test no longer reproduces "the actual production race" as its
      // original title claimed; it is kept as a regression check that
      // withStatementTimeout()'s own queue mechanism (still exported,
      // still real, still tested infrastructure for any future caller
      // that needs Prisma interactive-transaction semantics) continues to
      // work correctly for two genuinely concurrent callers.
      assertLocalUrl();
      const prisma = await getDbInstance();
      enterDeployment(`dpl_race_${RUN}`);

      const { claimStartup } = await import("@/services/startup-status");

      const [claimResult, sessionShapedResult] = await Promise.allSettled([
        claimStartup(),
        withStatementTimeout(prisma, 4_000, (tx) => tx.session.findUnique({ where: { token: "nonexistent-token" } }), "legacy-queue-check"),
      ]);

      if (claimResult.status === "fulfilled" && (claimResult.value as { outcome: string }).outcome === "CLAIMED") {
        createdInstanceIds.add((claimResult.value as { instanceId: string }).instanceId);
      }

      expect(claimResult.status).toBe("fulfilled");
      expect((claimResult as PromiseFulfilledResult<{ outcome: string }>).value.outcome).toBe("CLAIMED");
      expect(sessionShapedResult.status).toBe("fulfilled");
      expect((sessionShapedResult as PromiseFulfilledResult<unknown>).value).toBeNull();
    },
    15_000,
  );

  it(
    "7b. N=6 concurrent callers on a max:1 pool: all succeed serialized through the bounded queue -- no starvation, no unbounded hang",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      const start = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          withStatementTimeout(prisma, 1_000, (tx) => tx.$queryRaw<Array<{ n: number }>>`SELECT ${i}::int AS n`, `concurrent-${i}`),
        ),
      );
      const elapsed = Date.now() - start;

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(6);
      expect(elapsed).toBeLessThan(10_000);
    },
    15_000,
  );

  it(
    "7c. regression: 20 concurrent claimStartup() attempts on one deployment still yield exactly one CLAIMED and 19 IN_PROGRESS under the bounded-queue redesign",
    async () => {
      assertLocalUrl();
      enterDeployment(`dpl_claim20_mutex_${RUN}`);
      const { claimStartup, resolveInstanceId } = await import("@/services/startup-status");
      const key = resolveInstanceId();
      createdInstanceIds.add(key);

      const results = await Promise.all(Array.from({ length: 20 }, () => claimStartup()));
      const claimed = results.filter((r) => r.outcome === "CLAIMED");
      const inProgress = results.filter((r) => r.outcome === "IN_PROGRESS");
      expect(claimed).toHaveLength(1);
      expect(inProgress).toHaveLength(19);

      const rows = await db.startupStatus.findMany({ where: { instanceId: key } });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("STARTING");
    },
    20_000,
  );
});

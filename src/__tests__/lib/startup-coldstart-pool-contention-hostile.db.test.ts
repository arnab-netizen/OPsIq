/**
 * [db] F-PROD-STARTUP-COLDSTART RECURRENCE — pool-contention root cause and fix.
 *
 * PR #320 fixed withStatementTimeout()'s maxWait (2000ms -> 10000ms) on the
 * theory that Neon cold-compute-wake latency alone explains P2028 ("Unable
 * to start a transaction in the given time"). Production evidence recorded
 * in docs/opsiq/status/unrestricted-owner-master.yaml disproves that as a
 * COMPLETE explanation: the identical error recurred on the same deployment
 * ~25 minutes after deploy AND again ~6 hours later mid-steady-traffic, a
 * pattern inconsistent with pure database-wake latency.
 *
 * PROVEN root cause (independent of Neon, reproduced against local
 * PostgreSQL with no cold-start involved): production's pg.Pool is
 * `max: 1`, and at least four call sites (claimStartup(), checkDatabase(),
 * checkMigrationReadiness(), getSession()) each independently called
 * withStatementTimeout() -> prisma.$transaction({maxWait}). Prisma's
 * maxWait clock starts the instant $transaction() is invoked and keeps
 * ticking while queued for the pool's sole physical connection — it does
 * not pause or reset while queued. Two callers in the same process can
 * genuinely race (e.g. instrumentation.ts's non-blocking register() ->
 * ensureStartupComplete() -> claimStartup() against the very first real
 * request's own getSession() call on a freshly-booted instance). When the
 * first caller's connection hold time exceeds the second caller's REMAINING
 * maxWait budget, the second failed with P2028 — even with a fully awake,
 * healthy database and no single slow query.
 *
 * FIX (src/lib/db.ts, withStatementTimeout()): a process-local FIFO async
 * mutex now serializes interactive-transaction ACQUISITION ATTEMPTS. A
 * caller that arrives while another is still acquiring/running waits on a
 * plain in-memory promise (no fixed budget, cannot itself produce P2028)
 * instead of silently burning its own maxWait clock behind a caller it
 * doesn't know about. Once free, the waiting caller starts its OWN full,
 * fresh 10s maxWait window against a connection that is now actually free.
 * `maxWait` itself is untouched — this suite proves the fix WITHOUT any
 * change to that constant, per the explicit prohibition on closing this
 * recurrence by further raising it.
 *
 * This suite proves, against real PostgreSQL with the real `max: 1` pool:
 *   1. the exact contention mechanism that produced production's P2028
 *      (a slow holder + a queued caller whose remaining maxWait would have
 *      been exceeded) no longer produces P2028 — the queued caller now
 *      succeeds, waiting behind the mutex instead of racing the pool;
 *   2. the pool connection is fully reusable and unpoisoned afterward;
 *   3. claimStartup() (the actual production call site) keeps working
 *      correctly immediately after contention, with CAS invariants intact;
 *   4. the exact production race shape — claimStartup() concurrent with a
 *      getSession()-shaped query, both started at once — now both succeed
 *      instead of one racing the other to P2028;
 *   5. under N concurrent callers (heavier than the 2-caller production
 *      race), all still succeed serialized through the mutex, with no
 *      caller starved indefinitely (FINITE_FAILURE_BOUND / fairness).
 *
 * Requires: TEST_WITH_DB=true, --maxWorkers 1, a migrated local PostgreSQL.
 */

import { describe, it, expect, afterEach } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db, getDbInstance, withStatementTimeout, TRANSACTION_ACQUIRE_MAX_WAIT_MS } from "@/lib/db";

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

describe.skipIf(SKIP)("[db] F-PROD-STARTUP-COLDSTART recurrence: max:1 pool contention fix", () => {
  afterEach(async () => {
    for (const id of createdInstanceIds) {
      await db.startupStatus.deleteMany({ where: { instanceId: id } }).catch(() => undefined);
    }
    createdInstanceIds.clear();
    leaveDeployment();
  });

  it("sanity: TRANSACTION_ACQUIRE_MAX_WAIT_MS is still 10s -- the fix does not touch maxWait", () => {
    expect(TRANSACTION_ACQUIRE_MAX_WAIT_MS).toBe(10_000);
  });

  it(
    "a queued caller succeeds -- no P2028 -- even though a concurrent holder occupies the sole connection well past the queued caller's raw maxWait budget",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      // Holder: occupies the pool's one connection for 12s -- longer than
      // TRANSACTION_ACQUIRE_MAX_WAIT_MS (10s). Pre-fix, a caller queued
      // behind this would have its own maxWait clock expire while merely
      // waiting for the connection, producing P2028 at ~10s (proven during
      // this investigation). Post-fix, the queued caller does not even
      // attempt acquisition until the mutex frees, so its clock never ticks
      // while idle.
      const holder = withStatementTimeout(prisma, 20_000, (tx) => tx.$queryRaw`SELECT pg_sleep(12)::text AS slept`);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const queuedStart = Date.now();
      const result = await withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`);
      const queuedElapsed = Date.now() - queuedStart;

      expect(result).toEqual([{ one: 1 }]);
      // Waited roughly for the holder to finish (~11.8s remaining after the
      // 200ms head start) then completed quickly -- proves it queued behind
      // the mutex rather than failing, and did not wait unboundedly either.
      expect(queuedElapsed).toBeGreaterThan(9_000);
      expect(queuedElapsed).toBeLessThan(15_000);

      await expect(holder).resolves.toBeDefined();
    },
    25_000,
  );

  it(
    "the sole pool connection remains fully reusable and unpoisoned across serialized contention",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      const holder = withStatementTimeout(prisma, 20_000, (tx) => tx.$queryRaw`SELECT pg_sleep(11)::text AS slept`);
      await new Promise((resolve) => setTimeout(resolve, 200));

      await expect(
        withStatementTimeout(prisma, 2_000, (tx) => tx.$queryRaw`SELECT 1`),
      ).resolves.toBeDefined();

      await holder;

      // claimStartup() (the actual production call site under investigation)
      // must still work correctly on the very next acquisition attempt, with
      // its CAS invariants intact.
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
    25_000,
  );

  it(
    "the actual production race -- claimStartup() (register()) concurrent with a getSession()-shaped query, both started at once on a max:1 pool -- both now succeed",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();
      enterDeployment(`dpl_race_${RUN}`);

      const { claimStartup } = await import("@/services/startup-status");

      // Fire both concurrently, exactly as instrumentation.ts's
      // non-blocking register() and the first request's getSession() call
      // can race on a cold Vercel instance today.
      const [claimResult, sessionShapedResult] = await Promise.allSettled([
        claimStartup(),
        withStatementTimeout(prisma, 4_000, (tx) => tx.session.findUnique({ where: { token: "nonexistent-token" } })),
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
    "N=6 concurrent callers on a max:1 pool: all succeed serialized through the mutex -- no starvation, no unbounded hang (fairness / FINITE_FAILURE_BOUND)",
    async () => {
      assertLocalUrl();
      const prisma = await getDbInstance();

      const start = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          withStatementTimeout(prisma, 1_000, (tx) => tx.$queryRaw<Array<{ n: number }>>`SELECT ${i}::int AS n`),
        ),
      );
      const elapsed = Date.now() - start;

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(6);
      // Six trivial queries fully serialized should still complete quickly
      // (well under any single caller's own maxWait), proving the mutex
      // adds queuing delay proportional to real work, not unbounded stalls.
      expect(elapsed).toBeLessThan(10_000);
    },
    15_000,
  );

  it(
    "1/2/15 regression: 20 concurrent claimStartup() attempts on one deployment still yield exactly one CLAIMED and 19 IN_PROGRESS under the new serialized-acquisition path",
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

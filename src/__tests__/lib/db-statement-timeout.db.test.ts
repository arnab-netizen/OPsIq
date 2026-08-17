/**
 * [db] P0-15 pool-starvation closure — database-enforced statement_timeout,
 * proven against real PostgreSQL under the same `max: 1` pool constraint
 * production uses.
 *
 * Root cause this closes: with `max: 1`, the whole app shares exactly one
 * Postgres connection. A JS-side `Promise.race([query, timeout])` lets
 * calling code move on after the timer fires, but does nothing to the
 * underlying query — Postgres keeps executing it, and the pg.Pool client
 * stays checked out until that query eventually settles on its own, which
 * can mean indefinitely. Every other request needing the sole connection
 * queues behind it forever. withStatementTimeout() (src/lib/db.ts) wraps a
 * query in `SET LOCAL statement_timeout` so Postgres itself cancels the
 * statement server-side: the client gets a real error over the same
 * socket, the promise settles, and the connection returns to the pool
 * usable.
 *
 * This suite proves, against a real database, that:
 *   1. a deliberately slow query is actually cancelled server-side (not
 *      merely abandoned client-side) — the rejection lands close to the
 *      configured bound, not the query's natural (much longer) duration;
 *   2. the sole pool connection is released and reusable immediately after;
 *   3. claimStartup() and checkMigrationReadiness() keep working normally
 *      after a timeout event elsewhere on the shared pool — no corruption,
 *      no false READY, no ownership poisoning;
 *   4. the timeout rejection is a genuine, propagating Error — never
 *      silently swallowed — so callers like getSession() see it and stay
 *      fail-closed.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db, getDbInstance, withStatementTimeout } from "@/lib/db";
import { claimStartup, completeStartup } from "@/services/startup-status";
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";

const SKIP = !SHOULD_RUN_DB_TESTS;

/** Same production-URL guard as the sibling db/startup-status suites. */
function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[db-statement-timeout-db] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[db-statement-timeout-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "Aborting to protect production data.",
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

describe.skipIf(SKIP)("[db] P0-15 pool-starvation: withStatementTimeout()", () => {
  beforeAll(() => {
    assertLocalUrl();
  });

  afterEach(async () => {
    for (const id of createdInstanceIds) {
      await db.startupStatus.deleteMany({ where: { instanceId: id } }).catch(() => undefined);
    }
    createdInstanceIds.clear();
    leaveDeployment();
  });

  it("cancels a deliberately slow query server-side, well before its natural duration", async () => {
    const prisma = await getDbInstance();
    const boundMs = 500;

    const start = Date.now();
    await expect(
      withStatementTimeout(prisma, boundMs, (tx) => tx.$queryRaw`SELECT pg_sleep(5)`)
    ).rejects.toThrow();
    const elapsed = Date.now() - start;

    // A merely-abandoned JS race would still return almost immediately from
    // the CALLER's perspective too, so elapsed time alone can't prove
    // server-side cancellation happened -- what proves it is the pool
    // connection being reusable right after (next test) rather than stuck
    // until the 5s pg_sleep naturally finishes. Still assert elapsed stays
    // far below the query's 5s duration as a sanity bound.
    expect(elapsed).toBeLessThan(4000);
  });

  it("the sole pool connection (max: 1) is reusable immediately after a cancelled query", async () => {
    const prisma = await getDbInstance();

    await expect(
      withStatementTimeout(prisma, 300, (tx) => tx.$queryRaw`SELECT pg_sleep(5)`)
    ).rejects.toThrow();

    // If the cancelled query's connection were still held/poisoned, this
    // would hang or fail -- max:1 means there is no second connection to
    // fall back to.
    const rows = await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("claimStartup() still claims correctly after a timeout event elsewhere on the shared pool", async () => {
    const prisma = await getDbInstance();
    const deploymentId = `dpl_stmttimeout_${RUN}`;
    enterDeployment(deploymentId);

    await expect(
      withStatementTimeout(prisma, 300, (tx) => tx.$queryRaw`SELECT pg_sleep(5)`)
    ).rejects.toThrow();

    const claim = await claimStartup();
    expect(claim.outcome).toBe("CLAIMED");
    const { claimToken, instanceId } = claim as {
      outcome: "CLAIMED";
      claimToken: string;
      instanceId: string;
    };
    createdInstanceIds.add(instanceId);

    // No poisoning: exactly one row, in the exact state this claim wrote --
    // not some leftover/corrupted state from the earlier cancelled query.
    const rows = await db.startupStatus.findMany({ where: { instanceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("STARTING");
    expect(rows[0].claimToken).toBe(claimToken);

    // completeStartup() closes the loop normally -- no false READY, no stuck state.
    await completeStartup(claimToken, "READY", { completedAt: new Date() });
    const after = await db.startupStatus.findUnique({ where: { instanceId } });
    expect(after?.status).toBe("READY");
  });

  it("checkMigrationReadiness() still works after a timeout event elsewhere on the shared pool", async () => {
    const prisma = await getDbInstance();

    await expect(
      withStatementTimeout(prisma, 300, (tx) => tx.$queryRaw`SELECT pg_sleep(5)`)
    ).rejects.toThrow();

    const result = await checkMigrationReadiness();
    // Not asserting ready:true (depends on the test DB's actual migration
    // state) -- asserting the check itself completed normally, proving the
    // pool connection was genuinely free to serve it.
    expect(typeof result.ready).toBe("boolean");
    expect(result.totalCommitted).toBeGreaterThan(0);
  });

  it("the timeout rejection is a genuine, propagating Error -- never silently swallowed", async () => {
    const prisma = await getDbInstance();
    let caught: unknown;
    try {
      await withStatementTimeout(prisma, 300, (tx) => tx.$queryRaw`SELECT pg_sleep(5)`);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message.length).toBeGreaterThan(0);
  });

  it("rejects a non-positive timeoutMs before ever touching the database", async () => {
    const prisma = await getDbInstance();
    await expect(
      withStatementTimeout(prisma, 0, (tx) => tx.$queryRaw`SELECT 1`)
    ).rejects.toThrow(/positive finite number/);
    await expect(
      withStatementTimeout(prisma, -100, (tx) => tx.$queryRaw`SELECT 1`)
    ).rejects.toThrow(/positive finite number/);
  });
});

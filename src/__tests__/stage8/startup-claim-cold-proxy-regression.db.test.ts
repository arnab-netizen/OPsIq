/**
 * [db] P0-15 cold-proxy regression — proves claimStartup() works against a
 * genuinely cold `db` module, against real PostgreSQL.
 *
 * Production incident this guards against: src/lib/db.ts exports `db` as a
 * lazy Proxy designed for two-level access (db.<model>.<method>()). On a
 * cold instance (globalForPrisma.prisma unset), the Proxy's `get` trap
 * cannot distinguish "caller wants a model" from "caller wants a top-level
 * client method" — a one-level access like db.$queryRaw resolved to an
 * inner deferred-model Proxy object instead of a callable function, and
 * invoking it as a tagged template threw
 * `TypeError: ... $queryRaw is not a function` before any SQL reached
 * Postgres. claimStartup() was the first production-critical caller to make
 * a one-level db.$queryRaw call (needed for the atomic CAS insert), so it
 * hit this on effectively every genuinely cold Vercel instance. The
 * remediation resolves the initialized client explicitly via
 * getDbInstance() instead of the lazy proxy.
 *
 * This suite forces the exact cold state (globalForPrisma.prisma and
 * globalForPrisma.prismaPromise both unset, db.ts's own memoized
 * dbInitPromise cleared via a fresh module instance) and calls the real,
 * unmocked claimStartup() end to end against a migrated Postgres instance —
 * proving initialization occurs, the real $queryRaw is invoked, the atomic
 * CAS insert lands, and completeStartup() closes it out. This test fails
 * against the pre-remediation source (claimStartup() using the bare `db`
 * proxy) and passes after it.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance
 * (including the additive 20260816000001_startup_status_claim_token
 * migration).
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db } from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS;

/** Same production-URL guard as the sibling claim-concurrency/deployment-scoping suites. */
function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[stage8-cold-proxy-db] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[stage8-cold-proxy-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "Aborting to protect production data.",
    );
  }
}

const RUN = randomUUID().slice(0, 8);
const createdInstanceIds = new Set<string>();

/** Same globalForPrisma shape as src/lib/db.ts, for test-side access to the singleton slots. */
const globalForPrisma = globalThis as unknown as {
  prisma: unknown;
  prismaPromise: Promise<unknown> | undefined;
};

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

describe.skipIf(SKIP)("[db] [stage8] P0-15 claimStartup() cold-proxy regression", () => {
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

  it("claims, initializes, and completes against real Postgres from a genuinely cold module state", async () => {
    const deploymentId = `dpl_coldproxy_${RUN}`;
    enterDeployment(deploymentId);

    // Force the exact cold condition this regression guards against: no
    // initialized client, no initialization in flight. vitest.setup.ts's
    // global beforeAll already warmed globalForPrisma.prisma for this
    // worker before any test ran — clearing it here, plus resetting the
    // module graph so db.ts's own memoized dbInitPromise is also cleared,
    // reproduces a genuinely cold instance's first access.
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    vi.resetModules();

    const freshDb = await import("@/lib/db");
    const freshStartupStatus = await import("@/services/startup-status");

    expect(globalForPrisma.prisma).toBeUndefined();

    // The historical bug threw synchronously on this first access (a
    // TypeError from invoking a non-function). A passing claimStartup()
    // here — resolving to a real outcome, not throwing — is the regression
    // proof.
    const claim = await freshStartupStatus.claimStartup();

    expect(claim.outcome).toBe("CLAIMED");
    const { claimToken, instanceId } = claim as {
      outcome: "CLAIMED";
      claimToken: string;
      instanceId: string;
    };
    createdInstanceIds.add(instanceId);

    // Initialization actually happened as a side effect of the claim call.
    expect(globalForPrisma.prisma).toBeDefined();

    // The atomic CAS insert actually reached Postgres (not swallowed by a
    // client-side TypeError before any SQL was sent).
    const rows = await freshDb.db.startupStatus.findMany({ where: { instanceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("STARTING");
    expect(rows[0].claimToken).toBe(claimToken);

    // claim succeeds -> complete succeeds, closing the loop end to end.
    await freshStartupStatus.completeStartup(claimToken, "READY", { completedAt: new Date() });

    const status = await freshStartupStatus.getStartupStatus();
    expect(status.status).toBe("READY");
    expect(status.completed_at).toBeTruthy();
  });
});

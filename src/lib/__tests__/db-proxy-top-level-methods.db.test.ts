/**
 * [db] db.ts lazy Proxy — top-level Prisma client methods on a cold instance.
 *
 * Root cause this closes: the `db` export's lazy Proxy was built for
 * two-level access (db.<model>.<method>()). On a cold instance
 * (globalForPrisma.prisma unset), a one-level top-level method access like
 * db.$queryRaw resolved to an inner deferred-model Proxy object instead of a
 * callable function, throwing "TypeError: ... is not a function" before any
 * SQL reached Postgres.
 *
 * This was first discovered via claimStartup()'s db.$queryRaw call (fixed in
 * PR #314 by resolving the client explicitly through getDbInstance() at that
 * one call site) and confirmed to recur project-wide via
 * DatabaseSchedulerProvider.processDue()'s own direct db.$queryRaw call
 * (src/infra/scheduler.ts) — a genuine production TypeError on the cron
 * route, observed on a cold instance where the route handler's own code ran
 * before (or concurrently with) instrumentation's register() had finished
 * warming globalForPrisma.prisma. That evidence disproves the assumption
 * that every db.$... call site is safe "by ordering" (register() completing
 * before request handling begins), so the fix here closes the gap at the
 * source: the Proxy's `get` trap now recognizes Prisma's `$`-prefixed
 * top-level client methods and returns a directly callable deferred
 * function for them, instead of the two-level deferred-model proxy — this
 * protects every db.$... call site project-wide (db.$transaction,
 * db.$executeRaw, etc.), not just the ones already fixed individually.
 *
 * This suite exercises the BARE `db` export directly (no getDbInstance()
 * involved) from a genuinely cold module state, proving the generic fix.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
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
    throw new Error("[db-proxy-top-level-db] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[db-proxy-top-level-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "Aborting to protect production data.",
    );
  }
}

/** Same globalForPrisma shape as src/lib/db.ts, for test-side access to the singleton slots. */
const globalForPrisma = globalThis as unknown as {
  prisma: unknown;
  prismaPromise: Promise<unknown> | undefined;
};

const createdIds = new Set<string>();

describe.skipIf(SKIP)("[db] db.ts Proxy — $-prefixed top-level methods work cold", () => {
  beforeAll(() => {
    assertLocalUrl();
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await db.startupStatus.deleteMany({ where: { instanceId: id } }).catch(() => undefined);
    }
    createdIds.clear();
  });

  it("db.$queryRaw works on a genuinely cold module state (no getDbInstance() involved)", async () => {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    vi.resetModules();

    const freshDb = await import("@/lib/db");
    expect(globalForPrisma.prisma).toBeUndefined();

    // The historical bug threw synchronously here: "TypeError: ... $queryRaw
    // is not a function". A passing call proves the fix.
    const rows = await freshDb.db.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
    expect(rows).toEqual([{ one: 1 }]);
    expect(globalForPrisma.prisma).toBeDefined();
  });

  it("db.$executeRaw works on a genuinely cold module state", async () => {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    vi.resetModules();

    const freshDb = await import("@/lib/db");
    expect(globalForPrisma.prisma).toBeUndefined();

    const id = randomUUID();
    createdIds.add(id);
    const affected = await freshDb.db.$executeRaw`
      INSERT INTO "startup_status" ("id", "status", "started_at", "version", "instance_id", "updated_at")
      VALUES (gen_random_uuid(), 'NOT_STARTED', NOW(), 'test', ${id}, NOW())
    `;
    expect(affected).toBe(1);
  });

  it("db.$transaction works on a genuinely cold module state", async () => {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    vi.resetModules();

    const freshDb = await import("@/lib/db");
    expect(globalForPrisma.prisma).toBeUndefined();

    const id = randomUUID();
    createdIds.add(id);
    const result = await freshDb.db.$transaction(async (tx: typeof freshDb.db) => {
      return tx.startupStatus.create({
        data: { status: "NOT_STARTED", version: "test", instanceId: id },
      });
    });
    expect(result.instanceId).toBe(id);
  });

  it("two-level model access (db.<model>.<method>) is unaffected by the $-prefix branch", async () => {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    vi.resetModules();

    const freshDb = await import("@/lib/db");
    expect(globalForPrisma.prisma).toBeUndefined();

    const id = randomUUID();
    createdIds.add(id);
    const created = await freshDb.db.startupStatus.create({
      data: { status: "NOT_STARTED", version: "test", instanceId: id },
    });
    expect(created.instanceId).toBe(id);

    const found = await freshDb.db.startupStatus.findUnique({ where: { instanceId: id } });
    expect(found?.instanceId).toBe(id);
  });
});

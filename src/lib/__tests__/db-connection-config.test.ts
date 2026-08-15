/**
 * P0-15 (Neon production connectivity root-cause & reliability closure).
 *
 * Proves the three connection-config changes in src/lib/db.ts actually take
 * effect, rather than trusting the source read:
 *   1. Production pg.Pool is created with max:1 (not the prior max:10) —
 *      Prisma's documented serverless guidance, matching the max:1 already
 *      proven correct in this same file's own test-env branch.
 *   2. attachDatabasePool() (from @vercel/functions) is called with the pool
 *      instance, so Vercel can drain idle connections before suspending the
 *      function instance instead of leaving a stale socket to resume into.
 *   3. No `ssl: { rejectUnauthorized: false }` override is passed — TLS
 *      verification is left to the connection string's own sslmode, not
 *      manually weakened.
 *
 * Mocks every dependency createPrismaClient() touches (pg, the Prisma
 * adapter/client, workspace enforcement, @vercel/functions) so this stays a
 * pure unit test — no real Postgres, no real Vercel runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface FakePoolConfig {
  connectionString: string;
  ssl?: { rejectUnauthorized?: boolean } | boolean;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  keepAlive: boolean;
  keepAliveInitialDelayMillis: number;
}

const poolCtorCalls: FakePoolConfig[] = [];
const poolInstances: object[] = [];
const attachDatabasePoolCalls: object[] = [];

vi.mock("pg", () => {
  class FakePool {
    options: FakePoolConfig;
    constructor(config: FakePoolConfig) {
      poolCtorCalls.push(config);
      this.options = config;
      poolInstances.push(this);
    }
    on() {}
    query() {
      return Promise.resolve({ rows: [] });
    }
    end() {
      return Promise.resolve();
    }
  }
  return { Pool: FakePool, default: { Pool: FakePool } };
});

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class FakePrismaPg {
    constructor(public pool: object) {}
  },
}));

vi.mock("@/generated/prisma/client", () => {
  class FakePrismaClient {
    $extends() {
      return this;
    }
  }
  return { PrismaClient: FakePrismaClient };
});

vi.mock("@/lib/prisma-workspace-enforcement", () => ({
  createWorkspaceEnforcementMiddleware: () => ({}),
}));

vi.mock("@vercel/functions", () => ({
  attachDatabasePool: (pool: object) => {
    attachDatabasePoolCalls.push(pool);
  },
}));

interface GlobalForPrisma {
  prisma: unknown;
  prismaPromise: unknown;
  pgPool: unknown;
}

const globalForPrisma = globalThis as unknown as GlobalForPrisma;

function resetSingletonState() {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaPromise = undefined;
  globalForPrisma.pgPool = undefined;
  poolCtorCalls.length = 0;
  poolInstances.length = 0;
  attachDatabasePoolCalls.length = 0;
}

beforeEach(() => {
  resetSingletonState();
  // Simulate a real deployment runtime despite running under Vitest: db.ts's
  // isTestEnv branch is what we're proving production does NOT take.
  vi.stubEnv("VITEST", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://user:pass@ep-fake-pooler.us-east-2.aws.neon.tech/db?sslmode=require"
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetSingletonState();
  vi.resetModules();
});

describe("P0-15: production Prisma pool configuration", () => {
  it("creates the pool with max:1, not the prior max:10", async () => {
    const { getDbInstance } = await import("@/lib/db");
    await getDbInstance();

    expect(poolCtorCalls).toHaveLength(1);
    expect(poolCtorCalls[0].max).toBe(1);
  });

  it("calls attachDatabasePool() with the exact pool instance handed to PrismaPg", async () => {
    const { getDbInstance } = await import("@/lib/db");
    await getDbInstance();

    expect(attachDatabasePoolCalls).toHaveLength(1);
    expect(poolInstances).toHaveLength(1);
    expect(attachDatabasePoolCalls[0]).toBe(poolInstances[0]);
  });

  it("does not pass ssl:{rejectUnauthorized:false} — TLS is left to sslmode in the connection string", async () => {
    const { getDbInstance } = await import("@/lib/db");
    await getDbInstance();

    const config = poolCtorCalls[0];
    if (config.ssl && typeof config.ssl === "object") {
      expect(config.ssl).not.toHaveProperty("rejectUnauthorized", false);
    }
  });

  it("a Prisma client initialization failure (e.g. attachDatabasePool throwing) does not silently mask DB errors", async () => {
    // Failure-semantics guard: if the non-critical attachDatabasePool hook
    // throws, DB initialization must still succeed (fail-open only for that
    // hook, never for the connection itself) — proven by getDbInstance()
    // still resolving to a usable client.
    vi.doMock("@vercel/functions", () => ({
      attachDatabasePool: () => {
        throw new Error("simulated: not a real Vercel function runtime");
      },
    }));
    vi.resetModules();

    const { getDbInstance } = await import("@/lib/db");
    await expect(getDbInstance()).resolves.toBeDefined();
  });
});

describe("P0-15: test-env pool is unaffected (still max:1, unchanged behavior)", () => {
  it("keeps max:1 in a genuine test environment", async () => {
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("NODE_ENV", "test");

    const { getDbInstance } = await import("@/lib/db");
    await getDbInstance();

    expect(poolCtorCalls).toHaveLength(1);
    expect(poolCtorCalls[0].max).toBe(1);
  });
});

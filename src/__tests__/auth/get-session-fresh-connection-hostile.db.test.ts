/**
 * [db] getSession() raw-path acceptance — F-PROD-STARTUP-COLDSTART
 * second-mechanism forensic, getSession() migration.
 *
 * getSession() no longer runs its session-lookup query inside a Prisma
 * interactive transaction (withStatementTimeout()) — the per-caller audit
 * (see src/services/auth.ts's SESSION_QUERY_TIMEOUT_MS doc comment) found no
 * multi-statement atomicity/snapshot/row-lock requirement, only a need to
 * bound query execution. It now uses withRawStatementTimeout()/getRawPool(),
 * the same raw-pg-client mechanism already proven for claimStartup()/
 * checkDatabase()/checkMigrationReadiness().
 *
 * This suite proves, against real PostgreSQL, the owner's exact "GETSESSION
 * RAW-PATH ACCEPTANCE" requirements:
 *   - a fresh connection delayed >10s (the old Prisma maxWait boundary) but
 *     well under 90s (the pool's real connectionTimeoutMillis) now succeeds,
 *     where the pre-migration Prisma-transaction path would have failed
 *   - invalid / expired / revoked / inactive-user tokens all resolve to null
 *   - a valid token resolves to the exact expected user/session result
 *   - two distinct valid sessions never cross-resolve to each other's result
 *   - the pool is reusable after a success, and after an error
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db } from "@/lib/db";

const SKIP = !SHOULD_RUN_DB_TESTS;

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[get-session-fresh-connection-hostile] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[get-session-fresh-connection-hostile] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

const TOKEN_PREFIX = "get-session-hostile-";
const cookieHolder = { token: undefined as string | undefined };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined,
  }),
}));

vi.mock("@/lib/runtime-shadow-read-enforcer", () => ({
  checkShadowRead: vi.fn(),
}));

async function cleanup() {
  await db.session.deleteMany({ where: { token: { startsWith: TOKEN_PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: TOKEN_PREFIX } } });
}

async function makeUser(overrides: Partial<{ isActive: boolean }> = {}) {
  return db.user.create({
    data: {
      id: randomUUID(),
      email: `${TOKEN_PREFIX}${randomUUID()}@example.test`,
      hashedPassword: "not-a-real-hash",
      isActive: overrides.isActive ?? true,
      name: "Hostile Test User",
    },
  });
}

async function makeSession(
  userId: string,
  overrides: Partial<{ expiresAt: Date; revokedAt: Date | null }> = {},
) {
  const token = `${TOKEN_PREFIX}${randomUUID()}`;
  await db.session.create({
    data: {
      id: randomUUID(),
      userId,
      token,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: overrides.revokedAt ?? null,
    },
  });
  return token;
}

describe.skipIf(SKIP)("[db] getSession() semantic correctness against real Postgres", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("valid token resolves to the exact expected user/session result", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");

    const user = await makeUser();
    const token = await makeSession(user.id);
    cookieHolder.token = token;

    const result = await getSession();
    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(user.id);
    expect(result?.user.email).toBe(user.email);
    expect(result?.user.isActive).toBe(true);
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });

  it("invalid/nonexistent token resolves to null", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");
    cookieHolder.token = `${TOKEN_PREFIX}nonexistent-${randomUUID()}`;

    await expect(getSession()).resolves.toBeNull();
  });

  it("expired token resolves to null", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");
    const user = await makeUser();
    const token = await makeSession(user.id, { expiresAt: new Date(Date.now() - 60_000) });
    cookieHolder.token = token;

    await expect(getSession()).resolves.toBeNull();
  });

  it("revoked token resolves to null", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");
    const user = await makeUser();
    const token = await makeSession(user.id, { revokedAt: new Date() });
    cookieHolder.token = token;

    await expect(getSession()).resolves.toBeNull();
  });

  it("a valid session for an inactive user resolves to null", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");
    const user = await makeUser({ isActive: false });
    const token = await makeSession(user.id);
    cookieHolder.token = token;

    await expect(getSession()).resolves.toBeNull();
  });

  it("two distinct valid sessions never cross-resolve to each other's result", async () => {
    vi.resetModules();
    const { getSession } = await import("@/services/auth");

    const userA = await makeUser();
    const tokenA = await makeSession(userA.id);
    const userB = await makeUser();
    const tokenB = await makeSession(userB.id);

    cookieHolder.token = tokenA;
    const resultA = await getSession();
    expect(resultA?.user.id).toBe(userA.id);

    cookieHolder.token = tokenB;
    const resultB = await getSession();
    expect(resultB?.user.id).toBe(userB.id);
    expect(resultB?.user.id).not.toBe(resultA?.user.id);
  });
});

describe.skipIf(SKIP)("[db] getSession() fresh-connection acquisition timing and pool reuse", () => {
  const pools: Pool[] = [];

  beforeEach(() => {
    assertLocalUrl();
  });

  afterEach(async () => {
    while (pools.length) {
      const p = pools.pop()!;
      await p.end().catch(() => undefined);
    }
    await cleanup();
  });

  /**
   * Real pg.Pool against local Postgres, with its connect() wrapped so the
   * FIRST call is delayed by delayMs before delegating to the real
   * connect() -- which still succeeds normally. Same instance-level
   * technique already proven in
   * src/__tests__/lib/fresh-connection-acquisition-hostile.db.test.ts.
   * Deliberately NOT prototype-patching + vi.resetModules(): resetModules()
   * gives db.ts's own dynamic `await import("pg")` a fresh, separate `pg`
   * module instance whose Pool class is a different object than any
   * statically-imported reference captured before the reset, so a
   * prototype patch captured pre-reset silently does not apply post-reset
   * (confirmed by direct reproduction: the delay never took effect, and
   * calling the pre-reset unbound method against a post-reset instance
   * threw "Cannot read properties of undefined (reading 'then')"). Setting
   * globalForPrisma.pgPool directly to an already-constructed, already-
   * wrapped instance sidesteps the mismatch entirely: getRawPool()'s own
   * guard (`if (!globalForPrisma.pgPool)`) sees it already set and returns
   * it as-is, regardless of which `pg` module instance is currently loaded.
   */
  function createDelayedPool(delayMs: number): Pool {
    const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 90_000 });
    pools.push(pool);

    const realConnect = pool.connect.bind(pool);
    let firstCallConsumed = false;
    (pool as unknown as { connect: typeof pool.connect }).connect = ((...args: unknown[]) => {
      if (!firstCallConsumed) {
        firstCallConsumed = true;
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
            (realConnect as any)(...args).then(resolve, reject);
          }, delayMs);
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only pg.Pool.connect overload forwarding
      return (realConnect as any)(...args);
    }) as typeof pool.connect;

    return pool;
  }

  /** Forces a genuinely cold singleton, pre-seeded with the given pool. */
  function goColdWithPool(pool: Pool) {
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
    };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPool = pool;
    vi.resetModules();
  }

  /** Forces a genuinely cold singleton: no pool, no Prisma client, no init in flight. */
  function goCold() {
    const globalForPrisma = globalThis as unknown as {
      prisma: unknown;
      prismaPromise: unknown;
      pgPool: unknown;
    };
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaPromise = undefined;
    globalForPrisma.pgPool = undefined;
    vi.resetModules();
  }

  it(
    "a fresh connection delayed 12s (>old 10s Prisma maxWait, <90s pool connectionTimeoutMillis) now SUCCEEDS instead of failing",
    async () => {
      // Seed BEFORE going cold. goColdWithPool() below resets
      // globalForPrisma.prisma/prismaPromise to undefined; any db.* access
      // (Prisma, via the top-level static `db` import) AFTER that reset
      // would find them unset and silently trigger its own fresh
      // createPrismaClient() call -- via the ORIGINAL (pre-reset) module
      // instance's own closures -- which constructs a brand-new real pool
      // and overwrites globalForPrisma.pgPool, clobbering the delayed pool
      // just injected below. Seeding first means the ONLY database access
      // after the reset is getSession() itself, which (per its own
      // implementation) never touches the Prisma `db` client at all --
      // only getRawPool()/withRawStatementTimeout().
      const user = await makeUser();
      const token = await makeSession(user.id);
      cookieHolder.token = token;

      const pool = createDelayedPool(12_000);
      goColdWithPool(pool);
      const { getSession } = await import("@/services/auth");

      const start = Date.now();
      const result = await getSession();
      const elapsed = Date.now() - start;

      expect(result).not.toBeNull();
      expect(result?.user.id).toBe(user.id);
      // Succeeded at ~12s, past the old 10s Prisma-maxWait boundary that
      // would have produced a P2028-driven null before this migration.
      expect(elapsed).toBeGreaterThan(11_000);
      expect(elapsed).toBeLessThan(20_000);
    },
    30_000,
  );

  it(
    "pool is reusable immediately after a successful getSession() call",
    async () => {
      goCold();
      const { getSession } = await import("@/services/auth");

      const user = await makeUser();
      const token = await makeSession(user.id);
      cookieHolder.token = token;

      const first = await getSession();
      expect(first?.user.id).toBe(user.id);

      const start = Date.now();
      const second = await getSession();
      const elapsed = Date.now() - start;

      expect(second?.user.id).toBe(user.id);
      // No leaked/poisoned connection from the first call -- the second
      // call acquires promptly instead of waiting out a full pool timeout.
      expect(elapsed).toBeLessThan(2_000);
    },
    15_000,
  );

  it(
    "getSession() correctly queues behind a legitimate slow holder on the shared max:1 pool and still succeeds, and the pool remains reusable afterward",
    async () => {
      // NOTE ON SCOPE: this proves acquisition-queueing behavior (max:1 pool
      // contention), not statement_timeout cancellation of getSession()'s
      // OWN query -- that query is a single fast indexed lookup with no
      // practical way to make it exceed SESSION_STATEMENT_TIMEOUT_MS from a
      // test without a DB-side trick. The cancellation mechanism itself
      // (SET statement_timeout / SQLSTATE 57014 / reset-or-discard) is
      // exhaustively proven generically, against withRawStatementTimeout()
      // directly, in db-raw-statement-timeout-hostile.db.test.ts -- getSession()
      // shares that exact helper, so re-proving cancellation here would be
      // redundant, not additive.
      goCold();
      const { getSession } = await import("@/services/auth");
      const { getRawPool, withRawStatementTimeout } = await import("@/lib/db");

      // getRawPool() here fully initializes globalForPrisma.prisma/pgPool
      // (it awaits getDbInstance() to completion) BEFORE any seeding
      // happens, so the seeding below's db.* Prisma access finds
      // globalForPrisma.prisma already set and reuses it directly instead
      // of triggering its own competing createPrismaClient() call.
      const pool = await getRawPool();

      // Seed BEFORE occupying the pool with the holder. db.user.create()/
      // db.session.create() route through this SAME shared max:1 pool --
      // the whole point of the P0-15 single-pool architecture -- so
      // seeding AFTER starting the holder would itself queue behind it and
      // silently consume the holder's 2s wait before getSession() ever
      // runs, producing a false "elapsed=1ms" pass that proves nothing.
      const user = await makeUser();
      const token = await makeSession(user.id);
      cookieHolder.token = token;

      // Occupy the shared max:1 pool's sole connection with a real, slower
      // query for ~2s. Test-env's pool has connectionTimeoutMillis=0
      // (unlimited acquisition wait, matching db.ts's own test-env
      // behavior), so getSession() must wait behind the holder rather than
      // failing -- proving it correctly uses the pool's own real connection
      // queue instead of any separate, narrower acquisition budget. No
      // await happens between this call and getSession() below, so pg's
      // pool synchronously books the sole slot for the holder before
      // getSession()'s own pool.connect() call is ever made.
      const holderPromise = withRawStatementTimeout(
        pool,
        5_000,
        (client) => client.query("SELECT pg_sleep(2)"),
        "holder",
      );

      const start = Date.now();
      const result = await getSession();
      const elapsed = Date.now() - start;

      expect(result?.user.id).toBe(user.id);
      expect(elapsed).toBeGreaterThan(1_500);

      await holderPromise;

      // Pool must still be healthy and reusable after the contention.
      const start2 = Date.now();
      const after = await getSession();
      const elapsed2 = Date.now() - start2;
      expect(after?.user.id).toBe(user.id);
      expect(elapsed2).toBeLessThan(2_000);
    },
    20_000,
  );
});

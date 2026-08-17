import { classifyOperatorError } from "@/lib/operator-error-governance";
import type { Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
  pgPool: any | undefined;
};

/**
 * Detect if URL is a Neon endpoint (serverless PostgreSQL)
 * Neon endpoints have:
 * - neon.tech or neon.database in hostname
 * - typically include sslmode=require
 */
async function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL or TEST_DATABASE_URL environment variable is not set. " +
      "For production: Set DATABASE_URL=postgresql://user:password@host/dbname"
    );
  }

  // In test/vitest environments with a Neon pooler URL, use the direct endpoint instead.
  // pgbouncer (transaction mode, -pooler suffix) releases the Neon compute connection after every
  // transaction, so Neon's compute can suspend between test queries even with an 8-second keepalive
  // interval firing user.count(). The direct endpoint gives pg.Pool actual persistent TCP connections
  // to Neon compute, so pg.Pool's TCP keepAlive actually prevents suspension between sequential tests.
  const databaseUrl = (process.env.VITEST || process.env.NODE_ENV === "test") && rawUrl.includes("-pooler.")
    ? rawUrl.replace("-pooler.", ".")
    : rawUrl;

  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { createWorkspaceEnforcementMiddleware } = await import("@/lib/prisma-workspace-enforcement");

    // Use standard PostgreSQL adapter for all environments (proven safe path)
    // Works for both local and Neon cloud PostgreSQL
    console.log("[DB] Using @prisma/adapter-pg (standard PostgreSQL)");
    const pg = await import("pg");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const isTestEnv = !!(process.env.VITEST || process.env.NODE_ENV === "test");
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      // P0-15: no manual `ssl` override. node-postgres/pg-connection-string already
      // parses `sslmode` (and channel_binding) from the connection string itself when
      // `ssl` is left unset. The prior `{ rejectUnauthorized: false }` here actively
      // disabled certificate verification instead of relying on the connection
      // string's own sslmode=require (currently aliased to verify-full semantics) —
      // a real weakening, and unrelated to the connectivity failures this fixes.
      // In test envs, connectionTimeoutMillis=0 (unlimited pool-queue wait) so cold-start
      // connection attempts block until Neon compute is ready. Production keeps 90s.
      connectionTimeoutMillis: isTestEnv ? 0 : 90000,
      // P0-15 (Neon production connectivity root-cause): Prisma's official serverless
      // guidance is connection_limit=1 per function instance, relying on an external
      // pooler (Neon's PgBouncer / pooled endpoint) for fan-in across concurrent
      // instances — the prior max:10 let a single cold instance alone open up to 10
      // direct connections, multiplying instantly under concurrent cold starts and
      // adding connection pressure during Neon's compute-wake window (source of the
      // observed "Authentication timed out" / "Connection terminated unexpectedly"
      // errors). This mirrors the max:1 already proven correct in the test-env branch
      // below, for the identical Neon-suspend reason documented in its own comment.
      max: isTestEnv ? 1 : 1,
      idleTimeoutMillis: isTestEnv ? 300000 : 120000,
      // TCP keepalive: prevents OS/NAT from silently dropping idle connections.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    // Store pool reference so pingDatabase() can bypass Prisma's $extends() chain.
    globalForPrisma.pgPool = pool;

    // P0-15: keeps this function instance alive long enough for Vercel to drain idle
    // pool connections before the instance suspends, instead of the instance freezing
    // mid-connection and later resuming with a now-dead socket (the documented cause
    // of "Connection terminated unexpectedly" on resume). No-op outside a Vercel
    // function; failure here must never block DB initialization.
    try {
      const { attachDatabasePool } = await import("@vercel/functions");
      attachDatabasePool(pool);
    } catch (error) {
      console.warn("[DB] attachDatabasePool unavailable (non-Vercel runtime?)", String(error));
    }

    const adapter = new PrismaPg(pool);
    const client = new PrismaClient({ adapter });

    // Apply workspace isolation enforcement middleware
    const withEnforcement = client.$extends(createWorkspaceEnforcementMiddleware());

    // Extend client to auto-parse audit event payloads
    return withEnforcement.$extends({
      result: {
        auditEvent: {
          payload: {
            needs: { payload: true },
            compute(event: { payload: string | null }) {
              if (!event.payload) return null;
              if (typeof event.payload === "string") {
                try {
                  return JSON.parse(event.payload);
                } catch {
                  return null;
                }
              }
              return event.payload;
            },
          },
        },
      },
    });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new Error(
      `Failed to initialize Prisma client: ${governed.operatorMessage}`
    );
  }
}

async function getDb() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  if (globalForPrisma.prismaPromise) {
    return globalForPrisma.prismaPromise;
  }

  globalForPrisma.prismaPromise = createPrismaClient();
  globalForPrisma.prisma = await globalForPrisma.prismaPromise;
  return globalForPrisma.prisma;
}

let dbInitPromise: Promise<any> | null = null;

export async function getDbInstance() {
  if (!dbInitPromise) {
    dbInitPromise = getDb();
  }
  return dbInitPromise;
}

/**
 * Run `fn` inside a Postgres transaction with a database-enforced
 * statement_timeout, so a query that hangs (e.g. a stalled Neon connection
 * mid-handshake) is actually cancelled server-side instead of merely
 * abandoned client-side by a JS `Promise.race`.
 *
 * P0-15 pool-starvation gap: with `max: 1` in production, the whole app
 * shares exactly one Postgres connection. A `Promise.race([query, timeout])`
 * lets calling code move on after the JS timer fires, but does nothing to
 * the underlying query — Postgres keeps executing it, and the pg.Pool
 * client stays checked out (not released back to the pool) until that query
 * eventually settles on its own, which can mean indefinitely. Every other
 * request needing the sole connection queues behind it. `SET LOCAL
 * statement_timeout` makes Postgres itself cancel the statement after
 * `timeoutMs`: the client receives a real error over the same socket, the
 * query promise settles, and the connection is returned to the pool usable.
 *
 * `SET LOCAL` scopes the timeout to this transaction only — it can never
 * affect any other query on the shared pool, including legitimate
 * long-running business/finance work elsewhere in the app. `timeoutMs` is
 * interpolated directly into the SQL text because Postgres's `SET` command
 * does not accept bind parameters; this is safe only because callers must
 * pass a trusted internal constant, never a value derived from user input.
 *
 * Deliberately opt-in and narrowly used (startup claim, migration
 * readiness, the DB readiness probe, session lookup) — never apply this as
 * a blanket pool-level default.
 */
export async function withStatementTimeout<T>(
  prisma: { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> },
  timeoutMs: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const safeTimeoutMs = Math.trunc(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) {
    throw new Error(`withStatementTimeout: timeoutMs must be a positive finite number, got ${timeoutMs}`);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${safeTimeoutMs}`);
    return fn(tx);
  });
}

/**
 * Connectivity ping using a dedicated temporary pg.Client — completely separate
 * from Prisma's pg.Pool. This prevents the keepalive/beforeEach pings from
 * competing with Prisma queries for pool slots (critical with max:1 in test envs,
 * where a hung pool.connect() in a keepalive would deadlock Prisma transactions).
 *
 * Each attempt is bounded by timeoutMs (default 90s). On timeout the temporary
 * client is forcibly ended so it doesn't leak as an orphaned TCP connection.
 */
export async function pingDatabase(timeoutMs = 90000): Promise<void> {
  // Ensure the Prisma pool is initialised (for subsequent Prisma queries)
  if (!globalForPrisma.pgPool) {
    await getDbInstance();
  }

  const rawUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const dbUrl =
    (process.env.VITEST || process.env.NODE_ENV === "test") && rawUrl.includes("-pooler.")
      ? rawUrl.replace("-pooler.", ".")
      : rawUrl;

  const pg = await import("pg");
  const ssl = dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined;
  const deadline = Date.now() + timeoutMs;

  // Retry loop: each attempt is capped at PER_ATTEMPT_MS via Promise.race.
  // pg.Client has no connectionTimeoutMillis option (that is pool-only); the race
  // timer is the only reliable per-attempt cap. At 6s/attempt + 500ms gap a 30-min
  // budget yields ~295 attempts vs ~13 with the OS-default 135s TCP SYN timeout.
  // When Neon compute becomes ready, connect() takes <1s, so no penalty on the
  // happy path.
  const PER_ATTEMPT_MS = 6000;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`pingDatabase timeout after ${timeoutMs}ms`);

    const client = new pg.Client({ connectionString: dbUrl, ssl });
    let success = false;
    try {
      await Promise.race([
        (async () => {
          await client.connect();
          await client.query("SELECT 1");
        })(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("attempt timeout")),
            Math.min(PER_ATTEMPT_MS, remaining)
          );
          if (typeof t === "object" && t.unref) t.unref();
        }),
      ]);
      success = true;
    } catch {
      // attempt failed — will retry after cleanup
    } finally {
      client.end().catch(() => {});
    }

    if (success) return;
    if (Date.now() + 500 < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Direct pool heartbeat — bypasses Prisma's client/proxy layer entirely.
 * Sends SELECT 1 through the raw pg.Pool so the pool's connection is marked
 * "recently used" and idleTimeoutMillis never fires. Also keeps Neon compute
 * alive since a real query flows over the pool's TCP connection.
 *
 * Safe to call in setInterval: silently no-ops if the pool isn't ready yet.
 */
export async function heartbeatPool(): Promise<void> {
  if (!globalForPrisma.pgPool) return;
  await (globalForPrisma.pgPool as any).query("SELECT 1");
}

// NOTE: Removed auto-initialization on module load
// Reason: This was causing issues when db.ts is imported in Edge Runtime (middleware context)
// Auto-initialization now happens explicitly in app startup (see src/app/route.ts or startup sequence)
// This allows middleware to import db.ts without triggering Prisma initialization

// Export db as a lazy-loading proxy that auto-initializes on first access
export const db = new Proxy({} as any, {
  get(target, prop) {
    // If already initialized, return immediately (fast path)
    if (globalForPrisma.prisma) {
      return Reflect.get(globalForPrisma.prisma, prop);
    }

    // Ensure initialization is in progress (auto-start if needed)
    if (!globalForPrisma.prismaPromise) {
      globalForPrisma.prismaPromise = getDb();
    }

    // Prisma's own top-level client methods ($queryRaw, $queryRawUnsafe,
    // $executeRaw, $executeRawUnsafe, $transaction, $connect, $disconnect,
    // $extends, $on, $use, ...) are always `$`-prefixed by convention — this
    // is how Prisma itself avoids colliding with model delegate names (user,
    // startupStatus, ...), and is stable across the whole Prisma Client API
    // surface. A caller invoking one of these directly on a cold instance
    // (e.g. db.$queryRaw`...`) needs a callable FUNCTION back, not a
    // further-nested proxy: returning the two-level deferred-model proxy
    // below for a one-level access made the caller's own invocation
    // (`db.$queryRaw` used as a tag function) throw "is not a function"
    // before any SQL was ever sent — the P0-15 cold-proxy regression
    // (see src/services/startup-status.ts claimStartup(), the first caller
    // to hit this). Detecting the `$` prefix and returning a directly
    // callable deferred function closes this for every one-level call site
    // project-wide, not just the one that happened to be discovered first.
    if (typeof prop === "string" && prop.startsWith("$")) {
      return function deferredTopLevelMethod(...args: any[]) {
        return globalForPrisma.prismaPromise!.then(prisma => {
          const method = Reflect.get(prisma, prop);
          if (typeof method === "function") {
            return method.apply(prisma, args);
          }
          return method;
        });
      };
    }

    // Return a proxy for this property that defers to the actual model once ready
    // This allows db.user.findUnique(...) to work even if DB isn't initialized yet
    return new Proxy({}, {
      get(modelTarget, modelProp) {
        // When accessing a method on the model (like findUnique), return a deferred function
        return function deferredMethod(...args: any[]) {
          return globalForPrisma.prismaPromise!.then(prisma => {
            const model = Reflect.get(prisma, prop);
            const method = Reflect.get(model, modelProp);
            if (typeof method === 'function') {
              return method.apply(model, args);
            }
            return method;
          });
        };
      },
    });
  },
});


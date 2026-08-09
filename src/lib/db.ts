import { classifyOperatorError } from "@/lib/operator-error-governance";

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
      ssl: databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      // In test envs, connectionTimeoutMillis=0 (unlimited pool-queue wait) so cold-start
      // connection attempts block until Neon compute is ready. Production keeps 90s.
      connectionTimeoutMillis: isTestEnv ? 0 : 90000,
      // In test envs, keep max=1 connection. The neonKeepalive heartbeat (in each test
      // suite's beforeAll) sends SELECT 1 through this pool every 4s, keeping the single
      // connection active. idleTimeoutMillis=300s (5 min) gives a wide safety margin so
      // the connection is never removed even if the heartbeat misses a tick.
      max: isTestEnv ? 1 : 10,
      idleTimeoutMillis: isTestEnv ? 300000 : 120000,
      // TCP keepalive: prevents OS/NAT from silently dropping idle connections.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    // Store pool reference so pingDatabase() can bypass Prisma's $extends() chain.
    globalForPrisma.pgPool = pool;
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

  // Retry loop: each attempt uses a 5s socket timeout (connectionTimeoutMillis: 5000).
  // At 5s/attempt + 500ms gap, a 30-min budget yields ~327 attempts. With 135s OS-default
  // timeouts we'd only get ~13. More attempts = narrower window to miss the moment Neon's
  // compute finishes waking up. On success (Neon warm) the connect takes < 1s.
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`pingDatabase timeout after ${timeoutMs}ms`);

    const client = new pg.Client({ connectionString: dbUrl, ssl, connectionTimeoutMillis: 5000 });
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
            remaining  // use full remaining budget — allows Neon cold-start to complete
          );
          if (typeof t === "object" && t.unref) t.unref();
        }),
      ]);
      success = true;
    } catch {
      // attempt failed — will retry
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


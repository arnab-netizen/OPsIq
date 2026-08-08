import { classifyOperatorError } from "@/lib/operator-error-governance";

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
};

/**
 * Detect if URL is a Neon endpoint (serverless PostgreSQL)
 * Neon endpoints have:
 * - neon.tech or neon.database in hostname
 * - typically include sslmode=require
 */
async function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or TEST_DATABASE_URL environment variable is not set. " +
      "For production: Set DATABASE_URL=postgresql://user:password@host/dbname"
    );
  }

  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { createWorkspaceEnforcementMiddleware } = await import("@/lib/prisma-workspace-enforcement");

    // Use standard PostgreSQL adapter for all environments (proven safe path)
    // Works for both local and Neon cloud PostgreSQL
    console.log("[DB] Using @prisma/adapter-pg (standard PostgreSQL)");
    const pg = await import("pg");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      // Bound connection attempts so operations fail fast on DB unavailability
      // rather than hanging indefinitely (default is 0 = wait forever).
      connectionTimeoutMillis: 30000,
      // Keep idle connections alive for 2 min so Neon cold-start only pays once
      // per test suite run rather than once per query after a 10s lull.
      idleTimeoutMillis: 120000,
    });
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


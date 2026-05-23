import { classifyOperatorError } from "@/lib/operator-error-governance";

const globalForPrisma = globalThis as unknown as {
  prisma: unknown | undefined;
  prismaPromise: Promise<unknown> | undefined;
};

/**
 * Detect if URL is a Neon endpoint (serverless PostgreSQL)
 * Neon endpoints have:
 * - neon.tech or neon.database in hostname
 * - typically include sslmode=require
 */
function isNeonEndpoint(databaseUrl: string): boolean {
  return (
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("neon.database") ||
    (databaseUrl.includes("sslmode=require") && databaseUrl.includes("?"))
  );
}

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

    let client;
    const useNeon = isNeonEndpoint(databaseUrl);
    const dbType = useNeon ? "Neon (serverless)" : "PostgreSQL (standard)";

    // Log adapter selection (without exposing secrets)
    const sanitizedUrl = databaseUrl.replace(/:[^@]*@/, ":***@");
    console.log(`[DB] Initializing Prisma with ${dbType} adapter`);
    console.log(`[DB] Database: ${sanitizedUrl.split("?")[0].split("/").pop()}`);

    if (useNeon) {
      // Production/serverless: Use Neon WebSocket adapter
      console.log("[DB] Using @prisma/adapter-neon");
      const { Pool, neonConfig } = await import("@neondatabase/serverless");
      const { PrismaNeon } = await import("@prisma/adapter-neon");

      const pool = new Pool({ connectionString: databaseUrl, ...neonConfig });
      // @ts-expect-error - Pool type mismatch between @neondatabase/serverless and @prisma/adapter-neon
      const adapter = new PrismaNeon(pool);
      client = new PrismaClient({ adapter });
    } else {
      // Local/CI: Use standard PostgreSQL adapter
      console.log("[DB] Using @prisma/adapter-pg");
      const pg = await import("pg");
      const { PrismaPg } = await import("@prisma/adapter-pg");

      const pool = new pg.Pool({ connectionString: databaseUrl });
      const adapter = new PrismaPg(pool);
      client = new PrismaClient({ adapter });
    }

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

let dbInitPromise: Promise<unknown> | null = null;

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

// Export db as a lazy-loading proxy that waits for initialization if needed
export const db = new Proxy({} as unknown, {
  get(target, prop) {
    // If already initialized, return immediately (fast path)
    if (globalForPrisma.prisma) {
      return Reflect.get(globalForPrisma.prisma, prop);
    }

    // If initialization is in progress, we have a problem:
    // Prisma methods expect synchronous access but initialization is async
    // Solution: return a lazy function that will complete when DB is ready
    if (globalForPrisma.prismaPromise) {
      // Return a function that defers DB access until initialization completes
      return function deferredDbMethod(...args: unknown[]) {
        // This will be called when user invokes db.method()
        // At that point, we can safely await the initialization
        throw new Error(
          `[DB INIT RACE] Attempted to access db.${String(prop)} before database was initialized. ` +
          `This indicates middleware/auth is running before getDbInstance() has completed. ` +
          `This is a lifecycle ordering bug, not a database failure.`
        );
      };
    }

    // No initialization attempted - this is a real error
    throw new Error(
      `Database not initialized. Instance: ${typeof globalForPrisma.prisma}. ` +
      `Ensure vitest global setup completed or call await getDbInstance() in test setup.`
    );
  },
});


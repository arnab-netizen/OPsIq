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
      // @ts-ignore - Pool type mismatch between @neondatabase/serverless and @prisma/adapter-neon
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
    throw new Error(
      `Failed to initialize Prisma client: ${error instanceof Error ? error.message : String(error)}`
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

// Start initialization immediately on module load (server startup)
if (typeof globalThis !== "undefined" && !globalForPrisma.prisma) {
  // Non-blocking initialization - doesn't throw
  getDbInstance().catch((error) => {
    console.error("[DB] Failed to initialize database on module load:", error);
  });
}

// Export db as a proxy that accesses the cached instance from globalForPrisma
export const db = new Proxy({} as any, {
  get(target, prop) {
    const instance = globalForPrisma.prisma;
    if (!instance) {
      throw new Error(
        `Database not initialized. Instance: ${typeof instance}. ` +
        `Ensure vitest global setup completed or call await getDbInstance() in test setup.`
      );
    }
    return Reflect.get(instance, prop);
  },
});

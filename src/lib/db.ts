const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
};

async function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or TEST_DATABASE_URL environment variable is not set. " +
      "For production: Set DATABASE_URL=postgresql://user:password@host/dbname"
    );
  }

  try {
    const { PrismaClient: PgClient } = await import("@/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { createWorkspaceEnforcementMiddleware } = await import("@/lib/prisma-workspace-enforcement");

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });
    const client = new PgClient({ adapter });

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

// Export db as a getter that accesses the cached instance from globalForPrisma
Object.defineProperty(global, '_dbExport', {
  value: () => globalForPrisma.prisma,
  configurable: true,
});

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

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
  prismaPromise: Promise<any> | undefined;
};

async function createPrismaClient() {
  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { PrismaBetterSqlite3Adapter } = await import("@prisma/adapter-better-sqlite3");
    const Database = (await import("better-sqlite3")).default;

    // Parse database URL (remove "file://" prefix if present)
    const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "file:./dev.db";
    const dbPath = dbUrl.replace(/^file:/, "");

    const db = new Database(dbPath);
    const adapter = new PrismaBetterSqlite3Adapter(db);

    const client = new PrismaClient({ adapter });

    // Extend client to auto-parse audit event payloads
    return client.$extends({
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

export const db = await getDb();

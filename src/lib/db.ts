const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

async function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.startsWith("file:")) {
    // SQLite mode (default for tests)
    try {
      let SqliteClient: any;
      let createSqliteAdapter: any;
      let BetterSqlite3Module: any;

      try {
        const clientModule = await import("../generated/prisma-sqlite/client");
        SqliteClient = clientModule.PrismaClient;
      } catch (importError) {
        throw new Error(`Failed to import SQLite Prisma client: ${importError instanceof Error ? importError.message : String(importError)}`);
      }

      try {
        const { PrismaSqlite } = await import("prisma-adapter-sqlite");
        createSqliteAdapter = PrismaSqlite;
      } catch (importError) {
        throw new Error(`Failed to import SQLite adapter: ${importError instanceof Error ? importError.message : String(importError)}`);
      }

      if (!createSqliteAdapter) {
        throw new Error("PrismaSqlite class not found in adapter module");
      }

      console.debug(`[db.ts] Node version: ${process.version}`);

      const dbPath = databaseUrl || "file:./test.db";
      const adapter = new createSqliteAdapter({ url: dbPath });

      if (!adapter) {
        throw new Error("PrismaSqlite instantiation returned undefined/null");
      }

      const client = new SqliteClient({ adapter });
      return client;
    } catch (error) {
      throw new Error(
        `Failed to initialize SQLite Prisma client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // PostgreSQL mode (production)
    const { PrismaClient: PgClient } = await import("../generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    return new PgClient({ adapter });
  }
}

async function getDb() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  globalForPrisma.prisma = await createPrismaClient();
  return globalForPrisma.prisma;
}

export const db = await getDb();

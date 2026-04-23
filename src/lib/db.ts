const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.startsWith("file:")) {
    // SQLite mode (default for tests)
    try {
      const { PrismaClient: SqliteClient } = require("@/generated/prisma-sqlite/client");
      const { PrismaSqlite } = require("@prisma-next/adapter-sqlite");
      const Database = require("better-sqlite3").default || require("better-sqlite3");
      const dbPath = databaseUrl?.replace("file:", "").replace(/^\.\//, "./") || "test.db";
      const sqlite = new Database(dbPath);
      const adapter = new PrismaSqlite(sqlite);
      return new SqliteClient({ adapter });
    } catch (error) {
      throw new Error(
        `Failed to initialize SQLite Prisma client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // PostgreSQL mode (production)
    const { PrismaClient: PgClient } = require("@/generated/prisma/client");
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    return new PgClient({ adapter });
  }
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

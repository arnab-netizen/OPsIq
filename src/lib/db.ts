const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || "";

  try {
    if (databaseUrl.startsWith("file:")) {
      // For SQLite tests, dynamically load the SQLite-generated client
      // This path works because generated/prisma-sqlite is a sibling to lib
      let SqliteModule: any;
      try {
        // Try CommonJS require first (works better with compiled JS)
        SqliteModule = require("../generated/prisma-sqlite/client.js");
      } catch {
        // Fall back to TypeScript module
        SqliteModule = require("../generated/prisma-sqlite/client");
      }

      if (!SqliteModule || !SqliteModule.PrismaClient) {
        throw new Error(
          "SQLite Prisma client not properly generated. Run: npx prisma generate --schema ./prisma/schema.test.prisma"
        );
      }
      return new SqliteModule.PrismaClient() as any;
    } else {
      // For PostgreSQL production, load PostgreSQL client with adapter
      const PgModule = require("../generated/prisma/client");
      if (!PgModule || !PgModule.PrismaClient) {
        throw new Error("PostgreSQL Prisma client not properly generated");
      }

      const { PrismaPg } = require("@prisma/adapter-pg");
      const adapter = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      });
      return new PgModule.PrismaClient({ adapter }) as any;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create Prisma client: ${message}`);
  }
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export default async function globalSetup() {
  const projectRoot = process.cwd();
  const dbUrl = process.env.DATABASE_URL || "file:./test.db";
  const isTestingWithSqlite = dbUrl.startsWith("file:");

  if (isTestingWithSqlite) {
    console.log("Global: Setting up SQLite test database...");

    try {
      // Delete existing database file if it exists
      const dbPath = dbUrl.replace("file:", "").replace(/^\.\//, "");
      const fullDbPath = dbPath.startsWith("/") ? dbPath : path.join(projectRoot, dbPath);

      if (fs.existsSync(fullDbPath)) {
        fs.unlinkSync(fullDbPath);
        console.log("Global: Deleted existing test database");
      }

      // Generate SQLite client if not already generated
      console.log("Global: Generating SQLite Prisma client...");
      try {
        execSync("npx prisma generate --schema ./prisma/schema.test.prisma", {
          cwd: projectRoot,
          stdio: "pipe",
        });
      } catch (error) {
        console.warn("Global: Could not generate SQLite client, proceeding...");
      }

      // Initialize SQLite database using schema.test.prisma
      console.log("Global: Initializing SQLite database with schema...");
      execSync(`npx prisma db push --schema ./prisma/schema.test.prisma --url "${dbUrl}"`, {
        cwd: projectRoot,
        stdio: "pipe",
      });

      // Create test users for audit event FK constraint
      console.log("Global: Creating test users...");
      const { db } = await import("@/lib/db");

      // Create system user for audit events emitted during test setup
      await db.user.upsert({
        where: { email: "system@example.com" },
        update: {},
        create: {
          id: "system",
          email: "system@example.com",
          name: "System",
          hashedPassword: null,
          isActive: true,
        },
      });

      // Create test actor user for audit event FK constraint
      await db.user.upsert({
        where: { email: "test@example.com" },
        update: {},
        create: {
          id: "test-actor-id",
          email: "test@example.com",
          name: "Test User",
          hashedPassword: null,
          isActive: true,
        },
      });
      console.log("Global: Test users created/verified");

      console.log("Global: SQLite test database initialized");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Global: Failed to set up SQLite test database: ${message}`);
      throw new Error(`Global database setup failed: ${message}`);
    }
  }
}

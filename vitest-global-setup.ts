/**
 * Global setup for vitest - runs once before all tests
 * Initializes test environment and ensures database is ready
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

async function setup() {
  console.log("\n📊 Initializing test environment...");

  // Set test environment
  (process.env as any).NODE_ENV = "test";
  (process.env as any).VITEST = "true";
  (process.env as any).SKIP_ENV_VALIDATION = "true";
  (process.env as any).TEST_WITH_DB = "true";

  // Load .env.test for database configuration
  const envTestPath = path.resolve(__dirname, ".env.test");
  if (fs.existsSync(envTestPath)) {
    console.log("  → Loading .env.test...");
    dotenv.config({ path: envTestPath });
    console.log("  ✓ .env.test loaded");
  } else {
    console.log("  → .env.test not found, using defaults");
    // Fallback: use development database
    if (!process.env.DATABASE_URL) {
      (process.env as any).DATABASE_URL = "postgresql://user:password@localhost:5432/opsiq_dev?schema=public";
    }
  }

  console.log("  → Database URL:", (process.env.DATABASE_URL || "not set").replace(/:[^@]*@/, ":***@"));

  console.log("  → Generating Prisma client...");
  try {
    execSync("npx prisma generate", {
      cwd: __dirname,
      stdio: "pipe",
    });
    console.log("  ✓ Prisma Client generated");
  } catch (error) {
    console.log("  ℹ Prisma Client already generated");
  }

  // Initialize database connection
  console.log("  → Initializing database connection...");
  try {
    const { getDbInstance } = await import("./src/lib/db");
    await getDbInstance();
    console.log("  ✓ Database initialized");
  } catch (error) {
    console.error("  ✗ Failed to initialize database:", error);
    throw error;
  }

  // Note: Startup status initialization is deferred to individual tests
  // because testcontainers may not be ready yet during global setup.
  // Each test file that needs startup status should call it in beforeAll().

  console.log("✓ Test environment ready\n");
}

async function teardown() {
  console.log("\n📊 Cleaning up test environment...");
  try {
    const { getDbInstance } = await import("./src/lib/db");
    const prisma = await getDbInstance();
    await prisma.$disconnect();
    console.log("  ✓ Database connection closed");
  } catch (error) {
    console.error("  ⚠ Error closing database connection:", error);
  }
}

export { setup, teardown };


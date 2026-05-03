/**
 * Global setup for vitest - runs once before all tests
 * Initializes test environment with mocked database
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

async function setup() {
  console.log("\n📊 Initializing test environment...");

  // Set test environment
  (process.env as any).NODE_ENV = "test";
  (process.env as any).VITEST = "true";
  (process.env as any).SKIP_ENV_VALIDATION = "true";

  // For tests: use a test DATABASE_URL that won't be used (tests will mock the db)
  if (!process.env.DATABASE_URL) {
    (process.env as any).DATABASE_URL = "postgresql://test:test@localhost/test_db";
  }

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

  console.log("✓ Test environment ready\n");
}

async function teardown() {
  // No cleanup needed
}

export { setup, teardown };


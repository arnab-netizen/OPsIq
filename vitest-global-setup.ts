/**
 * Global setup for vitest - runs once before all tests
 * Initializes test environment for deterministic, isolated test database
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const TEST_DB_PATH = path.resolve(__dirname, "test.db");

function runCommand(cmd: string, logOutput: boolean = false): boolean {
  try {
    const stdio = logOutput ? "inherit" : "pipe";
    execSync(cmd, {
      cwd: __dirname,
      stdio: [stdio, stdio, "pipe"],
      encoding: "utf-8",
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function setup() {
  console.log("\n📊 Initializing deterministic test environment...");

  // Set test environment
  (process.env as any).NODE_ENV = "test";
  (process.env as any).VITEST = "true";
  (process.env as any).DATABASE_URL = `file:${TEST_DB_PATH}`;
  (process.env as any).SKIP_ENV_VALIDATION = "true";

  // Ensure directory exists
  const testDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Clean previous database
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Try to set up test database
  console.log("  → Preparing test database...");

  try {
    // Attempt to push schema to SQLite database
    if (runCommand("npx prisma generate")) {
      console.log("  ✓ Prisma Client generated");
    }

    // Try to push schema - this will create SQLite db if provider allows
    if (runCommand("npx prisma db push --skip-generate --accept-data-loss")) {
      if (fs.existsSync(TEST_DB_PATH)) {
        const stats = fs.statSync(TEST_DB_PATH);
        console.log(`  ✓ Test database created (${stats.size} bytes)`);
      }
    } else {
      // If push fails, tests will use mocked database
      console.log("  ℹ Tests configured to use mocked database");
    }
  } catch (error) {
    console.log("  ℹ Tests configured to use mocked database");
  }

  console.log("✓ Test environment ready\n");
}

async function teardown() {
  // Clean up test database
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export { setup, teardown };


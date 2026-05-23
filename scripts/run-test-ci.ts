#!/usr/bin/env node
/**
 * Self-contained test:ci runner
 * Ensures all required infrastructure is available before running tests
 *
 * Triggers fresh CI validation
 */

import { execSync } from "child_process";

const DOCKER_CONTAINER_NAME = "opsiq-test-postgres";
const POSTGRES_USER = "postgres";
const POSTGRES_PASSWORD = "postgres";
const POSTGRES_DB = "opsiq_test";
const DEFAULT_DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}`;
// Use DATABASE_URL from environment if available (GitHub Actions CI), otherwise use default
const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
const NEEDS_POSTGRES_MANAGEMENT = !process.env.DATABASE_URL; // Only manage PostgreSQL if not provided by CI

let postgresContainerId: string | null = null;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkPostgresRunning(): Promise<boolean> {
  try {
    execSync(`psql -h localhost -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT 1;" 2>/dev/null`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

async function startPostgres() {
  // Skip PostgreSQL management if DATABASE_URL is already set (GitHub Actions CI)
  if (!NEEDS_POSTGRES_MANAGEMENT) {
    console.log("✓ Using provided DATABASE_URL (GitHub Actions CI environment)");
    return;
  }

  console.log("🐘 Checking PostgreSQL...");

  // First check if it's already running locally
  if (await checkPostgresRunning()) {
    console.log("✓ PostgreSQL already running at localhost:5432");
    return;
  }

  console.log("📦 Attempting to start PostgreSQL container...");

  // Stop any existing container with the same name
  try {
    execSync(`docker stop ${DOCKER_CONTAINER_NAME} 2>/dev/null`, { stdio: "pipe" });
    execSync(`docker rm ${DOCKER_CONTAINER_NAME} 2>/dev/null`, { stdio: "pipe" });
  } catch {
    // Container doesn't exist, that's fine
  }

  // Start PostgreSQL container
  try {
    const result = execSync(
      `docker run -d --name ${DOCKER_CONTAINER_NAME} \\
      -e POSTGRES_USER=${POSTGRES_USER} \\
      -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \\
      -e POSTGRES_DB=${POSTGRES_DB} \\
      -p 5432:5432 \\
      postgres:16-alpine`,
      { encoding: "utf-8", stdio: "pipe" }
    );

    postgresContainerId = result.trim();
    console.log(`✓ PostgreSQL container started (${postgresContainerId.substring(0, 12)})`);

    // Wait for PostgreSQL to be ready
    let retries = 30;
    while (retries > 0) {
      if (await checkPostgresRunning()) {
        console.log("✓ PostgreSQL is ready");
        return;
      }
      await sleep(1000);
      retries--;
    }

    throw new Error("PostgreSQL failed to start within 30 seconds");
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("docker daemon") || errorMsg.includes("unix:///var/run/docker.sock")) {
      console.error("\n❌ INFRASTRUCTURE BLOCKER: LOCAL_POSTGRES_REQUIRED_FOR_TEST_CI");
      console.error("   PostgreSQL is not running and Docker daemon is not accessible.");
      console.error("");
      console.error("To fix this:");
      console.error("  Option 1: Start Docker and ensure 'docker ps' works");
      console.error("  Option 2: Start PostgreSQL locally:");
      console.error(`    - brew install postgresql@16  (macOS)`);
      console.error(`    - apt-get install postgresql-16  (Ubuntu/Debian)`);
      console.error(`    - Start service: psql -U postgres -c "CREATE DATABASE ${POSTGRES_DB};"`);
      console.error(`  Option 3: Run in GitHub Actions CI which provides PostgreSQL service`);
      console.error("");
      process.exit(1);
    }

    console.error("✗ Failed to start PostgreSQL:", errorMsg);
    process.exit(1);
  }
}

async function runMigrations() {
  console.log("🔧 Running Prisma migrations...");

  try {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SKIP_ENV_VALIDATION = "true";
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("✓ Migrations completed");
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("✗ Migration failed:", errorMsg);
    process.exit(1);
  }
}

async function generatePrismaClient() {
  console.log("⚙️  Generating Prisma client...");

  try {
    process.env.SKIP_ENV_VALIDATION = "true";
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✓ Prisma client generated");
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("✗ Prisma generation failed:", errorMsg);
    process.exit(1);
  }
}

async function buildNextJs() {
  console.log("🏗️  Building Next.js...");

  try {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SKIP_ENV_VALIDATION = "true";
    execSync("npm run build", { stdio: "inherit" });
    console.log("✓ Next.js build completed");
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("✗ Build failed:", errorMsg);
    process.exit(1);
  }
}

async function startNextServer() {
  // Note: Tests run directly with vitest, not through a server
  // Database is already configured and migrations are applied
  console.log("✓ Database infrastructure ready for tests");
}

async function runTests() {
  console.log("🧪 Running tests...");

  try {
    const env = { ...process.env };
    env.DATABASE_URL = DATABASE_URL;
    env.NODE_ENV = "test";
    env.SKIP_ENV_VALIDATION = "true";

    execSync("vitest run --maxWorkers 1", { stdio: "inherit", env });
    console.log("✓ Tests completed");
    return true;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("✗ Tests failed");
    console.error("Error details:", errorMsg);
    return false;
  }
}

async function cleanup() {
  console.log("🧹 Cleaning up...");

  // Stop and remove PostgreSQL container (only if we started one)
  if (postgresContainerId && NEEDS_POSTGRES_MANAGEMENT) {
    try {
      execSync(`docker stop ${DOCKER_CONTAINER_NAME} 2>/dev/null`, { stdio: "pipe" });
      execSync(`docker rm ${DOCKER_CONTAINER_NAME} 2>/dev/null`, { stdio: "pipe" });
      console.log("✓ PostgreSQL container stopped");
    } catch {
      // Container already stopped
    }
  }
}

async function main() {
  console.log("📋 OpsIQ Test CI Runner");
  console.log("=======================\n");
  console.log(`Process started at ${new Date().toISOString()}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log("");

  try {
    // Setup infrastructure
    console.log("[1/5] Starting PostgreSQL...");
    await startPostgres();
    console.log("[1/5] ✓ PostgreSQL ready\n");

    console.log("[2/5] Running migrations...");
    await runMigrations();
    console.log("[2/5] ✓ Migrations complete\n");

    console.log("[3/5] Generating Prisma client...");
    await generatePrismaClient();
    console.log("[3/5] ✓ Prisma client generated\n");

    console.log("[4/5] Building Next.js...");
    await buildNextJs();
    console.log("[4/5] ✓ Next.js build complete\n");

    console.log("[5/5] Starting test server...");
    await startNextServer();
    console.log("[5/5] ✓ Server ready\n");

    // Run tests
    console.log("[TESTS] Running vitest...");
    const testsPassed = await runTests();
    console.log(`[TESTS] ${testsPassed ? "✓" : "✗"} Tests ${testsPassed ? "passed" : "failed"}\n`);

    // Cleanup
    console.log("[CLEANUP] Cleaning up infrastructure...");
    await cleanup();
    console.log("[CLEANUP] ✓ Cleanup complete\n");

    // Exit with appropriate code
    const exitCode = testsPassed ? 0 : 1;
    console.log(`Test runner exiting with code: ${exitCode}`);
    process.exit(exitCode);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ FATAL ERROR in test runner");
    console.error("Error:", errorMsg);
    if (error instanceof Error && error.stack) {
      console.error("Stack:", error.stack);
    }
    await cleanup();
    process.exit(1);
  }
}

main();

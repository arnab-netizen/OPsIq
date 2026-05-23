#!/usr/bin/env node
/**
 * Self-contained test:ci runner
 * Ensures all required infrastructure is available before running tests
 */

import { execSync, spawn } from "child_process";
import type { ChildProcess } from "child_process";

const DOCKER_CONTAINER_NAME = "opsiq-test-postgres";
const POSTGRES_USER = "postgres";
const POSTGRES_PASSWORD = "postgres";
const POSTGRES_DB = "opsiq_test";
const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}`;
const NEXT_SERVER_PORT = 3000;
const NEXT_SERVER_URL = `http://localhost:${NEXT_SERVER_PORT}`;

let postgresContainerId: string | null = null;
let nextServerProcess: ChildProcess | null = null;

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
  } catch (error: any) {
    // Check if this is a Docker daemon error
    if (error.message.includes("docker daemon") || error.message.includes("unix:///var/run/docker.sock")) {
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

    console.error("✗ Failed to start PostgreSQL:", error.message);
    process.exit(1);
  }
}

async function runMigrations() {
  console.log("🔧 Running Prisma migrations...");

  try {
    process.env.DATABASE_URL = DATABASE_URL;
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("✓ Migrations completed");
  } catch (error: any) {
    console.error("✗ Migration failed:", error.message);
    process.exit(1);
  }
}

async function generatePrismaClient() {
  console.log("⚙️  Generating Prisma client...");

  try {
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✓ Prisma client generated");
  } catch (error: any) {
    console.error("✗ Prisma generation failed:", error.message);
    process.exit(1);
  }
}

async function buildNextJs() {
  console.log("🏗️  Building Next.js...");

  try {
    process.env.DATABASE_URL = DATABASE_URL;
    execSync("npm run build", { stdio: "inherit" });
    console.log("✓ Next.js build completed");
  } catch (error: any) {
    console.error("✗ Build failed:", error.message);
    process.exit(1);
  }
}

async function startNextServer() {
  console.log("🚀 Starting Next.js server...");

  return new Promise<void>((resolve, reject) => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.PORT = String(NEXT_SERVER_PORT);

    nextServerProcess = spawn("npm", ["run", "start"], {
      stdio: "inherit",
      env: process.env,
    });

    // Wait for server to be ready
    let retries = 30;
    const checkServer = async () => {
      while (retries > 0) {
        try {
          const response = await fetch(`${NEXT_SERVER_URL}/api/health`);
          if (response.ok) {
            console.log(`✓ Next.js server is ready on ${NEXT_SERVER_URL}`);
            resolve();
            return;
          }
        } catch {
          // Server not ready yet
        }

        await sleep(1000);
        retries--;
      }

      reject(new Error("Next.js server failed to start within 30 seconds"));
    };

    checkServer();
  });
}

async function runTests() {
  console.log("🧪 Running tests...");

  try {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.TEST_API_URL = NEXT_SERVER_URL;
    (process.env as any).NODE_ENV = "test";

    execSync("vitest run --maxWorkers 1", { stdio: "inherit" });
    console.log("✓ Tests completed");
    return true;
  } catch (error: any) {
    console.error("✗ Tests failed");
    return false;
  }
}

async function cleanup() {
  console.log("🧹 Cleaning up...");

  // Stop Next.js server
  if (nextServerProcess) {
    nextServerProcess.kill();
    await sleep(2000);
  }

  // Stop and remove PostgreSQL container
  if (postgresContainerId) {
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

  try {
    // Setup infrastructure
    await startPostgres();
    await runMigrations();
    await generatePrismaClient();
    await buildNextJs();
    await startNextServer();

    // Run tests
    const testsPassed = await runTests();

    // Cleanup
    await cleanup();

    // Exit with appropriate code
    process.exit(testsPassed ? 0 : 1);
  } catch (error: any) {
    console.error("\n❌ Test runner failed:", error.message);
    await cleanup();
    process.exit(1);
  }
}

main();

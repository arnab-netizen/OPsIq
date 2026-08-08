/**
 * Global setup for vitest - runs once before all tests
 * Initializes test environment and ensures database is ready
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

// Global keepalive: persistent pg.Client kept connected throughout the suite so
// Neon never starts its auto-suspend timer between test runs.
let _globalKeepaliveInterval: ReturnType<typeof setInterval> | undefined;
let _globalKeepaliveClient: any = undefined;

async function setup() {
  console.log("\n📊 Initializing test environment...");

  // Set test environment
  (process.env as any).NODE_ENV = "test";
  (process.env as any).VITEST = "true";
  (process.env as any).SKIP_ENV_VALIDATION = "true";
  // TEST_WITH_DB should be set by CI workflow if database tests are needed
  // Default to empty to allow vitest config's test filter to work

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

  // Strip pgbouncer pooler suffix for Neon URLs in test environments.
  // pgbouncer transaction mode releases Neon connections after each transaction, letting Neon
  // compute suspend between test queries. Direct connections let pg.Pool's TCP keepAlive work.
  if (process.env.DATABASE_URL?.includes("-pooler.")) {
    (process.env as any).DATABASE_URL = process.env.DATABASE_URL.replace("-pooler.", ".");
    console.log("  → Switched to direct Neon endpoint for test stability (stripped -pooler)");
  }

  // Write .env.test so vitest.setup.ts (setupFiles, runs in each worker process) loads the
  // direct URL. vitest worker_threads get a copy of process.env at creation time, which may
  // predate globalSetup's URL strip. Writing .env.test and having workers call
  // dotenv.config({ path: ".env.test" }) is the reliable propagation path.
  if (process.env.DATABASE_URL) {
    const envTestContent = [
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      `TEST_WITH_DB=${process.env.TEST_WITH_DB || "false"}`,
      `NODE_ENV=test`,
      `VITEST=true`,
      `SKIP_ENV_VALIDATION=true`,
    ].join("\n") + "\n";
    fs.writeFileSync(envTestPath, envTestContent, { encoding: "utf8" });
    console.log("  → Wrote direct Neon URL to .env.test for test worker propagation");
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

  // Initialize database connection only if TEST_WITH_DB is explicitly true
  const testWithDb = process.env.TEST_WITH_DB === "true";
  if (testWithDb) {
    console.log("  → Initializing database connection + warming Neon (may take several minutes for cold-start)...");
    try {
      const { getDbInstance } = await import("./src/lib/db");
      await getDbInstance();
    } catch (error) {
      console.error("  ✗ Failed to create database client:", error);
      throw error;
    }

    // Warm Neon compute before workers spawn.
    // Single attempt with 700s timeout — covers Neon's full cold-start window (7-10 min).
    // If Neon is already warm this returns instantly; if cold-starting it waits it out.
    // Global setup has no strict time limit, so a long single attempt is the right approach.
    // Non-fatal if it fails — workers handle cold-start via their own beforeAll timeout.
    try {
      const { pingDatabase } = await import("./src/lib/db");
      await pingDatabase(700000);
      console.log("  ✓ Neon compute warmed for all workers");
      // Keep Neon warm throughout the suite: persistent TCP connection so Neon
      // never starts its auto-suspend timer between test worker queries.
      const pgLib = await import("pg");
      const kaUrl = (process.env.DATABASE_URL || "").replace("-pooler.", ".");
      const kaSsl = kaUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined;
      const makeGlobalKaClient = () => new pgLib.Client({
        connectionString: kaUrl, ssl: kaSsl, keepAlive: true, keepAliveInitialDelayMillis: 5000,
      });
      _globalKeepaliveClient = makeGlobalKaClient();
      try { await _globalKeepaliveClient.connect(); } catch { _globalKeepaliveClient = null; }
      _globalKeepaliveInterval = setInterval(async () => {
        if (!_globalKeepaliveClient) {
          try { _globalKeepaliveClient = makeGlobalKaClient(); await _globalKeepaliveClient.connect(); } catch { _globalKeepaliveClient = null; }
          return;
        }
        try {
          await _globalKeepaliveClient.query("SELECT 1");
        } catch {
          try { await _globalKeepaliveClient.end().catch(() => {}); } catch { /* ignore */ }
          _globalKeepaliveClient = null;
          try { _globalKeepaliveClient = makeGlobalKaClient(); await _globalKeepaliveClient.connect(); } catch { _globalKeepaliveClient = null; }
        }
      }, 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  → Neon warm-up failed: ${msg.slice(0, 100)}`);
      console.log("  ⚠ Neon warm-up failed (non-fatal) — workers will handle cold-start via beforeAll");
    }

    // Initialize startup status for test environment
    console.log("  → Initializing startup status...");
    try {
      const { resetStartupStatus, setStartupStatus } = await import("./src/services/startup-status");
      await resetStartupStatus();
      await setStartupStatus("READY");
      console.log("  ✓ Startup status initialized");
    } catch (error) {
      console.error("  ⚠ Failed to initialize startup status:", error);
    }
  } else {
    console.log("  ℹ DATABASE_URL not configured for local testing, skipping DB initialization");
  }

  console.log("✓ Test environment ready\n");
}

async function teardown() {
  console.log("\n📊 Cleaning up test environment...");

  // Stop global Neon keepalive
  if (_globalKeepaliveInterval) {
    clearInterval(_globalKeepaliveInterval);
    _globalKeepaliveInterval = undefined;
    console.log("  ✓ Global Neon keepalive stopped");
  }
  if (_globalKeepaliveClient) {
    try { await _globalKeepaliveClient.end(); } catch { /* ignore */ }
    _globalKeepaliveClient = undefined;
  }

  // Remove the .env.test file written during setup (contains direct Neon URL for workers).
  // Only remove if we wrote it (file was created by this setup, not pre-existing user config).
  const envTestPath = path.resolve(__dirname, ".env.test");
  if (fs.existsSync(envTestPath)) {
    try {
      fs.unlinkSync(envTestPath);
      console.log("  ✓ Removed temporary .env.test");
    } catch {
      console.log("  ⚠ Could not remove .env.test (non-fatal)");
    }
  }

  const testWithDb = process.env.TEST_WITH_DB === "true";
  if (!testWithDb) {
    console.log("  ℹ Skipping DB disconnect (TEST_WITH_DB not set)");
    return;
  }
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


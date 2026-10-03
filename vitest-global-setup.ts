/**
 * Global setup for vitest - runs once before all tests
 * Initializes test environment and ensures database is ready
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Global keepalive: persistent pg.Client kept connected throughout the suite so
// Neon never starts its auto-suspend timer between test runs.
let _globalKeepaliveInterval: ReturnType<typeof setInterval> | undefined;
let _globalKeepaliveClient: import("pg").Client | null | undefined = undefined;

/** Mutable view of process.env (NODE_ENV is typed read-only by Next.js). */
const env = process.env as Record<string, string | undefined>;

async function setup() {
  console.log("\n📊 Initializing test environment...");

  // Set test environment
  env.NODE_ENV = "test";
  env.VITEST = "true";
  env.SKIP_ENV_VALIDATION = "true";
  // TEST_WITH_DB should be set by CI workflow if database tests are needed
  // Default to empty to allow vitest config's test filter to work

  // Test-database guard (src/infra/test-database-guard.ts). `.env.test` is a generated
  // artifact written below for worker propagation — a pre-existing one is stale (possibly from a
  // run with a different database) and is deleted, never loaded. The guard fails closed: a DB run
  // needs an explicit loopback throwaway DATABASE_URL (or OPSIQ_ALLOW_REMOTE_TEST_DB=true for a
  // declared remote TEST database); a non-DB run never uses an inherited database URL.
  const envTestPath = path.resolve(__dirname, ".env.test");
  if (fs.existsSync(envTestPath)) {
    fs.unlinkSync(envTestPath);
    console.log("  → Removed stale .env.test (generated artifact; never loaded)");
  }
  const { resolveTestDatabase, TEST_DATABASE_VARIABLES } = await import("./src/infra/test-database-guard");
  const resolution = resolveTestDatabase(process.env);
  env.DATABASE_URL = resolution.databaseUrl;
  if (resolution.mode === "no-db") {
    for (const name of TEST_DATABASE_VARIABLES) env[name] = resolution.databaseUrl;
  }
  console.log(`  → Test database target: ${resolution.target}`);

  // Remote-test identity (runtime layer of the production-isolation guard). The opt-in means "a remote
  // NON-PRODUCTION database": read the connected database's own identity (read-only session) and refuse production
  // or an unreadable identity BEFORE any DB access, keepalive, startup write or test. Loopback targets need no probe.
  if (resolution.mode === "db") {
    const { remoteDatabaseVariables, verifyRemoteTestDatabaseIdentity } = await import("./src/infra/test-database-guard");
    const { readDatabaseIdentity } = await import("./src/infra/pg-database-identity-reader");
    await verifyRemoteTestDatabaseIdentity(remoteDatabaseVariables(process.env), process.env, readDatabaseIdentity);
    console.log("  → Remote test database identity: approved OpsIQ test branch verified (or loopback)");
  }

  // Strip pgbouncer pooler suffix for Neon URLs in test environments.
  // pgbouncer transaction mode releases Neon connections after each transaction, letting Neon
  // compute suspend between test queries. Direct connections let pg.Pool's TCP keepAlive work.
  if (process.env.DATABASE_URL?.includes("-pooler.")) {
    env.DATABASE_URL = process.env.DATABASE_URL.replace("-pooler.", ".");
    console.log("  → Switched to direct Neon endpoint for test stability (stripped -pooler)");
  }

  // Write .env.test so vitest.setup.ts (setupFiles, runs in each worker process) loads the
  // direct URL. vitest worker_threads get a copy of process.env at creation time, which may
  // predate globalSetup's URL strip. Writing .env.test and having workers call
  // dotenv.config({ path: ".env.test" }) is the reliable propagation path.
  if (process.env.DATABASE_URL) {
    const envTestContent = [
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      // Sibling database variables too, so no worker keeps an inherited (unguarded) value.
      ...TEST_DATABASE_VARIABLES.filter((n) => n !== "DATABASE_URL" && process.env[n]).map((n) => `${n}=${process.env[n]}`),
      `TEST_WITH_DB=${resolution.mode === "db" ? "true" : "false"}`,
      `NODE_ENV=test`,
      `VITEST=true`,
      `SKIP_ENV_VALIDATION=true`,
    ].join("\n") + "\n";
    fs.writeFileSync(envTestPath, envTestContent, { encoding: "utf8" });
    console.log("  → Wrote guarded database URL(s) to .env.test for test worker propagation");
  }

  // Never print the URL, host or database name: even credential-masked, it identifies the target (and was copied
  // verbatim into signed Stage 7 evidence). The sanitized target class is logged above.
  console.log(`  → Database URL: ${process.env.DATABASE_URL ? "configured (not printed)" : "not set"}`);

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

  // Initialize database connection only for a guarded DB run
  const testWithDb = resolution.mode === "db";
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
    // 1800s (30 min) covers worst-case cold-start (14+ min observed in CI-like environments).
    // 700s was insufficient — pingDatabase timed out before Neon became ready, so the global
    // keepalive client was never created, causing workers to face a re-suspended Neon.
    // With 1800s: pingDatabase succeeds when Neon is ready → keepalive client created →
    // Neon stays warm for all workers. Non-fatal if it still fails — workers use their own
    // pingDatabase(1800000) in beforeAll as a fallback.
    try {
      const { pingDatabase } = await import("./src/lib/db");
      await pingDatabase(1800000);
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


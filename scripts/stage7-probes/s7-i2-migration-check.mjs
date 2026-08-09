#!/usr/bin/env node
/**
 * S7-I2 — Production migration integrity
 *
 * LANE_C production migration check.
 *
 * Assertion: All approved migrations applied; zero pending migrations
 *            confirmed against production DB.
 *
 * Required env vars:
 *   DATABASE_DIRECT_URL  — direct (non-pooled) connection; required for
 *                          migrate status introspection
 *   DATABASE_URL         — pooled URL, fallback if DIRECT not set
 *
 * Exit 0 = PASS. Non-zero = FAIL. Observations on stdout.
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

const DIRECT_URL = process.env.DATABASE_DIRECT_URL ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const observations = [];
let failed = false;

function record(label, value, pass = true) {
  const entry = { label, value, pass };
  observations.push(entry);
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}: ${JSON.stringify(value)}`);
  if (!pass) failed = true;
}

function fail(label, value) {
  record(label, value, false);
}

function countMigrationFiles() {
  try {
    const migrationsDir = resolve(projectRoot, "prisma", "migrations");
    const entries = readdirSync(migrationsDir, { withFileTypes: true });
    const migrationDirs = entries
      .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
      .map((e) => e.name);
    return migrationDirs;
  } catch {
    return [];
  }
}

async function runMigrateStatus(dbUrl) {
  const env = { ...process.env, DATABASE_URL: dbUrl };
  if (DIRECT_URL) {
    env.DATABASE_DIRECT_URL = DIRECT_URL;
  }

  try {
    const output = execSync("npx prisma migrate status --schema=prisma/schema.prisma", {
      cwd: projectRoot,
      env,
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { success: true, stdout: output, stderr: "" };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    return { success: false, stdout, stderr, code: err.status };
  }
}

async function main() {
  console.log("=== S7-I2: Production migration integrity ===");

  const dbUrl = DIRECT_URL || DATABASE_URL;
  if (!dbUrl) {
    fail(
      "database_credentials",
      "REFUSED: Neither DATABASE_DIRECT_URL nor DATABASE_URL is set. " +
        "Cannot verify migration status without a database connection."
    );
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }

  record("db_url_source", DIRECT_URL ? "DATABASE_DIRECT_URL" : "DATABASE_URL (pooled — DIRECT preferred)");

  // Count local migration files
  const localMigrations = countMigrationFiles();
  record("local_migration_count", localMigrations.length, localMigrations.length > 0);
  console.log(`Local migration directories: ${localMigrations.join(", ") || "(none)"}`);

  // Run prisma migrate status
  console.log("\nRunning: npx prisma migrate status");
  const result = await runMigrateStatus(dbUrl);

  console.log("\n--- migrate status stdout ---");
  console.log(result.stdout || "(empty)");
  if (result.stderr) {
    console.log("\n--- migrate status stderr ---");
    console.log(result.stderr);
  }
  console.log("--- end migrate status output ---\n");

  // Parse output for migration status indicators
  const output = (result.stdout + result.stderr).toLowerCase();

  const dbUpToDate =
    output.includes("database schema is up to date") ||
    output.includes("no pending migrations");

  const hasPending =
    output.includes("following migration") &&
    (output.includes("have not yet been applied") ||
      output.includes("unapplied migration"));

  const hasFailedMigrations =
    output.includes("failed migration") ||
    output.includes("migration failed") ||
    output.includes("error:");

  const hasDrift =
    output.includes("drift") ||
    output.includes("shadow database");

  record(
    "migrate_status_exit_code",
    result.success ? 0 : result.code ?? "non-zero",
    result.success
  );

  if (dbUpToDate && !hasPending) {
    record(
      "zero_pending_migrations",
      "Database schema is up to date — all migrations applied",
      true
    );
  } else if (hasPending) {
    fail("pending_migrations_detected", "One or more unapplied migrations detected");
  } else if (!result.success) {
    fail(
      "migrate_status_failed",
      `Exit code ${result.code}; check output above`
    );
  } else {
    // Could not determine status from output
    record(
      "migration_status_indeterminate",
      "Could not parse migrate status output — review manually",
      false
    );
    failed = true;
  }

  if (hasFailedMigrations) {
    fail("failed_migrations_present", "Output indicates failed/error migration state");
  }
  if (hasDrift) {
    record("schema_drift_warning", "Output mentions drift — review for shadow database artifacts");
  }

  // Verify schema.prisma is present (sanity check)
  try {
    readFileSync(resolve(projectRoot, "prisma", "schema.prisma"), "utf8");
    record("prisma_schema_present", "prisma/schema.prisma exists");
  } catch {
    fail("prisma_schema_missing", "prisma/schema.prisma not found");
  }

  console.log("\n=== OBSERVATION SUMMARY ===");
  const passes = observations.filter((o) => o.pass).length;
  const failures = observations.filter((o) => !o.pass).length;
  console.log(`Checks: ${passes} PASS, ${failures} FAIL`);

  if (failed) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

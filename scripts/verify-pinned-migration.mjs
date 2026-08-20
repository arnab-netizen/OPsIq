#!/usr/bin/env node
/**
 * Post-migration structural verification for migrate-production.yml's
 * PINNED_PREDEPLOY mode.
 *
 * Confirms exactly one named migration is recorded as successfully applied
 * in "_prisma_migrations", via a single fixed, parameterized query against
 * that table. migration_name is always passed as a bound query parameter,
 * never interpolated into SQL text -- this is NOT an arbitrary-SQL escape
 * hatch, it is one hardcoded read-only statement whose only variable input
 * is a value already checksum-verified earlier in the workflow.
 *
 * Usage: DATABASE_URL=... MIGRATION_NAME=<name> node scripts/verify-pinned-migration.mjs
 */
import { Client } from "pg";
import { fileURLToPath } from "url";

const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-zA-Z0-9_]+$/;

export function validateInputs(databaseUrl, migrationName) {
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL is required" };
  }
  if (!migrationName || !MIGRATION_NAME_PATTERN.test(migrationName)) {
    return {
      ok: false,
      error: "MIGRATION_NAME is required and must match <14-digit-timestamp>_<name>",
    };
  }
  return { ok: true };
}

export async function verifyMigrationApplied(client, migrationName) {
  const result = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    [migrationName]
  );

  if (result.rows.length === 0) {
    return { ok: false, error: `No _prisma_migrations row found for ${migrationName}` };
  }
  if (result.rows.length > 1) {
    return { ok: false, error: `Multiple _prisma_migrations rows found for ${migrationName} — unexpected` };
  }
  const row = result.rows[0];
  if (!row.finished_at) {
    return { ok: false, error: `${migrationName} has not finished (finished_at is null)` };
  }
  if (row.rolled_back_at) {
    return { ok: false, error: `${migrationName} was rolled back at ${row.rolled_back_at}` };
  }
  return { ok: true, finishedAt: row.finished_at };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const migrationName = process.env.MIGRATION_NAME;

  const inputCheck = validateInputs(databaseUrl, migrationName);
  if (!inputCheck.ok) {
    console.error(`✗ ${inputCheck.error}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await verifyMigrationApplied(client, migrationName);
    if (!result.ok) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }
    console.log(`✓ ${migrationName} verified applied: finished_at=${result.finishedAt}`);
    process.exit(0);
  } catch (err) {
    console.error(`✗ Verification query failed: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

// Guard: only run main() when executed directly (not when imported for tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
/**
 * Classifies `npx prisma migrate status`'s (exit code, output) for
 * migrate-production.yml's PINNED_PREDEPLOY pre-deploy gate.
 *
 * Incident this closes: the gate previously captured status via
 * `STATUS_OUTPUT=$(npx prisma migrate status 2>&1)` under the shell's
 * default `set -e`. Prisma exits non-zero whenever migrations are pending
 * -- the EXPECTED state for PINNED_PREDEPLOY, since a migration was just
 * materialized specifically to become pending -- so that assignment
 * itself aborted the step before any of the intended pending-migration
 * parsing/validation logic, or the trailing `exit 0`, ever ran.
 *
 * Prisma's CLI has no structured/JSON `migrate status` output, so this is
 * a strict ALLOW-LIST classifier: only PENDING_EXPECTED -- exactly the
 * one authorized migration name, no negative-signal markers present -- is
 * accepted. Any output shape this classifier doesn't positively recognize
 * is rejected. Fail closed, not fail open.
 */
import { fileURLToPath } from "url";

const MIGRATION_NAME_PATTERN = /[0-9]{14}_[a-zA-Z0-9_]+/g;

// Checked before the positive pending signature so an error message that
// happens to also contain migration-name-shaped text is never misread as
// a clean pending state.
const CONNECTION_ERROR_MARKERS = [
  "P1000",
  "P1001",
  "P1002",
  "P1010",
  "Can't reach database",
  "Authentication failed",
];
const FAILED_MIGRATION_MARKERS = ["P3009", "failed migration", "have failed"];
const PENDING_MARKER = "have not yet been applied";
const UP_TO_DATE_MARKER = "Database schema is up to date";

export function classifyMigrateStatus({ exitCode, output, expectedMigrationName }) {
  const text = typeof output === "string" ? output : "";

  for (const marker of CONNECTION_ERROR_MARKERS) {
    if (text.includes(marker)) {
      return {
        classification: "CONNECTION_ERROR",
        ok: false,
        reason: `Detected connection-error marker '${marker}' in migrate status output`,
      };
    }
  }
  for (const marker of FAILED_MIGRATION_MARKERS) {
    if (text.includes(marker)) {
      return {
        classification: "FAILED_MIGRATION",
        ok: false,
        reason: `Detected failed-migration marker '${marker}' in migrate status output`,
      };
    }
  }

  if (exitCode === 0) {
    if (text.includes(UP_TO_DATE_MARKER)) {
      return {
        classification: "NO_PENDING",
        ok: false,
        reason:
          "migrate status reports the database is up to date (0 pending) -- PINNED_PREDEPLOY requires exactly one pending migration and does not support an already-applied case",
      };
    }
    return {
      classification: "MALFORMED_OUTPUT",
      ok: false,
      reason: "Exit code 0 but output did not match the expected up-to-date signature",
    };
  }

  if (!text.includes(PENDING_MARKER)) {
    return {
      classification: "MALFORMED_OUTPUT",
      ok: false,
      reason: "Non-zero exit but output did not match the expected pending-migrations signature -- refusing to guess",
    };
  }

  const names = Array.from(new Set(text.match(MIGRATION_NAME_PATTERN) || []));
  if (names.length === 0) {
    return {
      classification: "MALFORMED_OUTPUT",
      ok: false,
      reason: "Pending-migrations signature present but no migration name could be parsed",
    };
  }
  if (names.length > 1) {
    return {
      classification: "MULTIPLE_PENDING",
      ok: false,
      reason: `Expected exactly one pending migration, found ${names.length}: ${names.join(", ")}`,
    };
  }
  if (names[0] !== expectedMigrationName) {
    return {
      classification: "WRONG_MIGRATION",
      ok: false,
      reason: `Pending migration '${names[0]}' does not match the authorized migration '${expectedMigrationName}'`,
    };
  }

  return {
    classification: "PENDING_EXPECTED",
    ok: true,
    reason: `Exactly the authorized migration '${expectedMigrationName}' is pending`,
  };
}

function main() {
  const exitCode = Number(process.env.STATUS_EXIT);
  const output = process.env.STATUS_OUTPUT ?? "";
  const expectedMigrationName = process.env.EXPECTED_MIGRATION_NAME ?? "";

  if (!Number.isInteger(exitCode)) {
    console.error("::error::STATUS_EXIT must be an integer exit code");
    process.exit(1);
  }
  if (!expectedMigrationName) {
    console.error("::error::EXPECTED_MIGRATION_NAME is required");
    process.exit(1);
  }

  const result = classifyMigrateStatus({ exitCode, output, expectedMigrationName });
  console.log(`PREFLIGHT_CLASSIFICATION=${result.classification}`);
  console.log(`PREFLIGHT_PASSED=${result.ok ? "true" : "false"}`);
  console.log(result.reason);

  if (!result.ok) {
    console.error(`::error::${result.reason}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

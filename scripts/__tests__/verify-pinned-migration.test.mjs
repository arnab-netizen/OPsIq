#!/usr/bin/env node
/**
 * verify-pinned-migration.mjs — input validation + query-result interpretation unit tests
 *
 * Tests the exported pure functions directly. No real DB connection is made:
 * verifyMigrationApplied() is exercised against a stub client object whose
 * query() returns canned rows, proving the interpretation logic (missing,
 * duplicate, unfinished, rolled-back, applied) without needing Postgres.
 *
 * Run: node scripts/__tests__/verify-pinned-migration.test.mjs
 * Exit 0 → all cases pass; exit 1 → one or more cases misbehaved.
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { validateInputs, verifyMigrationApplied } = await import(
  join(__dirname, "..", "verify-pinned-migration.mjs")
);

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function stubClient(rows) {
  return { query: async () => ({ rows }) };
}

console.log("\n── validateInputs ──");

assert(
  "missing DATABASE_URL",
  validateInputs("", "20260819000001_startup_session_business_handoff").ok,
  false
);
assert(
  "missing MIGRATION_NAME",
  validateInputs("postgresql://x/y", "").ok,
  false
);
assert(
  "malformed MIGRATION_NAME (no timestamp prefix)",
  validateInputs("postgresql://x/y", "startup_session_business_handoff").ok,
  false
);
assert(
  "malformed MIGRATION_NAME (path traversal)",
  validateInputs("postgresql://x/y", "20260819000001_../../etc").ok,
  false
);
assert(
  "valid inputs",
  validateInputs("postgresql://x/y", "20260819000001_startup_session_business_handoff").ok,
  true
);

console.log("\n── verifyMigrationApplied ──");

const noRows = await verifyMigrationApplied(stubClient([]), "20260819000001_x");
assert("no row found → not ok", noRows.ok, false);

const twoRows = await verifyMigrationApplied(
  stubClient([{ finished_at: new Date(), rolled_back_at: null }, { finished_at: new Date(), rolled_back_at: null }]),
  "20260819000001_x"
);
assert("duplicate rows → not ok", twoRows.ok, false);

const unfinished = await verifyMigrationApplied(
  stubClient([{ finished_at: null, rolled_back_at: null }]),
  "20260819000001_x"
);
assert("unfinished (finished_at null) → not ok", unfinished.ok, false);

const rolledBack = await verifyMigrationApplied(
  stubClient([{ finished_at: new Date(), rolled_back_at: new Date() }]),
  "20260819000001_x"
);
assert("rolled back → not ok", rolledBack.ok, false);

const applied = await verifyMigrationApplied(
  stubClient([{ finished_at: new Date("2026-08-19T00:00:00Z"), rolled_back_at: null }]),
  "20260819000001_x"
);
assert("applied, finished, not rolled back → ok", applied.ok, true);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

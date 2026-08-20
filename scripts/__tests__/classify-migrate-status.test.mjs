#!/usr/bin/env node
/**
 * classify-migrate-status.mjs — incident regression + hostile classification tests
 *
 * Reproduces the exact production incident (prisma migrate status exits 1
 * because the authorized migration is pending -- the EXPECTED state) and
 * proves the classifier accepts it, plus the 6 owner-required
 * differentiation scenarios that must all be rejected.
 *
 * Run: node scripts/__tests__/classify-migrate-status.test.mjs
 * Exit 0 → all cases pass; exit 1 → one or more cases misbehaved.
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { classifyMigrateStatus } = await import(join(__dirname, "..", "classify-migrate-status.mjs"));

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

const EXPECTED_MIGRATION = "20260819000001_startup_session_business_handoff";
const OTHER_MIGRATION = "20260820000001_some_other_migration";

console.log("\n── INCIDENT REGRESSION: exit 1 + exactly the one authorized pending migration -> ACCEPTED ──");
{
  const output = `
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech"

23 migrations found in prisma/migrations

Following migration have not yet been applied:
${EXPECTED_MIGRATION}

To apply migrations run prisma migrate deploy
`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is PENDING_EXPECTED", result.classification, "PENDING_EXPECTED");
  assert("ok is true (preflight would reach the deploy gate)", result.ok, true);
}

console.log("\n── owner-required scenario: exit 1 + connection error -> REJECT ──");
{
  const output = `
Error: P1001

Can't reach database server at \`ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech\`:\`5432\`

Please make sure your database server is running.
`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is CONNECTION_ERROR", result.classification, "CONNECTION_ERROR");
  assert("ok is false", result.ok, false);
}

console.log("\n── owner-required scenario: exit 1 + failed migration -> REJECT ──");
{
  const output = `
Error: P3009

migrate found failed migrations in the target database, new migrations will not be applied.

The \`${EXPECTED_MIGRATION}\` migration started at ... failed
`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is FAILED_MIGRATION", result.classification, "FAILED_MIGRATION");
  assert("ok is false", result.ok, false);
}

console.log("\n── owner-required scenario: exit 1 + wrong migration -> REJECT ──");
{
  const output = `
Following migration have not yet been applied:
${OTHER_MIGRATION}

To apply migrations run prisma migrate deploy
`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is WRONG_MIGRATION", result.classification, "WRONG_MIGRATION");
  assert("ok is false", result.ok, false);
}

console.log("\n── owner-required scenario: exit 1 + two pending migrations -> REJECT ──");
{
  const output = `
Following migration have not yet been applied:
${EXPECTED_MIGRATION}
${OTHER_MIGRATION}

To apply migrations run prisma migrate deploy
`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is MULTIPLE_PENDING", result.classification, "MULTIPLE_PENDING");
  assert("ok is false", result.ok, false);
}

console.log("\n── owner-required scenario: exit 0 + no pending migration -> classified correctly ──");
{
  const output = `
23 migrations found in prisma/migrations

Database schema is up to date!
`;
  const result = classifyMigrateStatus({ exitCode: 0, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("classification is NO_PENDING (distinctly labeled, not conflated with any error)", result.classification, "NO_PENDING");
  assert("ok is false (PINNED_PREDEPLOY requires exactly 1 pending, not 0)", result.ok, false);
}

console.log("\n── owner-required scenario: malformed/unparseable output -> REJECT ──");
{
  const result1 = classifyMigrateStatus({ exitCode: 1, output: "", expectedMigrationName: EXPECTED_MIGRATION });
  assert("empty output -> MALFORMED_OUTPUT", result1.classification, "MALFORMED_OUTPUT");
  assert("empty output -> not ok", result1.ok, false);

  const result2 = classifyMigrateStatus({
    exitCode: 1,
    output: "some totally unexpected prisma CLI output shape we've never seen",
    expectedMigrationName: EXPECTED_MIGRATION,
  });
  assert("unrecognized shape -> MALFORMED_OUTPUT", result2.classification, "MALFORMED_OUTPUT");
  assert("unrecognized shape -> not ok", result2.ok, false);

  const result3 = classifyMigrateStatus({
    exitCode: 0,
    output: "unexpected success-shaped output that isn't the up-to-date signature",
    expectedMigrationName: EXPECTED_MIGRATION,
  });
  assert("exit 0 with unrecognized text -> MALFORMED_OUTPUT (fail closed, not assumed clean)", result3.classification, "MALFORMED_OUTPUT");
  assert("exit 0 with unrecognized text -> not ok", result3.ok, false);
}

console.log("\n── defense-in-depth: connection-error/failed-migration markers checked before pending-name parsing ──");
{
  // An error message that happens to contain a migration-name-shaped
  // substring must never be misclassified as a clean pending state.
  const output = `Error: P1001\nCan't reach database server (attempted after ${EXPECTED_MIGRATION} was last seen pending)`;
  const result = classifyMigrateStatus({ exitCode: 1, output, expectedMigrationName: EXPECTED_MIGRATION });
  assert("connection error wins over incidental migration-name text", result.classification, "CONNECTION_ERROR");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

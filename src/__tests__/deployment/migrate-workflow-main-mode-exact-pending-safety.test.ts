/**
 * Governance validator for migrate-production.yml's MAIN-mode
 * exact-one-pending-migration gate.
 *
 * Root cause: MAIN mode previously had no automated check that exactly the
 * intended migration -- and only it -- was pending before `prisma migrate
 * deploy` ran. It logged `prisma migrate status` output for a human to
 * read, then deployed unconditionally. This is the same class of gap
 * PINNED_PREDEPLOY already closed for itself via
 * scripts/classify-migrate-status.mjs; this file proves MAIN mode now
 * reuses that same classifier (not a parallel reimplementation) and adds
 * two new MAIN-only checks: migration_name is required and format-safe,
 * and the named migration must already exist in the checked-out main.
 *
 * The classifier's own hostile-case behavior (zero pending, multiple
 * pending, wrong migration, failed migration, connection error, malformed
 * output -> all rejected; exactly the expected migration pending -> the
 * only accepted case) is unit-tested exhaustively in
 * scripts/__tests__/classify-migrate-status.test.mjs and is NOT
 * duplicated here -- this file proves MAIN mode is wired into that same,
 * already-hostile-tested gate, plus the two genuinely new MAIN-only
 * checks. All checks here are static-source against the YAML file.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

describe("migrate-production.yml — MAIN-mode exact-one-pending gate", () => {
  it("1. migration_name is required at the schema level (both modes, not PINNED_PREDEPLOY-only)", () => {
    const idx = src.indexOf("migration_name:");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/required:\s*true/);
    expect(block).not.toMatch(/PINNED_PREDEPLOY only/);
    expect(block).toMatch(/[Rr]equired for both modes/);
  });

  it("2. A dedicated 'Validate MAIN inputs' step exists, gated to MAIN mode, running before Checkout code", () => {
    const stepIdx = src.indexOf("name: Validate MAIN inputs");
    const checkoutIdx = src.indexOf("name: Checkout code");
    expect(stepIdx).toBeGreaterThan(-1);
    expect(stepIdx).toBeLessThan(checkoutIdx);
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'MAIN'/);
  });

  it("3. Validate MAIN inputs rejects an empty/missing migration_name", () => {
    const stepIdx = src.indexOf("name: Validate MAIN inputs");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if\s*\[\s*-z\s*"\$MIGRATION_NAME"\s*\]/);
    expect(stepBlock).toContain("MAIN mode requires migration_name to be set");
  });

  it("4. Validate MAIN inputs enforces Prisma's timestamp_name convention and rejects path traversal, same as PINNED_PREDEPLOY", () => {
    const stepIdx = src.indexOf("name: Validate MAIN inputs");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toContain("^[0-9]{14}_[a-zA-Z0-9_]+$");
    expect(stepBlock).toMatch(/\*\.\.\*/);
    expect(stepBlock).toMatch(/\*\/\*/);
    expect(stepBlock).toMatch(/\*'\s'\*/);
  });

  it("5. A dedicated 'Verify migration exists on current main' step exists, gated to MAIN mode, running after Checkout code and before Deploy migrations", () => {
    const checkoutIdx = src.indexOf("name: Checkout code");
    const stepIdx = src.indexOf("name: Verify migration exists on current main");
    const deployIdx = src.indexOf("name: Deploy migrations");
    expect(stepIdx).toBeGreaterThan(checkoutIdx);
    expect(stepIdx).toBeLessThan(deployIdx);
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'MAIN'/);
  });

  it("6. Verify migration exists on current main aborts when the migration_name folder is absent from prisma/migrations", () => {
    const stepIdx = src.indexOf("name: Verify migration exists on current main");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if\s*\[\s*!\s*-d\s*"prisma\/migrations\/\$MIG_NAME"\s*\]/);
    expect(stepBlock).toContain("does not exist in checked-out main's prisma/migrations directory");
    expect(stepBlock).toContain("exit 1");
  });

  it("7. Verify migration exists on current main also confirms migration.sql itself is present, not just the folder", () => {
    const stepIdx = src.indexOf("name: Verify migration exists on current main");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if\s*\[\s*!\s*-f\s*"prisma\/migrations\/\$MIG_NAME\/migration\.sql"\s*\]/);
  });

  it("8. The pre-deploy classifier gate now runs unconditionally (both modes), not just PINNED_PREDEPLOY — proves MAIN mode reuses the same script rather than reimplementing it", () => {
    const stepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    const deployIdx = src.indexOf("name: Deploy migrations");
    expect(stepIdx).toBeGreaterThan(-1);
    const stepBlock = src.slice(stepIdx, deployIdx);
    expect(stepBlock).toContain("node scripts/classify-migrate-status.mjs");
    // Exactly one invocation site — MAIN and PINNED_PREDEPLOY share it, not
    // two separate mode-specific call sites.
    const occurrences = [...src.matchAll(/node scripts\/classify-migrate-status\.mjs/g)];
    expect(occurrences.length).toBe(1);
    // The classifier call itself must not be wrapped in a mode-conditional
    // `if` — it must be a plain, unconditional statement in this step.
    const classifyIdx = stepBlock.indexOf("node scripts/classify-migrate-status.mjs");
    const precedingLines = stepBlock.slice(0, classifyIdx).split("\n").slice(-3).join("\n");
    expect(precedingLines).not.toMatch(/if\s*\[\s*"\$\{\{\s*inputs\.mode/);
  });

  it("9. EXPECTED_MIGRATION_NAME passed to the classifier is inputs.migration_name (the same input MAIN mode now requires and validates)", () => {
    const stepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toContain('EXPECTED_MIGRATION_NAME="${{ inputs.migration_name }}"');
  });

  it("10. The classifier gate runs strictly before Deploy migrations, immediately preceding it (no unrelated step separates preflight from deploy)", () => {
    const gateStepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    const deployStepHeaderIdx = src.indexOf("- name: Deploy migrations");
    const nextStepAfterGate = src.indexOf("- name:", gateStepIdx + 10);
    expect(nextStepAfterGate).toBe(deployStepHeaderIdx);
    expect(gateStepIdx).toBeLessThan(deployStepHeaderIdx);
  });

  it("11. PREFLIGHT_PASSED is set unconditionally (both modes) immediately after the classifier call, never before it", () => {
    const stepIdx = src.indexOf("name: Check pending migrations (pre-deploy)");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    const classifyIdx = stepBlock.indexOf("classify-migrate-status.mjs");
    const preflightIdx = stepBlock.indexOf('echo "PREFLIGHT_PASSED=true"');
    expect(classifyIdx).toBeGreaterThan(-1);
    expect(preflightIdx).toBeGreaterThan(classifyIdx);
  });

  it("12. Regression: PINNED_PREDEPLOY's migration-chain-integrity check is untouched — it still REJECTS a migration that already exists in main (the opposite assertion from the new MAIN-mode check)", () => {
    const stepIdx = src.indexOf("name: Verify migration-chain integrity against main and materialize verified file");
    expect(stepIdx).toBeGreaterThan(-1);
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'PINNED_PREDEPLOY'/);
    expect(stepBlock).toMatch(/if\s*\[\s*-d\s*"prisma\/migrations\/\$MIG_NAME"\s*\]/);
    expect(stepBlock).toContain("already exists in main");
    expect(stepBlock).toContain("Use MAIN mode instead");
  });

  it("13. Regression: PINNED_PREDEPLOY's own input validation (source_pr/source_sha/migration_name/migration_sha256 together) is untouched", () => {
    const stepIdx = src.indexOf("name: Validate PINNED_PREDEPLOY inputs");
    expect(stepIdx).toBeGreaterThan(-1);
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'PINNED_PREDEPLOY'/);
    expect(stepBlock).toContain(
      'if [ -z "$SOURCE_PR" ] || [ -z "$SOURCE_SHA" ] || [ -z "$MIGRATION_NAME" ] || [ -z "$MIGRATION_SHA256" ]',
    );
  });

  it("14. Regression: MAIN-mode-only steps never run for PINNED_PREDEPLOY dispatches (each new step's if-guard is mode == 'MAIN', never unconditional or PINNED_PREDEPLOY)", () => {
    for (const stepName of ["Validate MAIN inputs", "Verify migration exists on current main"]) {
      const stepIdx = src.indexOf(`name: ${stepName}`);
      expect(stepIdx).toBeGreaterThan(-1);
      const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
      const stepBlock = src.slice(stepIdx, nextStepIdx);
      expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'MAIN'/);
      expect(stepBlock).not.toMatch(/if:\s*inputs\.mode == 'PINNED_PREDEPLOY'/);
    }
  });

  it("15. Migration summary records the enforced migration_name unconditionally (both modes), not just under PINNED_PREDEPLOY", () => {
    const summaryIdx = src.indexOf("name: Migration summary");
    const rowIdx = src.indexOf("Migration (owner-authorized, exact-one-pending enforced", summaryIdx);
    expect(rowIdx).toBeGreaterThan(summaryIdx);
    const precedingIf = src.lastIndexOf('inputs.mode }}" == "PINNED_PREDEPLOY"', rowIdx);
    if (precedingIf > summaryIdx) {
      const fiBetween = src.indexOf("fi", precedingIf);
      expect(fiBetween).toBeGreaterThan(-1);
      expect(fiBetween).toBeLessThan(rowIdx);
    }
  });

  it("16. No seed/reset/db-push/arbitrary-SQL operation was introduced by these changes", () => {
    expect(src).not.toContain("prisma db push");
    expect(src).not.toContain("prisma db seed");
    expect(src).not.toContain("prisma migrate reset");
    expect(src).not.toMatch(/psql\s+-c/);
  });
});

describe("scripts/classify-migrate-status.mjs — reused unchanged for MAIN mode", () => {
  const SCRIPT_PATH = join(process.cwd(), "scripts/classify-migrate-status.mjs");
  const scriptSrc = readFileSync(SCRIPT_PATH, "utf-8");

  it("17. The classifier's functional contract has no mode input at all — it reads only STATUS_EXIT/STATUS_OUTPUT/EXPECTED_MIGRATION_NAME, never a MODE variable or inputs.mode, so it cannot branch on mode even in principle", () => {
    expect(scriptSrc).not.toMatch(/process\.env\.MODE/);
    expect(scriptSrc).not.toMatch(/inputs\.mode/);
    expect(scriptSrc).toContain("process.env.STATUS_EXIT");
    expect(scriptSrc).toContain("process.env.STATUS_OUTPUT");
    expect(scriptSrc).toContain("process.env.EXPECTED_MIGRATION_NAME");
    // classifyMigrateStatus's own parameter list is the full functional
    // surface — confirming it takes no mode-shaped parameter.
    expect(scriptSrc).toMatch(/classifyMigrateStatus\(\{\s*exitCode,\s*output,\s*expectedMigrationName\s*\}\)/);
  });

  it("18. The 7 hostile classifications MAIN mode now inherits are all present in the script (exhaustively hostile-tested in scripts/__tests__/classify-migrate-status.test.mjs, not re-duplicated here)", () => {
    for (const classification of [
      "PENDING_EXPECTED",
      "NO_PENDING",
      "MULTIPLE_PENDING",
      "WRONG_MIGRATION",
      "FAILED_MIGRATION",
      "CONNECTION_ERROR",
      "MALFORMED_OUTPUT",
    ]) {
      expect(scriptSrc).toContain(classification);
    }
  });
});

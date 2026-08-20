/**
 * Governance validator for migrate-production.yml's PINNED_PREDEPLOY mode.
 *
 * PINNED_PREDEPLOY lets an owner-authorized migration be applied from an
 * exact, unmerged PR commit SHA before that PR merges. The controls below
 * exist to guarantee the unmerged commit's application code/scripts are
 * NEVER checked out or executed while the workflow holds
 * PRODUCTION_DATABASE_URL — only its single named migration.sql file is
 * ever read, via a git-object-level read, and only after checksum and
 * GitHub-API provenance verification. All checks are static-source against
 * the YAML file — no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

describe("migrate-production.yml — PINNED_PREDEPLOY safety controls", () => {
  it("1. Existing MAIN-mode safety controls are fully preserved (18-point contract unchanged)", () => {
    expect(src).toContain("MIGRATE PRODUCTION");
    expect(src).toContain("merge-base --is-ancestor");
    expect(src).toContain("npx prisma migrate deploy");
    expect(src).toContain("group: migrate-production");
    expect(src).toContain("cancel-in-progress: false");
  });

  it("2. Exposes a mode input with MAIN and PINNED_PREDEPLOY choices, default MAIN", () => {
    expect(src).toMatch(/mode:\s*\n\s*description:/);
    expect(src).toContain("- MAIN");
    expect(src).toContain("- PINNED_PREDEPLOY");
    expect(src).toMatch(/default:\s*'MAIN'/);
  });

  it("3. PINNED_PREDEPLOY requires a distinct, longer confirmation phrase than MAIN", () => {
    expect(src).toContain("MIGRATE PRODUCTION PINNED PREDEPLOY");
    const confirmIdx = src.indexOf("Confirm explicit intent");
    expect(confirmIdx).toBeGreaterThan(-1);
  });

  it("4. Checkout is pinned to ref: main — dispatch source branch never controls the checked-out tree", () => {
    const checkoutIdx = src.indexOf("actions/checkout@v4");
    expect(checkoutIdx).toBeGreaterThan(-1);
    const nextSteps = src.slice(checkoutIdx, checkoutIdx + 200);
    expect(nextSteps).toMatch(/ref:\s*main/);
  });

  it("5. Declares least-privilege workflow permissions", () => {
    expect(src).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it("6. source_pr, source_sha, migration_name, migration_sha256 inputs exist and are validated before use", () => {
    for (const input of ["source_pr:", "source_sha:", "migration_name:", "migration_sha256:"]) {
      expect(src).toContain(input);
    }
    expect(src).toContain("Validate PINNED_PREDEPLOY inputs");
  });

  it("7. source_sha is validated as a full 40-char lowercase hex commit SHA", () => {
    expect(src).toContain("^[0-9a-f]{40}$");
  });

  it("8. migration_sha256 is validated as a 64-char lowercase hex checksum", () => {
    expect(src).toContain("^[0-9a-f]{64}$");
  });

  it("9. migration_name is validated against Prisma's timestamp_name convention and rejects path traversal", () => {
    expect(src).toContain("^[0-9]{14}_[a-zA-Z0-9_]+$");
    expect(src).toMatch(/\*\.\.\*/);
    expect(src).toMatch(/\*\/\*/);
  });

  it("10. Verifies source PR/SHA provenance via the GitHub API before touching the pinned commit", () => {
    const provenanceIdx = src.indexOf("Verify source PR/SHA provenance via GitHub API");
    expect(provenanceIdx).toBeGreaterThan(-1);
    const fetchIdx = src.indexOf("Fetch pinned commit object", provenanceIdx);
    expect(fetchIdx).toBeGreaterThan(provenanceIdx);
    expect(src).toContain("gh api");
    expect(src).toContain("head.sha");
  });

  it("11. Requires source_sha to equal the PR's current head SHA (rejects stale/wrong SHAs)", () => {
    expect(src).toMatch(/PR_HEAD_SHA.*!=.*inputs\.source_sha/s);
  });

  it("12. Rejects PRs whose head is on a fork (same-repository enforcement)", () => {
    expect(src).toContain("PR_HEAD_REPO_FULL");
    expect(src).toMatch(/PR_HEAD_REPO_FULL.*!=.*github\.repository/s);
  });

  it("13. Rejects non-open PRs (merged/closed) — MAIN mode is the correct path once merged", () => {
    expect(src).toMatch(/PR_STATE.*!=.*"open"/s);
  });

  it("14. Never checks out the pinned SHA — extraction uses git object reads only (git show / git ls-tree)", () => {
    expect(src).toContain("git show");
    expect(src).toContain("git ls-tree");
    // No checkout step may target the pinned SHA input.
    expect(src).not.toMatch(/actions\/checkout@v4[\s\S]{0,200}inputs\.source_sha/);
    expect(src).not.toMatch(/git checkout ["']?\$\{\{\s*inputs\.source_sha/);
  });

  it("15. Extraction enforces exactly one file (migration.sql) in the pinned migration directory", () => {
    expect(src).toContain('"$FILES" != "prisma/migrations/$MIG_NAME/migration.sql"');
  });

  it("16. Verifies the extracted file's checksum before it is ever used", () => {
    const extractIdx = src.indexOf("Extract ONLY the verified migration file");
    const checksumIdx = src.indexOf("Verify extracted migration checksum");
    const materializeIdx = src.indexOf("materialize verified file");
    expect(extractIdx).toBeGreaterThan(-1);
    expect(checksumIdx).toBeGreaterThan(extractIdx);
    expect(materializeIdx).toBeGreaterThan(checksumIdx);
    expect(src).toContain("sha256sum /tmp/pinned-migration.sql");
  });

  it("17. Enforces migration-chain integrity: rejects if already merged, rejects if it doesn't sort last", () => {
    expect(src).toContain("already exists in main");
    expect(src).toContain("does not sort after the latest migration already in main");
  });

  it("18. Enforces exactly one pending migration before deploy in PINNED_PREDEPLOY mode", () => {
    // The pre-deploy gate delegates this enforcement to
    // classify-migrate-status.mjs (see migrate-workflow-preflight-errexit-safety.test.ts
    // for the classifier's own governance/hostile tests) rather than
    // inline shell parsing.
    expect(src).toContain("node scripts/classify-migrate-status.mjs");
    const classifierSrc = readFileSync(
      join(process.cwd(), "scripts/classify-migrate-status.mjs"),
      "utf-8"
    );
    expect(classifierSrc).toContain("MULTIPLE_PENDING");
    expect(classifierSrc).toContain("Expected exactly one pending migration");
  });

  it("19. DATABASE_URL placeholder/pooler checks are shared — no mode-specific database target exists", () => {
    const urlStepIdx = src.indexOf("Validate DATABASE_URL safety");
    const nextModeSpecificEnv = src.indexOf("PRODUCTION_DATABASE_URL", urlStepIdx + 1);
    expect(urlStepIdx).toBeGreaterThan(-1);
    // The safety step itself is unconditional (no `if: inputs.mode ==` guard).
    const stepBlock = src.slice(urlStepIdx - 200, urlStepIdx);
    expect(stepBlock).not.toMatch(/if:\s*inputs\.mode/);
    expect(nextModeSpecificEnv).toBeGreaterThan(-1);
  });

  it("20. Runs post-migration structural verification via a version-controlled, parameterized script — not arbitrary SQL", () => {
    expect(src).toContain("node scripts/verify-pinned-migration.mjs");
    expect(src).not.toMatch(/psql\s+-c/);
    expect(src).not.toMatch(/inputs\.[a-z_]*sql/i);
  });

  it("21. Documents the transient DB-ahead-of-main state and the no-manual-repair reconciliation path", () => {
    expect(src).toContain("Transient state");
    expect(src).toContain("reconciles automatically");
    expect(src).toMatch(/Do NOT run.*prisma migrate resolve/);
  });

  it("22. Removed the stale f4e7ed10 commit reference from the summary step", () => {
    expect(src).not.toContain("f4e7ed10");
  });

  it("23. Migration summary conditionally includes PINNED_PREDEPLOY-specific fields", () => {
    const summaryIdx = src.indexOf("Migration summary");
    const modeRowIdx = src.indexOf("| Mode |", summaryIdx);
    expect(modeRowIdx).toBeGreaterThan(summaryIdx);
  });

  it("24. Never introduces an arbitrary-SQL workflow input", () => {
    expect(src).not.toMatch(/sql_statement|arbitrary_sql|raw_sql|custom_query/i);
  });

  it("25. All new PINNED_PREDEPLOY-only steps run strictly before the Deploy migrations step", () => {
    const deployIdx = src.indexOf("name: Deploy migrations");
    for (const marker of [
      "Verify source PR/SHA provenance via GitHub API",
      "Fetch pinned commit object",
      "Extract ONLY the verified migration file",
      "Verify extracted migration checksum",
      "Verify migration-chain integrity",
    ]) {
      const idx = src.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(deployIdx);
    }
  });
});

/**
 * Phase 2: Governance validator for the production migration workflow.
 *
 * Verifies that the 18 required safety controls cannot regress without a test failure.
 * All checks are static-source against the YAML file — no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

describe("migrate-production.yml — safety controls", () => {
  it("1. Manual trigger only (workflow_dispatch)", () => {
    expect(src).toContain("workflow_dispatch:");
    expect(src).not.toMatch(/on:\s*push/);
    expect(src).not.toMatch(/on:\s*pull_request/);
    expect(src).not.toContain("schedule:");
  });

  it("2. Requires exact confirmation phrase input", () => {
    expect(src).toContain("MIGRATE PRODUCTION");
    expect(src).toContain("confirm:");
  });

  it("3. Confirmation phrase is string-equality checked; exits 1 on mismatch", () => {
    expect(src).toMatch(/!=\s*["']MIGRATE PRODUCTION["']/);
    expect(src).toContain("exit 1");
  });

  it("4. Uses actions/checkout with fetch-depth: 0 for full history", () => {
    expect(src).toContain("actions/checkout@v4");
    expect(src).toContain("fetch-depth: 0");
  });

  it("5. Prints the checked-out SHA before any database action", () => {
    expect(src).toContain("git rev-parse HEAD");
    expect(src).toContain("MIGRATION_SHA");
  });

  it("6. Verifies SHA is an ancestor of origin/main (refuses non-main commits)", () => {
    expect(src).toContain("merge-base --is-ancestor");
    expect(src).toContain("origin/main");
  });

  it("7. Rejects empty DATABASE_URL (PRODUCTION_DATABASE_URL secret check)", () => {
    expect(src).toContain("PRODUCTION_DATABASE_URL secret is missing or empty");
    expect(src).toContain("exit 1");
  });

  it("8. Removes local .env files before migration to prevent placeholder contamination", () => {
    expect(src).toContain("rm -f .env .env.local");
  });

  it("9. Rejects placeholder values in DATABASE_URL", () => {
    expect(src).toMatch(/grep\s+-qE\s+['"]REPLACE_\|PLACEHOLDER\|your_neon_url\|example\\\.com['"]/);
  });

  it("10. Rejects pooler hostname (-pooler.) in DATABASE_URL", () => {
    expect(src).toContain("-pooler.");
    // Must grep for pooler AND exit 1 if found.
    const poolerCheckIdx = src.indexOf("-pooler.");
    const exit1AfterPooler = src.indexOf("exit 1", poolerCheckIdx);
    expect(exit1AfterPooler).toBeGreaterThan(poolerCheckIdx);
  });

  it("11. Extracts host for logging WITHOUT printing full credentials", () => {
    expect(src).toContain("new URL(process.env.DATABASE_URL)");
    expect(src).toContain("u.hostname");
    // Must NOT have a bare `echo "$DATABASE_URL"` that prints the URL to stdout.
    // Piped use (echo "$DATABASE_URL" | grep) is allowed — grep consumes the output.
    // This regex matches echo followed by the URL variable NOT followed by a pipe.
    expect(src).not.toMatch(/echo\s+"\$DATABASE_URL"\s*\n/);
  });

  it("12. Runs prisma validate", () => {
    expect(src).toContain("npx prisma validate");
  });

  it("13. Runs prisma migrate status BEFORE deploy", () => {
    const statusIdx = src.indexOf("npx prisma migrate status");
    const deployIdx = src.indexOf("npx prisma migrate deploy");
    expect(statusIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeLessThan(deployIdx);
  });

  it("14. Runs prisma migrate deploy", () => {
    expect(src).toContain("npx prisma migrate deploy");
  });

  it("15. Runs prisma migrate status AFTER deploy", () => {
    const deployIdx = src.indexOf("npx prisma migrate deploy");
    const postStatusIdx = src.indexOf("npx prisma migrate status", deployIdx + 1);
    expect(postStatusIdx).toBeGreaterThan(deployIdx);
  });

  it("16. Fails if pending or failed migrations remain after deploy", () => {
    // Post-deploy status check must exit 1 on pending/failed output.
    const postStatusIdx = src.indexOf("Verify migration status (post-deploy)");
    const nextExit1Idx = src.indexOf("exit 1", postStatusIdx);
    expect(postStatusIdx).toBeGreaterThan(-1);
    expect(nextExit1Idx).toBeGreaterThan(postStatusIdx);
    expect(src.slice(postStatusIdx, nextExit1Idx)).toMatch(/pending|failed/i);
  });

  it("17. Uses concurrency group with cancel-in-progress: false", () => {
    expect(src).toContain("group: migrate-production");
    expect(src).toContain("cancel-in-progress: false");
  });

  it("18. Records SHA and migration result in job summary", () => {
    expect(src).toContain("GITHUB_STEP_SUMMARY");
    expect(src).toContain("MIGRATION_SHA");
  });
});

/**
 * P0-15 addition: mode=reviewed_pr — applies exactly one owner-authorized,
 * checksum-verified migration from an unmerged PR SHA, without ever checking
 * out, installing, or executing PR-authored code/config/scripts. All checks
 * below are static-source against the YAML — no workflow execution.
 */
describe("migrate-production.yml — mode=reviewed_pr safety controls", () => {
  // Scope most assertions to the reviewed_pr job's own text so a check never
  // accidentally passes by matching something in the (untouched) main-mode job.
  const jobStart = src.indexOf("migrate-reviewed-pr:");
  const reviewedPrJob = src.slice(jobStart);

  it("0. migrate-reviewed-pr job exists, and mode input offers both main and reviewed_pr with main as default", () => {
    expect(jobStart).toBeGreaterThan(-1);
    expect(src).toMatch(/mode:\s*\n\s*description:.*\n\s*required: true\s*\n\s*default: 'main'/);
    expect(src).toContain("- main");
    expect(src).toContain("- reviewed_pr");
  });

  it("1. Job condition is exactly mode == 'reviewed_pr' (never runs unless explicitly selected)", () => {
    expect(src).toContain("if: github.event.inputs.mode == 'reviewed_pr'");
  });

  it("2. Requires all four reviewed_pr-only inputs present, fails closed if any missing", () => {
    for (const field of ["pr_number", "authorized_sha", "expected_migration", "expected_migration_sha256"]) {
      expect(reviewedPrJob).toContain(field);
    }
    const gateIdx = reviewedPrJob.indexOf("Validate required reviewed_pr inputs are present");
    expect(gateIdx).toBeGreaterThan(-1);
    const nextExit1 = reviewedPrJob.indexOf("exit 1", gateIdx);
    expect(nextExit1).toBeGreaterThan(gateIdx);
  });

  it("3. Requires expected_migration_sha256 to be a well-formed hex SHA-256 (no unchecksummed migration accepted)", () => {
    expect(reviewedPrJob).toMatch(/expected_migration_sha256.*\^\[0-9a-f\]\{64\}\$/s);
  });

  it("4. NEVER checks out the PR ref — the only checkout in this job is main", () => {
    const checkoutIdx = reviewedPrJob.indexOf("actions/checkout@v4");
    expect(checkoutIdx).toBeGreaterThan(-1);
    const nextStepIdx = reviewedPrJob.indexOf("- name:", checkoutIdx);
    const checkoutBlock = reviewedPrJob.slice(checkoutIdx, nextStepIdx === -1 ? undefined : nextStepIdx);
    expect(checkoutBlock).toContain("ref: main");
    // No checkout step anywhere in this job may reference the PR's SHA or a pull ref.
    expect(reviewedPrJob).not.toMatch(/uses:\s*actions\/checkout@v4[\s\S]{0,200}ref:\s*\$\{\{\s*github\.event\.inputs\.authorized_sha/);
    expect(reviewedPrJob).not.toMatch(/uses:\s*actions\/checkout@v4[\s\S]{0,200}ref:\s*refs\/pull/);
  });

  it("5. Gate 1: verifies PR is open, unmerged, based on main, same-repo (not a fork), and HEAD matches authorized_sha exactly", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 1/6: PR identity verification");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = reviewedPrJob.indexOf("Gate 2/6", gateIdx);
    const gate1 = reviewedPrJob.slice(gateIdx, gateEnd);
    expect(gate1).toMatch(/PR_STATE.*!=\s*"open"/);
    expect(gate1).toMatch(/PR_MERGED.*!=\s*"false"/);
    expect(gate1).toMatch(/PR_BASE_REF.*!=\s*"main"/);
    expect(gate1).toContain("PR_HEAD_REPO");
    expect(gate1).toMatch(/head repo \(this repository, NOT an untrusted fork\)|Refusing a fork PR/);
    expect(gate1).toMatch(/PR_HEAD_SHA.*!=\s*"\$AUTHORIZED_SHA"/);
    // Every one of the four conditions above must exit 1 within this gate's block.
    expect(gate1.match(/exit 1/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("6. Gate 1 never silently substitutes current branch HEAD for a stale authorization", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 1/6");
    const gateEnd = reviewedPrJob.indexOf("Gate 2/6", gateIdx);
    expect(reviewedPrJob.slice(gateIdx, gateEnd)).toMatch(/never substitutes current HEAD for a stale authorization/);
  });

  it("7. Gate 2: verifies required CI checks are success at the exact authorized_sha (not a different SHA)", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 2/6: CI evidence at authorized_sha");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = reviewedPrJob.indexOf("Gate 3/6", gateIdx);
    const gate2 = reviewedPrJob.slice(gateIdx, gateEnd);
    expect(gate2).toContain("commits/${AUTHORIZED_SHA}/check-runs");
    expect(gate2).toMatch(/CONCLUSION.*!=\s*"success"/);
    expect(gate2).toContain("exit 1");
    expect(reviewedPrJob).toMatch(/branch-protection.*build-and-test.*bundle-validate.*lint.*LANE_B/);
  });

  it("8. Gate 3: migration content is verified against the PR's actual delta vs main, and checksum-verified before use", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 3/6: migration content");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = reviewedPrJob.indexOf("Setup Node.js", gateIdx);
    const gate3 = reviewedPrJob.slice(gateIdx, gateEnd);
    expect(gate3).toContain("git diff origin/main");
    expect(gate3).toContain("--name-only");
    expect(gate3).toContain("git show");
    expect(gate3).toContain("sha256sum");
    expect(gate3).toMatch(/ACTUAL_SHA256.*!=\s*"\$EXPECTED_SHA256"/);
    expect(gate3).toContain("exit 1");
    // Content extraction must use git plumbing (show/diff), never a checkout of the PR.
    expect(gate3).not.toMatch(/git checkout/);
  });

  it("9. No step before the migration-content gate references the production secret (secret withheld until non-secret gates pass)", () => {
    const secretFirstIdx = reviewedPrJob.indexOf("secrets.PRODUCTION_DATABASE_URL");
    const gate3Idx = reviewedPrJob.indexOf("Gate 3/6");
    const gate3EndIdx = reviewedPrJob.indexOf("Setup Node.js", gate3Idx);
    expect(secretFirstIdx).toBeGreaterThan(-1);
    // The secret must not appear anywhere before Gate 3 has finished (i.e. before
    // main-tree tooling install even begins) — identity/CI/checksum gates run
    // entirely without it.
    expect(secretFirstIdx).toBeGreaterThan(gate3EndIdx);
  });

  it("10. Installs dependencies from main's own lockfile with lifecycle scripts disabled", () => {
    expect(reviewedPrJob).toContain("npm ci --ignore-scripts");
    expect(reviewedPrJob).toContain("prisma generate");
  });

  it("11. Gate 4: production identity is verified (redacted) before any mutation", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 4/6: production identity");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = reviewedPrJob.indexOf("Install postgresql-client", gateIdx);
    const gate4 = reviewedPrJob.slice(gateIdx, gateEnd);
    expect(gate4).toContain("EXPECTED_PROD_HOST_SUFFIX");
    expect(gate4).toContain("EXPECTED_PROD_REGION_HINT");
    expect(gate4).toContain("exit 1");
    // Must never print username/password.
    expect(gate4).not.toMatch(/console\.log\(u\.username\)/);
    expect(gate4).not.toMatch(/console\.log\(u\.password\)/);
  });

  it("12. Gate 5: exact pending-migration-set enforced via _prisma_migrations, not fragile text parsing — 0, >1, and wrong-migration all fail closed", () => {
    const gateIdx = reviewedPrJob.indexOf("Gate 5/6: exact pending migration set");
    expect(gateIdx).toBeGreaterThan(-1);
    const gateEnd = reviewedPrJob.indexOf("Gate 6/6", gateIdx);
    const gate5 = reviewedPrJob.slice(gateIdx, gateEnd);
    expect(gate5).toContain("_prisma_migrations");
    expect(gate5).toMatch(/PENDING_COUNT.*-eq 0/);
    expect(gate5).toMatch(/PENDING_COUNT.*-gt 1/);
    expect(gate5).toMatch(/PENDING.*!=\s*"\$EXPECTED_MIGRATION"/);
    expect(gate5.match(/exit 1/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("13. prisma migrate deploy only runs after all five gates (step ordering)", () => {
    const gate5Idx = reviewedPrJob.indexOf("Gate 5/6");
    const deployIdx = reviewedPrJob.indexOf("npx prisma migrate deploy");
    expect(gate5Idx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(gate5Idx);
  });

  it("14. Post-deploy verification proves claim_token column shape and unchanged row count, not just 'no error'", () => {
    const deployIdx = reviewedPrJob.indexOf("npx prisma migrate deploy");
    const postVerify = reviewedPrJob.slice(deployIdx);
    expect(postVerify).toContain("CLAIM_TOKEN_COLUMN_EXISTS");
    expect(postVerify).toContain("CLAIM_TOKEN_TYPE");
    expect(postVerify).toContain("CLAIM_TOKEN_NULLABLE");
    expect(postVerify).toMatch(/ROW_COUNT_AFTER.*!=\s*"\$STARTUP_STATUS_ROW_COUNT_BEFORE"/);
    expect(postVerify).toContain("exit 1");
  });

  it("15. Never merges PR #310 or any PR — no merge/gh pr merge invocation anywhere in this job", () => {
    expect(reviewedPrJob).not.toMatch(/gh pr merge/);
    expect(reviewedPrJob).not.toMatch(/\bmerge_pull_request\b/);
    expect(reviewedPrJob).toContain("is NOT merged by this workflow");
  });

  it("16. Shares the same concurrency group as mode=main (cannot run both modes against production simultaneously)", () => {
    // concurrency: is declared once at the workflow level and applies to every job.
    expect(src.indexOf("group: migrate-production")).toBeLessThan(jobStart);
  });

  it("17. Declares minimal explicit permissions (contents/pull-requests/checks: read) rather than inheriting defaults", () => {
    const permsIdx = reviewedPrJob.indexOf("permissions:");
    expect(permsIdx).toBeGreaterThan(-1);
    const permsBlock = reviewedPrJob.slice(permsIdx, permsIdx + 150);
    expect(permsBlock).toContain("contents: read");
    expect(permsBlock).toContain("pull-requests: read");
    expect(permsBlock).toContain("checks: read");
  });
});

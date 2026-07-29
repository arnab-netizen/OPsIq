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

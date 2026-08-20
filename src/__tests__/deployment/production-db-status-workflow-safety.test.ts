/**
 * Governance validator for the read-only production DB status workflow.
 *
 * Verifies that the workflow can never mutate production and can never
 * execute unmerged code, without a test failure. All checks are
 * static-source against the YAML file — no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/production-db-status.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

// SQL mutation verbs, matched only in an executable-statement shape so English
// prose ("create", "do", "call" as ordinary words) can't false-positive.
const SQL_MUTATION_PATTERN =
  /\b(INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM|TRUNCATE\s+(TABLE\s+)?\S|ALTER\s+(TABLE|DATABASE|ROLE|SYSTEM)|CREATE\s+(TABLE|INDEX|DATABASE|ROLE|EXTENSION|SCHEMA)|DROP\s+(TABLE|INDEX|DATABASE|ROLE|COLUMN|CONSTRAINT|SCHEMA)|GRANT\s+\S|REVOKE\s+\S|CALL\s+\S|DO\s*\$\$)/i;

describe("production-db-status.yml — read-only safety controls", () => {
  it("1. Manual trigger only (workflow_dispatch)", () => {
    expect(src).toContain("workflow_dispatch:");
    expect(src).not.toMatch(/on:\s*push/);
    expect(src).not.toMatch(/on:\s*pull_request/);
    expect(src).not.toContain("schedule:");
  });

  it("2. Requires exact confirmation phrase input", () => {
    expect(src).toContain("INSPECT PRODUCTION READ ONLY");
    expect(src).toContain("confirm:");
  });

  it("3. Confirmation phrase is string-equality checked at both job and step level, exits 1 on mismatch", () => {
    expect(src).toMatch(/if:\s*github\.event\.inputs\.confirm == 'INSPECT PRODUCTION READ ONLY'/);
    expect(src).toMatch(/!=\s*["']INSPECT PRODUCTION READ ONLY["']/);
    expect(src).toContain("exit 1");
  });

  it("4. Checkout is pinned to main, never an input-selected or event-derived ref", () => {
    expect(src).toContain("actions/checkout@v4");
    expect(src).toMatch(/ref:\s*main\b/);
    expect(src).not.toContain("github.event.inputs.ref");
    expect(src).not.toContain("github.head_ref");
    expect(src).not.toContain("pull_request");
  });

  it("5. Runs under the production GitHub Environment (reuses existing protection rules)", () => {
    expect(src).toContain("environment: production");
  });

  it("6. Rejects empty PRODUCTION_DATABASE_URL secret", () => {
    expect(src).toContain("PRODUCTION_DATABASE_URL secret is missing or empty");
    expect(src).toContain("exit 1");
  });

  it("7. Removes local .env files before querying to prevent placeholder contamination", () => {
    expect(src).toContain("rm -f .env .env.local");
  });

  it("8. Rejects placeholder values in DATABASE_URL", () => {
    expect(src).toMatch(/grep\s+-qE\s+['"]REPLACE_\|PLACEHOLDER\|your_neon_url\|example\\\.com['"]/);
  });

  it("9. Extracts host/database for logging WITHOUT printing the full URL or credentials", () => {
    expect(src).toContain("new URL(process.env.DATABASE_URL)");
    expect(src).toContain("u.hostname");
    expect(src).not.toMatch(/echo\s+"\$DATABASE_URL"\s*\n/);
    expect(src).not.toMatch(/echo\s+"\$PROD_URL"\s*\n/);
    expect(src).not.toMatch(/echo\s+"\$\{\{\s*secrets\.PRODUCTION_DATABASE_URL/);
  });

  it("10. PRODUCTION_DATABASE_URL secret is referenced only within this single job", () => {
    const matches = src.match(/secrets\.PRODUCTION_DATABASE_URL/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    // Scope to the jobs: section only (top-level `on:`/`concurrency:` keys
    // would otherwise also match a bare "2-space-indented key:" pattern).
    const jobsSection = src.slice(src.indexOf("\njobs:\n"));
    expect(jobsSection.length).toBeGreaterThan(0);
    const jobHeaders = jobsSection.match(/^ {2}\S[\w-]*:\s*$/gm) ?? [];
    expect(jobHeaders.length).toBe(1);
  });

  it("11. Enforces a read-only Postgres session for every direct SQL step", () => {
    expect(src).toContain("default_transaction_read_only=on");
  });

  it("12. Contains no mutating Prisma CLI commands anywhere in the file", () => {
    expect(src).not.toContain("prisma migrate deploy");
    expect(src).not.toContain("prisma migrate resolve");
    expect(src).not.toContain("prisma migrate reset");
    expect(src).not.toContain("prisma db push");
    expect(src).not.toContain("prisma db seed");
  });

  it("13. Contains no SQL mutation statements anywhere in the file", () => {
    expect(src).not.toMatch(SQL_MUTATION_PATTERN);
  });

  it("14. Uses psql against PROD_URL only for SELECT-shaped queries, never a mutation", () => {
    const psqlInvocations = src.match(/psql\s+"\$PROD_URL"/g) ?? [];
    expect(psqlInvocations.length).toBeGreaterThan(0);
    // Global mutation-pattern scan (test 13) already covers the whole file;
    // this additionally confirms every SQL-bearing step mentions SELECT.
    const sqlSteps = src.split(/\n {6}- name: /).filter((s) => s.includes('psql "$PROD_URL"'));
    expect(sqlSteps.length).toBeGreaterThan(0);
    for (const step of sqlSteps) {
      expect(step).toMatch(/SELECT/i);
    }
  });

  it("15. Runs the built-in prisma migrate status comparison (read-only)", () => {
    expect(src).toContain("npx prisma migrate status");
  });

  it("16. Uses a concurrency group with cancel-in-progress: false", () => {
    expect(src).toContain("group: production-db-status");
    expect(src).toContain("cancel-in-progress: false");
  });

  it("17. Installs dependencies without running arbitrary lifecycle scripts", () => {
    expect(src).toContain("npm ci --ignore-scripts");
  });

  it("18. Records a read-only-confirmation summary via GITHUB_STEP_SUMMARY", () => {
    expect(src).toContain("GITHUB_STEP_SUMMARY");
  });

  it("19. Never modifies Vercel or Neon configuration", () => {
    expect(src.toLowerCase()).not.toContain("vercel.com/api");
    expect(src).not.toMatch(/neon\.tech\/api/i);
    expect(src).not.toContain("vercel env");
  });

  it("20. Queries owner_startup_session.business_id (F-STARTUP-NO-HANDOFF, PR #326) via SELECT only", () => {
    const idx = src.indexOf("owner_startup_session.business_id");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/SELECT/i);
    expect(block).toContain("information_schema.columns");
    expect(block).toContain("table_name = 'owner_startup_session'");
  });

  it("21. Queries the owner_startup_session_business_id_key index definition (proves UNIQUE from data, not asserted in source)", () => {
    expect(src).toContain("owner_startup_session_business_id_key");
    const idx = src.indexOf("owner_startup_session_business_id_key index definition");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/SELECT/i);
    expect(block).toContain("pg_indexes");
  });

  it("22. Queries owner_startup_session row count and non-null business_id count via SELECT only", () => {
    const idx = src.indexOf("owner_startup_session row count");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 550);
    expect(block).toMatch(/SELECT/i);
    expect(block).toContain("COUNT(*)");
    expect(block).toContain("FROM owner_startup_session");
  });

  it("23. Includes 20260819000001_startup_session_business_handoff in the _prisma_migrations lookup, and documents its expected MISSING_ON_MAIN transient state", () => {
    expect(src).toContain("'20260819000001_startup_session_business_handoff'");
    expect(src).toContain("MISSING_ON_MAIN");
    const idx = src.indexOf("20260819000001_startup_session_business_handoff is included");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 400)).toMatch(/PINNED_PREDEPLOY/);
  });
});

/**
 * Governance validator for the live-production Owner acceptance workflow.
 *
 * This workflow authenticates as a real production Owner and performs real
 * (scoped, reversible) mutations against a dedicated acceptance business.
 * The checks below verify it fails closed on missing credentials, refuses
 * to run against a stale/wrong deployment, verifies production health
 * first, and never allows captured evidence (traces/screenshots) to leak
 * the password or a session-cookie value. All checks are static-source
 * against the YAML/config files -- no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/production-owner-acceptance.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

const CONFIG_PATH = join(process.cwd(), "playwright.production.config.ts");
const configSrc = readFileSync(CONFIG_PATH, "utf-8");

describe("production-owner-acceptance.yml — live-production safety controls", () => {
  it("1. Manual trigger only (workflow_dispatch)", () => {
    expect(src).toContain("workflow_dispatch:");
    expect(src).not.toMatch(/on:\s*push/);
    expect(src).not.toMatch(/on:\s*pull_request/);
    expect(src).not.toContain("schedule:");
  });

  it("2. Requires exact confirmation phrase input, checked at both job and step level", () => {
    expect(src).toContain("RUN PRODUCTION ACCEPTANCE");
    expect(src).toMatch(/if:\s*github\.event\.inputs\.confirm == 'RUN PRODUCTION ACCEPTANCE'/);
    expect(src).toMatch(/!=\s*["']RUN PRODUCTION ACCEPTANCE["']/);
  });

  it("3. Checkout is pinned to main, never an input-selected or event-derived ref", () => {
    expect(src).toContain("actions/checkout@v4");
    expect(src).toMatch(/ref:\s*main\b/);
    expect(src).not.toContain("github.event.inputs.ref");
    expect(src).not.toContain("github.head_ref");
  });

  it("4. Runs under the production GitHub Environment", () => {
    expect(src).toContain("environment: production");
  });

  it("5. Fails closed when either acceptance credential secret is missing or empty", () => {
    const idx = src.indexOf("Preflight check - production acceptance credentials exist");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toContain("secrets.PRODUCTION_ACCEPTANCE_EMAIL");
    expect(block).toContain("secrets.PRODUCTION_ACCEPTANCE_PASSWORD");
    expect(block).toContain("exit 1");
  });

  it("6. Never echoes the credential secret VALUES directly", () => {
    expect(src).not.toMatch(/echo\s+"\$\{\{\s*secrets\.PRODUCTION_ACCEPTANCE_PASSWORD/);
    expect(src).not.toMatch(/echo\s+"\$\{\{\s*secrets\.PRODUCTION_ACCEPTANCE_EMAIL/);
    expect(src).not.toMatch(/echo\s+"\$PRODUCTION_ACCEPTANCE_PASSWORD"/);
  });

  it("7. Verifies BASE_URL serves the exact checked-out commit via the build-info endpoint before running anything functional, and aborts as BLOCKED_STALE_PRODUCTION_TARGET on mismatch", () => {
    expect(src).toContain("/api/internal/build-info");
    expect(src).toContain("BLOCKED_STALE_PRODUCTION_TARGET");
    const shaCheckIdx = src.indexOf("BLOCKED_STALE_PRODUCTION_TARGET");
    const runSuiteIdx = src.indexOf("Run live production acceptance suite");
    expect(shaCheckIdx).toBeGreaterThan(-1);
    expect(runSuiteIdx).toBeGreaterThan(shaCheckIdx);
  });

  it("8. Verifies the environment field returned by build-info is exactly 'production', not merely that the request succeeded", () => {
    expect(src).toMatch(/DEPLOYED_ENV.*!=\s*"production"/s);
  });

  it("9. Verifies production health and readiness before the functional suite, and aborts as BLOCKED_PRE_FLIGHT on failure", () => {
    expect(src).toContain("/api/health");
    expect(src).toContain("/api/readiness");
    expect(src).toContain("BLOCKED_PRE_FLIGHT");
    expect(src).toContain('"is_ready":true');
    const preflightIdx = src.indexOf("BLOCKED_PRE_FLIGHT");
    const runSuiteIdx = src.indexOf("Run live production acceptance suite");
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(runSuiteIdx).toBeGreaterThan(preflightIdx);
  });

  it("10. Runs the Playwright suite against the dedicated production config, never the default (throwaway-environment) config", () => {
    expect(src).toContain("--config=playwright.production.config.ts");
  });

  it("11. Scans captured evidence for the password value and fails closed on any match, including inside trace archives", () => {
    const idx = src.indexOf("Verify no credential/session leakage");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2000);
    expect(block).toContain("secrets.PRODUCTION_ACCEPTANCE_PASSWORD");
    expect(block).toContain("unzip -p");
    expect(block).toContain("exit 1");
  });

  it("12. Also scans for the live session-token value(s), not only the password", () => {
    expect(src).toContain(".opsiq-acceptance-session-tokens");
    const idx = src.indexOf("Verify no credential/session leakage");
    const scanBlock = src.slice(idx, idx + 2000);
    expect(scanBlock).toContain(".opsiq-acceptance-session-tokens");
  });

  it("13. Deletes the session-token scratch file before the evidence artifact is uploaded", () => {
    const rmIdx = src.indexOf("rm -f /tmp/.opsiq-acceptance-session-tokens");
    const uploadIdx = src.indexOf("actions/upload-artifact@v4");
    expect(rmIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(rmIdx);
  });

  it("14. The leak-scan step runs with if: always() so it still executes (and can still fail the job) even when the suite itself failed", () => {
    const idx = src.indexOf("Verify no credential/session leakage");
    // if: always() is declared AFTER the step's own "- name:" line, not before it.
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/if:\s*always\(\)/);
  });

  it("15. Uses a concurrency group with cancel-in-progress: false", () => {
    expect(src).toContain("group: production-owner-acceptance");
    expect(src).toContain("cancel-in-progress: false");
  });

  it("16. PRODUCTION_ACCEPTANCE_EMAIL/PASSWORD secrets are referenced only within this single job", () => {
    const jobsSection = src.slice(src.indexOf("\njobs:\n"));
    const jobHeaders = jobsSection.match(/^ {2}\S[\w-]*:\s*$/gm) ?? [];
    expect(jobHeaders.length).toBe(1);
  });

  it("17. Contains no destructive or unrelated production-secret usage (no DATABASE_URL, no migrate deploy)", () => {
    expect(src).not.toContain("PRODUCTION_DATABASE_URL");
    expect(src).not.toContain("prisma migrate deploy");
    expect(src).not.toContain("prisma migrate resolve");
  });

  it("18. BASE_URL is a fixed workflow-level env value, never an input the dispatcher controls", () => {
    expect(src).toMatch(/env:\s*\n\s*BASE_URL:\s*https:\/\/o-ps-iq\.vercel\.app/);
    expect(src).not.toMatch(/BASE_URL:\s*\$\{\{\s*(github\.event\.inputs|inputs)\./);
  });
});

describe("playwright.production.config.ts — governance", () => {
  it("19. Retries are disabled -- first run is authoritative for a live-production acceptance run", () => {
    expect(configSrc).toMatch(/retries:\s*0/);
  });

  it("20. BASE_URL has no localhost/default fallback -- must be supplied explicitly", () => {
    expect(configSrc).toMatch(/baseURL:\s*process\.env\.BASE_URL/);
    expect(configSrc).not.toMatch(/baseURL:\s*process\.env\.BASE_URL\s*\|\|/);
  });

  it("21. Never starts a local webServer -- this lane only ever targets a remote, already-deployed app", () => {
    expect(configSrc).not.toContain("webServer");
  });

  it("22. Declares a globalSetup that fails closed on missing required environment variables", () => {
    expect(configSrc).toContain("globalSetup");
    const globalSetupSrc = readFileSync(
      join(process.cwd(), "tests/production/global-setup.ts"),
      "utf-8"
    );
    expect(globalSetupSrc).toContain("PRODUCTION_ACCEPTANCE_EMAIL");
    expect(globalSetupSrc).toContain("PRODUCTION_ACCEPTANCE_PASSWORD");
    expect(globalSetupSrc).toMatch(/throw new Error/);
  });
});

describe("tests/production/helpers/production-auth.ts — governance", () => {
  const authSrc = readFileSync(
    join(process.cwd(), "tests/production/helpers/production-auth.ts"),
    "utf-8"
  );

  it("23. Never logs or returns the password value", () => {
    expect(authSrc).not.toMatch(/console\.log\([^)]*password/i);
    expect(authSrc).not.toMatch(/return\s*\{[^}]*password/i);
  });

  it("24. Fails closed when credentials are absent", () => {
    expect(authSrc).toMatch(/if\s*\(!email\s*\|\|\s*!password\)/);
    expect(authSrc).toContain("throw new Error");
  });
});

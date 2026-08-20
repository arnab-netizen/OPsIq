/**
 * Governance validator for migrate-production.yml's PINNED_PREDEPLOY
 * exact-host gate.
 *
 * A syntactically valid direct (non-pooler) Neon URL belonging to the
 * wrong project/branch passes the pre-existing placeholder/pooler checks
 * undetected -- those checks only validate SHAPE, not IDENTITY. This gate
 * requires the owner to pin the exact expected production DB hostname as a
 * workflow_dispatch input and compares it against the runtime secret's
 * actual hostname before any migration is allowed to run. All checks here
 * are static-source against the YAML file -- no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

describe("migrate-production.yml — PINNED_PREDEPLOY exact-host gate", () => {
  it("1. Declares expected_database_host as a workflow_dispatch input", () => {
    expect(src).toMatch(/expected_database_host:\s*\n\s*description:/);
  });

  it("2. Input description documents a bare hostname, never a full URL", () => {
    const idx = src.indexOf("expected_database_host:");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/bare hostname/i);
    expect(block).toMatch(/never a full URL/i);
  });

  it("3. A dedicated step verifies the exact host match, gated to PINNED_PREDEPLOY", () => {
    const stepIdx = src.indexOf("Verify exact production database host matches owner-pinned expectation");
    expect(stepIdx).toBeGreaterThan(-1);
    const stepBlock = src.slice(stepIdx, stepIdx + 300);
    expect(stepBlock).toMatch(/if:\s*inputs\.mode == 'PINNED_PREDEPLOY'/);
  });

  it("4. The exact-host step runs the version-controlled validation script (no arbitrary SQL, no inline arbitrary logic)", () => {
    expect(src).toContain("node scripts/validate-expected-db-host.mjs");
  });

  it("5. The exact-host step passes both PRODUCTION_DATABASE_URL and expected_database_host to the script", () => {
    const stepIdx = src.indexOf("Verify exact production database host matches owner-pinned expectation");
    const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
    const stepBlock = src.slice(stepIdx, nextStepIdx);
    expect(stepBlock).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(stepBlock).toContain("inputs.expected_database_host");
  });

  it("6. The exact-host step runs strictly before Deploy migrations (and before pre-deploy status check)", () => {
    const gateIdx = src.indexOf("Verify exact production database host matches owner-pinned expectation");
    const pendingIdx = src.indexOf("Check pending migrations (pre-deploy)");
    const deployIdx = src.indexOf("name: Deploy migrations");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(pendingIdx);
    expect(pendingIdx).toBeLessThan(deployIdx);
  });

  it("7. The exact-host step runs after DATABASE_URL placeholder/pooler safety checks (reuses the same secret, doesn't precede its own safety net)", () => {
    const safetyIdx = src.indexOf("Validate DATABASE_URL safety");
    const gateIdx = src.indexOf("Verify exact production database host matches owner-pinned expectation");
    expect(safetyIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(safetyIdx);
  });

  it("8. Existing placeholder rejection, direct-endpoint requirement, and -pooler. rejection are untouched, not replaced", () => {
    expect(src).toContain("REPLACE_|PLACEHOLDER|your_neon_url|example\\.com");
    expect(src).toContain("-pooler.");
  });

  it("9. MAIN mode is not forced to supply expected_database_host (input remains optional at the schema level)", () => {
    const idx = src.indexOf("expected_database_host:");
    const block = src.slice(idx, idx + 320);
    expect(block).toMatch(/required:\s*false/);
  });

  it("10. Migration summary records the pinned expected host only under PINNED_PREDEPLOY, never unconditionally", () => {
    const summaryIdx = src.indexOf("Migration summary");
    const rowIdx = src.indexOf("Expected DB host", summaryIdx);
    expect(rowIdx).toBeGreaterThan(summaryIdx);
    const precedingIf = src.lastIndexOf('inputs.mode }}" == "PINNED_PREDEPLOY"', rowIdx);
    expect(precedingIf).toBeGreaterThan(summaryIdx);
    expect(precedingIf).toBeLessThan(rowIdx);
  });
});

describe("scripts/validate-expected-db-host.mjs — governance", () => {
  const SCRIPT_PATH = join(process.cwd(), "scripts/validate-expected-db-host.mjs");
  const scriptSrc = readFileSync(SCRIPT_PATH, "utf-8");

  it("11. Rejects the 5 named-forbidden substrings: ://, @, /, ?, #", () => {
    expect(scriptSrc).toContain("FORBIDDEN_SUBSTRINGS");
    for (const marker of ['"://"', '"@"', '"/"', '"?"', '"#"']) {
      expect(scriptSrc).toContain(marker);
    }
  });

  it("12. Rejects whitespace and control characters explicitly", () => {
    expect(scriptSrc).toMatch(/\\s.*\\x00-\\x1f.*\\x7f/);
  });

  it("13. Uses an allow-list hostname regex (not a denylist) as the final enforcement", () => {
    expect(scriptSrc).toContain("HOSTNAME_PATTERN");
  });

  it("14. Comparison is exact string equality, not substring/prefix/suffix matching", () => {
    expect(scriptSrc).toMatch(/actualHost === expectedHost/);
  });

  it("15. Logs exactly the 3 required lines, and never logs the full DATABASE_URL or credentials", () => {
    expect(scriptSrc).toContain("Expected database host: ${expected}");
    expect(scriptSrc).toContain("Actual database host: ${actual}");
    expect(scriptSrc).toMatch(/MATCH=\$\{match \? "YES" : "NO"\}/);
    expect(scriptSrc).not.toMatch(/console\.log\([^)]*databaseUrl[^)]*\)/);
  });

  it("16. Aborts (non-zero exit) before returning on any mismatch or invalid input", () => {
    expect(scriptSrc).toContain("process.exit(1)");
  });
});

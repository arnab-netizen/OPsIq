/**
 * Governance validator for .github/workflows/provision-administration-operator.yml.
 *
 * Modeled on src/__tests__/deployment/migrate-workflow-safety.test.ts and
 * migrate-workflow-expected-host-safety.test.ts's own pattern: all checks
 * here are static-source against the YAML file (and the shared host-gate
 * script it invokes) — no workflow execution.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, vi } from "vitest";
import { verifyExpectedDatabaseHost } from "../../../scripts/provision-administration-operator";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/provision-administration-operator.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");
// Functional YAML only (on: through the end) -- excludes the leading doc
// comment block, which legitimately documents in prose what this workflow
// does NOT do (e.g. "NEVER touches BETA_REQUEST_OPERATOR"). Checks for the
// absence of a forbidden construct must inspect only the parts of the file
// that could actually DO something, not prose that mentions a term in order
// to disclaim it.
const functionalSrc = src.slice(src.indexOf("on:\n"));

describe("provision-administration-operator.yml — safety controls", () => {
  it("1. Manual trigger only (workflow_dispatch)", () => {
    expect(src).toContain("workflow_dispatch:");
    expect(src).not.toMatch(/on:\s*push/);
    expect(src).not.toMatch(/on:\s*pull_request/);
    expect(src).not.toContain("schedule:");
  });

  it("2. Runs under the production GitHub Environment", () => {
    expect(src).toMatch(/environment:\s*production/);
  });

  it("3. Has exactly two modes: DRY_RUN and APPLY", () => {
    const modeIdx = src.indexOf("mode:");
    const block = src.slice(modeIdx, modeIdx + 300);
    expect(block).toContain("DRY_RUN");
    expect(block).toContain("APPLY");
    expect(block).not.toMatch(/PINNED_PREDEPLOY|MAIN\b/);
  });

  it("4. Mode is validated against an explicit allow-list before anything else runs", () => {
    const idx = src.indexOf("Validate mode input");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/DRY_RUN\|APPLY\)/);
    expect(block).toContain("exit 1");
  });

  it("5. Requires exact expected_main_sha and rejects non-40-char SHA input", () => {
    expect(src).toMatch(/expected_main_sha:\s*\n\s*description:/);
    const idx = src.indexOf("Validate expected_main_sha format");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(block).toContain("exit 1");
  });

  it("6. Checked-out SHA must exactly equal expected_main_sha (not merely be an ancestor)", () => {
    const idx = src.indexOf("Verify checked-out SHA exactly equals expected_main_sha");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toContain("git rev-parse HEAD");
    expect(block).toMatch(/CURRENT_SHA.*!=.*EXPECTED_MAIN_SHA/s);
    expect(block).toContain("inputs.expected_main_sha");
    expect(block).toContain("exit 1");
  });

  it("7. Checks out main only (ref: main)", () => {
    const idx = src.indexOf("actions/checkout@v4");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/ref:\s*main/);
  });

  it("8. Validates target_email is non-empty", () => {
    const idx = src.indexOf("Validate target_email is non-empty");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toContain("exit 1");
  });

  it("9. Validates workspace_id as a well-formed UUID", () => {
    const idx = src.indexOf("Validate workspace_id format");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/i);
    expect(block).toContain("exit 1");
  });

  it("10. Validates expected_database_host as a bare hostname via the shared validator (not a second implementation)", () => {
    const idx = src.indexOf("Validate expected_database_host format");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toContain("scripts/validate-expected-db-host.mjs");
    expect(block).toContain("isValidExpectedHost");
  });

  it("11. APPLY requires the exact confirmation phrase; DRY_RUN does not gate on it", () => {
    const idx = src.indexOf("Confirm explicit intent (APPLY only)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/if:\s*inputs\.mode == 'APPLY'/);
    expect(block).toContain('!= "GRANT ADMINISTRATION OPERATOR"');
    expect(block).toContain("exit 1");
  });

  it("12. Uses the protected production database secret (PRODUCTION_DATABASE_URL), never a hard-coded credential", () => {
    expect(src).toContain("secrets.PRODUCTION_DATABASE_URL");
    // No literal postgres:// connection string anywhere in the file.
    expect(src).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]/);
  });

  it("13. A dedicated step compares the production secret's actual host against expected_database_host, using the shared validation script, strictly before the provisioning script ever runs", () => {
    const gateIdx = src.indexOf("Verify exact production database host matches owner-pinned expectation (workflow-level gate)");
    const dryRunIdx = src.indexOf("Run provisioning script (DRY_RUN");
    const applyIdx = src.indexOf("Run provisioning script (APPLY");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(dryRunIdx);
    expect(gateIdx).toBeLessThan(applyIdx);
    const gateBlock = src.slice(gateIdx, dryRunIdx);
    expect(gateBlock).toContain("node scripts/validate-expected-db-host.mjs");
    expect(gateBlock).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(gateBlock).toContain("inputs.expected_database_host");
  });

  it("14. Never echoes the secret to logs", () => {
    expect(src).not.toMatch(/echo\s+"\$DATABASE_URL"/);
    expect(src).not.toMatch(/echo\s+"\$\{\{\s*secrets\.PRODUCTION_DATABASE_URL\s*\}\}"/);
    expect(src).not.toMatch(/console\.log\([^)]*DATABASE_URL[^)]*\)/);
  });

  it("15. Removes local .env files before touching production (placeholder-contamination guard, same as migrate-production.yml)", () => {
    expect(src).toContain("rm -f .env .env.local");
  });

  it("16. DRY_RUN invokes the script WITHOUT --apply", () => {
    const idx = src.indexOf("Run provisioning script (DRY_RUN");
    expect(idx).toBeGreaterThan(-1);
    const nextStepIdx = src.indexOf("- name:", idx + 10);
    const block = src.slice(idx, nextStepIdx);
    expect(block).not.toContain("--apply");
    expect(block).not.toContain("--confirm");
  });

  it("17. APPLY invokes the script with --apply and the exact confirm phrase", () => {
    const idx = src.indexOf("Run provisioning script (APPLY");
    expect(idx).toBeGreaterThan(-1);
    const nextStepIdx = src.indexOf("- name:", idx + 10);
    const block = src.slice(idx, nextStepIdx);
    expect(block).toContain("--apply");
    expect(block).toContain('--confirm "GRANT ADMINISTRATION OPERATOR"');
  });

  it("18. DRY_RUN and APPLY steps are mutually exclusive via `if:` on inputs.mode", () => {
    const dryIdx = src.indexOf("Run provisioning script (DRY_RUN");
    const applyIdx = src.indexOf("Run provisioning script (APPLY");
    const dryBlock = src.slice(dryIdx, applyIdx);
    const applyEndIdx = src.indexOf("- name:", applyIdx + 10);
    const applyBlock = src.slice(applyIdx, applyEndIdx);
    expect(dryBlock).toMatch(/if:\s*inputs\.mode == 'DRY_RUN'/);
    expect(applyBlock).toMatch(/if:\s*inputs\.mode == 'APPLY'/);
  });

  it("19. Invokes only scripts/provision-administration-operator.ts — no other script, no raw SQL, no generic role/CLI tool", () => {
    const scriptInvocations = src.match(/npx tsx scripts\/[a-zA-Z0-9-]+\.ts/g) ?? [];
    for (const invocation of scriptInvocations) {
      expect(invocation).toBe("npx tsx scripts/provision-administration-operator.ts");
    }
    expect(scriptInvocations.length).toBeGreaterThan(0);
    expect(src).not.toContain("provision-beta-request-operator.ts");
    expect(src).not.toMatch(/prisma\s+(migrate|db)\s/);
    expect(src).not.toContain("$executeRawUnsafe");
    expect(src).not.toContain("psql ");
  });

  it("20. Never accepts a role input, never mentions SYSTEM_ADMIN or BETA_REQUEST_OPERATOR as a selectable value (functional YAML, not the doc-comment disclaimer)", () => {
    expect(functionalSrc).not.toMatch(/\brole:\s*\n\s*description:/);
    expect(functionalSrc).not.toContain("--role");
    expect(functionalSrc).not.toMatch(/\bsystem_admin\b/);
    expect(functionalSrc).not.toContain("BETA_REQUEST_OPERATOR");
  });

  it("21. Never bootstraps PlatformSetting or touches admission mode/capacity (functional YAML, not the doc-comment disclaimer)", () => {
    expect(functionalSrc).not.toMatch(/platform[_-]?setting/i);
    expect(functionalSrc).not.toMatch(/admission[_-]?mode/i);
    expect(functionalSrc).not.toMatch(/capacity[_-]?limit/i);
  });

  it("22. Uses a concurrency group with cancel-in-progress: false", () => {
    expect(src).toContain("group: provision-administration-operator");
    expect(src).toContain("cancel-in-progress: false");
  });

  it("23. Job permissions are read-only at the top level (contents: read, no elevated scopes)", () => {
    const idx = src.indexOf("permissions:");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 60);
    expect(block).toContain("contents: read");
  });

  it("24. Records the run outcome in the job summary without ever printing the secret", () => {
    expect(src).toContain("GITHUB_STEP_SUMMARY");
    const summaryIdx = src.indexOf("Run summary");
    expect(summaryIdx).toBeGreaterThan(-1);
    const summaryBlock = src.slice(summaryIdx);
    expect(summaryBlock).not.toContain("PRODUCTION_DATABASE_URL");
  });
});

describe("scripts/provision-administration-operator.ts — expected-database-host gate governance", () => {
  const SCRIPT_PATH = join(process.cwd(), "scripts/provision-administration-operator.ts");
  const scriptSrc = readFileSync(SCRIPT_PATH, "utf-8");

  it("25. Imports the shared host-validation primitive rather than reimplementing it", () => {
    expect(scriptSrc).toContain('from "./validate-expected-db-host.mjs"');
    expect(scriptSrc).toContain("isValidExpectedHost");
    expect(scriptSrc).toContain("extractHostname");
    expect(scriptSrc).toContain("hostsMatch");
  });

  it("26. The host gate runs as literally the first statement in main(), before the email/workspace usage check and before getDbInstance()", () => {
    const mainIdx = scriptSrc.indexOf("async function main()");
    const gateCallIdx = scriptSrc.indexOf("verifyExpectedDatabaseHost(args.expectedDatabaseHost)");
    const usageCheckIdx = scriptSrc.indexOf("args.email || !args.workspaceId");
    const getDbIdx = scriptSrc.indexOf("await getDbInstance()");
    expect(mainIdx).toBeGreaterThan(-1);
    expect(gateCallIdx).toBeGreaterThan(mainIdx);
    expect(gateCallIdx).toBeLessThan(usageCheckIdx);
    expect(gateCallIdx).toBeLessThan(getDbIdx);
  });

  it("27. verifyExpectedDatabaseHost never logs the raw DATABASE_URL, only the two compared hostnames", () => {
    const fnIdx = scriptSrc.indexOf("export function verifyExpectedDatabaseHost");
    const fnEndIdx = scriptSrc.indexOf("\n}", fnIdx);
    const fnBody = scriptSrc.slice(fnIdx, fnEndIdx);
    expect(fnBody).toContain("Expected database host:");
    expect(fnBody).toContain("Actual database host:");
    expect(fnBody).not.toMatch(/console\.(log|error)\([^)]*rawUrl[^)]*\)/);
  });

  it("28. Resolves the runtime database URL the same way src/lib/db.ts does (DATABASE_URL, falling back to TEST_DATABASE_URL)", () => {
    expect(scriptSrc).toContain('process.env.DATABASE_URL || process.env.TEST_DATABASE_URL');
  });

  it("29. Exits non-zero (fail closed) on missing, malformed, or mismatched expected host", () => {
    const fnIdx = scriptSrc.indexOf("export function verifyExpectedDatabaseHost");
    const fnEndIdx = scriptSrc.indexOf("\n}", scriptSrc.indexOf("if (!match)", fnIdx));
    const fnBody = scriptSrc.slice(fnIdx, fnEndIdx);
    const exitCount = (fnBody.match(/process\.exit\(1\)/g) ?? []).length;
    expect(exitCount).toBeGreaterThanOrEqual(3); // format-invalid, unparseable actual host, mismatch
  });

  it("30. ROLE and SCOPE remain hard-coded constants — not derived from --expected-database-host or any other new input", () => {
    expect(scriptSrc).toContain("const ROLE = ROLES.ADMINISTRATION_OPERATOR;");
    expect(scriptSrc).toContain('const SCOPE = "workspace";');
  });
});

describe("scripts/validate-expected-db-host.mjs — shared validator stays strict for every caller", () => {
  const VALIDATOR_PATH = join(process.cwd(), "scripts/validate-expected-db-host.mjs");
  const validatorSrc = readFileSync(VALIDATOR_PATH, "utf-8");

  it("32. HOSTNAME_PATTERN requires at least one dot-separated label (no bare single-label host like 'localhost')", () => {
    const idx = validatorSrc.indexOf("const HOSTNAME_PATTERN");
    expect(idx).toBeGreaterThan(-1);
    const block = validatorSrc.slice(idx, validatorSrc.indexOf(";", idx));
    // The dot-group repetition must be `)+` (one or more), never `)*` (zero or more).
    expect(block).toMatch(/\)\+\$\/;?$|\)\+\/$/);
  });

  it("33. The shared validator contains no test-environment / VITEST / NODE_ENV escape hatch — any local-only allowance lives in a caller, never here", () => {
    expect(validatorSrc).not.toMatch(/VITEST/);
    expect(validatorSrc).not.toMatch(/NODE_ENV/);
  });
});

describe("scripts/provision-administration-operator.ts — narrow test-only local-host allowance is confined and production-unreachable", () => {
  const SCRIPT_PATH = join(process.cwd(), "scripts/provision-administration-operator.ts");
  const scriptSrc = readFileSync(SCRIPT_PATH, "utf-8");
  const MIGRATE_WORKFLOW_PATH = join(process.cwd(), ".github/workflows/migrate-production.yml");
  const migrateWorkflowSrc = readFileSync(MIGRATE_WORKFLOW_PATH, "utf-8");

  it("34. The test-only allowance is gated on the same existing repo convention as src/lib/db.ts (process.env.VITEST || process.env.NODE_ENV === \"test\") — not a new convention", () => {
    const idx = scriptSrc.indexOf("function isTestEnvironment()");
    expect(idx).toBeGreaterThan(-1);
    const block = scriptSrc.slice(idx, idx + 150);
    expect(block).toContain('process.env.VITEST');
    expect(block).toContain('process.env.NODE_ENV === "test"');
  });

  it("35. There is no CLI flag that disables, skips, or bypasses host validation (no --skip-host-check / --no-host-check / --unsafe / --force / --allow-local, etc.)", () => {
    const parseArgsIdx = scriptSrc.indexOf("function parseArgs");
    const parseArgsEndIdx = scriptSrc.indexOf("\n}", parseArgsIdx);
    const parseArgsBody = scriptSrc.slice(parseArgsIdx, parseArgsEndIdx);
    expect(parseArgsBody).not.toMatch(/skip|bypass|unsafe|force|allow-local|no-host-check/i);
    // The only host-related flag is --expected-database-host itself.
    const hostFlagMatches = parseArgsBody.match(/--[a-z-]*host[a-z-]*/gi) ?? [];
    expect(hostFlagMatches).toEqual(["--expected-database-host"]);
  });

  it("36. The test-only allowance never touches hostsMatch() — exact-equality comparison against the real resolved DB host is identical in every environment", () => {
    const allowanceIdx = scriptSrc.indexOf("TEST_ONLY_SINGLE_LABEL_HOST_PATTERN.test(expectedDatabaseHost)");
    expect(allowanceIdx).toBeGreaterThan(-1);
    const fnIdx = scriptSrc.indexOf("export function verifyExpectedDatabaseHost");
    const fnEndIdx = scriptSrc.indexOf("\n}", scriptSrc.indexOf("if (!match)", fnIdx));
    const fnBody = scriptSrc.slice(fnIdx, fnEndIdx);
    // hostsMatch is called exactly once, unconditionally, regardless of which
    // format-check branch (strict shared validator vs. test-only fallback) set formatCheck.ok.
    // Match only real call sites (assignment or bare statement), not the word
    // appearing inside a comment.
    const hostsMatchCalls = (fnBody.match(/(?:=|^)\s*hostsMatch\(/gm) ?? []).length;
    expect(hostsMatchCalls).toBe(1);
  });

  it("37. .github/workflows/provision-administration-operator.yml never sets VITEST or NODE_ENV=test anywhere — the test-only allowance is unreachable from DRY_RUN or APPLY", () => {
    expect(src).not.toMatch(/VITEST/);
    expect(src).not.toMatch(/NODE_ENV:\s*['"]?test['"]?/);
    expect(src).not.toMatch(/NODE_ENV=test/);
  });

  it("38. .github/workflows/migrate-production.yml (the pre-existing shared-validator caller) also never sets VITEST or NODE_ENV=test", () => {
    expect(migrateWorkflowSrc).not.toMatch(/VITEST/);
    expect(migrateWorkflowSrc).not.toMatch(/NODE_ENV:\s*['"]?test['"]?/);
    expect(migrateWorkflowSrc).not.toMatch(/NODE_ENV=test/);
  });
});

describe("scripts/provision-administration-operator.ts — verifyExpectedDatabaseHost runtime behavior (no DB required)", () => {
  const ORIGINAL_VITEST = process.env.VITEST;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
  const ORIGINAL_TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_VITEST === undefined) delete process.env.VITEST;
    else process.env.VITEST = ORIGINAL_VITEST;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    if (ORIGINAL_TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = ORIGINAL_TEST_DATABASE_URL;
  });

  it("39. In a simulated production environment (VITEST unset, NODE_ENV != 'test'), a single-label host ('localhost') is still rejected", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    expect(() => verifyExpectedDatabaseHost("localhost")).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("40. In a simulated test environment (NODE_ENV='test'), a single-label host that exactly matches the resolved DB host is accepted", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("unexpected exit");
    }) as never);
    expect(() => verifyExpectedDatabaseHost("localhost")).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("41. In a simulated test environment, a single-label host that does NOT match the resolved DB host is still rejected (format allowance never weakens hostsMatch exact equality)", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    expect(() => verifyExpectedDatabaseHost("postgres")).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("42. In a simulated test environment, credentials embedded in a single-label-looking value are still rejected as malformed", () => {
    process.env.VITEST = "true";
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    expect(() => verifyExpectedDatabaseHost("user:pass@localhost")).toThrow("exit:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("43. A legitimate production FQDN passes with no test-environment gating needed at all", () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@ep-abc-123.us-east-1.aws.neon.tech/db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("unexpected exit");
    }) as never);
    expect(() => verifyExpectedDatabaseHost("ep-abc-123.us-east-1.aws.neon.tech")).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("provision-administration-operator.yml — script-injection hardening", () => {
  it("31. Every ${{ inputs.* }} / ${{ secrets.* }} reference inside jobs: is used only via an env: key assignment or an if: condition — never interpolated directly into a shell command line", () => {
    const jobsIdx = src.indexOf("\njobs:");
    expect(jobsIdx).toBeGreaterThan(-1);
    const jobsSrc = src.slice(jobsIdx);
    const lines = jobsSrc.split("\n");
    const offenders: string[] = [];
    for (const line of lines) {
      if (!/\$\{\{\s*(inputs|secrets)\./.test(line)) continue;
      const trimmed = line.trim();
      const isEnvAssignment = /^[A-Za-z_][A-Za-z0-9_]*:\s*\$\{\{\s*(inputs|secrets)\.[A-Za-z0-9_.]+\s*\}\}$/.test(trimmed);
      const isIfCondition = trimmed.startsWith("if:");
      if (!isEnvAssignment && !isIfCondition) {
        offenders.push(trimmed);
      }
    }
    expect(offenders).toEqual([]);
  });
});

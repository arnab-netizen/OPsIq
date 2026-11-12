/**
 * Prevention control: the DB job must run the real-age restore proof, never skip it.
 *
 * Root cause (F-RESTORE-PROOF-SILENT-SKIP): backup-restore-local-proof.db.test.ts is
 * describe.skipIf(!CAN_RUN) and CAN_RUN needs `age`. The CI DB job never installed `age`, so the
 * restore proof SKIPPED in CI while the job was green. These tests read the real workflow and the
 * real proof file; nothing is mocked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import YAML from "js-yaml";

const root = join(__dirname, "..", "..", "..");
const ci = YAML.load(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as {
  jobs: Record<string, { steps?: Array<{ name?: string; run?: string; env?: Record<string, string>; "continue-on-error"?: boolean }> }>;
};
const steps = ci.jobs["db-verify"].steps ?? [];
const idx = (n: string) => steps.findIndex((s) => s.name?.includes(n));
const installIdx = idx("Install and verify real age");
const dbSuiteIdx = idx("Run DB test suite");
const proof = readFileSync(join(root, "src", "__tests__", "ci-cd", "backup-restore-local-proof.db.test.ts"), "utf8");

describe("DB job runs the real-age restore proof (F-RESTORE-PROOF-SILENT-SKIP)", () => {
  it("installs and verifies real age BEFORE the DB suite", () => {
    expect(installIdx, "age install step missing from db-verify").toBeGreaterThanOrEqual(0);
    expect(dbSuiteIdx).toBeGreaterThan(installIdx);
  });

  it("the install step fails closed: strict shell, version pin, two-recipient round trip with each identity, no masking", () => {
    const step = steps[installIdx];
    const run = step.run ?? "";
    expect(run).toContain("set -euo pipefail");
    expect(run).toContain("apt-get install");
    expect(run).toMatch(/age --version/);
    expect(run).toMatch(/age-keygen --version/);
    expect(run).toMatch(/unexpected age version/);
    expect(run).toMatch(/age -r "\$RA" -r "\$RB"/);
    expect(run).toContain('age -d -i "$T/a.key"');
    expect(run).toContain('age -d -i "$T/b.key"');
    expect(run).toContain("pg_dump --version");
    expect(run).not.toMatch(/\|\|\s*true/);
    expect(run).not.toMatch(/set\s+\+e/);
    expect(step["continue-on-error"] ?? false).toBe(false);
  });

  it("the DB suite step makes the restore proof mandatory and stays blocking", () => {
    const step = steps[dbSuiteIdx];
    expect(step.env?.OPSIQ_REQUIRE_RESTORE_PROOF).toBe("1");
    expect(step["continue-on-error"] ?? false).toBe(false);
    expect(step.run).toContain(".db.test.ts");
  });

  it("the proof file converts a would-be skip into a failure when the proof is required, and still skips locally without it", () => {
    expect(proof).toContain("OPSIQ_REQUIRE_RESTORE_PROOF");
    expect(proof).toMatch(/restore proof would be skipped/);
    expect(proof).toContain("describe.skipIf(!CAN_RUN)"); // local developer runs without age remain possible
    for (const bin of ["age", "age-keygen", "pg_dump", "psql"]) expect(proof).toContain(`"${bin}"`);
  });

  it("the proof still exercises BOTH identities independently (not weakened)", () => {
    expect(proof).toMatch(/identity ALONE/);
    expect(proof).toContain("primary");
    expect(proof).toContain("escrow");
  });
});

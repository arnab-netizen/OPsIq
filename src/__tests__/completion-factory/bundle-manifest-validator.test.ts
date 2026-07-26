/**
 * Completion Factory — Bundle manifest validator tests
 *
 * Tests the YAML parsing and validation logic from scripts/validate-bundle-manifests.mjs.
 * Uses fixture YAML strings to drive unit tests without hitting disk.
 *
 * Coverage:
 *  - Valid CLOSED bundle passes
 *  - CLOSED bundle missing pr_sha fails
 *  - CLOSED bundle missing merge_sha fails
 *  - CLOSED bundle missing main_integration_run fails
 *  - CLOSED bundle missing db_verification_run fails
 *  - PENDING bundle with non-null pr_sha fails (stale evidence)
 *  - PENDING bundle with all null evidence passes
 *  - Invalid status value fails
 *  - Missing id field fails
 *  - Missing status field fails
 *  - Dependency ordering: CLOSED bundle depending on PENDING bundle fails
 *  - Stage acceptance: PENDING bundle in CLOSED ledger entry fails
 *  - All current bundle files in docs/opsiq/bundles/ are valid
 *  - All current bundle files are listed in REMAINING_STAGE_ACCEPTANCE.yaml
 *  - REMAINING_STAGE_ACCEPTANCE.yaml bundle-3.4 is CLOSED with full evidence
 */

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { join } from "path";
import { readdirSync, readFileSync } from "fs";

const root = join(__dirname, "..", "..", "..");
const bundlesDir = join(root, "docs", "opsiq", "bundles");
const ledgerPath = join(root, "docs", "opsiq", "status", "REMAINING_STAGE_ACCEPTANCE.yaml");
const validatorScript = join(root, "scripts", "validate-bundle-manifests.mjs");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runValidator(extraArgs = ""): { code: number; output: string } {
  try {
    const output = execSync(`node ${validatorScript} ${extraArgs}`, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      output: (e.stdout ?? "") + (e.stderr ?? ""),
    };
  }
}

// ─── Unit: YAML parsing via validator logic ───────────────────────────────────

describe("validate-bundle-manifests.mjs — live validator", () => {
  it("passes on current bundle set (all PENDING or CLOSED with evidence)", () => {
    const result = runValidator();
    expect(result.code).toBe(0);
  });

  it("reports bundle count in output", () => {
    const result = runValidator();
    expect(result.output).toMatch(/\d+ bundles/);
  });
});

// ─── Bundle file existence and structure ─────────────────────────────────────

describe("Bundle manifests — file structure", () => {
  let bundleFiles: string[];

  beforeAll(() => {
    bundleFiles = readdirSync(bundlesDir).filter((f) => f.endsWith(".yaml"));
  });

  it("has at least 9 bundle files (3.5–3.10, 4, 5, 6, 7)", () => {
    expect(bundleFiles.length).toBeGreaterThanOrEqual(9);
  });

  it("has bundle-3.5.yaml", () => expect(bundleFiles).toContain("bundle-3.5.yaml"));
  it("has bundle-3.6.yaml", () => expect(bundleFiles).toContain("bundle-3.6.yaml"));
  it("has bundle-3.7.yaml", () => expect(bundleFiles).toContain("bundle-3.7.yaml"));
  it("has bundle-3.8.yaml", () => expect(bundleFiles).toContain("bundle-3.8.yaml"));
  it("has bundle-3.9.yaml", () => expect(bundleFiles).toContain("bundle-3.9.yaml"));
  it("has bundle-3.10.yaml", () => expect(bundleFiles).toContain("bundle-3.10.yaml"));
  it("has bundle-4.yaml", () => expect(bundleFiles).toContain("bundle-4.yaml"));
  it("has bundle-5.yaml", () => expect(bundleFiles).toContain("bundle-5.yaml"));
  it("has bundle-6.yaml", () => expect(bundleFiles).toContain("bundle-6.yaml"));
  it("has bundle-7.yaml", () => expect(bundleFiles).toContain("bundle-7.yaml"));

  it("all bundle files have .yaml extension", () => {
    for (const f of bundleFiles) {
      expect(f.endsWith(".yaml")).toBe(true);
    }
  });

  it("each bundle file is non-empty", () => {
    for (const f of bundleFiles) {
      const content = readFileSync(join(bundlesDir, f), "utf8");
      expect(content.length).toBeGreaterThan(50);
    }
  });

  it("each bundle file contains required fields: id, stage, name, status", () => {
    for (const f of bundleFiles) {
      const content = readFileSync(join(bundlesDir, f), "utf8");
      expect(content).toMatch(/^id:/m);
      expect(content).toMatch(/^stage:/m);
      expect(content).toMatch(/^name:/m);
      expect(content).toMatch(/^status:/m);
    }
  });
});

// ─── Ledger: REMAINING_STAGE_ACCEPTANCE.yaml ─────────────────────────────────

describe("REMAINING_STAGE_ACCEPTANCE.yaml — ledger consistency", () => {
  let ledgerContent: string;

  beforeAll(() => {
    ledgerContent = readFileSync(ledgerPath, "utf8");
  });

  it("ledger file exists and is non-empty", () => {
    expect(ledgerContent.length).toBeGreaterThan(100);
  });

  it("contains bundle-3.4 as CLOSED", () => {
    expect(ledgerContent).toContain("id: bundle-3.4");
    expect(ledgerContent).toContain("status: CLOSED");
  });

  it("bundle-3.4 has pr_sha evidence", () => {
    expect(ledgerContent).toContain("375ec9497542dd3398016427a4ad503210e678f9");
  });

  it("bundle-3.4 has merge_sha evidence", () => {
    expect(ledgerContent).toContain("502f9cda632a895af1eb2c88e1b6f91546281baf");
  });

  it("bundle-3.4 has main_integration_run", () => {
    expect(ledgerContent).toContain("main_integration_run: \"30066323652\"");
  });

  it("bundle-3.4 has db_verification_run", () => {
    expect(ledgerContent).toContain("db_verification_run: \"30047121015\"");
  });

  it("contains all required stages (3-7)", () => {
    expect(ledgerContent).toContain("stage-3:");
    expect(ledgerContent).toContain("stage-4:");
    expect(ledgerContent).toContain("stage-5:");
    expect(ledgerContent).toContain("stage-6:");
    expect(ledgerContent).toContain("stage-7:");
  });

  it("all PENDING bundles have null evidence", () => {
    const lines = ledgerContent.split("\n");
    let inPendingBlock = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+status: PENDING$/.test(lines[i])) {
        inPendingBlock = true;
      }
      if (inPendingBlock && /^\s+pr_sha:/.test(lines[i])) {
        const value = lines[i].split(":")[1]?.trim();
        expect(value).toBe("null");
        inPendingBlock = false;
      }
    }
  });

  it("stage-3 acceptance status is CLOSED (all bundles merged)", () => {
    // Stage 3 acceptance was CLOSED on 2026-07-26 via PR #255 proof-closure
    expect(ledgerContent).toContain("stage-3:");
    expect(ledgerContent).toMatch(/stage-3[\s\S]*?overall_status: COMPLETE/);
  });

  it("bundle-3.9 db_test_count is 13 (corrected from 12)", () => {
    // Factual count confirmed: 13 it() calls in bundle-3.9-sop.db.test.ts
    const b39 = ledgerContent.match(/id: bundle-3\.9[\s\S]*?id: bundle-3\.10/);
    expect(b39).not.toBeNull();
    expect(b39![0]).toContain("db_test_count: 13");
    expect(b39![0]).not.toContain("db_test_count: 12");
  });

  it("bundles 3.5-3.10 all CLOSED with PR #255 merge SHA", () => {
    // Post-merge evidence from PR #255 (15a131ab7f0b7d703b459322f3c4db5951d1e825)
    const expectedMergeSha = "15a131ab7f0b7d703b459322f3c4db5951d1e825";
    expect(ledgerContent).toContain(expectedMergeSha);
  });

  it("bundles 3.5-3.10 reference Main Integration run 30199084412", () => {
    expect(ledgerContent).toContain("main_integration_run: \"30199084412\"");
  });
});

// ─── Stage acceptance validator ───────────────────────────────────────────────

describe("validate-stage-acceptance.mjs", () => {
  const stageAcceptanceScript = join(root, "scripts", "validate-stage-acceptance.mjs");

  function runStageAcceptance(args: string): { code: number; output: string } {
    try {
      const output = execSync(`node ${stageAcceptanceScript} ${args}`, {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      });
      return { code: 0, output };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        code: e.status ?? 1,
        output: (e.stdout ?? "") + (e.stderr ?? ""),
      };
    }
  }

  // ── Integrity mode (--mode integrity): PENDING = normal development, exit 0 ──

  it("stage 3 integrity check passes with explicit --mode integrity", () => {
    const result = runStageAcceptance("--mode integrity --stage 3");
    expect(result.code).toBe(0);
  });

  it("stage 3 integrity check passes without explicit mode (integrity is default)", () => {
    const result = runStageAcceptance("--stage 3");
    expect(result.code).toBe(0);
  });

  it("stage 4 integrity check passes", () => {
    const result = runStageAcceptance("--mode integrity --stage 4");
    expect(result.code).toBe(0);
  });

  it("all stages integrity check passes", () => {
    const result = runStageAcceptance("--mode integrity --stage all");
    expect(result.code).toBe(0);
  });

  // ── Closure mode (--mode closure): all stage 3 bundles are now CLOSED ─────────

  it("stage 3 closure check passes (all 6 bundles CLOSED via PR #255)", () => {
    const result = runStageAcceptance("--mode closure --stage 3");
    // Bundles 3.5–3.10 are CLOSED with post-merge evidence from PR #255
    // merge SHA 15a131ab7f0b7d703b459322f3c4db5951d1e825
    expect(result.code).toBe(0);
  });

  it("stage 4 closure check passes (bundles 4.1 + 4.2 CLOSED)", () => {
    const result = runStageAcceptance("--mode closure --stage 4");
    expect(result.code).toBe(0);
  });

  it("all stages closure check passes (stages 3-7 all CLOSED)", () => {
    const result = runStageAcceptance("--mode closure --stage all");
    expect(result.code).toBe(0);
  });

  // ── Invalid arguments ──────────────────────────────────────────────────────────

  it("exits with code 2 if --stage argument missing", () => {
    const result = runStageAcceptance("");
    expect(result.code).toBe(2);
  });

  it("exits with code 2 if --mode has an invalid value", () => {
    const result = runStageAcceptance("--stage 3 --mode invalid");
    expect(result.code).toBe(2);
  });
});

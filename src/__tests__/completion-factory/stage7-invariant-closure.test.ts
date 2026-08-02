/**
 * Factory Stage 7 — closure condition 5 enforcement (PR-1B)
 *
 * Proves that the two closure gates now read the invariant block of a
 * factory_stage_closure manifest, and that a stage cannot be closed on metadata
 * alone.
 *
 * The historical governance gap this guards against: before PR-1B, neither
 * scripts/validate-stage-acceptance.mjs nor scripts/validate-bundle-manifests.mjs
 * looked at `invariants`. A closure manifest could be flipped to CLOSED with
 * pr_sha, merge_sha, main_integration_run and db_verification_run pasted in while
 * all sixteen Stage 7 invariants sat at PENDING with empty proof_artifacts, and
 * both gates exited 0. That is the mechanism by which a stage could be declared
 * closed with no evidence that the stage had happened.
 *
 * Every case drives the real scripts as subprocesses against generated fixtures,
 * so the assertions cover the shipped enforcement path rather than a reimplemented
 * copy of it.
 */

import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import YAML from "js-yaml";

const root = join(__dirname, "..", "..", "..");
const stageAcceptanceScript = join(root, "scripts", "validate-stage-acceptance.mjs");
const bundleManifestScript = join(root, "scripts", "validate-bundle-manifests.mjs");

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Fixture builders ─────────────────────────────────────────────────────────

const BUNDLE_ID = "factory-stage-test-closure";

const FULL_EVIDENCE = {
  pr_sha: "1111111111111111111111111111111111111111",
  merge_sha: "2222222222222222222222222222222222222222",
  main_integration_run: "https://github.com/org/repo/actions/runs/1001",
  db_verification_run: "https://github.com/org/repo/actions/runs/1002",
};

const COMPLETE_WAIVER = {
  invariant: "ST-I2",
  owner: "arnab-netizen",
  reason: "Live provider credentials unavailable for the pilot; email is not on the selected workflow.",
  date: "2026-08-02",
  acknowledgement: "Owner acknowledges ST-I2 is closed without proof and accepts the residual risk.",
};

type InvariantEntry = Record<string, unknown>;

function provenInvariant(id: string): InvariantEntry {
  return {
    name: `Test invariant ${id}`,
    status: "PROVEN",
    proof_artifacts: [`${id}: evidence recorded at docs/evidence/${id}.md`],
  };
}

function pendingInvariant(id: string): InvariantEntry {
  return { name: `Test invariant ${id}`, status: "PENDING", proof_artifacts: [] };
}

/**
 * Build a stage-closure manifest. `declareCondition5` controls whether the
 * manifest opts into invariant-proof enforcement, exactly as a frozen contract
 * does via closure_conditions.5_invariant_proof.
 */
function buildManifest(options: {
  status?: string;
  invariants?: Record<string, unknown>;
  waivers?: unknown;
  declareCondition5?: boolean;
  evidence?: Record<string, unknown>;
}): Record<string, unknown> {
  const {
    status = "CLOSED",
    invariants = { "ST-I1": provenInvariant("ST-I1"), "ST-I2": provenInvariant("ST-I2") },
    waivers = [],
    declareCondition5 = true,
    evidence = FULL_EVIDENCE,
  } = options;

  const manifest: Record<string, unknown> = {
    id: BUNDLE_ID,
    stage: "factory-test",
    artifact_type: "factory_stage_closure",
    factory_stage_id: "FACTORY_STAGE_TEST",
    development_bundle_id: null,
    status,
    priority: 1,
    name: "Factory Stage Test Closure",
    invariants,
    required_evidence: evidence,
  };

  if (declareCondition5) {
    manifest.closure_conditions = {
      "1_pr_sha": "required_evidence.pr_sha is non-null",
      "2_merge_sha": "required_evidence.merge_sha is non-null",
      "3_main_integration_run": "required_evidence.main_integration_run is non-null",
      "4_db_verification_run": "required_evidence.db_verification_run is non-null",
      "5_invariant_proof":
        "Every invariant carries status: PROVEN with at least one proof_artifacts entry, or an explicit owner waiver.",
    };
    manifest.invariant_waivers = waivers;
  }

  return manifest;
}

function buildLedger(status: string, evidence: Record<string, unknown>): Record<string, unknown> {
  return {
    stages: {
      "factory-stage-7": {
        name: "Factory Stage Test",
        bundles: [
          {
            id: BUNDLE_ID,
            artifact_type: "factory_stage_closure",
            status,
            required_evidence: evidence,
          },
        ],
      },
    },
  };
}

/** Materialise a ledger + bundles dir into a fresh temp workspace. */
function writeFixture(manifest: Record<string, unknown>): { ledgerPath: string; bundlesDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "opsiq-stage7-closure-"));
  tempDirs.push(dir);

  const bundlesDir = join(dir, "bundles");
  mkdirSync(bundlesDir);
  writeFileSync(join(bundlesDir, `${BUNDLE_ID}.yaml`), YAML.dump(manifest), "utf8");

  const ledgerPath = join(dir, "ledger.yaml");
  const ledger = buildLedger(
    manifest.status as string,
    (manifest.required_evidence ?? {}) as Record<string, unknown>,
  );
  writeFileSync(ledgerPath, YAML.dump(ledger), "utf8");

  return { ledgerPath, bundlesDir };
}

function runScript(script: string, args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync("node", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function runStageAcceptance(
  manifest: Record<string, unknown>,
  mode: "integrity" | "closure" = "integrity",
): { code: number; output: string } {
  const { ledgerPath, bundlesDir } = writeFixture(manifest);
  return runScript(stageAcceptanceScript, [
    "--stage",
    "factory-7",
    "--mode",
    mode,
    "--ledger",
    ledgerPath,
    "--bundles-dir",
    bundlesDir,
  ]);
}

// ─── Rule 1: metadata alone must never close a stage ──────────────────────────

describe("Stage 7 closure condition 5 — Rule 1: invariant proof required", () => {
  it("blocks closure when only the four metadata fields are populated (the historical gap)", () => {
    const manifest = buildManifest({
      invariants: {
        "ST-I1": pendingInvariant("ST-I1"),
        "ST-I2": pendingInvariant("ST-I2"),
      },
    });

    for (const mode of ["integrity", "closure"] as const) {
      const result = runStageAcceptance(manifest, mode);
      expect(result.code, `mode=${mode} must reject metadata-only closure`).toBe(1);
      expect(result.output).toContain("ST-I1");
      expect(result.output).toContain("ST-I2");
    }
  });

  it("blocks closure when an invariant is PROVEN but proof_artifacts is empty", () => {
    const manifest = buildManifest({
      invariants: {
        "ST-I1": provenInvariant("ST-I1"),
        "ST-I2": { name: "no proof", status: "PROVEN", proof_artifacts: [] },
      },
    });

    const result = runStageAcceptance(manifest);
    expect(result.code).toBe(1);
    expect(result.output).toContain("ST-I2");
    expect(result.output).toContain("proof_artifacts");
  });

  it("blocks closure when proof_artifacts is absent entirely", () => {
    const manifest = buildManifest({
      invariants: {
        "ST-I1": provenInvariant("ST-I1"),
        "ST-I2": { name: "no proof key", status: "PROVEN" },
      },
    });

    const result = runStageAcceptance(manifest);
    expect(result.code).toBe(1);
    expect(result.output).toContain("ST-I2");
    expect(result.output).toContain("proof_artifacts absent");
  });

  it("does not count empty-string proof artifacts as proof", () => {
    const manifest = buildManifest({
      invariants: {
        "ST-I1": provenInvariant("ST-I1"),
        "ST-I2": { name: "blank proof", status: "PROVEN", proof_artifacts: ["", "   "] },
      },
    });

    const result = runStageAcceptance(manifest);
    expect(result.code).toBe(1);
    expect(result.output).toContain("ST-I2");
  });

  it("passes when every invariant is PROVEN with at least one proof artifact", () => {
    const manifest = buildManifest({
      invariants: {
        "ST-I1": provenInvariant("ST-I1"),
        "ST-I2": provenInvariant("ST-I2"),
      },
    });

    const result = runStageAcceptance(manifest, "closure");
    expect(result.code).toBe(0);
    expect(result.output).toContain("closure condition 5 satisfied");
  });
});

// ─── Rule 2: waivers must be complete and attributable ────────────────────────

describe("Stage 7 closure condition 5 — Rule 2: waiver completeness", () => {
  const unprovenSet = {
    "ST-I1": provenInvariant("ST-I1"),
    "ST-I2": pendingInvariant("ST-I2"),
  };

  it("rejects an empty waiver object", () => {
    const result = runStageAcceptance(buildManifest({ invariants: unprovenSet, waivers: [{}] }));
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant_waivers[0]");
    expect(result.output).toContain("ST-I2");
  });

  it("rejects a waiver missing its reason", () => {
    const { reason: _reason, ...withoutReason } = COMPLETE_WAIVER;
    const result = runStageAcceptance(
      buildManifest({ invariants: unprovenSet, waivers: [withoutReason] }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("reason");
    expect(result.output).toContain("ST-I2");
  });

  it("rejects an anonymous waiver (no owner attribution)", () => {
    const { owner: _owner, ...anonymous } = COMPLETE_WAIVER;
    const result = runStageAcceptance(
      buildManifest({ invariants: unprovenSet, waivers: [anonymous] }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("owner");
  });

  it("rejects a waiver with no timestamp", () => {
    const { date: _date, ...undated } = COMPLETE_WAIVER;
    const result = runStageAcceptance(buildManifest({ invariants: unprovenSet, waivers: [undated] }));
    expect(result.code).toBe(1);
    expect(result.output).toContain("date");
  });

  it("rejects a waiver with no explicit acknowledgement", () => {
    const { acknowledgement: _ack, ...unacknowledged } = COMPLETE_WAIVER;
    const result = runStageAcceptance(
      buildManifest({ invariants: unprovenSet, waivers: [unacknowledged] }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("acknowledgement");
  });

  it("rejects a waiver naming an invariant the contract does not declare", () => {
    const result = runStageAcceptance(
      buildManifest({
        invariants: unprovenSet,
        waivers: [{ ...COMPLETE_WAIVER, invariant: "ST-I99" }],
      }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("ST-I99");
  });

  it("rejects duplicate waivers for the same invariant", () => {
    const result = runStageAcceptance(
      buildManifest({ invariants: unprovenSet, waivers: [COMPLETE_WAIVER, COMPLETE_WAIVER] }),
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("duplicate owner waiver");
  });

  it("accepts a complete owner waiver in place of proof", () => {
    const result = runStageAcceptance(
      buildManifest({ invariants: unprovenSet, waivers: [COMPLETE_WAIVER] }),
      "closure",
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain("1 waived");
  });

  it("treats a missing invariant_waivers list as no waivers, never as blanket approval", () => {
    const manifest = buildManifest({ invariants: unprovenSet, waivers: [] });
    delete (manifest as Record<string, unknown>).invariant_waivers;
    const result = runStageAcceptance(manifest);
    expect(result.code).toBe(1);
    expect(result.output).toContain("ST-I2");
  });
});

// ─── Rule 3: failures must be specific ────────────────────────────────────────

describe("Stage 7 closure condition 5 — Rule 3: specific failure messages", () => {
  it("names the invariant, the unmet requirement, the missing proof and the missing waiver", () => {
    const result = runStageAcceptance(
      buildManifest({
        invariants: { "ST-I1": provenInvariant("ST-I1"), "ST-I2": pendingInvariant("ST-I2") },
      }),
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant ST-I2 blocks closure");
    expect(result.output).toContain("unmet requirement:");
    expect(result.output).toContain("missing proof:");
    expect(result.output).toContain("missing waiver:");
    // The satisfied invariant must not be blamed.
    expect(result.output).not.toContain("invariant ST-I1 blocks closure");
  });

  it("reports every unmet invariant, not just the first", () => {
    const result = runStageAcceptance(
      buildManifest({
        invariants: {
          "ST-I1": pendingInvariant("ST-I1"),
          "ST-I2": pendingInvariant("ST-I2"),
          "ST-I3": pendingInvariant("ST-I3"),
        },
      }),
    );

    expect(result.code).toBe(1);
    for (const id of ["ST-I1", "ST-I2", "ST-I3"]) {
      expect(result.output).toContain(`invariant ${id} blocks closure`);
    }
  });
});

// ─── Rule 4: a passing integrity gate is not closure ──────────────────────────

describe("Stage 7 closure condition 5 — Rule 4: integrity is not closure", () => {
  it("passes integrity for a PENDING contract but states it is not stage progress", () => {
    const manifest = buildManifest({
      status: "PENDING",
      invariants: { "ST-I1": pendingInvariant("ST-I1"), "ST-I2": pendingInvariant("ST-I2") },
      evidence: {
        pr_sha: null,
        merge_sha: null,
        main_integration_run: null,
        db_verification_run: null,
      },
    });

    const result = runStageAcceptance(manifest, "integrity");
    expect(result.code).toBe(0);
    expect(result.output).toContain("closure condition 5 (invariant proof) still outstanding");
    expect(result.output).toContain("NOT stage progress");
    expect(result.output).toContain("0/2 invariants proven");
  });

  it("still refuses closure mode for the same PENDING contract", () => {
    const manifest = buildManifest({
      status: "PENDING",
      invariants: { "ST-I1": pendingInvariant("ST-I1") },
      evidence: {
        pr_sha: null,
        merge_sha: null,
        main_integration_run: null,
        db_verification_run: null,
      },
    });

    const result = runStageAcceptance(manifest, "closure");
    expect(result.code).toBe(1);
  });

  it("fails a CLOSED stage-closure entry whose manifest cannot be found", () => {
    const dir = mkdtempSync(join(tmpdir(), "opsiq-stage7-nomanifest-"));
    tempDirs.push(dir);
    const bundlesDir = join(dir, "bundles");
    mkdirSync(bundlesDir);
    const ledgerPath = join(dir, "ledger.yaml");
    writeFileSync(ledgerPath, YAML.dump(buildLedger("CLOSED", FULL_EVIDENCE)), "utf8");

    const result = runScript(stageAcceptanceScript, [
      "--stage",
      "factory-7",
      "--mode",
      "integrity",
      "--ledger",
      ledgerPath,
      "--bundles-dir",
      bundlesDir,
    ]);

    expect(result.code).toBe(1);
    expect(result.output).toContain("no manifest found");
  });
});

// ─── Rule 5: contracts that never froze condition 5 are untouched ─────────────

describe("Stage 7 closure condition 5 — Rule 5: no effect on contracts without condition 5", () => {
  it("leaves a CLOSED contract with LANE_*_PROVEN invariants and no closure_conditions alone", () => {
    // This is the Factory Stage 6 shape: structured invariants, but statuses are
    // LANE_A_PROVEN / LANE_B_PROVEN and the manifest never froze condition 5.
    const manifest = buildManifest({
      declareCondition5: false,
      invariants: {
        "ST-I1": { name: "lane a", status: "LANE_A_PROVEN", proof_artifacts: ["ci gate"] },
        "ST-I2": { name: "lane b", status: "LANE_B_PROVEN", proof_artifacts: ["db run"] },
      },
    });

    const result = runStageAcceptance(manifest, "closure");
    expect(result.code).toBe(0);
    expect(result.output).not.toContain("closure condition 5");
  });

  it("leaves a CLOSED contract with free-text invariants alone", () => {
    // This is the Factory Stage 5 shape: invariants are prose, not structured entries.
    const manifest = buildManifest({
      declareCondition5: false,
      invariants: {
        I1_tenant_isolation: "A workspace must never read another workspace's records.",
        I2_authorization: "All routes use canonical capability enforcement.",
      },
    });

    const result = runStageAcceptance(manifest, "closure");
    expect(result.code).toBe(0);
  });
});

// ─── Live repository state ────────────────────────────────────────────────────

describe("Stage 7 closure condition 5 — live repository state", () => {
  it("keeps the real Factory Stage 6 integrity gate green", () => {
    const result = runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "factory-6"]);
    expect(result.code).toBe(0);
  });

  it("keeps the real stage-3 integrity gate green", () => {
    const result = runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "3"]);
    expect(result.code).toBe(0);
  });

  it("keeps the real bundle manifest validator green", () => {
    const result = runScript(bundleManifestScript, []);
    expect(result.code).toBe(0);
  });

  it("reports the real Factory Stage 7 contract as PENDING with 16 unproven invariants", () => {
    const result = runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "factory-7"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("factory-stage-7-closure: status=PENDING");
    expect(result.output).toContain("0/16 invariants proven, 0 waived, 16 unmet");
  });

  it("refuses to close the real Factory Stage 7 contract", () => {
    const result = runScript(stageAcceptanceScript, ["--mode", "closure", "--stage", "factory-7"]);
    expect(result.code).toBe(1);
  });
});

// ─── Bundle manifest validator path ───────────────────────────────────────────

describe("validate-bundle-manifests.mjs — closure condition 5", () => {
  /**
   * The manifest validator always scans docs/opsiq/bundles/, so it is exercised
   * here against the real repository set. The generated-fixture cases above cover
   * the shared evaluation module that both gates call, which is the single place
   * the rule is implemented.
   */
  it("passes the current repository bundle set", () => {
    const result = runScript(bundleManifestScript, []);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Bundle manifest validation passed");
  });

  it("does not report condition 5 for Stage 5 or Stage 6, which never froze it", () => {
    const result = runScript(bundleManifestScript, []);
    expect(result.output).not.toContain("factory-stage-5-closure.yaml: closure condition 5");
    expect(result.output).not.toContain("factory-stage-6-closure.yaml: closure condition 5");
  });
});

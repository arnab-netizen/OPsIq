/**
 * Factory Stage 7 — closure condition 5 enforcement (PR-1B)
 *
 * Proves that the two closure gates read the invariant block of a stage-closure
 * manifest, that a stage cannot be closed on metadata alone, and — after the
 * hostile forensic audit — that a manifest cannot opt itself out of the rules
 * that govern it.
 *
 * Two historical governance gaps are covered:
 *
 *  1. Before PR-1B, neither validator looked at `invariants`. A closure manifest
 *     could be flipped to CLOSED with the four metadata fields pasted in while all
 *     sixteen Stage 7 invariants sat at PENDING with empty proof_artifacts, and
 *     both gates exited 0.
 *
 *  2. The first PR-1B implementation asked the manifest whether enforcement
 *     applied, by testing for `closure_conditions.5_invariant_proof`. Deleting
 *     that key, renaming it, writing `closure_conditions` as a list, or deleting
 *     invariants from the manifest all silently disabled or shrank enforcement.
 *     Enforcement is now owned by STAGE_CLOSURE_ENFORCEMENT_REGISTRY in
 *     scripts/lib/invariant-closure.mjs and keyed on the bundle id.
 *
 * Every case drives the real scripts as subprocesses against generated fixtures,
 * so the assertions cover the shipped enforcement path rather than a reimplemented
 * copy of it. Fixtures use the real bundle ids, so they exercise the production
 * registry entries rather than a test-only registry.
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

const STAGE_7_ID = "factory-stage-7-closure";
const STAGE_6_ID = "factory-stage-6-closure";
const STAGE_5_ID = "factory-stage-5-closure";

/** The canonical set the validator owns. Mirrored here so drift fails a test. */
const CANONICAL_IDS = Array.from({ length: 16 }, (_, i) => `S7-I${i + 1}`);

const FULL_EVIDENCE = {
  pr_sha: "1111111111111111111111111111111111111111",
  merge_sha: "2222222222222222222222222222222222222222",
  main_integration_run: "https://github.com/org/repo/actions/runs/1001",
  db_verification_run: "https://github.com/org/repo/actions/runs/1002",
};

const NULL_EVIDENCE = {
  pr_sha: null,
  merge_sha: null,
  main_integration_run: null,
  db_verification_run: null,
};

const CONDITIONS = {
  "1_pr_sha": "required_evidence.pr_sha is non-null",
  "2_merge_sha": "required_evidence.merge_sha is non-null",
  "3_main_integration_run": "required_evidence.main_integration_run is non-null",
  "4_db_verification_run": "required_evidence.db_verification_run is non-null",
  "5_invariant_proof":
    "Every invariant carries status: PROVEN with at least one proof_artifacts entry, or an explicit owner waiver.",
};

const COMPLETE_WAIVER = {
  invariant: "S7-I2",
  owner: "arnab-netizen",
  reason: "Live provider credentials unavailable for the pilot; email is not on the selected workflow.",
  date: "2026-08-02",
  acknowledgement: "Owner acknowledges S7-I2 is closed without proof and accepts the residual risk.",
};

type Entry = Record<string, unknown>;

// G-1: a proof reference is a canonical artifact id, never prose. These ids are
// well-formed but resolve to no artifact, which is what a PROVEN invariant looks
// like before any evidence has actually been captured.
const proven = (id: string): Entry => ({
  name: `Invariant ${id}`,
  status: "PROVEN",
  proof_artifacts: [`evd_${id.replace(/[^0-9]/g, "").padStart(32, "0")}`],
});

const pendingInv = (id: string): Entry => ({
  name: `Invariant ${id}`,
  status: "PENDING",
  proof_artifacts: [],
});

/** All sixteen canonical invariants, built from a per-id factory. */
function canonicalInvariants(factory: (id: string) => Entry): Record<string, Entry> {
  return Object.fromEntries(CANONICAL_IDS.map((id) => [id, factory(id)]));
}

/** All proven except the named ids, which are left PENDING. */
function allProvenExcept(...unproven: string[]): Record<string, Entry> {
  return canonicalInvariants((id) => (unproven.includes(id) ? pendingInv(id) : proven(id)));
}

function buildStage7Manifest(options: {
  status?: string;
  invariants?: unknown;
  waivers?: unknown;
  conditions?: unknown;
  omitConditions?: boolean;
  evidence?: unknown;
} = {}): Record<string, unknown> {
  const {
    status = "CLOSED",
    invariants = canonicalInvariants(proven),
    waivers = [],
    conditions = CONDITIONS,
    omitConditions = false,
    evidence = FULL_EVIDENCE,
  } = options;

  const manifest: Record<string, unknown> = {
    id: STAGE_7_ID,
    stage: "factory-7",
    artifact_type: "factory_stage_closure",
    factory_stage_id: "FACTORY_STAGE_7",
    status,
    name: "Factory Stage 7 Closure",
    invariants,
    invariant_waivers: waivers,
    required_evidence: evidence,
  };
  if (!omitConditions) manifest.closure_conditions = conditions;
  return manifest;
}

function buildLedger(bundleId: string, status: string, evidence: unknown, artifactType = "factory_stage_closure") {
  const entry: Record<string, unknown> = { id: bundleId, artifact_type: artifactType, status };
  if (artifactType === "factory_stage_closure") entry.required_evidence = evidence;
  else entry.post_merge_evidence = evidence;
  return { stages: { "factory-stage-7": { name: "Factory Stage Test", bundles: [entry] } } };
}

function runScript(script: string, args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync("node", [script, ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

/**
 * Materialise a manifest (object or raw YAML text) plus a ledger, then run the
 * stage acceptance gate against them.
 */
function runGate(options: {
  manifest?: Record<string, unknown>;
  rawManifest?: string;
  bundleId?: string;
  ledgerStatus?: string;
  ledgerEvidence?: unknown;
  ledgerArtifactType?: string;
  writeManifest?: boolean;
  mode?: "integrity" | "closure";
}): { code: number; output: string } {
  const {
    manifest,
    rawManifest,
    bundleId = STAGE_7_ID,
    ledgerArtifactType = "factory_stage_closure",
    writeManifest = true,
    mode = "integrity",
  } = options;

  const dir = mkdtempSync(join(tmpdir(), "opsiq-stage7-closure-"));
  tempDirs.push(dir);
  const bundlesDir = join(dir, "bundles");
  mkdirSync(bundlesDir);

  if (writeManifest) {
    const body = rawManifest ?? YAML.dump(manifest ?? {});
    writeFileSync(join(bundlesDir, `${bundleId}.yaml`), body, "utf8");
  }

  const ledgerStatus = options.ledgerStatus ?? (manifest?.status as string) ?? "CLOSED";
  const ledgerEvidence = options.ledgerEvidence ?? manifest?.required_evidence ?? FULL_EVIDENCE;
  const ledgerPath = join(dir, "ledger.yaml");
  writeFileSync(
    ledgerPath,
    YAML.dump(buildLedger(bundleId, ledgerStatus, ledgerEvidence, ledgerArtifactType)),
    "utf8",
  );

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

// ─── Audit bypasses B01 / B02 / B10 — enforcement cannot be opted out ─────────

describe("Stage 7 condition 5 — enforcement is validator-owned (audit B01/B02/B10)", () => {
  it("B01: deleting closure_conditions is a violation, not an opt-out", () => {
    const result = runGate({ manifest: buildStage7Manifest({ omitConditions: true }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("closure_conditions is absent");
    expect(result.output).toContain("cannot opt itself out");
  });

  it("B02: renaming 5_invariant_proof is a violation", () => {
    const result = runGate({
      manifest: buildStage7Manifest({ conditions: { "5_invariant_proofs": "typo" } }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("does not declare '5_invariant_proof'");
  });

  it("B10: closure_conditions written as a list is a violation", () => {
    const result = runGate({
      manifest: buildStage7Manifest({ conditions: ["5_invariant_proof"] }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("closure_conditions is list");
  });

  it("B01 is blocked even while the contract is still PENDING", () => {
    // A contract must not be quietly disarmed now and closed later.
    const result = runGate({
      manifest: buildStage7Manifest({
        status: "PENDING",
        omitConditions: true,
        invariants: canonicalInvariants(pendingInv),
        evidence: NULL_EVIDENCE,
      }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("cannot opt itself out");
  });

  it("5_invariant_proof declared with a null value still enforces", () => {
    const result = runGate({
      manifest: buildStage7Manifest({
        conditions: { "5_invariant_proof": null },
        invariants: canonicalInvariants(pendingInv),
      }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("blocks closure");
  });
});

// ─── Audit bypass B04 — the validator owns the canonical invariant set ────────

describe("Stage 7 condition 5 — canonical invariant set (audit B04)", () => {
  it("B04: deleting invariants is a violation even when the survivors are proven", () => {
    const result = runGate({
      manifest: buildStage7Manifest({ invariants: { "S7-I1": proven("S7-I1") } }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("canonical invariant(s) missing");
    expect(result.output).toContain("S7-I16");
    expect(result.output).toContain("cannot shrink it");
  });

  it("adding an undeclared invariant is a violation", () => {
    const result = runGate({
      manifest: buildStage7Manifest({
        invariants: { ...canonicalInvariants(proven), "S7-I17": proven("S7-I17") },
      }),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("undeclared invariant(s)");
    expect(result.output).toContain("S7-I17");
    expect(result.output).toContain("cannot extend it");
  });

  it("an empty invariants map is a violation", () => {
    const result = runGate({ manifest: buildStage7Manifest({ invariants: {} }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("'invariants' is empty");
  });

  it("invariants written as a list is a violation", () => {
    const result = runGate({ manifest: buildStage7Manifest({ invariants: [] }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("'invariants' is");
  });

  it("duplicate invariant ids fail validation (YAML rejects duplicate mapping keys)", () => {
    const raw = `id: ${STAGE_7_ID}
artifact_type: factory_stage_closure
status: CLOSED
closure_conditions:
  5_invariant_proof: proof or waiver
invariants:
  S7-I1:
    status: PENDING
    proof_artifacts: []
  S7-I1:
    status: PROVEN
    proof_artifacts: ["forged"]
invariant_waivers: []
`;
    const result = runGate({ rawManifest: raw });
    expect(result.code).toBe(1);
    expect(result.output).toContain("duplicated mapping key");
  });

  it("a stage-closure manifest unknown to the registry is a violation", () => {
    const manifest = { ...buildStage7Manifest(), id: "factory-stage-99-closure" };
    const result = runGate({ manifest, bundleId: "factory-stage-99-closure" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("not present in STAGE_CLOSURE_ENFORCEMENT_REGISTRY");
  });
});

// ─── Ledger-side and file-side evasion ───────────────────────────────────────

describe("Stage 7 condition 5 — evasion via the ledger or the manifest file", () => {
  it("reclassifying the ledger entry as a development_bundle does not skip invariants", () => {
    const result = runGate({
      manifest: buildStage7Manifest({ invariants: canonicalInvariants(pendingInv) }),
      ledgerArtifactType: "development_bundle",
      ledgerEvidence: FULL_EVIDENCE,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("blocks closure");
  });

  it("an empty manifest file is a violation, not an absence of things to check", () => {
    const result = runGate({ rawManifest: "" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("file is empty");
  });

  it("a manifest that is a bare scalar is a violation", () => {
    const result = runGate({ rawManifest: "just-a-string\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("not a mapping");
  });

  it("a governed contract with no manifest on disk is a violation at any status", () => {
    const result = runGate({
      writeManifest: false,
      ledgerStatus: "PENDING",
      ledgerEvidence: NULL_EVIDENCE,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("canonical invariant set cannot be verified");
  });
});

// ─── Proof requirement ───────────────────────────────────────────────────────

describe("Stage 7 condition 5 — invariant proof required", () => {
  it("blocks closure when only the four metadata fields are populated (the original gap)", () => {
    const manifest = buildStage7Manifest({ invariants: canonicalInvariants(pendingInv) });
    for (const mode of ["integrity", "closure"] as const) {
      const result = runGate({ manifest, mode });
      expect(result.code, `mode=${mode} must reject metadata-only closure`).toBe(1);
      expect(result.output).toContain("invariant S7-I1 blocks closure");
      expect(result.output).toContain("invariant S7-I16 blocks closure");
    }
  });

  it("blocks closure when an invariant is PROVEN but proof_artifacts is empty", () => {
    const invariants = canonicalInvariants(proven);
    invariants["S7-I3"] = { status: "PROVEN", proof_artifacts: [] };
    const result = runGate({ manifest: buildStage7Manifest({ invariants }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant S7-I3 blocks closure");
    expect(result.output).toContain("proof_artifacts");
  });

  it("blocks closure when proof_artifacts is absent entirely", () => {
    const invariants = canonicalInvariants(proven);
    invariants["S7-I4"] = { status: "PROVEN" };
    const result = runGate({ manifest: buildStage7Manifest({ invariants }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("proof_artifacts absent");
  });

  it("does not count empty-string proof artifacts as proof", () => {
    const invariants = canonicalInvariants(proven);
    invariants["S7-I5"] = { status: "PROVEN", proof_artifacts: ["", "   "] };
    const result = runGate({ manifest: buildStage7Manifest({ invariants }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant S7-I5 blocks closure");
  });

  it("does not accept a non-PROVEN status such as LANE_A_PROVEN", () => {
    const invariants = canonicalInvariants(proven);
    invariants["S7-I6"] = { status: "LANE_A_PROVEN", proof_artifacts: ["ci gate"] };
    const result = runGate({ manifest: buildStage7Manifest({ invariants }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("required: 'PROVEN'");
  });

  // G-1 changed this rule deliberately. Declaring PROVEN with a well-formed
  // reference is no longer sufficient: the reference must resolve to an ACCEPTED
  // artifact. The stage gate holds no signing key and cannot verify provenance,
  // so it can never certify closure on its own — that is the fail-closed
  // behaviour owner decision D-8 requires, not a defect.
  it("refuses closure when every invariant is PROVEN but no proof reference resolves", () => {
    const result = runGate({ manifest: buildStage7Manifest(), mode: "closure" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("resolves to no artifact");
  });
});

// ─── Waivers ─────────────────────────────────────────────────────────────────

describe("Stage 7 condition 5 — waiver completeness", () => {
  const withUnproven = (waivers: unknown) =>
    buildStage7Manifest({ invariants: allProvenExcept("S7-I2"), waivers });

  /** A copy of the complete waiver with exactly one required field removed. */
  const waiverWithout = (field: string): Record<string, unknown> => {
    const waiver: Record<string, unknown> = { ...COMPLETE_WAIVER };
    delete waiver[field];
    return waiver;
  };

  it("rejects an empty waiver object", () => {
    const result = runGate({ manifest: withUnproven([{}]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant_waivers[0]");
  });

  it("rejects a waiver missing its reason", () => {
    const rest = waiverWithout("reason");
    const result = runGate({ manifest: withUnproven([rest]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("reason");
  });

  it("rejects an anonymous waiver (no owner attribution)", () => {
    const rest = waiverWithout("owner");
    const result = runGate({ manifest: withUnproven([rest]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("owner");
  });

  it("rejects a waiver with no date", () => {
    const rest = waiverWithout("date");
    const result = runGate({ manifest: withUnproven([rest]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("date");
  });

  it("rejects a waiver with no explicit acknowledgement", () => {
    const rest = waiverWithout("acknowledgement");
    const result = runGate({ manifest: withUnproven([rest]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("acknowledgement");
  });

  it("rejects a waiver naming an invariant the contract does not declare", () => {
    const result = runGate({ manifest: withUnproven([{ ...COMPLETE_WAIVER, invariant: "S7-I99" }]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("S7-I99");
  });

  it("rejects duplicate waivers for the same invariant", () => {
    const result = runGate({ manifest: withUnproven([COMPLETE_WAIVER, COMPLETE_WAIVER]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("duplicate owner waiver");
  });

  it("treats a missing invariant_waivers list as no waivers, never as blanket approval", () => {
    const manifest = withUnproven([]);
    delete (manifest as Record<string, unknown>).invariant_waivers;
    const result = runGate({ manifest });
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant S7-I2 blocks closure");
  });

  it("accepts a complete owner waiver in place of proof", () => {
    const result = runGate({ manifest: withUnproven([COMPLETE_WAIVER]), mode: "closure" });
    // Closure as a whole still fails for the unrelated G-1 reason (no artifact
    // resolves). What this case proves is that the waiver was accepted: S7-I2
    // is never blamed.
    expect(result.output).not.toContain("invariant S7-I2 blocks closure");
  });

  it("accepts an unquoted YAML date, which parses to a Date object (audit false negative)", () => {
    const raw = YAML.dump(withUnproven([])).replace(
      "invariant_waivers: []",
      [
        "invariant_waivers:",
        "  - invariant: S7-I2",
        "    owner: arnab-netizen",
        "    reason: credentials unavailable for the pilot",
        "    date: 2026-08-02",
        "    acknowledgement: owner accepts the residual risk",
      ].join("\n"),
    );
    const result = runGate({ rawManifest: raw, mode: "closure" });
    // Closure as a whole still fails for the unrelated G-1 reason (no artifact
    // resolves). What this case proves is that the waiver was accepted: S7-I2
    // is never blamed.
    expect(result.output).not.toContain("invariant S7-I2 blocks closure");
  });

  it("accepts a full YAML timestamp as the waiver date", () => {
    const raw = YAML.dump(withUnproven([])).replace(
      "invariant_waivers: []",
      [
        "invariant_waivers:",
        "  - invariant: S7-I2",
        "    owner: arnab-netizen",
        "    reason: credentials unavailable for the pilot",
        "    date: 2026-08-02T10:30:00Z",
        "    acknowledgement: owner accepts the residual risk",
      ].join("\n"),
    );
    const result = runGate({ rawManifest: raw, mode: "closure" });
    expect(result.output).not.toContain("invariant S7-I2 blocks closure");
  });

  it("still rejects an empty-string date", () => {
    const result = runGate({ manifest: withUnproven([{ ...COMPLETE_WAIVER, date: "" }]) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("date");
  });
});

// ─── Rule 3: specific failure messages ───────────────────────────────────────

describe("Stage 7 condition 5 — specific failure messages", () => {
  it("names the invariant, the unmet requirement, the missing proof and the missing waiver", () => {
    const result = runGate({ manifest: buildStage7Manifest({ invariants: allProvenExcept("S7-I2") }) });
    expect(result.code).toBe(1);
    expect(result.output).toContain("invariant S7-I2 blocks closure");
    expect(result.output).toContain("unmet requirement:");
    expect(result.output).toContain("missing proof:");
    expect(result.output).toContain("missing waiver:");
    // S7-I1 is PROVEN, so it is never blamed for the status defect that blocks
    // S7-I2. Post-G-1 it has its own, different unmet requirement: its proof
    // reference resolves to no artifact.
    expect(result.output).not.toContain("invariant S7-I1 blocks closure — unmet requirement: status");
  });

  it("reports every unmet invariant, not just the first", () => {
    const result = runGate({
      manifest: buildStage7Manifest({ invariants: allProvenExcept("S7-I2", "S7-I9", "S7-I14") }),
    });
    expect(result.code).toBe(1);
    for (const id of ["S7-I2", "S7-I9", "S7-I14"]) {
      expect(result.output).toContain(`invariant ${id} blocks closure`);
    }
  });
});

// ─── Rule 4: integrity is not closure, and the notice cannot be silenced ─────

describe("Stage 7 condition 5 — integrity is not closure", () => {
  it("passes integrity for a well-formed PENDING contract but states it is not progress", () => {
    const result = runGate({
      manifest: buildStage7Manifest({
        status: "PENDING",
        invariants: canonicalInvariants(pendingInv),
        evidence: NULL_EVIDENCE,
      }),
      mode: "integrity",
    });
    expect(result.code).toBe(0);
    expect(result.output).toContain("closure condition 5 (invariant proof) still outstanding");
    expect(result.output).toContain("NOT stage progress");
    expect(result.output).toContain("0/16 invariants proven");
  });

  it("still refuses closure mode for the same PENDING contract", () => {
    const result = runGate({
      manifest: buildStage7Manifest({
        status: "PENDING",
        invariants: canonicalInvariants(pendingInv),
        evidence: NULL_EVIDENCE,
      }),
      mode: "closure",
    });
    expect(result.code).toBe(1);
  });
});

// ─── Legacy stages must be unaffected ────────────────────────────────────────

describe("Stage 7 condition 5 — legacy stage contracts unchanged", () => {
  it("leaves factory-stage-6-closure (LANE_*_PROVEN, no closure_conditions) alone", () => {
    const manifest = {
      id: STAGE_6_ID,
      artifact_type: "factory_stage_closure",
      status: "CLOSED",
      invariants: {
        "S6-I1": { status: "LANE_A_PROVEN", proof_artifacts: ["ci gate"] },
        "S6-I2": { status: "LANE_B_PROVEN", proof_artifacts: ["db run"] },
      },
      required_evidence: FULL_EVIDENCE,
    };
    const result = runGate({ manifest, bundleId: STAGE_6_ID, mode: "closure" });
    expect(result.code).toBe(0);
    expect(result.output).not.toContain("closure condition 5");
  });

  it("leaves factory-stage-5-closure (free-text invariants) alone", () => {
    const manifest = {
      id: STAGE_5_ID,
      artifact_type: "factory_stage_closure",
      status: "CLOSED",
      invariants: {
        I1_tenant_isolation: "A workspace must never read another workspace's records.",
        I2_authorization: "All routes use canonical capability enforcement.",
      },
      required_evidence: FULL_EVIDENCE,
    };
    const result = runGate({ manifest, bundleId: STAGE_5_ID, mode: "closure" });
    expect(result.code).toBe(0);
  });
});

// ─── Live repository state ───────────────────────────────────────────────────

describe("Stage 7 condition 5 — live repository state", () => {
  it("keeps the real Factory Stage 6 integrity gate green", () => {
    expect(runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "factory-6"]).code).toBe(0);
  });

  it("keeps the real stage-3 integrity gate green", () => {
    expect(runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "3"]).code).toBe(0);
  });

  it("keeps the real all-stage integrity gate green", () => {
    expect(runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "all"]).code).toBe(0);
  });

  it("keeps the real bundle manifest validator green", () => {
    expect(runScript(bundleManifestScript, []).code).toBe(0);
  });

  it("reports the real Factory Stage 7 contract as PENDING with 16 unproven invariants", () => {
    const result = runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "factory-7"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("factory-stage-7-closure: status=PENDING");
    expect(result.output).toContain("0/16 invariants proven, 0 waived, 16 unmet");
  });

  it("refuses to close the real Factory Stage 7 contract", () => {
    expect(runScript(stageAcceptanceScript, ["--mode", "closure", "--stage", "factory-7"]).code).toBe(1);
  });

  it("confirms the real contract still declares all sixteen canonical invariants", () => {
    // Guards against the canonical set and the shipped contract drifting apart.
    const result = runScript(stageAcceptanceScript, ["--mode", "integrity", "--stage", "factory-7"]);
    expect(result.output).not.toContain("canonical invariant(s) missing");
    expect(result.output).not.toContain("undeclared invariant(s)");
  });
});

// ─── Bundle manifest validator path ──────────────────────────────────────────

describe("validate-bundle-manifests.mjs — closure condition 5", () => {
  it("passes the current repository bundle set", () => {
    const result = runScript(bundleManifestScript, []);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Bundle manifest validation passed");
  });

  it("does not report condition 5 for Stage 5 or Stage 6, which are legacy-exempt", () => {
    const result = runScript(bundleManifestScript, []);
    expect(result.output).not.toContain("factory-stage-5-closure.yaml: closure condition 5");
    expect(result.output).not.toContain("factory-stage-6-closure.yaml: closure condition 5");
  });
});

/**
 * Stage 7 closure — protected evidence context (PR-G3).
 *
 * `evaluateInvariantClosure` decides whether a cited artifact may back a PROVEN
 * invariant, and an artifact only reaches ACCEPTED when its signature verified
 * against the registry authoritative at its AUTH_SHA and its provenance
 * cross-checked. Neither production caller supplied that context, so the gate
 * could not accept evidence it was never given the means to check:
 *
 *   B6-A  scripts/validate-stage-acceptance.mjs passed evidenceDir + manifestYaml
 *         but no signing key and no provenance. A cryptographically valid,
 *         correctly bound artifact resolved UNVERIFIED and could never close:
 *           "proof reference evd_… is UNVERIFIED, not ACCEPTED — signature not
 *            checked (EVIDENCE_SIGNING_KEY not available to the validator);
 *            provenance not checked"
 *
 *   B6-B  scripts/validate-bundle-manifests.mjs passed only { bundleId }, so the
 *         evidence directory defaulted to the process cwd and the D-4/A4 guard had
 *         no contract text at all:
 *           "S7-I11 proof blocked by D-4 enforcement (MANIFEST_UNREADABLE)"
 *
 * A gate that refuses everything is not fail-closed, it is inoperable — and one
 * that is known to refuse everything stops being read as a real check.
 *
 * These tests drive the real closure evaluator against real signed artifacts and a
 * real temporary git repository standing in for AUTH_SHA governance. Nothing is
 * mocked except the GitHub transport for provenance, which is injected.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { generateKeyPairSync } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import yaml from "js-yaml";

import {
  buildEvidenceArtifact,
  PROVENANCE_STATE,
} from "../../../scripts/lib/evidence-artifact.mjs";
import { evaluateInvariantClosure } from "../../../scripts/lib/invariant-closure.mjs";
import {
  createAuthShaResolvers,
  resolveKeyRegistryAtSha,
  resolveClosureManifestAtSha,
  resolveProvenanceStates,
} from "../../../scripts/lib/closure-evidence-context.mjs";

const REPO_ROOT = process.cwd();
const BUNDLE_ID = "factory-stage-7-closure";
const KEY_ID = "stage7-g3-context-fixture";

const { privateKey: SIGNING_KEY, publicKey: PUBLIC_DER } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "der" },
});

function git(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function registryYaml(status: string): string {
  return [
    'version: "1"',
    "keys:",
    `  - key_id: "${KEY_ID}"`,
    '    algorithm: "Ed25519"',
    `    status: "${status}"`,
    `    public_key_spki_der_base64: "${(PUBLIC_DER as Buffer).toString("base64")}"`,
    "",
  ].join("\n");
}

/** A Stage 7 contract carrying the canonical invariant set. */
function manifestObject(target: string) {
  const invariants: Record<string, unknown> = {};
  for (let i = 1; i <= 16; i += 1) {
    invariants[`S7-I${i}`] = { status: "PENDING", proof_artifacts: [], proof_lane: "LANE_E" };
  }
  (invariants["S7-I11"] as Record<string, unknown>) = {
    status: "PENDING",
    proof_artifacts: [],
    proof_lane: "LANE_E",
    proof_type: "simulation_adversarial",
  };
  return {
    id: BUNDLE_ID,
    artifact_type: "factory_stage_closure",
    status: "CLOSED",
    closure_subject_sha: SUBJECT,
    closure_conditions: { "5_invariant_proof": "Every invariant PROVEN or waived." },
    invariants,
    invariant_waivers: Object.keys(invariants)
      .filter((k) => k !== "S7-I11")
      .map((k) => ({
        invariant: k,
        owner: "arnab-netizen",
        reason: "G3 protected-context fixture",
        date: "2026-09-03",
        acknowledgement: "synthetic fixture, never committed",
      })),
    required_evidence: {
      pr_sha: SUBJECT,
      merge_sha: SUBJECT,
      main_integration_run: "1",
      db_verification_run: "1",
    },
    s7_i11_environment_target: target,
  };
}

const SUBJECT = "a".repeat(40);

let dir = "";
let authRepo = "";
let evidenceDir = "";
let authSha = "";
let revokedAuthSha = "";
let genericAuthSha = "";

/** Write a signed S7-I11 artifact bound to `auth` into `evidenceDir`. */
function writeArtifact(auth: string, overrides: Record<string, unknown> = {}): string {
  const manifestYaml = yaml.dump(manifestObject("ci"));
  const artifact = buildEvidenceArtifact(
    {
      invariant_id: "S7-I11",
      lane: "LANE_E",
      proof_type: "simulation_adversarial",
      artifact_classification: "INTERNAL_ONLY",
      environment: "ci",
      method: "test_run",
      captured_at_utc: "2026-09-03T09:00:00.000Z",
      subject_sha: SUBJECT,
      authorization_manifest_sha: auth,
      deployment_id: null,
      repository: "arnab-netizen/OPsIq",
      workflow: "Stage 7 — Evidence Capture (Canonical)",
      workflow_ref: null,
      job: "capture",
      run_id: "4242",
      run_number: 1,
      run_attempt: 1,
      run_started_at: "2026-09-03T08:59:00Z",
      actor: "arnab-netizen",
      event_name: "workflow_dispatch",
      owner_identity: null,
      owner_attestation_ref: null,
      replay_command: "npx vitest run a --reporter=default",
      raw_observation: " Test Files  2 passed (2)\n",
      assertion: "G3 protected-context fixture",
      result: "PASS",
      supersedes: null,
      ...overrides,
    },
    { signingKey: SIGNING_KEY, signingKeyId: KEY_ID, closureManifestYaml: manifestYaml },
  ) as { artifact_id: string };
  writeFileSync(join(evidenceDir, `${artifact.artifact_id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact.artifact_id;
}

function clearEvidence(): void {
  rmSync(evidenceDir, { recursive: true, force: true });
  mkdirSync(evidenceDir, { recursive: true });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "s7-g3-context-"));
  authRepo = join(dir, "authrepo");
  evidenceDir = join(dir, "artifacts");
  mkdirSync(join(authRepo, ".governance"), { recursive: true });
  mkdirSync(join(authRepo, "docs/opsiq/bundles"), { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });

  const write = (status: string, target: string) => {
    writeFileSync(join(authRepo, ".governance/stage7-signing-keys.yaml"), registryYaml(status));
    writeFileSync(join(authRepo, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), yaml.dump(manifestObject(target)));
  };

  git(authRepo, ["init", "-q", "-b", "main"]);
  git(authRepo, ["config", "user.email", "a@b"]);
  git(authRepo, ["config", "user.name", "t"]);

  write("active", "ci");
  git(authRepo, ["add", "-A"]);
  git(authRepo, ["commit", "-q", "-m", "governance at AUTH_SHA"]);
  authSha = git(authRepo, ["rev-parse", "HEAD"]);

  write("revoked", "ci");
  git(authRepo, ["add", "-A"]);
  git(authRepo, ["commit", "-q", "-m", "governance with revoked key"]);
  revokedAuthSha = git(authRepo, ["rev-parse", "HEAD"]);

  write("active", "isolated_simulation");
  git(authRepo, ["add", "-A"]);
  git(authRepo, ["commit", "-q", "-m", "governance with generic D-4 target"]);
  genericAuthSha = git(authRepo, ["rev-parse", "HEAD"]);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

interface Verdict {
  proven: string[];
  proofViolations: string[];
  structuralViolations: string[];
}

/**
 * Evaluate closure with the protected context both production callers now build.
 * `context: false` reproduces the pre-G3 call shape.
 */
function evaluate(citedId: string, opts: { context?: boolean; provenanceVerified?: boolean } = {}): Verdict {
  const { context = true, provenanceVerified = true } = opts;
  const manifest = manifestObject("ci") as Record<string, unknown>;
  (manifest.invariants as Record<string, Record<string, unknown>>)["S7-I11"] = {
    status: "PROVEN",
    proof_artifacts: [citedId],
    proof_lane: "LANE_E",
    proof_type: "simulation_adversarial",
  };
  if (!context) {
    return evaluateInvariantClosure(manifest, { bundleId: BUNDLE_ID }) as unknown as Verdict;
  }
  const resolvers = createAuthShaResolvers({ repoRoot: authRepo });
  return evaluateInvariantClosure(manifest, {
    bundleId: BUNDLE_ID,
    evidenceDir,
    manifestYaml: yaml.dump(manifest),
    resolveSigningKey: resolvers.resolveSigningKey,
    resolveClosureManifest: resolvers.resolveClosureManifest,
    provenance: provenanceVerified
      ? new Map([[citedId, PROVENANCE_STATE.VERIFIED]])
      : new Map([[citedId, PROVENANCE_STATE.FAILED]]),
  }) as unknown as Verdict;
}

// ─── Root cause ──────────────────────────────────────────────────────────────

describe("B6 root cause — closure without protected context cannot accept anything", () => {
  it("refuses a valid artifact when no context is supplied (the pre-G3 call shape)", () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const r = evaluate(id, { context: false });
    expect(r.proven).not.toContain("S7-I11");
    const all = [...r.proofViolations, ...r.structuralViolations].join("\n");
    // The evidence directory defaulted away and the D-4 guard had no contract.
    expect(all).toMatch(/resolves to no artifact|MANIFEST_UNREADABLE/);
  });

  it("accepts that same artifact once the protected context is supplied", () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const r = evaluate(id);
    expect(r.proofViolations).toEqual([]);
    expect(r.structuralViolations).toEqual([]);
    expect(r.proven).toContain("S7-I11");
  });
});

// ─── AUTH_SHA binding ────────────────────────────────────────────────────────

describe("protected context resolves governance at the artifact's AUTH_SHA", () => {
  it("loads the registry that was active at that commit", () => {
    expect(resolveKeyRegistryAtSha(authSha, authRepo)?.has(KEY_ID)).toBe(true);
  });

  it("treats a commit whose registry lists no ACTIVE key as unusable, not as no-check", () => {
    expect(resolveKeyRegistryAtSha(revokedAuthSha, authRepo)).toBeNull();
  });

  it("returns null for a SHA this clone does not hold", () => {
    expect(resolveKeyRegistryAtSha("b".repeat(40), authRepo)).toBeNull();
    expect(resolveClosureManifestAtSha("b".repeat(40), authRepo)).toBeNull();
  });

  it("reads the contract text from that commit, not the working tree", () => {
    expect(resolveClosureManifestAtSha(authSha, authRepo)).toContain("s7_i11_environment_target: ci");
    expect(resolveClosureManifestAtSha(genericAuthSha, authRepo)).toContain("isolated_simulation");
  });
});

// ─── Hostile matrix ──────────────────────────────────────────────────────────

describe("closure fails closed on every invalid citation", () => {
  it("rejects a tampered signature", () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const path = join(evidenceDir, `${id}.json`);
    const a = JSON.parse(readFileSync(path, "utf-8"));
    a.signature.value = (a.signature.value[0] === "0" ? "1" : "0") + a.signature.value.slice(1);
    writeFileSync(path, JSON.stringify(a, null, 2));
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toMatch(/signature does not verify|not ACCEPTED/);
  });

  it("rejects content edited after capture (artifact id no longer derives)", () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const path = join(evidenceDir, `${id}.json`);
    const a = JSON.parse(readFileSync(path, "utf-8"));
    a.assertion = "TAMPERED";
    writeFileSync(path, JSON.stringify(a, null, 2));
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
  });

  it("rejects an artifact whose AUTH_SHA registry has no ACTIVE key", () => {
    clearEvidence();
    const id = writeArtifact(revokedAuthSha);
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toMatch(/signature not checked|not ACCEPTED/);
  });

  it("rejects an artifact whose AUTH_SHA contract declares a generic D-4 target", () => {
    clearEvidence();
    const id = writeArtifact(genericAuthSha);
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toMatch(/D-4 enforcement|TARGET_IS_GENERIC|not ACCEPTED/);
  });

  it("rejects an artifact naming an AUTH_SHA this clone cannot resolve", () => {
    clearEvidence();
    const id = writeArtifact("c".repeat(40));
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
  });

  it("rejects a subject SHA the contract does not authorize", () => {
    clearEvidence();
    const id = writeArtifact(authSha, { subject_sha: "d".repeat(40) });
    const r = evaluate(id);
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toMatch(/SUBJECT_SHA_NOT_AUTHORIZED|not ACCEPTED/);
  });

  it("rejects a citation whose artifact is absent", () => {
    clearEvidence();
    const r = evaluate(`evd_${"e".repeat(32)}`);
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toContain("resolves to no artifact");
  });

  it("rejects a valid artifact whose provenance did not verify", () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const r = evaluate(id, { provenanceVerified: false });
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toMatch(/provenance|not ACCEPTED/);
  });
});

// ─── Provenance resolution ───────────────────────────────────────────────────

describe("provenance resolution is fail-closed", () => {
  it("verifies nothing without a token, and says so", async () => {
    const { provenance, checked, reasons } = await resolveProvenanceStates({
      records: [{ artifactId: "evd_x", absolutePath: "/dev/null" }],
      repoRoot: REPO_ROOT,
      githubToken: null,
      readArtifact: () => ({}),
    });
    expect(checked).toBe(false);
    expect(provenance.size).toBe(0);
    expect(reasons.join(" ")).toContain("no GitHub token");
  });

  it("marks an artifact FAILED when the run it names does not exist", async () => {
    clearEvidence();
    const id = writeArtifact(authSha);
    const artifact = JSON.parse(readFileSync(join(evidenceDir, `${id}.json`), "utf-8"));
    const { provenance } = await resolveProvenanceStates({
      records: [{ artifactId: id, absolutePath: join(evidenceDir, `${id}.json`) }],
      repoRoot: authRepo,
      githubToken: "fixture-token",
      readArtifact: () => artifact,
      fetchJson: async () => null,
    });
    expect(provenance.get(id)).toBe(PROVENANCE_STATE.FAILED);
  });
});

// ─── Both production callers actually wire it ────────────────────────────────

describe("every production caller supplies the protected context", () => {
  const REQUIRED = [
    "bundleId",
    "evidenceDir",
    "manifestYaml",
    "resolveSigningKey",
    "resolveClosureManifest",
    "provenance",
  ];

  it.each([
    ["scripts/validate-stage-acceptance.mjs"],
    ["scripts/validate-bundle-manifests.mjs"],
  ])("%s passes every required context field", (file) => {
    const src = readFileSync(join(REPO_ROOT, file), "utf-8");
    const call = /evaluateInvariantClosure\((.*?)\n\s*\}\);/s.exec(src);
    expect(call, `${file} has no evaluateInvariantClosure call`).not.toBeNull();
    for (const field of REQUIRED) {
      expect(call![1], `${file} omits ${field}`).toContain(field);
    }
  });

  it("has no other production call site", () => {
    const r = spawnSync(
      "bash",
      ["-c", "grep -rln 'evaluateInvariantClosure(' --include=*.mjs scripts/ | sort"],
      { cwd: REPO_ROOT, encoding: "utf-8" },
    );
    const files = (r.stdout ?? "").trim().split("\n").filter(Boolean);
    expect(files.sort()).toEqual([
      "scripts/lib/invariant-closure.mjs",
      "scripts/validate-bundle-manifests.mjs",
      "scripts/validate-stage-acceptance.mjs",
    ]);
  });
});

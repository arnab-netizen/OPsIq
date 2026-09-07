/**
 * G-1 — Stage 7 invariant proofs are bound to ACCEPTED evidence artifacts.
 *
 * Root cause under test: before G-1, `evaluateInvariantClosure` counted any
 * non-empty string in `proof_artifacts` as proof, so the literal text
 * "proved it" satisfied the same requirement as a captured, signed, provenance-
 * verified observation. The evidence artifact format existed but no closure gate
 * read it.
 *
 * Owner decision D-8, as implemented and asserted here:
 *   - an UNVERIFIED artifact may be committed and structurally validated;
 *   - an UNVERIFIED artifact may never satisfy a PROVEN invariant;
 *   - closure requires ACCEPTED provenance;
 *   - a PENDING invariant with no proof_artifacts remains valid.
 *
 * Every case drives a real temporary artifact directory through the real
 * resolution path. The central evidence-resolution path is never mocked.
 */

import { describe, it, expect, afterAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import YAML from "js-yaml";

import {
  ACCEPTANCE,
  PROVENANCE_STATE,
  SUBJECT_SHA_NOT_AUTHORIZED,
  SUBJECT_SHA_POLICY,
  buildEvidenceArtifact,
  evaluateSupersessionChain,
  isCanonicalArtifactReference,
  loadEvidenceArtifactIndex,
  resolveSubjectShaPolicy,
} from "../../../scripts/lib/evidence-artifact.mjs";
import { evaluateInvariantClosure } from "../../../scripts/lib/invariant-closure.mjs";

const root = join(__dirname, "..", "..", "..");
const STAGE_7_ID = "factory-stage-7-closure";
const { privateKey: SIGNING_KEY } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const SUBJECT_SHA = "f129fb8633b38230c16fb44aed8f5f90c8f4b8a9";
/**
 * Owner decision D-18, authorized 2026-09-05: the one commit Stage 7 evidence may
 * describe. This is PR #419's merge commit — the security-fixed runtime that
 * removed the confirmed sanitizeTokenForLogging OAuth-access-token prefix
 * disclosure. It supersedes D-17 (3647b8ce), which HAD become active governance
 * (PR #417 merged, production genuinely deployed at that SHA) but was never
 * tagged and never had evidence captured against it before production advanced.
 */
const AUTHORIZED_SUBJECT_SHA = "0c06fe4399fb4dc81bb7fb9f41db70b921e9ec06";
/**
 * D-17, 2026-09-05 (amendment A17's corrected value): the PREVIOUS active
 * subject, now historical. D-18's SINGLE_ACTIVE_SUBJECT policy does not
 * authorize this commit. No D17 tag was ever created and no D17-subject
 * evidence was ever captured against it.
 */
const D17_SUBJECT_SHA = "3647b8ce95fd4c75640a6062a3a9ed235577f023";
/**
 * D-17 as originally proposed, 2026-09-04, while the D-17 PR was still unmerged:
 * "RUNTIME_CANDIDATE_SHA= ae15813c417901a9b48b012303f666e7591d1275". It never became
 * an active subject — no evidence was ever captured against it, and that PR never
 * merged carrying that value before main advanced past it. Neither D-17 nor D-18's
 * SINGLE_ACTIVE_SUBJECT policy authorizes this commit.
 */
const OLD_UNMERGED_D17_CANDIDATE_SHA = "ae15813c417901a9b48b012303f666e7591d1275";
/**
 * Owner decision D-16, 2026-09-03: an earlier active subject, now historical.
 * D-18's SINGLE_ACTIVE_SUBJECT policy does not authorize this commit. The one
 * committed evidence artifact (evd_147fce5b18cdeeebf9d9b0b9778b8f06) still declares
 * this as its subject_sha — that is real, unaltered history — but it is no longer
 * the authorized subject.
 */
const D16_SUBJECT_SHA = "789768b99d5e8996c3f48671b188fa5ba0c51d04";

const CANONICAL_IDS = Array.from({ length: 16 }, (_, i) => `S7-I${i + 1}`);

/** Contract lane + proof_type for the invariants these cases exercise. */
const CONTRACT: Record<string, { lane: string; proofType: string }> = {
  "S7-I1": { lane: "LANE_C", proofType: "production_runtime_check" },
  "S7-I2": { lane: "LANE_C", proofType: "production_migration_check" },
  "S7-I11": { lane: "LANE_E", proofType: "simulation_adversarial" },
  "S7-I12": { lane: "LANE_E", proofType: "simulation_runbook_recovery" },
};

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Write artifacts to a fresh directory under their canonical filenames. */
function writeArtifacts(
  artifacts: Array<Record<string, unknown>>,
  { fileNameFor }: { fileNameFor?: (a: Record<string, unknown>) => string } = {},
): string {
  const dir = tempDir("opsiq-g1-evidence-");
  for (const artifact of artifacts) {
    const name = fileNameFor ? fileNameFor(artifact) : `${artifact.artifact_id}.json`;
    writeFileSync(join(dir, name), JSON.stringify(artifact, null, 2), "utf8");
  }
  return dir;
}

/** Signed artifact whose signature actually verifies (built, not mutated). */
function signedArtifact(invariantId: string, extra: Record<string, unknown> = {}) {
  const contract = CONTRACT[invariantId] ?? { lane: "LANE_C", proofType: "production_runtime_check" };
  return buildEvidenceArtifact(
    {
      invariant_id: invariantId,
      lane: contract.lane,
      proof_type: contract.proofType,
      environment: contract.lane === "LANE_E" ? "isolated_simulation" : "production",
      method: "http_probe",
      captured_at_utc: "2026-08-03T12:00:00.000Z",
      subject_sha: SUBJECT_SHA,
      // LANE_E is observed in isolation and must not name a deployment.
      deployment_id: contract.lane === "LANE_E" ? null : "dpl_GrLZL3XK8jufwybVSMc1sDdS73oD",
      assertion: `${invariantId} observed`,
      result: "PASS",
      raw_observation: `observation for ${invariantId}`,
      replay_command: "npm run verify",
      repository: "arnab-netizen/OPsIq",
      workflow: "Stage 7 Evidence Capture",
      workflow_ref: "arnab-netizen/OPsIq/.github/workflows/capture.yml@refs/heads/main",
      job: "capture",
      run_id: "30811454916",
      run_number: 1,
      run_attempt: 1,
      run_started_at: "2026-08-03T11:55:37Z",
      actor: "arnab-netizen",
      event_name: "workflow_dispatch",
      ...extra,
    },
    { signingKey: SIGNING_KEY },
  ) as Record<string, unknown>;
}

/** Provenance map marking every supplied artifact VERIFIED. */
function verifiedProvenance(...artifacts: Array<Record<string, unknown>>) {
  const map = new Map<string, string>();
  for (const a of artifacts) map.set(a.artifact_id as string, PROVENANCE_STATE.VERIFIED);
  return map;
}

function manifestWith(invariants: Record<string, unknown>, status = "CLOSED") {
  return {
    id: STAGE_7_ID,
    stage: "factory-7",
    artifact_type: "factory_stage_closure",
    status,
    name: "Factory Stage 7 Closure",
    closure_conditions: { "5_invariant_proof": "Every invariant PROVEN with proof, or waived." },
    invariants,
    invariant_waivers: [],
    required_evidence: {
      pr_sha: SUBJECT_SHA,
      merge_sha: SUBJECT_SHA,
      main_integration_run: "30811454916",
      db_verification_run: "30811454916",
    },
  };
}

function pending(id: string) {
  return { name: id, status: "PENDING", proof_artifacts: [], proof_lane: CONTRACT[id]?.lane, proof_type: CONTRACT[id]?.proofType };
}

function provenWith(id: string, refs: unknown[]) {
  return { name: id, status: "PROVEN", proof_artifacts: refs, proof_lane: CONTRACT[id]?.lane, proof_type: CONTRACT[id]?.proofType };
}

/** All sixteen PENDING except the named ids, which take the supplied entry. */
function contractWith(overrides: Record<string, unknown>) {
  const invariants: Record<string, unknown> = {};
  for (const id of CANONICAL_IDS) invariants[id] = overrides[id] ?? pending(id);
  return invariants;
}

/** Evaluate closure against a real artifact directory. */
function evaluate(
  invariants: Record<string, unknown>,
  { evidenceDir, provenance, status = "CLOSED" }: { evidenceDir: string; provenance?: Map<string, string>; status?: string },
) {
  return evaluateInvariantClosure(manifestWith(invariants, status), {
    bundleId: STAGE_7_ID,
    evidenceDir,
    signingKey: SIGNING_KEY,
    provenance,
  }) as {
    structuralViolations: string[];
    proofViolations: string[];
    proven: string[];
    unmet: string[];
    waived: string[];
  };
}

const allViolations = (r: { structuralViolations: string[]; proofViolations: string[] }) =>
  [...r.structuralViolations, ...r.proofViolations].join("\n");

describe("G-1 — proof reference format", () => {
  it("accepts only evd_ followed by 32 lowercase hex characters", () => {
    expect(isCanonicalArtifactReference(`evd_${"a".repeat(32)}`)).toBe(true);
    expect(isCanonicalArtifactReference(`evd_${"a".repeat(31)}`)).toBe(false);
    expect(isCanonicalArtifactReference(`evd_${"a".repeat(33)}`)).toBe(false);
    expect(isCanonicalArtifactReference(`EVD_${"A".repeat(32)}`)).toBe(false);
    expect(isCanonicalArtifactReference(`evd_${"g".repeat(32)}`)).toBe(false);
  });

  it("rejects prose, paths, URLs and labels", () => {
    for (const bad of [
      "proved it",
      "see the CI run",
      "docs/opsiq/evidence/stage-7/artifacts/x.json",
      "/etc/passwd",
      "../../secrets.json",
      "https://github.com/arnab-netizen/OPsIq/actions/runs/1",
      "LANE_C evidence",
      "",
    ]) {
      expect(isCanonicalArtifactReference(bad)).toBe(false);
    }
  });

  it("rejects a Unicode lookalike id", () => {
    // Cyrillic 'а' (U+0430) in place of ASCII 'a'.
    expect(isCanonicalArtifactReference(`evd_${"а".repeat(32)}`)).toBe(false);
  });
});

describe("G-1 — PENDING invariants stay valid", () => {
  it("PENDING with empty proof_artifacts passes, requiring no artifact", () => {
    const result = evaluate(contractWith({}), { evidenceDir: writeArtifacts([]), status: "PENDING" });
    expect(result.structuralViolations).toHaveLength(0);
    expect(result.proven).toHaveLength(0);
  });

  it("PENDING with a malformed reference still fails structural validation", () => {
    const invariants = contractWith({
      "S7-I1": { name: "S7-I1", status: "PENDING", proof_artifacts: ["proved it"], proof_lane: "LANE_C" },
    });
    const result = evaluate(invariants, { evidenceDir: writeArtifacts([]), status: "PENDING" });
    expect(result.structuralViolations.join("\n")).toContain("is free text");
  });

  // D-17 (2026-09-04) atomically demoted S7-I11 from PROVEN back to PENDING when the
  // active subject advanced past D-16: evd_147fce5b18cdeeebf9d9b0b9778b8f06 declares
  // subject_sha 789768b9 (D-16), which neither D-17 nor D-18's SINGLE_ACTIVE_SUBJECT
  // policy authorizes. All sixteen invariants are therefore PENDING with empty
  // proof_artifacts, and the bundle stays PENDING. This is asserted per-invariant,
  // not by a bare count: a count would still pass if one invariant silently carried
  // a stale reference while another went empty.
  it("the live Stage 7 contract evaluates as fully PENDING under D-18", () => {
    const manifest = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const result = evaluateInvariantClosure(manifest, { bundleId: STAGE_7_ID }) as {
      structuralViolations: string[]; proven: string[]; total: number;
    };
    expect(result.structuralViolations).toHaveLength(0);
    expect(result.total).toBe(16);
    expect(result.proven).toEqual([]);

    const invariants = (manifest as { invariants: Record<string, {
      status: string; proof_artifacts: string[];
    }> }).invariants;
    for (const [id, inv] of Object.entries(invariants)) {
      expect(inv.status, id).toBe("PENDING");
      expect(inv.proof_artifacts, id).toEqual([]);
    }
  });
});

describe("G-1 — PROVEN requires an eligible ACCEPTED artifact", () => {
  it("free text fails", () => {
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", ["proved it"]) }), {
      evidenceDir: writeArtifacts([]),
    });
    expect(allViolations(r)).toContain("is free text");
    expect(r.proven).not.toContain("S7-I1");
  });

  it("a URL fails", () => {
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", ["https://github.com/x/y/actions/runs/1"]) }), {
      evidenceDir: writeArtifacts([]),
    });
    expect(allViolations(r)).toContain("is a URL");
  });

  it("a path, including traversal, fails", () => {
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", ["../../../etc/passwd"]) }), {
      evidenceDir: writeArtifacts([]),
    });
    expect(allViolations(r)).toContain("is a path");
  });

  it("a well-formed reference to a nonexistent artifact fails", () => {
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [`evd_${"a".repeat(32)}`]) }), {
      evidenceDir: writeArtifacts([]),
    });
    expect(allViolations(r)).toContain("resolves to no artifact");
  });

  it("an artifact filed under the wrong filename fails", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact], { fileNameFor: () => "wrong-name.json" });
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toMatch(/must be named|resolves to no artifact|structurally invalid/);
  });

  it("an artifact whose stored id does not match its content fails", () => {
    const artifact = signedArtifact("S7-I1");
    const forgedId = `evd_${"b".repeat(32)}`;
    const tampered = { ...artifact, artifact_id: forgedId };
    const dir = writeArtifacts([tampered]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [forgedId]) }), {
      evidenceDir: dir, provenance: new Map([[forgedId, PROVENANCE_STATE.VERIFIED]]),
    });
    expect(allViolations(r)).toContain("structurally invalid");
  });

  it("an artifact with a broken content hash fails", () => {
    const artifact = signedArtifact("S7-I1");
    const observation = artifact.observation as Record<string, unknown>;
    const tampered = { ...artifact, observation: { ...observation, content_hash: "0".repeat(64) } };
    const dir = writeArtifacts([tampered], { fileNameFor: () => `${artifact.artifact_id}.json` });
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("structurally invalid");
  });

  it("an UNVERIFIED artifact fails — D-8", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact]);
    // No provenance supplied, so acceptance caps at UNVERIFIED.
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), { evidenceDir: dir });
    expect(allViolations(r)).toContain("not ACCEPTED");
    expect(allViolations(r)).toContain("D-8");
    expect(r.proven).not.toContain("S7-I1");
  });

  it("an unsigned artifact cannot reach ACCEPTED even with verified provenance", () => {
    const artifact = buildEvidenceArtifact(
      {
        invariant_id: "S7-I1", lane: "LANE_C", proof_type: "production_runtime_check",
        environment: "production", method: "http_probe", captured_at_utc: "2026-08-03T12:00:00.000Z",
        subject_sha: SUBJECT_SHA, deployment_id: "dpl_GrLZL3XK8jufwybVSMc1sDdS73oD",
        assertion: "observed", result: "PASS", raw_observation: "obs",
        replay_command: "npm run verify", repository: "arnab-netizen/OPsIq",
        workflow: "W", workflow_ref: "arnab-netizen/OPsIq/.github/workflows/w.yml@refs/heads/main",
        job: "j", run_id: "1", run_number: 1, run_attempt: 1,
        run_started_at: "2026-08-03T11:55:37Z", actor: "arnab-netizen", event_name: "workflow_dispatch",
      },
      { signingKey: null },
    ) as Record<string, unknown>;
    const dir = writeArtifacts([artifact]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("not ACCEPTED");
  });

  it("a REJECTED artifact fails", () => {
    const artifact = signedArtifact("S7-I1");
    const broken = { ...artifact, invariant_id: "NOT-AN-INVARIANT" };
    const dir = writeArtifacts([broken], { fileNameFor: () => `${artifact.artifact_id}.json` });
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("structurally invalid");
  });

  it("an ACCEPTED artifact bound to the invariant passes", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(r.proven).toContain("S7-I1");
    expect(r.proofViolations.filter((v) => /invariant S7-I1 —/.test(v))).toHaveLength(0);
  });
});

describe("G-1 — binding rules", () => {
  it("an artifact bound to another invariant cannot be reused", () => {
    const artifact = signedArtifact("S7-I2");
    const dir = writeArtifacts([artifact]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("is bound to invariant S7-I2, not S7-I1");
  });

  it("an artifact in an incompatible lane fails", () => {
    const artifact = signedArtifact("S7-I12"); // LANE_E
    const dir = writeArtifacts([artifact]);
    const invariants = contractWith({
      "S7-I12": { name: "S7-I12", status: "PROVEN", proof_artifacts: [artifact.artifact_id], proof_lane: "LANE_C", proof_type: "simulation_runbook_recovery" },
    });
    const r = evaluate(invariants, { evidenceDir: dir, provenance: verifiedProvenance(artifact) });
    expect(allViolations(r)).toContain("is lane LANE_E, but S7-I12 requires LANE_C");
  });

  it("an artifact with an incompatible proof_type fails", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact]);
    const invariants = contractWith({
      "S7-I1": { name: "S7-I1", status: "PROVEN", proof_artifacts: [artifact.artifact_id], proof_lane: "LANE_C", proof_type: "production_migration_check" },
    });
    const r = evaluate(invariants, { evidenceDir: dir, provenance: verifiedProvenance(artifact) });
    expect(allViolations(r)).toContain("requires production_migration_check");
  });

  it("a compound contract lane accepts either declared lane", () => {
    const artifact = signedArtifact("S7-I12"); // LANE_E
    const dir = writeArtifacts([artifact]);
    const invariants = contractWith({
      "S7-I12": { name: "S7-I12", status: "PROVEN", proof_artifacts: [artifact.artifact_id], proof_lane: "LANE_C+LANE_E", proof_type: "simulation_runbook_recovery" },
    });
    const r = evaluate(invariants, { evidenceDir: dir, provenance: verifiedProvenance(artifact) });
    expect(r.proven).toContain("S7-I12");
  });

  it("a duplicate reference under one invariant fails", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact]);
    const r = evaluate(
      contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id, artifact.artifact_id]) }),
      { evidenceDir: dir, provenance: verifiedProvenance(artifact) },
    );
    expect(r.structuralViolations.join("\n")).toContain("more than once");
  });

  it("an artifact whose subject_sha is not a full commit SHA fails", () => {
    const artifact = signedArtifact("S7-I1");
    const malformed = { ...artifact, subject_sha: "f129fb8" };
    const dir = writeArtifacts([malformed], { fileNameFor: () => `${artifact.artifact_id}.json` });
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("is not a full 40-character lowercase commit SHA");
    expect(r.proven).not.toContain("S7-I1");
  });

  it("evidence captured against a different commit fails the subject-SHA policy", () => {
    const artifact = signedArtifact("S7-I1", { subject_sha: "0".repeat(40) });
    const dir = writeArtifacts([artifact]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(allViolations(r)).toContain("SUBJECT_SHA_NOT_AUTHORIZED");
  });
});

describe("G-1 — supersession", () => {
  function chain() {
    const original = signedArtifact("S7-I1", { assertion: "first observation" });
    const replacement = signedArtifact("S7-I1", { assertion: "corrected observation", supersedes: original.artifact_id });
    return { original, replacement };
  }

  it("a superseded artifact cannot back a proof", () => {
    const { original, replacement } = chain();
    const dir = writeArtifacts([original, replacement]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [original.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(original, replacement),
    });
    expect(allViolations(r)).toContain("has been superseded");
  });

  it("the terminal superseding artifact passes", () => {
    const { original, replacement } = chain();
    const dir = writeArtifacts([original, replacement]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [replacement.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(original, replacement),
    });
    expect(r.proven).toContain("S7-I1");
  });

  it("a chain through a missing artifact fails closed", () => {
    const replacement = signedArtifact("S7-I1", { supersedes: `evd_${"c".repeat(32)}` });
    const dir = writeArtifacts([replacement]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [replacement.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(replacement),
    });
    expect(allViolations(r)).toContain("not present in");
  });

  it("cross-invariant supersession is invalid", () => {
    const other = signedArtifact("S7-I2");
    const replacement = signedArtifact("S7-I1", { supersedes: other.artifact_id });
    const dir = writeArtifacts([other, replacement]);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [replacement.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(other, replacement),
    });
    expect(allViolations(r)).toContain("supersession is only meaningful within one invariant");
  });

  it("a supersession cycle fails closed", () => {
    // Two artifacts naming each other requires post-hoc editing, which is exactly
    // the shape a forger would attempt.
    const a = signedArtifact("S7-I1", { assertion: "a" });
    const b = signedArtifact("S7-I1", { assertion: "b", supersedes: a.artifact_id });
    const aCycled = { ...a, supersedes: b.artifact_id };
    const dir = writeArtifacts([aCycled, b], {
      fileNameFor: (art) => `${art.artifact_id}.json`,
    });
    const { byId } = loadEvidenceArtifactIndex({ dir, signingKey: SIGNING_KEY });
    // The tampered artifact no longer matches its id, so it is rejected outright;
    // either outcome is a closed door, which is what the rule requires.
    expect(byId.size).toBeGreaterThan(0);
    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [a.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(a, b),
    });
    expect(allViolations(r).length).toBeGreaterThan(0);
  });

  // `supersedes` is part of the artifact-id input, so a cycle and a self-reference
  // are both unreachable through buildEvidenceArtifact — the id changes the moment
  // the field does. The walker is therefore driven directly, or the rules above
  // would only ever be reached by way of the hash check and would pass vacuously.
  const asRecord = (artifactId: string, supersedes: string | null, invariantId = "S7-I1") => ({
    artifactId, supersedes, invariantId, level: ACCEPTANCE.UNVERIFIED, violations: [] as string[],
  });

  it("self-supersession is invalid", () => {
    const id = `evd_${"a".repeat(32)}`;
    const record = asRecord(id, id);
    const violations = evaluateSupersessionChain(record, new Map([[id, record]]));
    expect(violations.join("\n")).toContain("supersedes itself");
  });

  it("the walker names a two-artifact cycle rather than looping", () => {
    const first = `evd_${"a".repeat(32)}`;
    const second = `evd_${"b".repeat(32)}`;
    const a = asRecord(first, second);
    const b = asRecord(second, first);
    const byId = new Map([[first, a], [second, b]]);
    const violations = evaluateSupersessionChain(a, byId);
    expect(violations.join("\n")).toContain("supersession cycle detected");
  });

  it("the walker terminates on a longer cycle", () => {
    const ids = ["a", "b", "c"].map((c) => `evd_${c.repeat(32)}`);
    const records = ids.map((id, i) => asRecord(id, ids[(i + 1) % ids.length]));
    const byId = new Map(records.map((r) => [r.artifactId, r]));
    expect(evaluateSupersessionChain(records[0], byId).join("\n")).toContain("supersession cycle detected");
  });

  it("a chain through a REJECTED artifact fails closed", () => {
    const first = `evd_${"a".repeat(32)}`;
    const second = `evd_${"b".repeat(32)}`;
    const broken = { ...asRecord(second, null), level: ACCEPTANCE.REJECTED, violations: ["broken"] };
    const head = asRecord(first, second);
    const byId = new Map([[first, head], [second, broken]]);
    expect(evaluateSupersessionChain(head, byId).join("\n")).toContain("is REJECTED");
  });
});

describe("G-1 — closure-level enforcement", () => {
  it("closure with one UNVERIFIED artifact fails", () => {
    const good = signedArtifact("S7-I1");
    const weak = signedArtifact("S7-I2");
    const dir = writeArtifacts([good, weak]);
    const invariants = contractWith({
      "S7-I1": provenWith("S7-I1", [good.artifact_id]),
      "S7-I2": provenWith("S7-I2", [weak.artifact_id]),
    });
    // Only the first artifact's provenance is verified.
    const r = evaluate(invariants, { evidenceDir: dir, provenance: verifiedProvenance(good) });
    expect(r.proven).toContain("S7-I1");
    expect(r.unmet).toContain("S7-I2");
  });

  it("closure with one free-text reference fails", () => {
    const good = signedArtifact("S7-I1");
    const dir = writeArtifacts([good]);
    const invariants = contractWith({
      "S7-I1": provenWith("S7-I1", [good.artifact_id]),
      "S7-I2": provenWith("S7-I2", ["see the run log"]),
    });
    const r = evaluate(invariants, { evidenceDir: dir, provenance: verifiedProvenance(good) });
    expect(r.structuralViolations.join("\n")).toContain("is free text");
    expect(r.unmet).toContain("S7-I2");
  });

  it("an artifact hidden in a subdirectory is read, rejected, and cannot back a proof", () => {
    // The scan is recursive precisely so this file cannot be ignored. A flat read
    // would report "0 artifacts present" over a malformed or secret-bearing file,
    // which is silence, not enforcement.
    const artifact = signedArtifact("S7-I1");
    const dir = tempDir("opsiq-g1-nested-");
    mkdirSync(join(dir, "archive"));
    writeFileSync(join(dir, "archive", `${artifact.artifact_id}.json`), JSON.stringify(artifact), "utf8");

    const { records, byId } = loadEvidenceArtifactIndex({ dir, signingKey: SIGNING_KEY });
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe(ACCEPTANCE.REJECTED);
    expect(records[0].violations.join("\n")).toContain("filed in a subdirectory");
    expect(byId.size).toBe(0);

    const r = evaluate(contractWith({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }), {
      evidenceDir: dir, provenance: verifiedProvenance(artifact),
    });
    expect(r.proven).not.toContain("S7-I1");
    expect(allViolations(r)).toContain("resolves to no artifact");
  });

  it("the validator exits non-zero on a nested artifact rather than reporting an empty directory", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = tempDir("opsiq-g1-nested-cli-");
    mkdirSync(join(dir, "archive"));
    writeFileSync(join(dir, "archive", "junk.json"), JSON.stringify({ ...artifact, extra: 1 }), "utf8");

    let code = 0;
    let stdout = "";
    try {
      stdout = execFileSync("node", ["scripts/validate-evidence-artifacts.mjs", "--dir", dir], {
        cwd: root, encoding: "utf8", stdio: "pipe",
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      code = e.status ?? 1;
      stdout = e.stdout ?? "";
    }
    expect(code).toBe(1);
    expect(stdout).not.toContain("0 artifacts present");
  });

  it("an empty artifact directory proves nothing", () => {
    const dir = writeArtifacts([]);
    const invariants = contractWith({ "S7-I1": provenWith("S7-I1", [`evd_${"d".repeat(32)}`]) });
    const r = evaluate(invariants, { evidenceDir: dir });
    expect(r.proven).toHaveLength(0);
  });

  it("a waived invariant keeps its existing behaviour and needs no artifact", () => {
    const manifest = manifestWith(contractWith({}), "CLOSED");
    manifest.invariant_waivers = [
      {
        invariant: "S7-I1",
        owner: "arnab-netizen",
        reason: "Not applicable to the private pilot scope.",
        date: "2026-08-03",
        acknowledgement: "I accept this invariant is not proven.",
      },
    ];
    const result = evaluateInvariantClosure(manifest, {
      bundleId: STAGE_7_ID,
      evidenceDir: writeArtifacts([]),
    }) as { waived: string[] };
    expect(result.waived).toContain("S7-I1");
  });
});

describe("G-1 — subject-SHA policy fails closed when the contract states none", () => {
  /**
   * Root cause this block exists for: the eligibility path applied the subject-SHA
   * rule only when the allowlist was non-empty, so a contract that named no
   * authorized commit had the rule skipped rather than enforced. The live Stage 7
   * contract carries four null required_evidence fields, so the rule was inert on
   * the real contract — an artifact bearing any commit at all would have been
   * accepted the moment ACCEPTED provenance became reachable.
   *
   * An empty allowlist is not "allow all". It is the absence of an authorization.
   */

  /** The real Stage 7 contract exactly as it sits on disk, with invariant overrides. */
  function realContract(overrides: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const invariants = { ...(raw.invariants as Record<string, unknown>) };
    for (const [id, entry] of Object.entries(overrides)) invariants[id] = entry;
    return { ...raw, ...patch, invariants };
  }

  /**
   * The real contract with its D-9 authorization stripped — the shape it had before
   * the owner named a subject SHA, and the shape any future stage contract has
   * before its own D-9.
   *
   * These cases must keep testing the MISSING state on a realistic contract. Reading
   * the live file directly would silently stop exercising that state the moment a
   * SHA was authorized, which is exactly the kind of check that quietly stops
   * checking. The D-9 tests below read the live file unmodified instead.
   */
  function liveContract(overrides: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
    const m = realContract(overrides, patch);
    if (!("closure_subject_sha" in patch)) delete m.closure_subject_sha;
    delete m.closure_subject_sha_authorization;
    return m;
  }

  function evaluateLive(manifest: Record<string, unknown>, dir: string, provenance?: Map<string, string>) {
    return evaluateInvariantClosure(manifest, {
      bundleId: STAGE_7_ID, evidenceDir: dir, signingKey: SIGNING_KEY, provenance,
    }) as { structuralViolations: string[]; proofViolations: string[]; proven: string[]; waived: string[] };
  }

  const withPolicy = (shas: string[]) => ({
    required_evidence: {
      pr_sha: shas[0] ?? null, merge_sha: shas[1] ?? shas[0] ?? null,
      main_integration_run: "1", db_verification_run: "1",
    },
  });

  it("a contract with no authorized subject SHA resolves MISSING", () => {
    const policy = resolveSubjectShaPolicy(liveContract());
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.MISSING);
    expect(policy.authorized).toEqual([]);
  });

  it("no-policy contract, PENDING with empty proof_artifacts, still passes", () => {
    const r = evaluateLive(liveContract(), writeArtifacts([]));
    expect(r.proofViolations.filter((v) => v.includes("SUBJECT_SHA"))).toHaveLength(0);
    expect(r.structuralViolations).toHaveLength(0);
  });

  it("no-policy contract, PROVEN with an otherwise-eligible artifact, fails SUBJECT_SHA_POLICY_MISSING", () => {
    const artifact = signedArtifact("S7-I1");
    const dir = writeArtifacts([artifact]);
    const r = evaluateLive(
      liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      dir, verifiedProvenance(artifact),
    );
    expect(allViolations(r)).toContain(SUBJECT_SHA_POLICY.MISSING);
    expect(r.proven).not.toContain("S7-I1");
  });

  it("an empty allowlist never means allow all", () => {
    // Every one of these is a commit an implicit fallback might have reached for.
    const candidates: Record<string, string> = {
      "all-zero SHA": "0".repeat(40),
      "current main SHA": SUBJECT_SHA,
      "a deployment-shaped SHA": "a77bc58a6ba6751cb402d5bb3bc6186e0079cc55",
      "an arbitrary SHA": "9".repeat(40),
    };
    for (const [label, sha] of Object.entries(candidates)) {
      const artifact = signedArtifact("S7-I1", { subject_sha: sha });
      const r = evaluateLive(
        liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
        writeArtifacts([artifact]), verifiedProvenance(artifact),
      );
      expect(allViolations(r), label).toContain(SUBJECT_SHA_POLICY.MISSING);
      expect(r.proven, label).not.toContain("S7-I1");
    }
  });

  it("the artifact's own subject_sha never authorizes itself", () => {
    const sha = "7".repeat(40);
    const artifact = signedArtifact("S7-I1", { subject_sha: sha });
    const r = evaluateLive(
      liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      writeArtifacts([artifact]), verifiedProvenance(artifact),
    );
    expect(allViolations(r)).toContain(SUBJECT_SHA_POLICY.MISSING);
  });

  it("an explicit policy naming the artifact's commit passes", () => {
    const artifact = signedArtifact("S7-I1");
    const r = evaluateLive(
      liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }, withPolicy([SUBJECT_SHA])),
      writeArtifacts([artifact]), verifiedProvenance(artifact),
    );
    expect(r.proven).toContain("S7-I1");
  });

  it("an explicit policy excluding the artifact's commit fails SUBJECT_SHA_NOT_AUTHORIZED", () => {
    const artifact = signedArtifact("S7-I1", { subject_sha: "1".repeat(40) });
    const r = evaluateLive(
      liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }, withPolicy([SUBJECT_SHA])),
      writeArtifacts([artifact]), verifiedProvenance(artifact),
    );
    expect(allViolations(r)).toContain(SUBJECT_SHA_NOT_AUTHORIZED);
    expect(allViolations(r)).not.toContain(SUBJECT_SHA_POLICY.MISSING);
    expect(r.proven).not.toContain("S7-I1");
  });

  it("multiple authorized SHAs are deterministic and deduplicated", () => {
    const second = "2".repeat(40);
    const policy = resolveSubjectShaPolicy(liveContract({}, withPolicy([SUBJECT_SHA, second])));
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.PRESENT);
    expect(policy.authorized).toEqual([second, SUBJECT_SHA]); // merge_sha, then pr_sha — declaration order
    const dup = resolveSubjectShaPolicy(liveContract({}, withPolicy([SUBJECT_SHA, SUBJECT_SHA])));
    expect(dup.authorized).toEqual([SUBJECT_SHA]);
    // An artifact on either authorized commit is accepted.
    for (const sha of [SUBJECT_SHA, second]) {
      const artifact = signedArtifact("S7-I1", { subject_sha: sha });
      const r = evaluateLive(
        liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }, withPolicy([SUBJECT_SHA, second])),
        writeArtifacts([artifact]), verifiedProvenance(artifact),
      );
      expect(r.proven, sha).toContain("S7-I1");
    }
  });

  it("a malformed policy fails structurally rather than shortening the allowlist", () => {
    for (const bad of ["f129fb8", "F".repeat(40), 42, ["a".repeat(40)], {}]) {
      const manifest = liveContract({}, {
        required_evidence: { pr_sha: SUBJECT_SHA, merge_sha: bad, main_integration_run: "1", db_verification_run: "1" },
      });
      const policy = resolveSubjectShaPolicy(manifest);
      expect(policy.state, JSON.stringify(bad)).toBe(SUBJECT_SHA_POLICY.MALFORMED);
      // The one well-formed sibling must NOT survive as a silently shorter allowlist.
      expect(policy.authorized, JSON.stringify(bad)).toEqual([]);
      const artifact = signedArtifact("S7-I1");
      const r = evaluateLive(
        { ...manifest, invariants: { ...(manifest.invariants as object), "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) } },
        writeArtifacts([artifact]), verifiedProvenance(artifact),
      );
      expect(r.structuralViolations.join("\n"), JSON.stringify(bad)).toContain(SUBJECT_SHA_POLICY.MALFORMED);
      expect(r.proven, JSON.stringify(bad)).not.toContain("S7-I1");
    }
  });

  it("an absent or null field is MISSING, not MALFORMED", () => {
    expect(resolveSubjectShaPolicy({}).state).toBe(SUBJECT_SHA_POLICY.MISSING);
    expect(resolveSubjectShaPolicy({ required_evidence: null }).state).toBe(SUBJECT_SHA_POLICY.MISSING);
    expect(resolveSubjectShaPolicy({ closure_subject_sha: null }).state).toBe(SUBJECT_SHA_POLICY.MISSING);
    expect(resolveSubjectShaPolicy(null).state).toBe(SUBJECT_SHA_POLICY.MISSING);
  });

  it("a whitespace-padded SHA is malformed, not trimmed into authorization", () => {
    const policy = resolveSubjectShaPolicy({ closure_subject_sha: ` ${SUBJECT_SHA} ` });
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.MALFORMED);
    expect(policy.authorized).toEqual([]);
  });

  it("a PENDING invariant with a malformed reference still fails as before", () => {
    const r = evaluateLive(
      liveContract({ "S7-I1": { name: "S7-I1", status: "PENDING", proof_artifacts: ["proved it"] } }),
      writeArtifacts([]),
    );
    expect(r.structuralViolations.join("\n")).toContain("is free text");
  });

  it("waived invariants are unaffected by the subject-SHA policy", () => {
    const manifest = liveContract();
    (manifest as { invariant_waivers: unknown[] }).invariant_waivers = [{
      invariant: "S7-I1", owner: "arnab-netizen", reason: "Not applicable to the private pilot scope.",
      date: "2026-08-03", acknowledgement: "I accept this invariant is not proven.",
    }];
    const r = evaluateLive(manifest, writeArtifacts([]));
    expect(r.waived).toContain("S7-I1");
    expect(r.structuralViolations).toHaveLength(0);
  });

  it("closure fails when every artifact is otherwise eligible but no policy exists", () => {
    // S7-I11 is blocked pending D-4; use the remaining 15 invariants — enough to prove the point.
    const ids = CANONICAL_IDS.filter((id) => id !== "S7-I11");
    const artifacts = ids.map((id) => signedArtifact(id));
    const dir = writeArtifacts(artifacts);
    const overrides: Record<string, unknown> = {};
    ids.forEach((id, i) => { overrides[id] = provenWith(id, [artifacts[i].artifact_id]); });
    const r = evaluateLive(liveContract(overrides), dir, verifiedProvenance(...artifacts));
    expect(r.proven).toHaveLength(0);
    expect(allViolations(r)).toContain(SUBJECT_SHA_POLICY.MISSING);
  });

  it("a G-2-style verified provenance map cannot make an artifact usable while the policy is absent", () => {
    const artifact = signedArtifact("S7-I1");
    const everythingVerified = new Map<string, string>([[artifact.artifact_id as string, PROVENANCE_STATE.VERIFIED]]);
    const r = evaluateLive(
      liveContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      writeArtifacts([artifact]), everythingVerified,
    );
    expect(r.proven).not.toContain("S7-I1");
    expect(allViolations(r)).toContain(SUBJECT_SHA_POLICY.MISSING);
  });

  /**
   * D-18 (authorized 2026-09-05, PR #419 merge SHA 0c06fe43) is the current subject:
   * the exact production-deployed commit that removed the confirmed
   * sanitizeTokenForLogging OAuth-access-token prefix disclosure, deployed READY at
   * that exact SHA. It supersedes D-17 (3647b8ce, PR #418 merge, corrected in place
   * 2026-09-05 by amendment A17 from the never-activated ae15813c/PR #416 candidate
   * originally proposed 2026-09-04). D-17 HAD become active governance — PR #417
   * merged and production was genuinely deployed at 3647b8ce — but no D17 tag was
   * ever created and no D17-subject evidence was ever captured before production
   * advanced to 0c06fe43. D-17 superseded D-16 (789768b9, PR #404 merge), the first
   * commit carrying the complete known capture-path repair set (#391-#394, #396,
   * #401-#402) together with both observation credential-disclosure repairs. Under
   * owner decision D17_TRANSITION_POLICY=SINGLE_ACTIVE_SUBJECT, neither D-16 nor
   * D-17 is carried forward in the active subject allowlist, and S7-I11 — the one
   * invariant D-16 left PROVEN — stays demoted to PENDING with proof_artifacts []
   * (amendment A16; D-18 does not touch it), because no artifact declares D-18's
   * subject_sha. D-16 and D-17 remain historical and unmodified; amendments A15 and
   * A17 still record them. The guarantee worth holding is narrower and stricter:
   * exactly one commit is authorized at a time, it is the one the owner named, and
   * authorizing it moved nothing else in the contract to PROVEN.
   */
  it("the live contract authorizes exactly the owner-named subject SHA", () => {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    expect(raw.closure_subject_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    const policy = resolveSubjectShaPolicy(raw);
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.PRESENT);
    expect(policy.authorized).toEqual([AUTHORIZED_SUBJECT_SHA]);
  });

  it("authorizing a subject SHA is not closure evidence and proves nothing", () => {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    // The four closure-evidence fields describe the PR that closes Stage 7. Naming
    // the commit evidence may describe is a different statement, and must not be
    // written into them — doing so would claim closure evidence that does not exist.
    expect(raw.required_evidence).toEqual({
      pr_sha: null, merge_sha: null, main_integration_run: null, db_verification_run: null,
    });
    expect(raw.status).toBe("PENDING");
    expect(raw.invariant_waivers).toEqual([]);
    const invariants = raw.invariants as Record<string, { status: string; proof_artifacts: unknown[] }>;
    expect(Object.keys(invariants)).toHaveLength(16);
    // Under D-18, every invariant is PENDING with empty proof_artifacts — including
    // S7-I11, atomically demoted when the active subject advanced past D-16 (see the
    // A16 amendment) and still untouched by the D-17->D-18 transition (amendment
    // A18). Authorizing a subject SHA proves nothing on its own; the bundle itself
    // remains PENDING above.
    for (const [id, entry] of Object.entries(invariants)) {
      expect(entry.status, id).toBe("PENDING");
      expect(entry.proof_artifacts, id).toEqual([]);
    }
  });

  it("an artifact on the authorized commit is accepted; any other commit is not", () => {
    const onAuthorized = signedArtifact("S7-I1", { subject_sha: AUTHORIZED_SUBJECT_SHA });
    const elsewhere = signedArtifact("S7-I1", { subject_sha: "3".repeat(40) });
    const liveShaContract = (a: Record<string, unknown>) =>
      realContract({ "S7-I1": provenWith("S7-I1", [a.artifact_id]) });

    const accepted = evaluateLive(liveShaContract(onAuthorized), writeArtifacts([onAuthorized]), verifiedProvenance(onAuthorized));
    expect(accepted.proven).toContain("S7-I1");

    const refused = evaluateLive(liveShaContract(elsewhere), writeArtifacts([elsewhere]), verifiedProvenance(elsewhere));
    expect(refused.proven).not.toContain("S7-I1");
    expect(allViolations(refused)).toContain(SUBJECT_SHA_NOT_AUTHORIZED);
  });

  it("no artifact becomes ACCEPTED merely because a subject SHA now exists", () => {
    // The policy is one eligibility rule among many. Satisfying it does not confer
    // acceptance: signature and provenance are still unverifiable in this context,
    // so the artifact remains UNVERIFIED and D-8 still refuses it.
    const artifact = signedArtifact("S7-I1", { subject_sha: AUTHORIZED_SUBJECT_SHA });
    const dir = writeArtifacts([artifact]);

    const { records } = loadEvidenceArtifactIndex({ dir, signingKey: SIGNING_KEY });
    expect(records[0].level).toBe(ACCEPTANCE.UNVERIFIED);

    // Evaluated the way the shipped gates evaluate it: no signing key, no provenance.
    const asShipped = evaluateInvariantClosure(
      realContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      { bundleId: STAGE_7_ID, evidenceDir: dir },
    ) as { proven: string[]; proofViolations: string[] };
    expect(asShipped.proven).not.toContain("S7-I1");
    expect(asShipped.proofViolations.join("\n")).toContain("not ACCEPTED");
  });

  it("the authorization record names the run and deployment it rests on", () => {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const auth = raw.closure_subject_sha_authorization as Record<string, unknown>;
    expect(auth.decision).toBe("D-18");
    // A superseded decision is not erased — the record must still name what it replaced.
    expect(auth.supersedes).toBe("D-17");
    expect(auth.superseded_sha).toBe(D17_SUBJECT_SHA);
    // The SHA the owner authorized must be the SHA CI tested and the SHA production
    // deployed. A record that names three different commits records nothing.
    expect(raw.closure_subject_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.main_integration_tested_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.vercel_production_commit_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.main_integration_run).toBe("33970892435");
    expect(auth.vercel_production_deployment).toBe("dpl_8owYgFhBFFwCPUfs2LMHBeQdGzgm");
    // Never the old, unmerged D-17 candidate, and never D-16 — a record naming either
    // commit anywhere in the authorized-facing fields would mean the transition did
    // not actually take effect.
    expect(raw.closure_subject_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(auth.main_integration_tested_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(auth.vercel_production_commit_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(raw.closure_subject_sha).not.toBe(D16_SUBJECT_SHA);
    // The migration provenance is D-17's, carried forward unchanged: PR #419
    // introduced no new Prisma migration of its own.
    const migration = auth.production_migration as Record<string, string>;
    expect(migration.name).toBe("20260905044623_open_beta_hardening");
    expect(migration.result).toBe("SUCCESS");
    expect(migration.post_deploy_status).toBe("DATABASE_SCHEMA_UP_TO_DATE");
    expect(migration.new_migration_this_decision).toBe(false);
    // The limitations must stay recorded, not quietly dropped once inconvenient.
    const unverified = auth.unverified as Record<string, string>;
    expect(unverified.production_http_health).toMatch(/egress/i);
    expect(unverified.production_http_health).toMatch(/UNVERIFIED_DIRECTLY|not independently/i);
    expect(unverified.production_schema_structural_verification).toMatch(/not applicable/i);
    expect(auth.deployment_success_is_not_readiness).toMatch(/not Owner Mode readiness/);
  });

  it("the contract still refuses closure — an authorized SHA is not a proven stage", () => {
    let code = 0;
    try {
      execFileSync("node", ["scripts/validate-stage-acceptance.mjs", "--mode", "closure", "--stage", "factory-7"], {
        cwd: root, encoding: "utf8", stdio: "pipe",
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
    }
    expect(code).not.toBe(0);
  });
});

describe("D-18 transition — subject policy hostile simulation", () => {
  /**
   * Owner decision D-18 (2026-09-05) advances closure_subject_sha from D-17
   * (3647b8ce, which HAD become active governance via PR #417 but was never
   * tagged and never had evidence captured against it) to D-18 (0c06fe43, PR
   * #419's merge — the security-fixed runtime that removed the confirmed
   * sanitizeTokenForLogging OAuth-access-token prefix disclosure), under the
   * same D17_TRANSITION_POLICY=SINGLE_ACTIVE_SUBJECT. S7-I11 was already PENDING
   * (demoted under D-17 by amendment A16) and stays PENDING — this transition
   * does not touch it. This block proves the transition is safe, that D-17, the
   * old unmerged D-17 candidate, and D-16 are all rejected as the active
   * subject, and that the mechanism would REJECT the unsafe alternative of
   * S7-I11 PROVEN citing the D-16 artifact under the new subject.
   */

  /** The real Stage 7 contract exactly as it sits on disk, with invariant overrides. */
  function realContract(overrides: Record<string, unknown> = {}) {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const invariants = { ...(raw.invariants as Record<string, unknown>) };
    for (const [id, entry] of Object.entries(overrides)) invariants[id] = entry;
    return { ...raw, invariants };
  }

  it("D18_ACTIVE_SUBJECT is authorized; D17, the old unmerged D17 candidate, and D16 are not", () => {
    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.PRESENT);
    expect(policy.authorized).toEqual([AUTHORIZED_SUBJECT_SHA]);
    expect(policy.authorized).not.toContain(D17_SUBJECT_SHA);
    expect(policy.authorized).not.toContain(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(policy.authorized).not.toContain(D16_SUBJECT_SHA);
  });

  // D-17 (3647b8ce) DID become active governance — PR #417 merged and production
  // was genuinely deployed at that SHA — but it was never tagged and never had
  // evidence captured against it before production advanced again under D-18.
  // The policy must reject it exactly as it rejects any other non-authorized SHA
  // once superseded: there is no "it used to be active" carve-out in
  // SINGLE_ACTIVE_SUBJECT.
  it("the superseded D17 subject (3647b8ce) is not authorized under D18", () => {
    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.authorized).not.toContain(D17_SUBJECT_SHA);
    expect(policy.authorized).toEqual([AUTHORIZED_SUBJECT_SHA]);
  });

  // The old, never-merged D-17 candidate (ae15813c, proposed 2026-09-04 while that
  // PR was still open) must not linger as authorized under D-18 either. No evidence
  // was ever captured against it, but the policy must reject it exactly as it
  // rejects any other non-authorized SHA — there is no "it used to be proposed"
  // carve-out in SINGLE_ACTIVE_SUBJECT.
  it("the old unmerged D17 candidate (ae15813c) is not authorized under D18", () => {
    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.authorized).not.toContain(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(policy.authorized).not.toContain(D16_SUBJECT_SHA);
    expect(policy.authorized).toEqual([AUTHORIZED_SUBJECT_SHA]);
  });

  // S7-I11 alone additionally requires the D-4 governance target to be resolved
  // from the manifest text (buildEvidenceArtifact's own D-4/A4 guard), which is
  // orthogonal to the subject-SHA policy this test exercises. Using S7-I1 here is
  // the same idiom the rest of this file already uses to isolate the subject-SHA
  // check from S7-I11's extra gate (see "closure fails when every artifact is
  // otherwise eligible but no policy exists" above).
  it("a fresh D18 artifact -> subject authorization PASS", () => {
    const artifact = signedArtifact("S7-I1", { subject_sha: AUTHORIZED_SUBJECT_SHA });
    const dir = writeArtifacts([artifact]);
    const r = evaluateInvariantClosure(
      realContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      { bundleId: STAGE_7_ID, evidenceDir: dir, signingKey: SIGNING_KEY, provenance: verifiedProvenance(artifact) },
    ) as { proven: string[]; structuralViolations: string[]; proofViolations: string[] };
    expect(r.proven).toContain("S7-I1");
    expect(allViolations(r)).not.toContain("SUBJECT_SHA");
  });

  it("the D16 artifact cannot prove the active D18 invariant", () => {
    // The one real evidence artifact on disk: subject_sha is D-16's, not D-18's.
    const { records } = loadEvidenceArtifactIndex({
      dir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
    });
    const d16Artifact = records.find((r) => (r as { artifactId: string }).artifactId === "evd_147fce5b18cdeeebf9d9b0b9778b8f06");
    expect(d16Artifact).toBeDefined();
    expect((d16Artifact as unknown as { subjectSha: string }).subjectSha).toBe(D16_SUBJECT_SHA);

    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.authorized).not.toContain((d16Artifact as unknown as { subjectSha: string }).subjectSha);
  });

  // A D-17-subject artifact would be just as stale as the D-16 one now: D-17 was
  // never tagged and never actually had a capture run against it (this is a
  // simulated/hypothetical D-17 artifact, since no real one exists), but the
  // policy must reject it exactly the same way once D-18 is the active subject.
  it("a D17-subject artifact cannot prove the active D18 invariant", () => {
    const d17Artifact = signedArtifact("S7-I1", { subject_sha: D17_SUBJECT_SHA });
    const dir = writeArtifacts([d17Artifact]);
    const r = evaluateInvariantClosure(
      realContract({ "S7-I1": provenWith("S7-I1", [d17Artifact.artifact_id]) }),
      { bundleId: STAGE_7_ID, evidenceDir: dir, signingKey: SIGNING_KEY, provenance: verifiedProvenance(d17Artifact) },
    ) as { proven: string[]; proofViolations: string[] };
    expect(r.proven).not.toContain("S7-I1");
    expect(r.proofViolations.join("\n")).toContain(SUBJECT_SHA_NOT_AUTHORIZED);
  });

  // The old unmerged D-17 candidate is no more able to prove D-18 than it was able
  // to prove D-17 itself — it was never authorized under either decision.
  it("the old unmerged D17 candidate's artifact cannot prove the active D18 invariant", () => {
    const oldCandidateArtifact = signedArtifact("S7-I1", { subject_sha: OLD_UNMERGED_D17_CANDIDATE_SHA });
    const dir = writeArtifacts([oldCandidateArtifact]);
    const r = evaluateInvariantClosure(
      realContract({ "S7-I1": provenWith("S7-I1", [oldCandidateArtifact.artifact_id]) }),
      { bundleId: STAGE_7_ID, evidenceDir: dir, signingKey: SIGNING_KEY, provenance: verifiedProvenance(oldCandidateArtifact) },
    ) as { proven: string[]; proofViolations: string[] };
    expect(r.proven).not.toContain("S7-I1");
    expect(r.proofViolations.join("\n")).toContain(SUBJECT_SHA_NOT_AUTHORIZED);
  });

  it("S7-I11=PENDING with no proof artifacts under D18 -> manifest integrity PASS", () => {
    const r = evaluateInvariantClosure(realContract(), {
      bundleId: STAGE_7_ID,
      evidenceDir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
      signingKey: SIGNING_KEY,
    }) as { structuralViolations: string[]; proofViolations: string[]; proven: string[] };
    expect(r.structuralViolations).toHaveLength(0);
    // evaluateInvariantClosure reports an "unmet requirement" proofViolations entry
    // for every non-PROVEN, non-waived invariant regardless of bundle status — that
    // is how a CLOSED gate later knows what still blocks it. On a PENDING bundle
    // these are informational, not blocking: the real enforcement point is that
    // neither gate script surfaces them while status stays PENDING (asserted below
    // by actually running validate-bundle-manifests.mjs), and that none of them
    // concern the subject-SHA policy specifically.
    expect(r.proofViolations.filter((v) => v.includes("SUBJECT_SHA"))).toHaveLength(0);
    expect(r.proven).toEqual([]);

    let code = 0;
    let output = "";
    try {
      output = execFileSync("node", ["scripts/validate-bundle-manifests.mjs"], { cwd: root, encoding: "utf8" });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
      output = String((err as { stdout?: string }).stdout ?? "");
    }
    expect(code).toBe(0);
    expect(output).toContain("Bundle manifest validation passed");
  });

  // The critical hostile-simulation gate: if the transition had left S7-I11 PROVEN
  // while citing the D-16 artifact under the D-18 subject, the proof-binding path
  // must reject it with SUBJECT_SHA_NOT_AUTHORIZED — not silently accept a proof
  // bound to a superseded commit. This is evaluated the way a CLOSED-bundle gate
  // would evaluate it (closure.proofViolations), which is exactly the check this PR
  // avoided triggering by leaving S7-I11 demoted rather than resurrecting it.
  it("S7-I11=PROVEN with the D16 artifact under D18 -> manifest integrity FAIL", () => {
    const hypothetical = realContract({
      "S7-I11": provenWith("S7-I11", ["evd_147fce5b18cdeeebf9d9b0b9778b8f06"]),
    });
    const r = evaluateInvariantClosure(hypothetical, {
      bundleId: STAGE_7_ID,
      evidenceDir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
      signingKey: SIGNING_KEY,
    }) as { proofViolations: string[]; proven: string[] };
    expect(r.proven).not.toContain("S7-I11");
    expect(r.proofViolations.join("\n")).toContain(SUBJECT_SHA_NOT_AUTHORIZED);
  });

  it("OPTION A: GITHUB_SHA=D18 + manifest closure_subject_sha=D18 -> authorization PASS", () => {
    const script = `
      import { resolveCaptureAuthorization } from ${JSON.stringify(join(root, "scripts/lib/evidence-artifact.mjs"))};
      const result = resolveCaptureAuthorization({
        subjectSha: ${JSON.stringify(AUTHORIZED_SUBJECT_SHA)},
        fetchMainManifest: () => \`closure_subject_sha: ${AUTHORIZED_SUBJECT_SHA}\`,
        resolveMainSha: () => ${JSON.stringify(AUTHORIZED_SUBJECT_SHA)},
      });
      process.stdout.write(result.authorizationManifestSha);
    `;
    const result = execFileSync("node", ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
    expect(result).toBe(AUTHORIZED_SUBJECT_SHA);
  });

  // D-17 was a real, active subject once — but a capture dispatched at that commit
  // against today's manifest is describing a superseded runtime, not the one D-18
  // authorizes, and must be refused the same as any other non-authorized SHA.
  it("OPTION A: GITHUB_SHA=D17 (3647b8ce) + manifest closure_subject_sha=D18 -> authorization FAIL", () => {
    const script = `
      import { resolveCaptureAuthorization } from ${JSON.stringify(join(root, "scripts/lib/evidence-artifact.mjs"))};
      try {
        resolveCaptureAuthorization({
          subjectSha: ${JSON.stringify(D17_SUBJECT_SHA)},
          fetchMainManifest: () => \`closure_subject_sha: ${AUTHORIZED_SUBJECT_SHA}\`,
          resolveMainSha: () => ${JSON.stringify(AUTHORIZED_SUBJECT_SHA)},
        });
        process.stderr.write("NO_THROW");
        process.exit(1);
      } catch (e) {
        process.stdout.write(e.message);
      }
    `;
    const result = execFileSync("node", ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
    expect(result).toContain("OPTION A authorization gate");
    expect(result).toContain("is NOT authorized");
  });

  it("OPTION A: GITHUB_SHA=D16 + manifest closure_subject_sha=D18 -> authorization FAIL", () => {
    const script = `
      import { resolveCaptureAuthorization } from ${JSON.stringify(join(root, "scripts/lib/evidence-artifact.mjs"))};
      try {
        resolveCaptureAuthorization({
          subjectSha: ${JSON.stringify(D16_SUBJECT_SHA)},
          fetchMainManifest: () => \`closure_subject_sha: ${AUTHORIZED_SUBJECT_SHA}\`,
          resolveMainSha: () => ${JSON.stringify(AUTHORIZED_SUBJECT_SHA)},
        });
        process.stderr.write("NO_THROW");
        process.exit(1);
      } catch (e) {
        process.stdout.write(e.message);
      }
    `;
    const result = execFileSync("node", ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
    expect(result).toContain("OPTION A authorization gate");
    expect(result).toContain("is NOT authorized");
  });

  // The old unmerged D-17 candidate must fail the same way D-16 does: a capture
  // dispatched at that commit, against today's corrected manifest, is not describing
  // the authorized subject and must be refused before it can produce an artifact.
  it("OPTION A: GITHUB_SHA=old unmerged D17 candidate (ae15813c) + manifest closure_subject_sha=D18 -> authorization FAIL", () => {
    const script = `
      import { resolveCaptureAuthorization } from ${JSON.stringify(join(root, "scripts/lib/evidence-artifact.mjs"))};
      try {
        resolveCaptureAuthorization({
          subjectSha: ${JSON.stringify(OLD_UNMERGED_D17_CANDIDATE_SHA)},
          fetchMainManifest: () => \`closure_subject_sha: ${AUTHORIZED_SUBJECT_SHA}\`,
          resolveMainSha: () => ${JSON.stringify(AUTHORIZED_SUBJECT_SHA)},
        });
        process.stderr.write("NO_THROW");
        process.exit(1);
      } catch (e) {
        process.stdout.write(e.message);
      }
    `;
    const result = execFileSync("node", ["--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
    expect(result).toContain("OPTION A authorization gate");
    expect(result).toContain("is NOT authorized");
  });

  it("D16-bound evidence PRs (#410-#415) remain unmerged and are not cited as D18 proof", () => {
    const raw = YAML.load(
      readFileSync(join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml"), "utf8"),
    ) as Record<string, unknown>;
    const invariants = raw.invariants as Record<string, { proof_artifacts: unknown[] }>;
    // No proof_artifacts entry anywhere in the live manifest names an artifact other
    // than the one D-16 artifact already on disk (which is itself no longer bound to
    // anything, per the fully-PENDING assertion above) — in particular, nothing from
    // the still-open #410-#415 evidence PRs has been merged in as a citation.
    for (const [id, entry] of Object.entries(invariants)) {
      expect(entry.proof_artifacts, id).toEqual([]);
    }
  });
});

describe("G-1 — main-lane enforcement cannot be removed unnoticed", () => {
  const workflow = readFileSync(join(root, ".github/workflows/main-integration.yml"), "utf8");

  it("Main Integration runs the evidence artifact validator", () => {
    expect(workflow).toContain("node scripts/validate-evidence-artifacts.mjs");
  });

  it("the evidence validation step is blocking, not advisory", () => {
    const stepIndex = workflow.indexOf("Stage 7 evidence artifact validator");
    expect(stepIndex).toBeGreaterThan(-1);
    const step = workflow.slice(stepIndex, stepIndex + 1200);
    expect(step).toContain("continue-on-error: false");
    expect(step).not.toContain("continue-on-error: true");
  });

  it("the evidence validation step is unconditional on main", () => {
    const stepIndex = workflow.indexOf("Stage 7 evidence artifact validator");
    const step = workflow.slice(stepIndex, workflow.indexOf("- name:", stepIndex + 10));
    expect(step).not.toMatch(/^\s+if:/m);
  });

  it("Main Integration still runs the Stage 7 and bundle manifest gates", () => {
    expect(workflow).toContain("validate-stage-acceptance.mjs --mode integrity --stage factory-7");
    expect(workflow).toContain("node scripts/validate-bundle-manifests.mjs");
  });

  it("Main Integration is never handed the evidence signing key", () => {
    // The step comment names the key to explain why main cannot verify signatures.
    // What must never appear is the key actually being wired into the job.
    expect(workflow).not.toMatch(/secrets\.EVIDENCE_SIGNING_KEY/);
    expect(workflow).not.toMatch(/^\s*EVIDENCE_SIGNING_KEY\s*:/m);
  });
});

describe("G-1 — the live repository is unchanged by this PR", () => {
  // Run with GITHUB_TOKEN and GH_TOKEN stripped. The gate resolves evidence
  // provenance through the GitHub API, so a credentialed shell and an
  // uncredentialed CI job otherwise disagree about the same commit — the counts
  // below would pass locally and fail in CI. Uncredentialed, the gate cannot check
  // the provenance of evd_147fce5b18cdeeebf9d9b0b9778b8f06 and refuses to count it,
  // which is the property worth pinning: unverifiable provenance is never proof.
  it("the Stage 7 integrity gate stays green and counts no unverifiable evidence", () => {
    const env = { ...process.env };
    delete env.GITHUB_TOKEN;
    delete env.GH_TOKEN;
    const output = execFileSync(
      "node",
      ["scripts/validate-stage-acceptance.mjs", "--mode", "integrity", "--stage", "factory-7"],
      { cwd: root, encoding: "utf8", env },
    );
    expect(output).toContain("0/16 invariants proven");
    expect(output).toContain("NOT stage progress");
  });

  it("the real Stage 7 contract still refuses closure", () => {
    let code = 0;
    try {
      execFileSync("node", ["scripts/validate-stage-acceptance.mjs", "--mode", "closure", "--stage", "factory-7"], {
        cwd: root, encoding: "utf8", stdio: "pipe",
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
    }
    expect(code).not.toBe(0);
  });

  // The repository holds an APPEND-ONLY history of Stage 7 evidence artifacts.
  // Legitimate growth is expected: D-16's S7-I11 capture, then three D-18
  // LANE_C FAIL captures archived by a later, reviewed PR (#431) once their
  // own unmerged evidence branches made that archival possible. That growth
  // must never be mistaken for noise — but what must still fail loudly is
  // anything OUTSIDE this reviewed, enumerated set: a recapture under a new
  // id, a duplicate, a hand-written file, or a known artifact's id, fields or
  // filename being silently substituted.
  //
  // A bare directory-length count cannot tell "one more reviewed artifact"
  // apart from "one more of anything" — it was the right check only while the
  // set had exactly one member and any second file was automatically
  // suspect. Asserting the CLOSED SET of artifact ids by name, deep-checking
  // every one, is the same "fail loudly on anything unexpected" property
  // restated so that further *reviewed* growth doesn't require guessing a new
  // magic number: it requires adding the new artifact's own entry here, in
  // the same PR that adds it, which is the correct place for that review to
  // be visible.
  const KNOWN_ARTIFACTS = [
    {
      artifactId: "evd_147fce5b18cdeeebf9d9b0b9778b8f06",
      invariantId: "S7-I11",
      lane: "LANE_E",
      proofType: "simulation_adversarial",
      // This artifact describes D-16's subject, not the active D-18 subject —
      // that is real, unaltered history (see D16_SUBJECT_SHA above). It is why
      // S7-I11 was demoted to PENDING (originally under D-17, unchanged by
      // the D-17->D-18 transition) rather than left PROVEN against a stale
      // subject.
      subjectSha: D16_SUBJECT_SHA,
      result: "PASS",
      supersedes: null,
      // Loaded with no protected context, so the index cannot reach a verdict
      // and must not invent one: D-4 is unresolvable without the manifest
      // text for an S7-I11 artifact specifically.
      level: "REJECTED",
    },
    {
      artifactId: "evd_5b59b73ad136d0603778d92cba8df2c1",
      invariantId: "S7-I4",
      lane: "LANE_C",
      proofType: "production_auth_check",
      // D-18 historical FAIL observation, archived by PR #431. Immutable: it
      // remains FAIL and proves nothing about S7-I4 on its own.
      subjectSha: AUTHORIZED_SUBJECT_SHA,
      result: "FAIL",
      supersedes: null,
      level: "UNVERIFIED",
    },
    {
      artifactId: "evd_3d09b82a000f831554b5d8ab70c87c8d",
      invariantId: "S7-I5",
      lane: "LANE_C",
      proofType: "production_boundary_check",
      subjectSha: AUTHORIZED_SUBJECT_SHA,
      result: "FAIL",
      supersedes: null,
      level: "UNVERIFIED",
    },
    {
      artifactId: "evd_20466e742c3720a92b56e1258662317a",
      invariantId: "S7-I10",
      lane: "LANE_C",
      proofType: "simulation_and_production_audit_check",
      subjectSha: AUTHORIZED_SUBJECT_SHA,
      result: "FAIL",
      supersedes: null,
      level: "UNVERIFIED",
    },
  ] as const;

  it("holds exactly the known, reviewed set of historical evidence artifacts — nothing more, nothing substituted", () => {
    const { records, duplicates } = loadEvidenceArtifactIndex({
      dir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
    });

    // Closed-set membership by id catches an unexpected addition, a missing
    // artifact, and a rename/substitution alike — properties a bare length
    // check cannot distinguish from legitimate growth.
    expect(records.map((r) => r.artifactId).sort()).toEqual(
      [...KNOWN_ARTIFACTS.map((a) => a.artifactId)].sort(),
    );
    expect(duplicates).toEqual([]);

    for (const expected of KNOWN_ARTIFACTS) {
      const record = records.find((r) => r.artifactId === expected.artifactId);
      if (!record) throw new Error(`expected known artifact ${expected.artifactId} not found`);
      expect(record.invariantId).toBe(expected.invariantId);
      expect(record.lane).toBe(expected.lane);
      expect(record.proofType).toBe(expected.proofType);
      expect(record.subjectSha).toBe(expected.subjectSha);
      expect(record.fileName).toBe(`${expected.artifactId}.json`);
      expect(record.nested).toBe(false);
      expect(record.supersedes).toBe(expected.supersedes);

      // Loaded with no protected context, so the index cannot reach a verdict
      // above what its own structural pass supports, and must not invent
      // one. Every known artifact here is at most UNVERIFIED — never
      // ACCEPTED — confirming none of them backs a PROVEN invariant merely
      // by existing on disk in structurally valid form.
      expect(record.level).toBe(expected.level);
      expect(record.level).not.toBe("ACCEPTED");
      expect(record.signatureState).toBe("UNCHECKED");
      expect(record.provenanceState).toBe("UNCHECKED");

      // `result` is not part of the loader's summary record; read the
      // governed observation directly, exactly as every other
      // artifact-content test in this suite does.
      const raw = JSON.parse(readFileSync(record.absolutePath, "utf8"));
      expect(raw.result).toBe(expected.result);
    }
  });

  it("the evidence validator and bundle validator both stay green", () => {
    for (const script of ["scripts/validate-evidence-artifacts.mjs", "scripts/validate-bundle-manifests.mjs"]) {
      const output = execFileSync("node", [script], { cwd: root, encoding: "utf8" });
      expect(output.length).toBeGreaterThan(0);
    }
  });

  it("ACCEPTANCE never gains a level above ACCEPTED", () => {
    expect(Object.keys(ACCEPTANCE).sort()).toEqual(["ACCEPTED", "REJECTED", "UNVERIFIED"]);
  });
});

/**
 * Hostile audit of the closed-set repair above (append-only evidence history).
 *
 * These run against synthetic temp directories, never the live repository —
 * they exist to prove the repair PATTERN itself is sound, not to re-test
 * loadEvidenceArtifactIndex's own structural checks (covered exhaustively
 * elsewhere). The closed-set-by-id assertion replaces a bare `toHaveLength`
 * specifically so legitimate history can grow without the check going stale
 * again the next time a real artifact is archived; these cases prove that
 * substitution is still not tolerated.
 */
describe("G-1 append-only evidence history — closed-set repair hostile cases", () => {
  /** The same assertion shape the real G-1 test above uses, generalised over any expected id set. */
  function assertClosedSet(dir: string, expectedIds: string[]) {
    const { records, duplicates } = loadEvidenceArtifactIndex({ dir });
    expect(records.map((r) => r.artifactId).sort()).toEqual([...expectedIds].sort());
    expect(duplicates).toEqual([]);
  }

  it("the expected governed artifact, present exactly once, passes", () => {
    const a = signedArtifact("S7-I1");
    const dir = writeArtifacts([a]);
    expect(() => assertClosedSet(dir, [a.artifact_id as string])).not.toThrow();
  });

  it("a missing expected artifact fails loudly", () => {
    const a = signedArtifact("S7-I1");
    const b = signedArtifact("S7-I2");
    const dir = writeArtifacts([a]); // b is expected but never written
    expect(() => assertClosedSet(dir, [a.artifact_id as string, b.artifact_id as string])).toThrow();
  });

  it("an unexpected extra artifact (a recapture, a hand-written file) fails loudly even though the expected one is still present", () => {
    const a = signedArtifact("S7-I1");
    const surprise = signedArtifact("S7-I2");
    const dir = writeArtifacts([a, surprise]);
    // Only `a` was reviewed/expected; `surprise` appearing must not pass silently
    // merely because `a` is still findable.
    expect(() => assertClosedSet(dir, [a.artifact_id as string])).toThrow();
  });

  it("the same artifact_id duplicated under a second filename is caught by loadEvidenceArtifactIndex's own duplicate detection, and fails the closed-set check", () => {
    const a = signedArtifact("S7-I1");
    const dir = writeArtifacts([a], { fileNameFor: () => `${a.artifact_id}.json` });
    // Write it again under a second canonical-looking filename with the same id.
    writeFileSync(join(dir, `${a.artifact_id}-copy.json`), JSON.stringify(a, null, 2), "utf8");
    const { records, duplicates } = loadEvidenceArtifactIndex({ dir });
    expect(duplicates).toEqual([a.artifact_id]);
    // Whichever of the two files the scan reaches second is the one carrying
    // the "duplicate artifact_id" violation (file iteration order, not review
    // order, decides which); what matters is that at least one record does,
    // and that the closed-set check — which refuses on ANY duplicate — throws
    // regardless of which file that is.
    expect(records.map((r) => r.violations.join("\n")).join("\n")).toContain("duplicate artifact_id");
    expect(() => assertClosedSet(dir, [a.artifact_id as string])).toThrow();
  });

  it("a substituted artifact — same filename, different content/id than reviewed — is caught because the id no longer matches what was expected", () => {
    const expectedId = signedArtifact("S7-I1").artifact_id as string;
    const substitute = signedArtifact("S7-I2"); // different observation entirely
    const dir = tempDir("opsiq-g1-evidence-");
    // Filed under the EXPECTED artifact's canonical filename, but its content
    // (and therefore its content-derived artifact_id) is a different
    // observation — the classic "swap the file, keep the name" attack.
    writeFileSync(join(dir, `${expectedId}.json`), JSON.stringify(substitute, null, 2), "utf8");
    expect(() => assertClosedSet(dir, [expectedId])).toThrow();
  });

  it("additional legitimate historical artifacts do not break the check merely because the count increased, once explicitly enumerated", () => {
    // Mirrors what happened for real: one known artifact, then reviewed growth
    // to include several more. The pattern must accommodate that growth as
    // long as the grower updates the expected set — it must not require the
    // check itself to special-case "count went up".
    const known = [signedArtifact("S7-I1"), signedArtifact("S7-I2"), signedArtifact("S7-I4"), signedArtifact("S7-I5")];
    const dir = writeArtifacts(known);
    expect(() => assertClosedSet(dir, known.map((a) => a.artifact_id as string))).not.toThrow();
  });

  it("a malformed (unparseable) artifact still fails closed under the same directory scan", () => {
    const a = signedArtifact("S7-I1");
    const dir = writeArtifacts([a]);
    writeFileSync(join(dir, "evd_deadbeefdeadbeefdeadbeefdeadbeef.json"), "{ not json", "utf8");
    const { records } = loadEvidenceArtifactIndex({ dir });
    const malformed = records.find((r) => r.fileName === "evd_deadbeefdeadbeefdeadbeefdeadbeef.json");
    expect(malformed?.level).toBe("REJECTED");
    expect(malformed?.violations.join("\n")).toContain("not parseable as JSON");
  });

  it("a historical FAIL artifact, in the same unverified state as the real committed D18 artifacts, cannot close its invariant", () => {
    const fail = signedArtifact("S7-I4", { result: "FAIL", assertion: "observed FAIL, archived as history" });
    const dir = writeArtifacts([fail]);
    // No provenance map supplied — this is the artifact's REAL state on disk
    // right now: structurally valid and signed, but never independently
    // confirmed against a live GitHub Actions run (that requires a network
    // call and a token neither this test nor a bare load has). The main G-1
    // test above pins that every real committed artifact is at most
    // UNVERIFIED for exactly this reason. UNVERIFIED can never satisfy the
    // ACCEPTED level `evaluateInvariantClosure` requires, so closure is
    // refused here regardless of `result`.
    const result = evaluate(
      contractWith({ "S7-I4": provenWith("S7-I4", [fail.artifact_id as string]) }),
      { evidenceDir: dir },
    );
    expect(result.proven).not.toContain("S7-I4");
    expect(allViolations(result)).toMatch(/S7-I4/);
  });

  // NOT asserted here, and deliberately not papered over: evaluateInvariantClosure's
  // proof-binding check (scripts/lib/invariant-closure.mjs) requires the cited
  // artifact to reach ACCEPTANCE level ACCEPTED — structurally valid, signed, and
  // provenance-verified against the correct lane/subject — but does not itself
  // additionally require `result === 'PASS'`. In principle a FAIL artifact that
  // somehow reached full ACCEPTED status (real signing key, real matching GitHub
  // Actions run) would currently satisfy proof_artifacts. In practice this cannot
  // happen unattended: reaching ACCEPTED needs the production signing key (a GitHub
  // Actions secret) and a live run whose provenance matches, both of which are
  // exactly the two things this file's own threat model says an interactive session
  // cannot produce. This is a real, separate, pre-existing gap in `result`
  // enforcement — out of scope for this test's repair (a stale artifact-count
  // assumption, not a proof-binding design change) and not fixed here.
});

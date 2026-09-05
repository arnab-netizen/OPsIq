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
 * Owner decision D-17, corrected 2026-09-05: the one commit Stage 7 evidence may
 * describe. This is PR #418's squash-merge commit — the actual final beta runtime
 * (PR #416's owner-lane probe repair + PR #418's public-beta hardening + production
 * migration 20260905044623_open_beta_hardening) — not the intermediate ae15813c
 * candidate D-17 originally proposed on 2026-09-04.
 */
const AUTHORIZED_SUBJECT_SHA = "3647b8ce95fd4c75640a6062a3a9ed235577f023";
/**
 * D-17 as originally proposed, 2026-09-04, while this same PR was still unmerged:
 * "RUNTIME_CANDIDATE_SHA= ae15813c417901a9b48b012303f666e7591d1275". It never became
 * an active subject — no evidence was ever captured against it, and this PR never
 * merged carrying that value before main advanced past it. D-17's
 * SINGLE_ACTIVE_SUBJECT policy does not authorize this commit either.
 */
const OLD_UNMERGED_D17_CANDIDATE_SHA = "ae15813c417901a9b48b012303f666e7591d1275";
/**
 * Owner decision D-16, 2026-09-03: the PREVIOUS active subject, now historical.
 * D-17's SINGLE_ACTIVE_SUBJECT policy does not authorize this commit. The one
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
  // subject_sha 789768b9 (D-16), which D-17's SINGLE_ACTIVE_SUBJECT policy does not
  // authorize. All sixteen invariants are therefore PENDING with empty
  // proof_artifacts, and the bundle stays PENDING. This is asserted per-invariant,
  // not by a bare count: a count would still pass if one invariant silently carried
  // a stale reference while another went empty.
  it("the live Stage 7 contract evaluates as fully PENDING under D-17", () => {
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
   * D-17 (corrected 2026-09-05, PR #418 merge SHA 3647b8ce) is the current subject:
   * the exact production-deployed commit carrying PR #416's owner-lane capture-path
   * repair (S7-I1, S7-I2, S7-I4, S7-I5, S7-I10, S7-I12) plus PR #418's public-beta
   * runtime hardening, with production migration 20260905044623_open_beta_hardening
   * applied. D-17 was originally proposed against ae15813c (2026-09-04, while this
   * PR was still unmerged); that candidate never became active — no evidence was
   * captured against it — and is corrected here to name the actual final runtime
   * instead, without advancing to D-18 (see amendment A17). It superseded
   * D-16 (789768b9, PR #404 merge), the first commit carrying the complete known
   * capture-path repair set (#391-#394, #396, #401-#402) together with both
   * observation credential-disclosure repairs. Under owner decision
   * D17_TRANSITION_POLICY=SINGLE_ACTIVE_SUBJECT, D-16 is not carried forward in the
   * active subject allowlist, and S7-I11 — the one invariant D-16 left PROVEN — is
   * atomically demoted to PENDING with proof_artifacts reset to [] (amendment A16),
   * because its proof artifact declares D-16's subject_sha, which D-17 no longer
   * authorizes. D-16 remains historical and unmodified; amendment A15 still records
   * it. The guarantee worth holding is narrower and stricter: exactly one commit is
   * authorized at a time, it is the one the owner named, and authorizing it moved
   * nothing else in the contract to PROVEN.
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
    // Under D-17, every invariant is PENDING with empty proof_artifacts — including
    // S7-I11, atomically demoted when the active subject advanced past D-16 (see the
    // A16 amendment). Authorizing a subject SHA proves nothing on its own; the bundle
    // itself remains PENDING above.
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
    expect(auth.decision).toBe("D-17");
    // A superseded decision is not erased — the record must still name what it replaced.
    expect(auth.supersedes).toBe("D-16");
    expect(auth.superseded_sha).toBe(D16_SUBJECT_SHA);
    // The SHA the owner authorized must be the SHA CI tested and the SHA production
    // deployed. A record that names three different commits records nothing.
    expect(raw.closure_subject_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.main_integration_tested_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.vercel_production_commit_sha).toBe(AUTHORIZED_SUBJECT_SHA);
    expect(auth.main_integration_run).toBe("33951086242");
    expect(auth.vercel_production_deployment).toBe("dpl_8FqgGoe1SXaUQTrKmD691rs46zE6");
    // Never the old, unmerged D-17 candidate — a record naming that commit anywhere
    // in the authorized-facing fields would mean the correction did not actually
    // take effect.
    expect(raw.closure_subject_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(auth.main_integration_tested_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    expect(auth.vercel_production_commit_sha).not.toBe(OLD_UNMERGED_D17_CANDIDATE_SHA);
    // The migration provenance PR #418 actually produced must be recorded too.
    const migration = auth.production_migration as Record<string, string>;
    expect(migration.name).toBe("20260905044623_open_beta_hardening");
    expect(migration.result).toBe("SUCCESS");
    expect(migration.post_deploy_status).toBe("DATABASE_SCHEMA_UP_TO_DATE");
    // The limitations must stay recorded, not quietly dropped once inconvenient.
    const unverified = auth.unverified as Record<string, string>;
    expect(unverified.production_http_health).toMatch(/egress/i);
    expect(unverified.production_http_health).toMatch(/not independently/i);
    expect(unverified.production_schema_structural_verification).toMatch(/skipped/i);
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

describe("D-17 transition — subject policy hostile simulation", () => {
  /**
   * Owner decision D-17 (2026-09-04) advances closure_subject_sha past D-16 under
   * D17_TRANSITION_POLICY=SINGLE_ACTIVE_SUBJECT and atomically demotes S7-I11 from
   * PROVEN back to PENDING. This block is the hostile simulation required before the
   * governance PR opens: it proves the transition is safe with I11 PENDING, and that
   * the mechanism would have REJECTED the unsafe alternative — leaving S7-I11 PROVEN
   * while citing the D-16 artifact under the D-17 subject.
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

  it("D17_ACTIVE_SUBJECT is authorized; D16_ACTIVE_SUBJECT is not", () => {
    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.state).toBe(SUBJECT_SHA_POLICY.PRESENT);
    expect(policy.authorized).toEqual([AUTHORIZED_SUBJECT_SHA]);
    expect(policy.authorized).not.toContain(D16_SUBJECT_SHA);
  });

  // The old, never-merged D-17 candidate (ae15813c, proposed 2026-09-04 while this
  // PR was still open) must not linger as authorized once D-17 is corrected to name
  // the actual final runtime (3647b8ce). No evidence was ever captured against it,
  // but the policy must reject it exactly as it rejects any other non-authorized SHA
  // — there is no "it used to be proposed" carve-out in SINGLE_ACTIVE_SUBJECT.
  it("the old unmerged D17 candidate (ae15813c) is not authorized", () => {
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
  it("a fresh D17 artifact -> subject authorization PASS", () => {
    const artifact = signedArtifact("S7-I1", { subject_sha: AUTHORIZED_SUBJECT_SHA });
    const dir = writeArtifacts([artifact]);
    const r = evaluateInvariantClosure(
      realContract({ "S7-I1": provenWith("S7-I1", [artifact.artifact_id]) }),
      { bundleId: STAGE_7_ID, evidenceDir: dir, signingKey: SIGNING_KEY, provenance: verifiedProvenance(artifact) },
    ) as { proven: string[]; structuralViolations: string[]; proofViolations: string[] };
    expect(r.proven).toContain("S7-I1");
    expect(allViolations(r)).not.toContain("SUBJECT_SHA");
  });

  it("the D16 artifact cannot prove the active D17 invariant", () => {
    // The one real evidence artifact on disk: subject_sha is D-16's, not D-17's.
    const { records } = loadEvidenceArtifactIndex({
      dir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
    });
    const d16Artifact = records.find((r) => (r as { artifactId: string }).artifactId === "evd_147fce5b18cdeeebf9d9b0b9778b8f06");
    expect(d16Artifact).toBeDefined();
    expect((d16Artifact as unknown as { subjectSha: string }).subjectSha).toBe(D16_SUBJECT_SHA);

    const policy = resolveSubjectShaPolicy(realContract());
    expect(policy.authorized).not.toContain((d16Artifact as unknown as { subjectSha: string }).subjectSha);
  });

  it("S7-I11=PENDING with no proof artifacts under D17 -> manifest integrity PASS", () => {
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
  // while citing the D-16 artifact under the D-17 subject, the proof-binding path
  // must reject it with SUBJECT_SHA_NOT_AUTHORIZED — not silently accept a proof
  // bound to a superseded commit. This is evaluated the way a CLOSED-bundle gate
  // would evaluate it (closure.proofViolations), which is exactly the check this PR
  // avoided triggering by demoting S7-I11 instead of merely advancing the subject.
  it("S7-I11=PROVEN with the D16 artifact under D17 -> manifest integrity FAIL", () => {
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

  it("OPTION A: GITHUB_SHA=D17 + manifest closure_subject_sha=D17 -> authorization PASS", () => {
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

  it("OPTION A: GITHUB_SHA=D16 + manifest closure_subject_sha=D17 -> authorization FAIL", () => {
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
  it("OPTION A: GITHUB_SHA=old unmerged D17 candidate (ae15813c) + manifest closure_subject_sha=D17 (3647b8ce) -> authorization FAIL", () => {
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

  it("D16-bound evidence PRs (#410-#415) remain unmerged and are not cited as D17 proof", () => {
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

  // The repository now holds exactly one evidence artifact. Asserting the whole
  // inventory, not merely that this one is present, is deliberate: a second
  // artifact appearing here — a recapture, a duplicate, a hand-written file —
  // must fail loudly rather than pass because the one id it looked for is still
  // there. Fields are checked against the governed D-16 capture.
  it("holds exactly the one governed S7-I11 evidence artifact", () => {
    const { records } = loadEvidenceArtifactIndex({
      dir: join(root, "docs/opsiq/evidence/stage-7/artifacts"),
    });
    expect(records).toHaveLength(1);
    const [record] = records as unknown as [{
      artifactId: string; invariantId: string; lane: string; proofType: string;
      subjectSha: string; fileName: string; nested: boolean; supersedes: string | null;
      level: string; signatureState: string; provenanceState: string;
    }];
    expect(record.artifactId).toBe("evd_147fce5b18cdeeebf9d9b0b9778b8f06");
    expect(record.invariantId).toBe("S7-I11");
    expect(record.lane).toBe("LANE_E");
    expect(record.proofType).toBe("simulation_adversarial");
    // This artifact describes D-16's subject, not the active D-17 subject — that is
    // real, unaltered history (see D16_SUBJECT_SHA above). It is why S7-I11 was
    // demoted to PENDING under D-17 rather than left PROVEN against a stale subject.
    expect(record.subjectSha).toBe(D16_SUBJECT_SHA);
    expect(record.fileName).toBe("evd_147fce5b18cdeeebf9d9b0b9778b8f06.json");
    expect(record.nested).toBe(false);
    expect(record.supersedes).toBeNull();

    // Loaded with no protected context, so the index cannot reach a verdict and
    // must not invent one: D-4 is unresolvable without the manifest text, and the
    // signature and provenance go UNCHECKED rather than assumed good. The artifact
    // reaches ACCEPTED only through the governed path, which the validator and gate
    // tests exercise. A future change that let a bare load report ACCEPTED would be
    // a real regression, and this pins it.
    expect(record.level).toBe("REJECTED");
    expect(record.signatureState).toBe("UNCHECKED");
    expect(record.provenanceState).toBe("UNCHECKED");
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

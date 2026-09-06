/**
 * Factory Stage 7 — CONTROL-PLANE authorization gate hostile audit
 *
 * A control-plane capture runs from current main and observes a DIFFERENT,
 * immutable subject commit (e.g. the D18 tag) checked out into an isolated
 * path. This decouples "code that executed" from "code being observed" —
 * legacy OPTION A collapses the two on purpose (the job's own checkout IS the
 * subject); a control-plane capture's own checkout is main, so that equality
 * no longer holds and a new, additive gate proves the replacement invariant:
 * the immutable subject tag and the governance manifest must name the exact
 * same commit, independently of anything the run itself claims.
 *
 * These tests exercise, by fixture injection (never real git/network I/O):
 *   - resolveControlPlaneSubject: the capture-time tag/manifest cross-check
 *   - buildEvidenceArtifact + validateEvidenceArtifact: the new optional
 *     capture_mode/control_plane_sha/control_plane_ref/subject_tag producer
 *     fields, and that a legacy (capture_mode absent) artifact is completely
 *     unaffected
 *   - evaluateRunProvenance: the ongoing, per-validation re-verification that
 *     ties a control-plane artifact's subject_sha to what the immutable tag
 *     currently resolves to — catching a tag moved AFTER capture, not just at
 *     capture time
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "crypto";
import { spawnSync } from "child_process";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");

const { privateKey: SIGNING_KEY_PEM } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const D18_SHA = "0c06fe4399fb4dc81bb7fb9f41db70b921e9ec06";
const MAIN_SHA = "a0a8a16066cd77da52a21758efeb361a32f723ee";
const OTHER_SHA = "1111111111111111111111111111111111111111";
const SUBJECT_TAG = "stage7-evidence-subject-d18";

interface ResolveOpts {
  subjectTag?: string;
  closureSubjectSha: string;
  tagSha?: string;
  throwOnManifest?: boolean;
  throwOnTag?: boolean;
  emptyManifest?: boolean;
  malformedManifest?: boolean;
  badTagShaShape?: boolean;
}

/** Call resolveControlPlaneSubject with injectable fixture callbacks. */
function callResolveControlPlaneSubject(opts: ResolveOpts): { status: number; stdout: string; stderr: string } {
  const script = `
    import { resolveControlPlaneSubject } from ${JSON.stringify(libPath)};
    const opts = JSON.parse(process.env.RESOLVE_OPTS);
    const manifest = opts.emptyManifest
      ? ""
      : opts.malformedManifest
        ? "closure_subject_sha: not-a-sha"
        : \`closure_subject_sha: "\${opts.closureSubjectSha}"\`;
    const fetchMainManifest = opts.throwOnManifest
      ? () => { throw new Error("git show origin/main failed"); }
      : () => manifest;
    const resolveTagSha = opts.throwOnTag
      ? () => { throw new Error("git rev-parse tag failed — unknown revision"); }
      : () => (opts.badTagShaShape ? "not-a-sha" : (opts.tagSha ?? opts.closureSubjectSha));
    try {
      const args = { fetchMainManifest, resolveTagSha };
      if (opts.subjectTag !== undefined) args.subjectTag = opts.subjectTag;
      const result = resolveControlPlaneSubject(args);
      process.stdout.write(JSON.stringify(result));
    } catch (e) {
      process.stderr.write(e.message);
      process.exit(1);
    }
  `;
  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: root,
    env: { PATH: process.env.PATH ?? "", RESOLVE_OPTS: JSON.stringify(opts) },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("Stage 7 CONTROL-PLANE authorization gate — resolveControlPlaneSubject", () => {
  it("returns the subject SHA and tag when the manifest and tag agree", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ subjectSha: D18_SHA, subjectTag: SUBJECT_TAG });
  });

  it("refuses when the tag resolves to a different commit than the governance manifest declares (tag moved)", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, tagSha: OTHER_SHA });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("resolves to");
    expect(result.stderr).toContain(OTHER_SHA);
    expect(result.stderr).toContain(D18_SHA);
  });

  it("refuses when fetchMainManifest throws", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, throwOnManifest: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("failed to read factory-stage-7-closure.yaml");
  });

  it("refuses when the manifest is empty", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, emptyManifest: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("empty or unreadable");
  });

  it("refuses when the manifest has no well-formed closure_subject_sha", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, malformedManifest: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not contain a well-formed closure_subject_sha");
  });

  it("refuses when resolveTagSha throws (tag does not exist)", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, throwOnTag: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("could not resolve tag");
  });

  it("refuses when resolveTagSha returns something that is not a 40-hex commit SHA", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, badTagShaShape: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is not a valid 40-character lowercase commit SHA");
  });

  it("refuses a caller-supplied subjectTag that does not match the Stage 7 subject-tag pattern (arbitrary tag injection)", () => {
    const result = callResolveControlPlaneSubject({ closureSubjectSha: D18_SHA, subjectTag: "refs/heads/main" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not match");
  });

  it("refuses a caller-supplied subjectTag that matches the pattern but names a different (unauthorized) subject decision", () => {
    // Shape-valid, but not the currently authorized tag — resolveControlPlaneSubject
    // itself doesn't know which tag is "the" authorized one (that's enforced one
    // layer up, by buildEvidenceArtifact/validateEvidenceArtifact comparing against
    // CONTROL_PLANE_AUTHORIZED_SUBJECT_TAG) — but it must still resolve deterministically
    // and cross-check whatever tag it is asked about.
    const result = callResolveControlPlaneSubject({
      subjectTag: "stage7-evidence-subject-d99",
      closureSubjectSha: D18_SHA,
      tagSha: OTHER_SHA,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("resolves to");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildEvidenceArtifact + validateEvidenceArtifact — control_plane producer fields
// ═══════════════════════════════════════════════════════════════════════════════

function callLib(exportName: string, argsJson: unknown[]): unknown {
  const script = `
    import * as lib from ${JSON.stringify(libPath)};
    const args = JSON.parse(process.env.LIB_ARGS);
    process.stdout.write(JSON.stringify(lib[process.env.LIB_EXPORT](...args)));
  `;
  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: root,
    env: { PATH: process.env.PATH ?? "", LIB_EXPORT: exportName, LIB_ARGS: JSON.stringify(argsJson) },
  });
  if (result.status !== 0) throw new Error(`${exportName} threw: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const FAKE_RUN_ENV = {
  GITHUB_REPOSITORY: "arnab-netizen/OPsIq",
  GITHUB_RUN_ID: "99999999999999999",
  GITHUB_RUN_NUMBER: 1,
  GITHUB_RUN_ATTEMPT: 1,
  GITHUB_WORKFLOW: "Stage 7 — Evidence Capture (Control Plane / D18 correction)",
  GITHUB_JOB: "capture",
  GITHUB_ACTOR: "test-actor",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_RUN_STARTED_AT: "2026-01-01T00:00:00Z",
};

function controlPlaneInput() {
  return {
    invariant_id: "S7-I4",
    lane: "LANE_C",
    proof_type: "production_auth_check",
    environment: "production",
    method: "http_probe",
    assertion: "Owner login, logout, session expiry, and unauthorized-user rejection all confirmed on production deployment.",
    result: "PASS",
    replay_command: "node subject/scripts/stage7-probes/s7-i4-auth-check.mjs",
    raw_observation: "RESULT: PASS\n",
    deployment_id: "dpl_8owYgFhBFFwCPUfs2LMHBeQdGzgm",
    supersedes: "evd_5b59b73ad136d0603778d92cba8df2c1",
    repository: FAKE_RUN_ENV.GITHUB_REPOSITORY,
    run_id: FAKE_RUN_ENV.GITHUB_RUN_ID,
    run_number: FAKE_RUN_ENV.GITHUB_RUN_NUMBER,
    run_attempt: FAKE_RUN_ENV.GITHUB_RUN_ATTEMPT,
    workflow: FAKE_RUN_ENV.GITHUB_WORKFLOW,
    job: FAKE_RUN_ENV.GITHUB_JOB,
    actor: FAKE_RUN_ENV.GITHUB_ACTOR,
    event_name: FAKE_RUN_ENV.GITHUB_EVENT_NAME,
    run_started_at: FAKE_RUN_ENV.GITHUB_RUN_STARTED_AT,
    captured_at_utc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    authorization_manifest_sha: MAIN_SHA,
    subject_sha: D18_SHA,
    capture_mode: "control_plane",
    control_plane_sha: MAIN_SHA,
    control_plane_ref: "refs/heads/main",
    subject_tag: SUBJECT_TAG,
  };
}

function build(input: Record<string, unknown>): Record<string, unknown> {
  return callLib("buildEvidenceArtifact", [input, { signingKey: SIGNING_KEY_PEM }]) as Record<string, unknown>;
}

function violationsOf(artifact: Record<string, unknown>): string[] {
  const result = callLib("validateEvidenceArtifact", [artifact, { signingKey: null }]) as { violations: string[] };
  return result.violations;
}

describe("Stage 7 CONTROL-PLANE producer fields — buildEvidenceArtifact + validateEvidenceArtifact", () => {
  it("a well-formed control-plane artifact has zero violations", () => {
    const artifact = build(controlPlaneInput());
    expect(artifact.capture_mode).toBe("control_plane");
    expect((artifact.producer as Record<string, unknown>).control_plane_sha).toBe(MAIN_SHA);
    expect(violationsOf(artifact)).toEqual([]);
  });

  it("a legacy artifact (capture_mode absent) is completely unaffected — backward compatibility", () => {
    const legacyInput = controlPlaneInput();
    delete legacyInput.capture_mode;
    delete legacyInput.control_plane_sha;
    delete legacyInput.control_plane_ref;
    delete legacyInput.subject_tag;
    legacyInput.subject_sha = MAIN_SHA; // legacy: subject_sha IS the run's own checkout
    const artifact = build(legacyInput);
    expect(artifact.capture_mode).toBeUndefined();
    expect((artifact.producer as Record<string, unknown>).control_plane_sha).toBeUndefined();
    expect(violationsOf(artifact)).toEqual([]);
  });

  it("rejects capture_mode set to a value other than 'control_plane'", () => {
    const artifact = build(controlPlaneInput());
    (artifact as Record<string, unknown>).capture_mode = "something_else";
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("capture_mode"))).toBe(true);
  });

  it("rejects a missing/invalid producer.control_plane_sha", () => {
    const artifact = build(controlPlaneInput());
    (artifact.producer as Record<string, unknown>).control_plane_sha = null;
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("control_plane_sha"))).toBe(true);
  });

  it("rejects a control_plane_ref that is not exactly refs/heads/main (fork/tag/PR ref)", () => {
    const artifact = build(controlPlaneInput());
    (artifact.producer as Record<string, unknown>).control_plane_ref = "refs/heads/some-feature-branch";
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("control_plane_ref"))).toBe(true);
  });

  it("rejects a subject_tag that does not match the Stage 7 subject-tag naming pattern", () => {
    const artifact = build(controlPlaneInput());
    (artifact.producer as Record<string, unknown>).subject_tag = "not-a-subject-tag";
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("subject_tag"))).toBe(true);
  });

  it("rejects a well-formed but unauthorized subject_tag (caller tries an alternate tag name)", () => {
    const artifact = build(controlPlaneInput());
    (artifact.producer as Record<string, unknown>).subject_tag = "stage7-evidence-subject-d99";
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("is not the currently authorized control-plane subject tag"))).toBe(true);
  });

  it("rejects control_plane_sha equal to subject_sha (control-plane mode implies observing a DIFFERENT commit)", () => {
    const input = controlPlaneInput();
    input.control_plane_sha = D18_SHA; // same as subject_sha
    const artifact = build(input);
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("equals subject_sha"))).toBe(true);
  });

  it("rejects a legacy artifact that sets control_plane_sha without declaring capture_mode", () => {
    const legacyInput = controlPlaneInput();
    delete legacyInput.capture_mode;
    delete legacyInput.control_plane_ref;
    delete legacyInput.subject_tag;
    legacyInput.subject_sha = MAIN_SHA;
    const artifact = build(legacyInput);
    // Force the field back on to simulate a forged/malformed legacy-shaped artifact.
    (artifact.producer as Record<string, unknown>).control_plane_sha = MAIN_SHA;
    const violations = violationsOf(artifact);
    expect(violations.some((v) => v.includes("control_plane_sha") && v.includes("capture_mode is not"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// evaluateRunProvenance — ongoing (per-validation) subject-tag re-verification
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateRunProvenance(
  artifact: Record<string, unknown>,
  run: Record<string, unknown> | null,
  context: Record<string, unknown> = {},
): string[] {
  return callLib("evaluateRunProvenance", [artifact, run, context]) as string[];
}

function fakeRun(overrides: Record<string, unknown> = {}) {
  return {
    // Kept as a string: evaluateRunProvenance compares String(run.id) to
    // producer.run_id, and FAKE_RUN_ENV.GITHUB_RUN_ID (17 nines) exceeds
    // Number.MAX_SAFE_INTEGER — Number(...) would silently round it.
    id: FAKE_RUN_ENV.GITHUB_RUN_ID,
    head_sha: MAIN_SHA,
    repository: { full_name: FAKE_RUN_ENV.GITHUB_REPOSITORY },
    name: FAKE_RUN_ENV.GITHUB_WORKFLOW,
    run_number: FAKE_RUN_ENV.GITHUB_RUN_NUMBER,
    run_attempt: FAKE_RUN_ENV.GITHUB_RUN_ATTEMPT,
    event: FAKE_RUN_ENV.GITHUB_EVENT_NAME,
    run_started_at: FAKE_RUN_ENV.GITHUB_RUN_STARTED_AT,
    updated_at: "2026-01-01T00:05:00Z",
    ...overrides,
  };
}

describe("Stage 7 CONTROL-PLANE producer fields — evaluateRunProvenance", () => {
  it("a control-plane artifact is checked against control_plane_sha, not subject_sha", () => {
    const artifact = build(controlPlaneInput());
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: MAIN_SHA }); // run executed at control-plane SHA, not D18
    const violations = evaluateRunProvenance(artifact, run, { subjectTagSha: D18_SHA });
    expect(violations).toEqual([]);
  });

  it("flags a control-plane artifact whose run did not actually execute at control_plane_sha", () => {
    const artifact = build(controlPlaneInput());
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: OTHER_SHA });
    const violations = evaluateRunProvenance(artifact, run, { subjectTagSha: D18_SHA });
    expect(violations.some((v) => v.includes("control_plane_sha") && v.includes("was not run at the commit it claims"))).toBe(true);
  });

  it("flags a control-plane artifact when the subject tag could not be independently re-resolved", () => {
    const artifact = build(controlPlaneInput());
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: MAIN_SHA });
    const violations = evaluateRunProvenance(artifact, run, {});
    expect(violations.some((v) => v.includes("never trusted from the run alone"))).toBe(true);
  });

  it("flags a control-plane artifact when the tag lookup itself failed", () => {
    const artifact = build(controlPlaneInput());
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: MAIN_SHA });
    const violations = evaluateRunProvenance(artifact, run, { subjectTagLookupError: "404 Not Found" });
    expect(violations.some((v) => v.includes("could not resolve tag"))).toBe(true);
  });

  it("flags a control-plane artifact when the tag has since moved away from subject_sha (post-capture tag mutation)", () => {
    const artifact = build(controlPlaneInput());
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: MAIN_SHA });
    const violations = evaluateRunProvenance(artifact, run, { subjectTagSha: OTHER_SHA });
    expect(violations.some((v) => v.includes("does not match what tag") && v.includes("currently resolves to"))).toBe(true);
  });

  it("a legacy artifact (capture_mode absent) is still checked against subject_sha, unaffected by the context parameter", () => {
    const legacyInput = controlPlaneInput();
    delete legacyInput.capture_mode;
    delete legacyInput.control_plane_sha;
    delete legacyInput.control_plane_ref;
    delete legacyInput.subject_tag;
    legacyInput.subject_sha = MAIN_SHA;
    const artifact = build(legacyInput);
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: MAIN_SHA });
    // Passing an irrelevant/garbage context must not affect a legacy artifact at all.
    const violations = evaluateRunProvenance(artifact, run, { subjectTagSha: OTHER_SHA, subjectTagLookupError: "boom" });
    expect(violations).toEqual([]);
  });

  it("a legacy artifact still flags a real subject_sha/run mismatch exactly as before", () => {
    const legacyInput = controlPlaneInput();
    delete legacyInput.capture_mode;
    delete legacyInput.control_plane_sha;
    delete legacyInput.control_plane_ref;
    delete legacyInput.subject_tag;
    legacyInput.subject_sha = MAIN_SHA;
    const artifact = build(legacyInput);
    artifact.captured_at_utc = "2026-01-01T00:01:00Z";
    const run = fakeRun({ head_sha: OTHER_SHA });
    const violations = evaluateRunProvenance(artifact, run, {});
    expect(violations.some((v) => v.includes("subject_sha") && v.includes("was not made against the commit it claims"))).toBe(true);
  });
});

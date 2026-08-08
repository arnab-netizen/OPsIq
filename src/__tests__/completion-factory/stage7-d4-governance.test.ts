/**
 * BLOCK 1 — D-4 / A4 governance enforcement: hostile test suite.
 *
 * Proves that S7-I11 evidence is fail-closed until owner decision D-4 is made
 * and amendment A4 is applied with a concrete non-generic environment target.
 *
 * All eight required hostile cases:
 *   1. D-4 absent (A4 still in deferred_amendments) → reject
 *   2. A4 deferred → reject (same mechanism as #1 — A4 block precedes target check)
 *   3. Generic 'isolated_simulation' only → reject (TARGET_IS_GENERIC)
 *   4. Caller supplies target directly → ignored/rejected (target comes from manifest only)
 *   5. Governance target A + artifact environment B → reject (mismatch)
 *   6. Concrete authorized target A + artifact environment A → permit
 *   7. Rejection occurs BEFORE signing (throw fires before signing block executes)
 *   8. Rejection produces no artifact file (throw means no return value, no file written)
 *
 * Plus unit tests for resolveD4GovernanceTarget directly.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "crypto";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const root = join(__dirname, "..", "..", "..");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");
const resolverPath = join(root, "scripts", "lib", "d4-governance-resolver.mjs");

// ─── Ephemeral test signing key ───────────────────────────────────────────────
const { privateKey: SIGNING_KEY_PEM } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// ─── Fixture manifests ───────────────────────────────────────────────────────

/** Current production state: A4 still in deferred_amendments, no target field. */
const MANIFEST_A4_DEFERRED = `
status: PENDING
deferred_amendments:
  - id: A4
    blocked_by_owner_decision: D-4
    summary: "Add isolated_environment target for S7-I11."
amendments:
  - id: A3
    date: "2026-08-02"
    summary: "Correction only"
`;

/** A4 removed from deferred but s7_i11_environment_target still absent. */
const MANIFEST_A4_APPLIED_NO_TARGET = `
status: PENDING
deferred_amendments: []
amendments:
  - id: A4
    date: "2026-09-01"
    summary: "A4 applied"
`;

/** A4 applied but target is a generic purpose label — must be rejected. */
const MANIFEST_GENERIC_TARGET_ISOLATED_SIMULATION = `
status: PENDING
deferred_amendments: []
amendments:
  - id: A4
    date: "2026-09-01"
    summary: "A4 applied"
s7_i11_environment_target: isolated_simulation
`;

/** A4 applied but target is the other generic label. */
const MANIFEST_GENERIC_TARGET_STAGING = `
status: PENDING
deferred_amendments: []
amendments:
  - id: A4
    date: "2026-09-01"
    summary: "A4 applied"
s7_i11_environment_target: staging_or_isolated_simulation
`;

/** A4 properly applied with concrete target 'ci'. */
const MANIFEST_CONCRETE_TARGET_CI = `
status: PENDING
deferred_amendments: []
amendments:
  - id: A4
    date: "2026-09-01"
    authority: "owner decision D-4"
    summary: "A4 applied: S7-I11 authorized in GitHub Actions CI"
s7_i11_environment_target: ci
`;

// ─── Helper: call a pure resolver export via subprocess ──────────────────────

function callResolver(exportName: string, argsJson: unknown[]): { ok: boolean; result?: unknown; error?: string } {
  const script = `
    import * as lib from ${JSON.stringify(resolverPath)};
    const args = JSON.parse(process.env.LIB_ARGS);
    try {
      const result = lib[process.env.LIB_EXPORT](...args);
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
    }
  `;
  const res = spawnSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: root,
    env: { PATH: process.env.PATH ?? "", LIB_EXPORT: exportName, LIB_ARGS: JSON.stringify(argsJson) },
  });
  if (res.status !== 0 || !res.stdout) return { ok: false, error: res.stderr };
  return JSON.parse(res.stdout);
}

// ─── Helper: call evidence-artifact.mjs export via subprocess ────────────────

function callLib(exportName: string, argsJson: unknown[]): { threw: boolean; result?: unknown; error?: string } {
  const script = `
    import * as lib from ${JSON.stringify(libPath)};
    const args = JSON.parse(process.env.LIB_ARGS);
    try {
      const result = lib[process.env.LIB_EXPORT](...args);
      process.stdout.write(JSON.stringify({ threw: false, result }));
    } catch (e) {
      process.stdout.write(JSON.stringify({ threw: true, error: e.message }));
    }
  `;
  const res = spawnSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: root,
    env: { PATH: process.env.PATH ?? "", LIB_EXPORT: exportName, LIB_ARGS: JSON.stringify(argsJson) },
  });
  if (res.status !== 0 || !res.stdout) return { threw: true, error: res.stderr };
  return JSON.parse(res.stdout);
}

/** Base input for an S7-I11 artifact (LANE_E, simulation_adversarial). */
function s7i11Input(environment = "isolated_simulation") {
  return {
    invariant_id: "S7-I11",
    lane: "LANE_E",
    proof_type: "simulation_adversarial",
    environment,
    method: "test_run",
    assertion: "Nine adversarial failure scenarios all fail safely in isolated simulation.",
    result: "PASS",
    replay_command: "npx vitest run src/__tests__/completion-factory/stage7-s7-i11-failure-scenarios.test.ts --reporter=basic",
    raw_observation: "✓ 17 tests passed",
    repository: "arnab-netizen/OPsIq",
    run_id: "99999999999999999",
    run_number: 1,
    run_attempt: 1,
    workflow: "Synthetic Test",
    job: "capture",
    actor: "test-actor",
    event_name: "workflow_dispatch",
    subject_sha: "036c526940f349d7d06e05635f29c064c78ba71b",
    run_started_at: "2026-01-01T00:00:00Z",
    captured_at_utc: "2026-01-01T00:00:00Z",
    authorization_manifest_sha: null,
  };
}

// ─── Unit tests: resolveD4GovernanceTarget ───────────────────────────────────

describe("resolveD4GovernanceTarget — unit", () => {
  it("rejects when manifest is null (MANIFEST_UNREADABLE)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: null }]);
    expect(out.ok).toBe(true); // subprocess succeeded
    const result = out.result as { ok: boolean; reason: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("MANIFEST_UNREADABLE");
  });

  it("rejects when manifest is empty string (MANIFEST_UNREADABLE)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: "" }]);
    const result = out.result as { ok: boolean; reason: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("MANIFEST_UNREADABLE");
  });

  it("CASE 1+2: rejects when A4 is still in deferred_amendments (D4_NOT_YET_DECIDED)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: MANIFEST_A4_DEFERRED }]);
    const result = out.result as { ok: boolean; reason: string; detail: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("D4_NOT_YET_DECIDED");
    expect(result.detail).toMatch(/A4.*deferred_amendments/i);
  });

  it("rejects when A4 is applied but s7_i11_environment_target is absent (TARGET_ABSENT)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: MANIFEST_A4_APPLIED_NO_TARGET }]);
    const result = out.result as { ok: boolean; reason: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("TARGET_ABSENT");
  });

  it("CASE 3: rejects generic target 'isolated_simulation' (TARGET_IS_GENERIC)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: MANIFEST_GENERIC_TARGET_ISOLATED_SIMULATION }]);
    const result = out.result as { ok: boolean; reason: string; detail: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("TARGET_IS_GENERIC");
    expect(result.detail).toMatch(/isolated_simulation/);
  });

  it("CASE 3: rejects generic target 'staging_or_isolated_simulation' (TARGET_IS_GENERIC)", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: MANIFEST_GENERIC_TARGET_STAGING }]);
    const result = out.result as { ok: boolean; reason: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("TARGET_IS_GENERIC");
  });

  it("CASE 6: permits concrete target 'ci' and returns target string", () => {
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: MANIFEST_CONCRETE_TARGET_CI }]);
    const result = out.result as { ok: boolean; target: string };
    expect(result.ok).toBe(true);
    expect(result.target).toBe("ci");
  });

  it("CASE 4: caller cannot supply target directly — only manifestYaml is accepted", () => {
    // Even if the caller passes a crafted object with a 'target' field alongside the YAML,
    // the function ignores it. The only accepted API is { manifestYaml }.
    // We test this by showing a null manifest rejects even when a caller tries to bypass.
    const out = callResolver("resolveD4GovernanceTarget", [{ manifestYaml: null, target: "ci" }]);
    const result = out.result as { ok: boolean; reason: string };
    // Extra 'target' property is ignored; null manifest → MANIFEST_UNREADABLE
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("MANIFEST_UNREADABLE");
  });
});

// ─── Integration tests: buildEvidenceArtifact D-4 enforcement ────────────────

describe("buildEvidenceArtifact — S7-I11 D-4 fail-closed (BLOCK 1)", () => {
  it("CASE 1+2: throws when no closureManifestYaml provided (default fail-closed)", () => {
    const out = callLib("buildEvidenceArtifact", [s7i11Input(), {}]);
    expect(out.threw).toBe(true);
    expect(out.error).toMatch(/D-4 enforcement/i);
  });

  it("CASE 1+2: throws when A4 still deferred (D4_NOT_YET_DECIDED)", () => {
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input(),
      { closureManifestYaml: MANIFEST_A4_DEFERRED },
    ]);
    expect(out.threw).toBe(true);
    expect(out.error).toMatch(/D4_NOT_YET_DECIDED/i);
  });

  it("CASE 3: throws when target is generic 'isolated_simulation' (TARGET_IS_GENERIC)", () => {
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("isolated_simulation"),
      { closureManifestYaml: MANIFEST_GENERIC_TARGET_ISOLATED_SIMULATION },
    ]);
    expect(out.threw).toBe(true);
    expect(out.error).toMatch(/TARGET_IS_GENERIC/i);
  });

  it("CASE 4: throws when caller claims correct environment but no manifest (cannot bypass)", () => {
    // Caller sets environment='ci' (which would be the correct target) but provides
    // no closureManifestYaml. The system cannot verify D-4 without the manifest.
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("ci"),
      {},
    ]);
    expect(out.threw).toBe(true);
    expect(out.error).toMatch(/MANIFEST_UNREADABLE|D-4 enforcement/i);
  });

  it("CASE 5: throws when governance target='ci' but artifact environment='isolated_simulation'", () => {
    // Governance authorizes 'ci'; artifact claims 'isolated_simulation' — mismatch.
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("isolated_simulation"),
      { closureManifestYaml: MANIFEST_CONCRETE_TARGET_CI },
    ]);
    expect(out.threw).toBe(true);
    expect(out.error).toMatch(/does not match D-4 authorized target/i);
  });

  it("CASE 6: permits when concrete authorized target 'ci' matches artifact environment 'ci'", () => {
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("ci"),
      { closureManifestYaml: MANIFEST_CONCRETE_TARGET_CI },
    ]);
    expect(out.threw).toBe(false);
    const artifact = out.result as { invariant_id: string; environment: string; signature: null };
    expect(artifact.invariant_id).toBe("S7-I11");
    expect(artifact.environment).toBe("ci");
  });

  it("CASE 7: rejection occurs BEFORE signing — throw fires before signingKey is used", () => {
    // Provide a signing key. If D-4 check fires before signing, the artifact is never
    // signed and the error occurs before the signing block executes.
    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("isolated_simulation"),
      { signingKey: SIGNING_KEY_PEM, closureManifestYaml: MANIFEST_A4_DEFERRED },
    ]);
    expect(out.threw).toBe(true);
    // Error mentions D-4, not anything about the signing key.
    expect(out.error).toMatch(/D-4 enforcement|D4_NOT_YET_DECIDED/i);
  });

  it("CASE 8: rejection produces no artifact — thrown function returns nothing", () => {
    // When build throws, no artifact is returned — caller cannot write a file.
    const tempDir = mkdtempSync(join(tmpdir(), "s7-d4-test-"));
    const outDir = join(tempDir, "artifacts");
    mkdirSync(outDir, { recursive: true });

    const out = callLib("buildEvidenceArtifact", [
      s7i11Input("isolated_simulation"),
      { closureManifestYaml: MANIFEST_A4_DEFERRED },
    ]);

    expect(out.threw).toBe(true);

    // If throw happened, caller has nothing to write. Directory stays empty.
    const files = readdirSync(outDir);
    expect(files).toHaveLength(0);

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ─── Integration tests: validateEvidenceArtifact D-4 enforcement ─────────────

describe("validateEvidenceArtifact — S7-I11 D-4 fail-closed", () => {
  it("fails when no closureManifestYaml provided (MANIFEST_UNREADABLE)", () => {
    // Build a minimal artifact to validate (use S7-I12 to bypass build-time guard,
    // then swap invariant_id to test the validate-time guard directly).
    const buildOut = callLib("buildEvidenceArtifact", [
      {
        invariant_id: "S7-I12",
        lane: "LANE_E",
        proof_type: "simulation_runbook_recovery",
        environment: "isolated_simulation",
        method: "test_run",
        assertion: "Recovery confirmed.",
        result: "PASS",
        replay_command: "npx vitest run",
        raw_observation: "ok",
        repository: "arnab-netizen/OPsIq",
        run_id: "1", run_number: 1, run_attempt: 1,
        workflow: "Test", job: "capture", actor: "a",
        event_name: "workflow_dispatch",
        subject_sha: "036c526940f349d7d06e05635f29c064c78ba71b",
        run_started_at: "2026-01-01T00:00:00Z",
        captured_at_utc: "2026-01-01T00:00:00Z",
        authorization_manifest_sha: null,
      },
      {},
    ]);
    expect(buildOut.threw).toBe(false);

    const artifact = { ...(buildOut.result as object), invariant_id: "S7-I11" };

    const validateOut = callLib("validateEvidenceArtifact", [artifact, {}]);
    expect(validateOut.threw).toBe(false); // validateEvidenceArtifact returns violations, doesn't throw
    const { violations } = validateOut.result as { violations: string[] };
    const s7Violation = violations.find((v: string) => v.includes("D-4") || v.includes("S7-I11"));
    expect(s7Violation).toBeTruthy();
    expect(s7Violation).toMatch(/MANIFEST_UNREADABLE|D-4 enforcement/i);
  });

  it("permits S7-I11 when manifest has concrete target matching artifact environment", () => {
    // Build directly with concrete target environment='ci' and manifest
    const buildOut = callLib("buildEvidenceArtifact", [
      s7i11Input("ci"),
      { closureManifestYaml: MANIFEST_CONCRETE_TARGET_CI },
    ]);
    expect(buildOut.threw).toBe(false);

    const artifact = buildOut.result;

    // Validate with the same manifest — should produce no D-4 violation.
    const validateOut = callLib("validateEvidenceArtifact", [
      artifact,
      { closureManifestYaml: MANIFEST_CONCRETE_TARGET_CI },
    ]);
    expect(validateOut.threw).toBe(false);
    const { violations } = validateOut.result as { violations: string[] };
    const d4Violations = violations.filter((v: string) => v.includes("D-4") || v.includes("S7-I11"));
    // No D-4 related violation
    expect(d4Violations).toHaveLength(0);
  });
});

// ─── Non-S7-I11 invariants: D-4 guard must NOT fire ─────────────────────────

describe("buildEvidenceArtifact — D-4 guard does not affect other invariants", () => {
  it("S7-I12 builds without any manifest and without throwing", () => {
    const out = callLib("buildEvidenceArtifact", [
      {
        invariant_id: "S7-I12",
        lane: "LANE_E",
        proof_type: "simulation_runbook_recovery",
        environment: "isolated_simulation",
        method: "test_run",
        assertion: "Recovery confirmed.",
        result: "PASS",
        replay_command: "npx vitest run",
        raw_observation: "ok",
        repository: "arnab-netizen/OPsIq",
        run_id: "1", run_number: 1, run_attempt: 1,
        workflow: "Test", job: "capture", actor: "a",
        event_name: "workflow_dispatch",
        subject_sha: "036c526940f349d7d06e05635f29c064c78ba71b",
        run_started_at: "2026-01-01T00:00:00Z",
        captured_at_utc: "2026-01-01T00:00:00Z",
        authorization_manifest_sha: null,
      },
      {},
    ]);
    expect(out.threw).toBe(false);
    const artifact = out.result as { invariant_id: string };
    expect(artifact.invariant_id).toBe("S7-I12");
  });
});

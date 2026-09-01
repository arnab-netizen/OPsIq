/**
 * Factory Stage 7 — Ed25519 signing hostile audit
 *
 * Nine adversarial failure scenarios that must each fail safely, visibly, and
 * recoverably. Tested directly against the pure signing library
 * (scripts/lib/evidence-artifact.mjs) with explicitly supplied ephemeral key
 * material — never through the CLI validator, whose key registry precedence
 * (real production registry over any test-supplied key, once the registry is
 * active) is covered separately in stage7-registry-precedence.test.ts. All keys
 * here are ephemeral: generated at suite initialisation, never written to disk
 * or committed. Production signing key generation is a separate, owner-only
 * action recorded in .governance/stage7-signing-keys.yaml.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Key registry: .governance/stage7-signing-keys.yaml
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "crypto";
import { spawnSync } from "child_process";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");

// ─── Ephemeral key pairs ──────────────────────────────────────────────────────

const { privateKey: LEGITIMATE_PRIVATE_KEY, publicKey: LEGITIMATE_PUBLIC_KEY } =
  generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

const { privateKey: ATTACKER_PRIVATE_KEY, publicKey: ATTACKER_PUBLIC_KEY } =
  generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Evaluate a pure library export in a subprocess, so the shipped .mjs is what runs. */
function callLib(exportName: string, argsJson: unknown[]): unknown {
  const script = `
    import * as lib from ${JSON.stringify(libPath)};
    const args = JSON.parse(process.env.LIB_ARGS);
    process.stdout.write(JSON.stringify(lib[process.env.LIB_EXPORT](...args)));
  `;
  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      LIB_EXPORT: exportName,
      LIB_ARGS: JSON.stringify(argsJson),
    },
  });
  if (result.status !== 0) throw new Error(`${exportName} threw: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function baseInput() {
  return {
    invariant_id: "S7-I12",
    lane: "LANE_E",
    proof_type: "simulation_runbook_recovery",
    environment: "isolated_simulation",
    method: "test_run",
    assertion: "Staged failure introduced; runbook followed; recovery confirmed without undocumented steps.",
    result: "PASS",
    replay_command: "npx vitest run src/__tests__/example.test.ts --reporter=basic",
    raw_observation: "PASS  src/example.test.ts\n Tests  9 passed (9)\n",
    repository: "arnab-netizen/OPsIq",
    run_id: "99999999999999999",
    run_number: 1,
    run_attempt: 1,
    workflow: "Synthetic Test Workflow",
    job: "capture",
    actor: "test-actor",
    event_name: "workflow_dispatch",
    subject_sha: "0000000000000000000000000000000000000001",
    run_started_at: "2026-01-01T00:00:00Z",
    captured_at_utc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    authorization_manifest_sha: null,
  };
}

function buildArtifact(signingKey: string | null, opts: Record<string, unknown> = {}) {
  const signOpts = signingKey ? { signingKey } : {};
  return callLib("buildEvidenceArtifact", [{ ...baseInput(), ...opts }, signOpts]) as Record<string, unknown>;
}

function rederiveId(artifact: Record<string, unknown>): Record<string, unknown> {
  const id = callLib("computeArtifactId", [artifact]) as string;
  return { ...artifact, artifact_id: id };
}

/** verifySignature() against explicitly supplied ephemeral key material. */
function verifyWith(artifact: Record<string, unknown>, signingKey: string | null): string {
  return callLib("verifySignature", [artifact, signingKey]) as string;
}

/** Structural violations (algorithm, content-hash, etc.) — independent of any key registry. */
function structuralViolations(artifact: Record<string, unknown>, signingKey: string | null = null): string[] {
  const result = callLib("validateEvidenceArtifact", [artifact, signingKey ? { signingKey } : {}]) as {
    violations: string[];
  };
  return result.violations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Nine adversarial failure scenarios (S7-I11 contract)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 — Ed25519 hostile audit (S7-I11)", () => {
  // ── Scenario 1: wrong private key ──────────────────────────────────────────
  it("H-01: artifact signed with attacker private key does not verify against legitimate key", () => {
    const artifact = buildArtifact(ATTACKER_PRIVATE_KEY);
    expect(verifyWith(artifact, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 2: wrong public key presented directly ─────────────────────────
  it("H-02: verification with the attacker public key rejects a legitimately signed artifact", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    expect(verifyWith(artifact, ATTACKER_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 3: unknown key_id in registry lookup ───────────────────────────
  it("H-03: unknown key_id in a registry Map returns INVALID, not UNCHECKED", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    // Build a Map containing only a different key_id than the artifact carries.
    // Cannot pass a Map via JSON; use a dedicated inline module script instead.
    const script = `
      import { verifySignature } from ${JSON.stringify(libPath)};
      const artifact = JSON.parse(process.env.ARTIFACT);
      // Registry has 'different-key-id'; artifact has DEFAULT_SIGNING_KEY_ID.
      const registry = new Map([["different-key-id", process.env.PUBLIC_KEY]]);
      process.stdout.write(JSON.stringify(verifySignature(artifact, registry)));
    `;
    const result = spawnSync("node", ["--input-type=module", "-e", script], {
      encoding: "utf8",
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        ARTIFACT: JSON.stringify(artifact),
        PUBLIC_KEY: LEGITIMATE_PUBLIC_KEY,
      },
    });
    expect(result.status).toBe(0);
    // Unknown key_id in registry is INVALID, not UNCHECKED. Fail closed.
    expect(JSON.parse(result.stdout)).toBe("INVALID");
  });

  // ── Scenario 4: key_id in signature mutated ─────────────────────────────────
  it("H-04: mutating signature.key_id invalidates the signature", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = rederiveId({
      ...artifact,
      signature: { ...(artifact.signature as Record<string, unknown>), key_id: "evd-mutated-key-id" },
    });
    expect(verifyWith(tampered, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 5: algorithm field mutated ─────────────────────────────────────
  it("H-05: mutating signature.algorithm invalidates the artifact structurally", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = rederiveId({
      ...artifact,
      signature: { ...(artifact.signature as Record<string, unknown>), algorithm: "HMAC-SHA256" },
    });
    // Wrong algorithm is a structural violation, not just a failed verify.
    const violations = structuralViolations(tampered, LEGITIMATE_PUBLIC_KEY);
    expect(violations.some((v) => /signature\.algorithm/.test(v))).toBe(true);
  });

  // ── Scenario 6: result field mutated ────────────────────────────────────────
  it("H-06: mutating result from FAIL to PASS invalidates the signature", () => {
    const failing = buildArtifact(LEGITIMATE_PRIVATE_KEY, { result: "FAIL" });
    const tampered = rederiveId({ ...failing, result: "PASS" });
    expect(verifyWith(tampered, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 7: observation raw mutated ─────────────────────────────────────
  it("H-07: mutating observation.raw invalidates the content_hash and the signature", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = {
      ...artifact,
      observation: {
        ...(artifact.observation as Record<string, unknown>),
        raw: "ATTACKER INJECTED OBSERVATION\n",
      },
    };
    const rederived = rederiveId(tampered);
    const violations = structuralViolations(rederived, LEGITIMATE_PUBLIC_KEY);
    expect(violations.some((v) => v.includes("content_hash does not hash observation.raw"))).toBe(true);
    expect(verifyWith(rederived, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 8: authorization_manifest_sha mutated ──────────────────────────
  it("H-08: mutating authorization_manifest_sha invalidates the signature", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY, {
      authorization_manifest_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
    });
    const tampered = rederiveId({
      ...artifact,
      authorization_manifest_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(verifyWith(tampered, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });

  // ── Scenario 9: subject_sha mutated ─────────────────────────────────────────
  it("H-09: mutating subject_sha with id re-derived still fails on signature", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = rederiveId({ ...artifact, subject_sha: "c".repeat(40) });
    expect(verifyWith(tampered, LEGITIMATE_PUBLIC_KEY)).toBe("INVALID");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional fail-closed properties
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 — Ed25519 fail-closed properties", () => {
  it("verifySignature with null signingKey returns UNCHECKED, not VERIFIED", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    expect(verifyWith(artifact, null)).toBe("UNCHECKED");
  });

  it("unsigned artifact (signature: null) returns ABSENT, not UNCHECKED", () => {
    const artifact = buildArtifact(null);
    expect((artifact as Record<string, unknown>).signature).toBeNull();
    expect(verifyWith(artifact, LEGITIMATE_PRIVATE_KEY)).toBe("ABSENT");
  });

  it("signature with a 127-hex value (one byte short) is INVALID", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const truncated = rederiveId({
      ...artifact,
      signature: {
        ...(artifact.signature as Record<string, unknown>),
        value: "a".repeat(127),
      },
    });
    expect(verifyWith(truncated, LEGITIMATE_PRIVATE_KEY)).toBe("INVALID");
  });

  it("signature with uppercase hex is INVALID", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const sig = (artifact.signature as Record<string, unknown>).value as string;
    const uppercased = rederiveId({
      ...artifact,
      signature: {
        ...(artifact.signature as Record<string, unknown>),
        value: sig.toUpperCase(),
      },
    });
    // Uppercase hex does not match the HEX128 pattern → INVALID.
    expect(verifyWith(uppercased, LEGITIMATE_PRIVATE_KEY)).toBe("INVALID");
  });

  it("a legitimately signed artifact verifies VERIFIED against its own public key", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    expect(verifyWith(artifact, LEGITIMATE_PUBLIC_KEY)).toBe("VERIFIED");
  });

  it("a legitimately signed artifact verifies VERIFIED when given the private key directly", () => {
    // verifySignature() derives the public key from a private key and accepts a
    // public key directly with identical results — both paths must converge.
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    expect(verifyWith(artifact, LEGITIMATE_PRIVATE_KEY)).toBe("VERIFIED");
  });
});

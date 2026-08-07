/**
 * Factory Stage 7 — Ed25519 signing hostile audit
 *
 * Nine adversarial failure scenarios that must each fail safely, visibly, and
 * recoverably. All keys are ephemeral: generated at suite initialisation, never
 * written to disk or committed. Production signing key generation is a later
 * owner action.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Key registry: .governance/stage7-signing-keys.yaml
 */

import { describe, it, expect, afterAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const root = join(__dirname, "..", "..", "..");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");
const validatorScript = join(root, "scripts", "validate-evidence-artifacts.mjs");

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

const tempDirs: string[] = [];
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

function makeTempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "s7-hostile-"));
  tempDirs.push(d);
  return d;
}

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

function runValidator(dir: string, signingKey: string | null): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [validatorScript, "--dir", dir], {
    encoding: "utf8",
    cwd: root,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ...(signingKey ? { EVIDENCE_SIGNING_KEY: signingKey } : {}),
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function baseInput() {
  return {
    invariant_id: "S7-I11",
    lane: "LANE_E",
    proof_type: "simulation_adversarial",
    environment: "isolated_simulation",
    method: "test_run",
    assertion: "Nine adversarial failure scenarios each fail safely, visibly and recoverably.",
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

function stageArtifact(artifact: Record<string, unknown>): string {
  const dir = makeTempDir();
  const outDir = join(dir, "artifacts");
  mkdirSync(outDir, { recursive: true });
  const id = artifact.artifact_id as string;
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(artifact, null, 2), "utf8");
  return outDir;
}

function rederiveId(artifact: Record<string, unknown>): Record<string, unknown> {
  const id = callLib("computeArtifactId", [artifact]) as string;
  return { ...artifact, artifact_id: id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Nine adversarial failure scenarios (S7-I11 contract)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 — Ed25519 hostile audit (S7-I11)", () => {
  // ── Scenario 1: wrong private key ──────────────────────────────────────────
  it("H-01: artifact signed with attacker private key does not verify against legitimate key", () => {
    const artifact = buildArtifact(ATTACKER_PRIVATE_KEY);
    const dir = stageArtifact(artifact);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
  });

  // ── Scenario 2: wrong public key presented directly ─────────────────────────
  it("H-02: verification with the attacker public key rejects a legitimately signed artifact", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const dir = stageArtifact(artifact);
    // Validator given attacker's PUBLIC key — cannot verify legitimate signature.
    const { status, stdout } = runValidator(dir, ATTACKER_PUBLIC_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
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
    const dir = stageArtifact(tampered);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
  });

  // ── Scenario 5: algorithm field mutated ─────────────────────────────────────
  it("H-05: mutating signature.algorithm invalidates the artifact structurally", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = rederiveId({
      ...artifact,
      signature: { ...(artifact.signature as Record<string, unknown>), algorithm: "HMAC-SHA256" },
    });
    const dir = stageArtifact(tampered);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    // Wrong algorithm is a structural INVALID, not just a failed verify.
    expect(stdout).toMatch(/signature.*algorithm|algorithm.*invalid/i);
  });

  // ── Scenario 6: result field mutated ────────────────────────────────────────
  it("H-06: mutating result from FAIL to PASS invalidates the signature", () => {
    const failing = buildArtifact(LEGITIMATE_PRIVATE_KEY, { result: "FAIL" });
    const tampered = rederiveId({ ...failing, result: "PASS" });
    const dir = stageArtifact(tampered);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
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
    const dir = stageArtifact(rederived);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("content_hash does not hash observation.raw");
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
    const dir = stageArtifact(tampered);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
  });

  // ── Scenario 9: subject_sha mutated ─────────────────────────────────────────
  it("H-09: mutating subject_sha with id re-derived still fails on signature", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const tampered = rederiveId({ ...artifact, subject_sha: "c".repeat(40) });
    const dir = stageArtifact(tampered);
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    expect(status).toBe(1);
    expect(stdout).toContain("signature does not verify");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional fail-closed properties
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 — Ed25519 fail-closed properties", () => {
  it("verifySignature with null signingKey returns UNCHECKED, not VERIFIED", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const state = callLib("verifySignature", [artifact, null]);
    expect(state).toBe("UNCHECKED");
  });

  it("unsigned artifact (signature: null) returns ABSENT, not UNCHECKED", () => {
    const artifact = buildArtifact(null);
    expect((artifact as Record<string, unknown>).signature).toBeNull();
    const state = callLib("verifySignature", [artifact, LEGITIMATE_PRIVATE_KEY]);
    expect(state).toBe("ABSENT");
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
    const state = callLib("verifySignature", [truncated, LEGITIMATE_PRIVATE_KEY]);
    expect(state).toBe("INVALID");
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
    const state = callLib("verifySignature", [uppercased, LEGITIMATE_PRIVATE_KEY]);
    // Uppercase hex does not match the HEX128 pattern → INVALID.
    expect(state).toBe("INVALID");
  });

  it("a legitimately signed artifact verifies VERIFIED against its own public key", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const state = callLib("verifySignature", [artifact, LEGITIMATE_PUBLIC_KEY]);
    expect(state).toBe("VERIFIED");
  });

  it("a legitimately signed artifact verifies VERIFIED when validator receives private key", () => {
    const artifact = buildArtifact(LEGITIMATE_PRIVATE_KEY);
    const dir = stageArtifact(artifact);
    // Validator derives public key from private key — both paths must converge.
    const { status, stdout } = runValidator(dir, LEGITIMATE_PRIVATE_KEY);
    // Status 0 = structural pass; UNVERIFIED because provenance is not checked.
    expect(status).toBe(0);
    expect(stdout).not.toContain("signature does not verify");
    expect(stdout).not.toContain("REJECTED");
  });
});

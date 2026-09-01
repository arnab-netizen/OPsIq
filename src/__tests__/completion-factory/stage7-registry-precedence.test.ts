/**
 * Factory Stage 7 — production key registry precedence over test-supplied keys
 *
 * scripts/validate-evidence-artifacts.mjs is explicit about this precedence:
 *
 *   // Registry takes precedence; env var is a fallback for test suites that
 *   // cannot commit an active key but need signature verification.
 *   const signingKey = keyRegistry.size > 0 ? keyRegistry : evidenceSigningKeyPem;
 *
 * This is production behavior, not a test convenience, and this suite proves it
 * end-to-end against the real, unmodified validator script — not a mock and not a
 * bypass. Owner decision (2026-09-01): once the production key registry
 * (.governance/stage7-signing-keys.yaml) carries an active key, EVIDENCE_SIGNING_KEY
 * must never be able to override it, under any circumstance.
 *
 * The registry's own security invariant is that its path is fixed and cannot be
 * overridden at runtime (scripts/lib/evidence-artifact.mjs: "No runtime path
 * override is accepted — callers always pass the hardcoded path"). This suite does
 * not violate that: it never modifies the real repository's registry file, and it
 * never adds a bypass flag or env var to the validator. Instead it runs an
 * unmodified copy of the validator script (plus its two library dependencies) in an
 * isolated temporary directory that has its own `.governance/stage7-signing-keys.yaml`
 * at the same relative path the real script always resolves against
 * (`join(__dirname, '..', '.governance', 'stage7-signing-keys.yaml')`, computed from
 * the running script's own location). This proves the real registry-precedence code
 * path without ever touching, or needing, the real repository's registry or the real
 * production private key — no production secret is required or exposed by this
 * suite, and CI artifacts from it never depend on one.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 * Key registry: .governance/stage7-signing-keys.yaml
 */

import { describe, it, expect, afterAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const root = join(__dirname, "..", "..", "..");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");
const validatorScriptSrc = join(root, "scripts", "validate-evidence-artifacts.mjs");
const libSrc = join(root, "scripts", "lib", "evidence-artifact.mjs");
const d4ResolverSrc = join(root, "scripts", "lib", "d4-governance-resolver.mjs");

// The real registry's fixed key_id (scripts/lib/evidence-artifact.mjs:
// DEFAULT_SIGNING_KEY_ID). Read off the shipped library rather than duplicated as a
// literal, so this suite cannot silently drift from the constant it is proving
// production behavior against.
const DEFAULT_SIGNING_KEY_ID = spawnSync(
  "node",
  ["--input-type=module", "-e", `import * as lib from ${JSON.stringify(libPath)}; process.stdout.write(lib.DEFAULT_SIGNING_KEY_ID);`],
  { encoding: "utf8", cwd: root, env: { PATH: process.env.PATH ?? "" } },
).stdout;

// ─── Ephemeral key pairs — never written to disk except inside an isolated,
// discarded temp directory's own throwaway "registry" for the duration of one test.

const registryKeyPair = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "der" },
});

const envKeyPair = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "der" },
});

const tempDirs: string[] = [];
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

function makeTempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

/**
 * An isolated copy of the real, unmodified validator script plus its library
 * dependencies, with its own `.governance/stage7-signing-keys.yaml` carrying one
 * active key. Because the script resolves the registry path relative to its own
 * location, the copy reads this isolated registry — never the real repository's.
 */
function isolatedValidatorWithActiveRegistry(activePublicKeyDer: Buffer): string {
  const tempRoot = makeTempDir("s7-isolated-validator-");
  mkdirSync(join(tempRoot, "scripts", "lib"), { recursive: true });
  mkdirSync(join(tempRoot, ".governance"), { recursive: true });
  copyFileSync(validatorScriptSrc, join(tempRoot, "scripts", "validate-evidence-artifacts.mjs"));
  copyFileSync(libSrc, join(tempRoot, "scripts", "lib", "evidence-artifact.mjs"));
  copyFileSync(d4ResolverSrc, join(tempRoot, "scripts", "lib", "d4-governance-resolver.mjs"));
  const registryYaml = [
    'version: "1"',
    "keys:",
    `  - key_id: "${DEFAULT_SIGNING_KEY_ID}"`,
    '    algorithm: "Ed25519"',
    '    status: "active"',
    `    public_key_spki_der_base64: "${activePublicKeyDer.toString("base64")}"`,
    "",
  ].join("\n");
  writeFileSync(join(tempRoot, ".governance", "stage7-signing-keys.yaml"), registryYaml, "utf8");
  return tempRoot;
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
    env: { PATH: process.env.PATH ?? "", LIB_EXPORT: exportName, LIB_ARGS: JSON.stringify(argsJson) },
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

function stageArtifact(artifact: Record<string, unknown>): string {
  const dir = makeTempDir("s7-registry-precedence-artifacts-");
  const outDir = join(dir, "artifacts");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${artifact.artifact_id as string}.json`), JSON.stringify(artifact, null, 2), "utf8");
  return outDir;
}

function runIsolatedValidator(
  isolatedRoot: string,
  artifactsDir: string,
  envSigningKey: string | null,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [join(isolatedRoot, "scripts", "validate-evidence-artifacts.mjs"), "--dir", artifactsDir], {
    encoding: "utf8",
    cwd: isolatedRoot,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ...(envSigningKey ? { EVIDENCE_SIGNING_KEY: envSigningKey } : {}),
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("Stage 7 — active key registry takes precedence over EVIDENCE_SIGNING_KEY", () => {
  it("ENV_KEY_CANNOT_OVERRIDE_ACTIVE_REGISTRY: an artifact signed with a different key than the active registry's is REJECTED, even though EVIDENCE_SIGNING_KEY is present and would itself verify it", () => {
    // ACTIVE_REGISTRY_PRESENT=YES
    const isolatedRoot = isolatedValidatorWithActiveRegistry(registryKeyPair.publicKey);
    // EVIDENCE_SIGNING_KEY_ENV_PRESENT=YES, ENV_KEY_DIFFERENT_FROM_REGISTRY_KEY=YES
    const artifact = callLib("buildEvidenceArtifact", [
      baseInput(),
      { signingKey: envKeyPair.privateKey, signingKeyId: DEFAULT_SIGNING_KEY_ID },
    ]) as Record<string, unknown>;
    const artifactsDir = stageArtifact(artifact);

    const result = runIsolatedValidator(isolatedRoot, artifactsDir, envKeyPair.privateKey);

    // RESULT=ENV_KEY_CANNOT_OVERRIDE_ACTIVE_REGISTRY: the artifact's own key (which
    // EVIDENCE_SIGNING_KEY correctly matches) is ignored — the active registry's
    // different key is used instead, so verification against it fails.
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("REJECTED");
    expect(result.stdout).toContain("signature does not verify against the evidence signing key");
    expect(result.stdout).toContain("signing key available");
  });

  it("an artifact signed with the SAME key as the active registry verifies, regardless of what EVIDENCE_SIGNING_KEY is set to", () => {
    const isolatedRoot = isolatedValidatorWithActiveRegistry(registryKeyPair.publicKey);
    const artifact = callLib("buildEvidenceArtifact", [
      baseInput(),
      { signingKey: registryKeyPair.privateKey, signingKeyId: DEFAULT_SIGNING_KEY_ID },
    ]) as Record<string, unknown>;
    const artifactsDir = stageArtifact(artifact);

    // EVIDENCE_SIGNING_KEY is set to an unrelated key — the registry wins regardless.
    const result = runIsolatedValidator(isolatedRoot, artifactsDir, envKeyPair.privateKey);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("REJECTED");
    expect(result.stdout).not.toContain("signature does not verify");
  });

  it("the same artifact, validated with no EVIDENCE_SIGNING_KEY set at all, still verifies against the active registry", () => {
    const isolatedRoot = isolatedValidatorWithActiveRegistry(registryKeyPair.publicKey);
    const artifact = callLib("buildEvidenceArtifact", [
      baseInput(),
      { signingKey: registryKeyPair.privateKey, signingKeyId: DEFAULT_SIGNING_KEY_ID },
    ]) as Record<string, unknown>;
    const artifactsDir = stageArtifact(artifact);

    const result = runIsolatedValidator(isolatedRoot, artifactsDir, null);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("REJECTED");
  });
});

/**
 * Factory Stage 7 — evidence capture framework, hostile audit
 *
 * Proves the two claims the framework exists to make:
 *
 *   1. An interactive session cannot produce evidence. `capture-evidence.mjs`
 *      refuses to run outside GitHub Actions, exposes no flag by which a caller
 *      could state its own provenance, and a hand-written artifact can never
 *      exceed acceptance level UNVERIFIED — which may not back a PROVEN invariant.
 *
 *   2. Every forgery route fails. Fake run id, fake SHA, copied artifact, edited
 *      timestamp, modified content hash, missing replay command, wrong producer,
 *      manual artifact — each is rejected, and each rejection names the mechanism.
 *
 * The suite drives the real scripts as subprocesses. Nothing here is Stage 7
 * evidence: every artifact is built in a temp directory from a synthetic run
 * context that no GitHub run will ever match, and the repository's own artifact
 * directory is never written to.
 *
 * Design and threat model: docs/opsiq/evidence/stage-7/EVIDENCE_ARTIFACT_SPEC.md
 */

import { describe, it, expect, afterAll } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, renameSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { canonicalStringify as canonicalStringifyTs } from "@/services/integrity/hash";

const root = join(__dirname, "..", "..", "..");
const captureScript = join(root, "scripts", "capture-evidence.mjs");
const validatorScript = join(root, "scripts", "validate-evidence-artifacts.mjs");
const libPath = join(root, "scripts", "lib", "evidence-artifact.mjs");

const SIGNING_KEY = "test-only-signing-key-never-provisioned-anywhere";

/**
 * A synthetic GitHub Actions context. The run id is deliberately impossible
 * (17 nines) so that if one of these artifacts ever escaped into a real
 * provenance check it would fail at the API request rather than match a run.
 */
const FAKE_RUN_ENV: Record<string, string> = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "arnab-netizen/OPsIq",
  GITHUB_RUN_ID: "99999999999999999",
  GITHUB_RUN_NUMBER: "1",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_WORKFLOW: "Synthetic Test Workflow",
  GITHUB_JOB: "capture",
  GITHUB_ACTOR: "test-actor",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_SHA: "0000000000000000000000000000000000000001",
  GITHUB_RUN_STARTED_AT: "2026-01-01T00:00:00Z",
};

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "s7-evidence-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

/** The fields these tests read off a captured artifact. */
type Artifact = {
  artifact_id: string;
  invariant_id: string;
  lane: string;
  subject_sha: string;
  captured_at_utc: string;
  environment: string;
  method: string;
  deployment_id: string | null;
  supersedes: string | null;
  producer: Record<string, unknown> & { type: string; repository: string; run_id: string | null };
  replay: { replayable: boolean; command: string | null };
  observation: { raw: string; content_hash: string; byte_length: number; truncated: boolean };
  redaction_attestation: Record<string, unknown>;
  signature: { algorithm: string; key_id: string; value: string } | null;
};

function runNode(script: string, args: string[], env: Record<string, string> = {}): RunResult {
  const result = spawnSync("node", [script, ...args], {
    encoding: "utf8",
    cwd: root,
    // A clean base env: no inherited GITHUB_* from a CI run executing this suite,
    // so "refuses outside Actions" is actually tested rather than accidentally
    // satisfied by the harness.
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

const CAPTURE_DEFAULTS = [
  "--invariant", "S7-I11",
  "--lane", "LANE_E",
  "--proof-type", "simulation_adversarial",
  "--environment", "isolated_simulation",
  "--method", "test_run",
  "--assertion", "Nine adversarial failure scenarios each fail safely, visibly and recoverably.",
  "--result", "PASS",
  "--replay-command", "npx vitest run src/__tests__/example.test.ts --reporter=basic",
];

function writeObservation(dir: string, text = "Test Files  1 passed (1)\n     Tests  9 passed (9)\n"): string {
  const path = join(dir, "observation.txt");
  writeFileSync(path, text, "utf8");
  return path;
}

/** Capture a valid artifact through the shipped helper. Returns its parsed form. */
function captureArtifact(
  overrides: { args?: string[]; env?: Record<string, string>; observation?: string; signed?: boolean } = {},
): { artifact: Artifact; dir: string; path: string } {
  const dir = makeTempDir();
  const observationPath = writeObservation(dir, overrides.observation);
  const outDir = join(dir, "artifacts");
  const env = {
    ...FAKE_RUN_ENV,
    ...(overrides.signed === false ? {} : { EVIDENCE_SIGNING_KEY: SIGNING_KEY }),
    ...(overrides.env ?? {}),
  };
  const args = [
    ...(overrides.args ?? CAPTURE_DEFAULTS),
    "--observation-file", observationPath,
    "--out-dir", outDir,
  ];
  const result = runNode(captureScript, args, env);
  if (result.status !== 0) {
    throw new Error(`capture failed unexpectedly (exit ${result.status}):\n${result.output}`);
  }
  const files = readdirSync(outDir);
  const path = join(outDir, files[0]);
  return { artifact: JSON.parse(readFileSync(path, "utf8")), dir: outDir, path };
}

/** Place an arbitrary object in a fresh artifact directory, named by its own id. */
function stage(artifact: { artifact_id?: string }, fileName?: string): string {
  const dir = join(makeTempDir(), "artifacts");
  execFileSync("mkdir", ["-p", dir]);
  writeFileSync(join(dir, fileName ?? `${artifact.artifact_id}.json`), JSON.stringify(artifact, null, 2), "utf8");
  return dir;
}

function validate(dir: string, opts: { key?: boolean; requireAccepted?: boolean } = {}): RunResult {
  const args = ["--dir", dir];
  if (opts.requireAccepted) args.push("--require-accepted");
  return runNode(validatorScript, args, opts.key === false ? {} : { EVIDENCE_SIGNING_KEY: SIGNING_KEY });
}

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

/** Read a constant off the shipped library, so the schema is compared to what runs. */
function libConst(exportName: string): unknown {
  const result = spawnSync("node", ["--input-type=module", "-e",
    `import * as lib from ${JSON.stringify(libPath)}; process.stdout.write(JSON.stringify(lib[process.env.LIB_EXPORT]));`,
  ], { encoding: "utf8", cwd: root, env: { PATH: process.env.PATH ?? "", LIB_EXPORT: exportName } });
  if (result.status !== 0) throw new Error(`could not read ${exportName}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

/** Recompute artifact_id the way the library does — the forger's best move. */
function rederiveId<T extends object>(artifact: T): T & { artifact_id: string } {
  const id = callLib("computeArtifactId", [artifact]) as string;
  return { ...artifact, artifact_id: id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — only CI-produced artifacts can satisfy the validator
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 evidence — an interactive session cannot produce evidence", () => {
  it("capture-evidence.mjs refuses to run when GITHUB_ACTIONS is not true", () => {
    const dir = makeTempDir();
    const result = runNode(captureScript, [
      ...CAPTURE_DEFAULTS,
      "--observation-file", writeObservation(dir),
      "--out-dir", join(dir, "artifacts"),
    ], { EVIDENCE_SIGNING_KEY: SIGNING_KEY });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("interactive agent session is not valid evidence");
    expect(result.stderr).toContain("Nothing was written");
    expect(() => readdirSync(join(dir, "artifacts"))).toThrow();
  });

  it("refuses when the Actions context is incomplete, rather than inventing a run id", () => {
    const dir = makeTempDir();
    const withoutRunId = { ...FAKE_RUN_ENV };
    delete withoutRunId.GITHUB_RUN_ID;
    const result = runNode(captureScript, [
      ...CAPTURE_DEFAULTS,
      "--observation-file", writeObservation(dir),
      "--out-dir", join(dir, "artifacts"),
    ], withoutRunId);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("GITHUB_RUN_ID is not set");
  });

  it("exposes no flag by which a caller can state its own provenance", () => {
    const dir = makeTempDir();
    for (const forged of [["--run-id", "12345"], ["--sha", "a".repeat(40)], ["--workflow", "CI"], ["--producer", "owner"]]) {
      const result = runNode(captureScript, [
        ...CAPTURE_DEFAULTS,
        ...forged,
        "--observation-file", writeObservation(dir),
        "--out-dir", join(dir, "artifacts"),
      ], FAKE_RUN_ENV);

      expect(result.status).toBe(3);
      expect(result.stderr).toContain("Provenance is read from the GitHub Actions environment");
    }
  });

  it("a CI-produced artifact is UNVERIFIED until provenance is checked, never ACCEPTED", () => {
    const { dir } = captureArtifact();

    const permissive = validate(dir);
    expect(permissive.status).toBe(0);
    expect(permissive.stdout).toContain("UNVERIFIED");
    expect(permissive.stdout).toContain("0 accepted");

    const strict = validate(dir, { requireAccepted: true });
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain("provenance not checked");
  });

  it("an unsigned artifact is UNVERIFIED and blocked in require-accepted mode", () => {
    const { dir } = captureArtifact({ signed: false });
    const permissive = validate(dir);
    expect(permissive.status).toBe(0);
    expect(permissive.stdout).toContain("UNVERIFIED");

    expect(validate(dir, { requireAccepted: true }).status).toBe(1);
  });

  it("refuses to report provenance as verified when it cannot check it", () => {
    const { dir } = captureArtifact();
    const result = runNode(validatorScript, ["--dir", dir, "--require-provenance"], {
      EVIDENCE_SIGNING_KEY: SIGNING_KEY,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Refusing to report provenance as verified without checking it");
  });

  it("reports an empty artifact directory as empty, never as a pass", () => {
    const dir = join(makeTempDir(), "artifacts");
    const result = validate(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 artifacts present");
    expect(result.stdout).toContain("neither a pass nor a failure");
    expect(result.stdout).not.toContain("ACCEPTED");
  });

  it("never reports an invariant as proven, or a stage as closed", () => {
    const { dir } = captureArtifact();
    const result = validate(dir);

    // The only place the word appears is the disclaimer that denies it.
    expect(result.output.match(/PROVEN/g) ?? []).toHaveLength(1);
    expect(result.stdout).toContain("No invariant is PROVEN");
    expect(result.output).not.toMatch(/CLOSED|FACTORY_STAGE|STAGE_8|READY/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — malformed artifacts fail
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 evidence — malformed artifacts are rejected", () => {
  it("rejects a file that is not JSON", () => {
    const dir = join(makeTempDir(), "artifacts");
    execFileSync("mkdir", ["-p", dir]);
    writeFileSync(join(dir, "evd_00000000000000000000000000000000.json"), "not json at all", "utf8");
    const result = validate(dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("not parseable as JSON");
  });

  it.each([
    ["content_hash", "observation"],
    ["run id", "producer"],
    ["subject_sha", "subject_sha"],
    ["assertion", "assertion"],
    ["redaction attestation", "redaction_attestation"],
    ["replay", "replay"],
  ])("rejects an artifact missing its %s", (_label, field) => {
    const { artifact } = captureArtifact();
    const stripped = { ...artifact };
    delete stripped[field];
    const result = validate(stage(rederiveId(stripped)));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`required field '${field}' is absent`);
  });

  it("rejects an artifact whose content_hash does not hash its observation", () => {
    const { artifact } = captureArtifact();
    const tampered = rederiveId({
      ...artifact,
      observation: { ...artifact.observation, content_hash: `sha256:${"0".repeat(64)}` },
    });
    const result = validate(stage(tampered));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("content_hash does not hash observation.raw");
  });

  it("rejects a CI-lane artifact carrying no run id", () => {
    const { artifact } = captureArtifact();
    const tampered = rederiveId({
      ...artifact,
      producer: { ...artifact.producer, run_id: null },
    });
    const result = validate(stage(tampered));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("requires producer.run_id");
  });

  it("rejects a subject_sha that is not a full commit SHA", () => {
    const { artifact } = captureArtifact();
    for (const bad of ["abc123", "A".repeat(40), ""]) {
      const tampered = rederiveId({ ...artifact, subject_sha: bad });
      const result = validate(stage(tampered));
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("is not a full 40-character lowercase commit SHA");
    }
  });

  it("rejects an artifact carrying a field the validator does not evaluate", () => {
    const { artifact } = captureArtifact();
    const tampered = rederiveId({ ...artifact, verified_by_owner: true });
    const result = validate(stage(tampered));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("unknown top-level field 'verified_by_owner'");
  });

  it("rejects an observation containing a secret value, at capture and at validation", () => {
    const secretish = "DATABASE_URL=postgresql://opsiq:hunter2correct@db.example.com:5432/prod\n";
    const dir = makeTempDir();
    const capture = runNode(captureScript, [
      ...CAPTURE_DEFAULTS,
      "--observation-file", writeObservation(dir, secretish),
      "--out-dir", join(dir, "artifacts"),
    ], { ...FAKE_RUN_ENV, EVIDENCE_SIGNING_KEY: SIGNING_KEY });

    expect(capture.status).toBe(3);
    expect(capture.stderr).toContain("database_url_with_credentials");
    expect(capture.stderr).toContain("presence booleans only, never values");

    // And an artifact assembled around it out-of-band is rejected on read.
    const { artifact } = captureArtifact();
    const smuggled = rederiveId({
      ...artifact,
      observation: {
        raw: secretish,
        content_hash: `sha256:${(callLib("sha256Hex", [secretish]) as string)}`,
        byte_length: Buffer.byteLength(secretish, "utf8"),
        truncated: false,
      },
    });
    const result = validate(stage(smuggled));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("matches secret pattern");
  });

  it("does not mistake a redacted placeholder for a leaked secret", () => {
    const redacted = "env check: DATABASE_URL present=true password=<redacted> api_key=****\n";
    expect(callLib("scanForSecrets", [redacted])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — hostile audit: every forgery route must fail
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 evidence — hostile audit", () => {
  it("attack: fake run id — provenance cross-check finds no such run", () => {
    const { artifact } = captureArtifact();
    const violations = callLib("evaluateRunProvenance", [artifact, null]) as string[];
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join("\n")).toContain("names a run that does not exist");
  });

  it("attack: real run id borrowed from another workflow — every field is cross-checked", () => {
    const { artifact } = captureArtifact();
    const realRunOnAnotherWorkflow = {
      id: artifact.producer.run_id,
      repository: { full_name: artifact.producer.repository },
      head_sha: "b".repeat(40),
      name: "CI - Build & Test",
      run_number: 4321,
      run_attempt: 2,
      event: "pull_request",
      run_started_at: "2025-05-05T05:05:05Z",
      updated_at: "2025-05-05T05:15:05Z",
    };
    const violations = (callLib("evaluateRunProvenance", [artifact, realRunOnAnotherWorkflow]) as string[]).join("\n");

    expect(violations).toContain("is not the commit run");
    expect(violations).toContain("producer.workflow");
    expect(violations).toContain("producer.run_number");
    expect(violations).toContain("producer.run_attempt");
    expect(violations).toContain("producer.event_name");
    expect(violations).toContain("falls outside the window of run");
  });

  it("attack: fake SHA — editing subject_sha breaks the id and the signature", () => {
    const { artifact } = captureArtifact();
    const forged = { ...artifact, subject_sha: "c".repeat(40) };
    const result = validate(stage(forged, `${artifact.artifact_id}.json`));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("artifact_id does not match its content");
    expect(result.stdout).toContain("signature does not verify");
  });

  it("attack: fake SHA with the id re-derived — the signature still fails", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({ ...artifact, subject_sha: "c".repeat(40) });
    const result = validate(stage(forged));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("signature does not verify");
  });

  it("attack: copied artifact — the same observation cannot be filed twice", () => {
    const { artifact, dir } = captureArtifact();
    writeFileSync(join(dir, "second-copy.json"), JSON.stringify(artifact, null, 2), "utf8");
    const result = validate(dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must be named");

    // Renamed to its own id in a second directory it is still the same id, and the
    // duplicate is caught rather than counted as a second observation.
    const second = stage(artifact);
    renameSync(join(dir, "second-copy.json"), join(second, `${artifact.artifact_id}.json.bak`));
    const copiedInto = stage(artifact);
    writeFileSync(join(copiedInto, "sub-evd.json"), JSON.stringify(artifact, null, 2), "utf8");
    expect(validate(copiedInto).status).toBe(1);
  });

  it("attack: copied artifact re-pointed at another invariant — id and signature both fail", () => {
    const { artifact } = captureArtifact();
    const forged = { ...artifact, invariant_id: "S7-I13" };
    expect(validate(stage(forged, `${artifact.artifact_id}.json`)).stdout)
      .toContain("artifact_id does not match its content");

    const withNewId = rederiveId(forged);
    const result = validate(stage(withNewId));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("signature does not verify");
  });

  it("attack: edited timestamp — captured_at_utc is inside the signed envelope", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({ ...artifact, captured_at_utc: "2030-01-01T00:00:00.000Z" });
    const result = validate(stage(forged));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("signature does not verify");
  });

  it("attack: modified content hash — caught before the signature is even consulted", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({
      ...artifact,
      observation: { ...artifact.observation, content_hash: `sha256:${"f".repeat(64)}` },
    });
    const result = validate(stage(forged), { key: false });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("content_hash does not hash observation.raw");
  });

  it("attack: missing replay command — CI evidence must name how to reproduce it", () => {
    const { artifact } = captureArtifact();
    for (const replay of [{ replayable: true, command: null }, { replayable: false, command: null }]) {
      const forged = rederiveId({ ...artifact, replay });
      const result = validate(stage(forged));
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("must name the command that reproduces it");
    }
  });

  it("attack: wrong producer — an owner producer cannot stand in for a CI lane", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({
      ...artifact,
      producer: { ...artifact.producer, type: "owner" },
    });
    const result = validate(stage(forged));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must originate in a CI run");
  });

  it("attack: an invented producer type has no representation", () => {
    const { artifact } = captureArtifact();
    for (const type of ["interactive_agent", "claude_code", "local", "human"]) {
      const forged = rederiveId({ ...artifact, producer: { ...artifact.producer, type } });
      const result = validate(stage(forged));
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("an interactive agent session has no valid producer identity");
    }
  });

  it("attack: manual artifact — a hand-written file never exceeds UNVERIFIED", () => {
    const { artifact } = captureArtifact();
    // The forger's best unaided effort: strip the signature it cannot compute,
    // keep every other field internally consistent, re-derive the id.
    const handWritten = rederiveId({ ...artifact, signature: null });

    const permissive = validate(stage(handWritten));
    expect(permissive.status).toBe(0);
    expect(permissive.stdout).toContain("UNVERIFIED");
    expect(permissive.stdout).toContain("0 accepted");

    const strict = validate(stage(handWritten), { requireAccepted: true });
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain("unsigned");
  });

  it("attack: a self-signed artifact fails against the real key", () => {
    const { artifact } = captureArtifact({ env: { EVIDENCE_SIGNING_KEY: "attacker-guessed-key" } });
    const result = validate(stage(artifact));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("signature does not verify");
  });

  it("attack: forged owner attestation — the comment author is checked", () => {
    const ownerArtifact = {
      artifact_id: "evd_00000000000000000000000000000000",
      subject_sha: "d".repeat(40),
      lane: "LANE_F",
      producer: {
        type: "owner",
        repository: "arnab-netizen/OPsIq",
        owner_identity: "arnab-netizen",
        owner_attestation_ref: "https://github.com/arnab-netizen/OPsIq/issues/1#issuecomment-1",
      },
    };
    const impostorComment = {
      user: { login: "some-other-account" },
      body: `evd_00000000000000000000000000000000 ${"d".repeat(40)}`,
    };
    const violations = (callLib("evaluateOwnerProvenance", [ownerArtifact, impostorComment, ["arnab-netizen"]]) as string[]).join("\n");
    expect(violations).toContain("is not in the owner allowlist");
    expect(violations).toContain("produced by the owner and by no one else");
  });

  it("attack: owner attestation that does not name the artifact it supposedly attests", () => {
    const ownerArtifact = {
      artifact_id: "evd_00000000000000000000000000000000",
      subject_sha: "d".repeat(40),
      lane: "LANE_F",
      producer: {
        type: "owner",
        repository: "arnab-netizen/OPsIq",
        owner_identity: "arnab-netizen",
        owner_attestation_ref: "https://github.com/arnab-netizen/OPsIq/issues/1#issuecomment-1",
      },
    };
    const vagueComment = { user: { login: "arnab-netizen" }, body: "Looks good to me, accepted." };
    const violations = (callLib("evaluateOwnerProvenance", [ownerArtifact, vagueComment, ["arnab-netizen"]]) as string[]).join("\n");
    expect(violations).toContain("does not name this artifact_id");
    expect(violations).toContain("does not name subject_sha");
  });

  it("attack: owner-lane artifact claiming a CI run id", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({
      ...artifact,
      lane: "LANE_F",
      method: "owner_attestation",
      replay: { replayable: false, command: null },
      producer: { ...artifact.producer, type: "owner", owner_identity: "arnab-netizen", owner_attestation_ref: "https://github.com/x/y/issues/1#issuecomment-1" },
    });
    const result = validate(stage(forged));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must not claim a CI run id");
  });

  it("attack: owner provenance with no allowlist configured fails closed", () => {
    const violations = callLib("evaluateOwnerProvenance", [
      { artifact_id: "evd_0", subject_sha: "d", producer: {} },
      { user: { login: "anyone" }, body: "evd_0 d" },
      [],
    ]) as string[];
    expect(violations.join("\n")).toContain("no owner login allowlist is configured");
  });

  it("attack: superseding an artifact that does not exist", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({ ...artifact, supersedes: "evd_" + "a".repeat(32) });
    // Validated without the signing key, so the chain check is reached on its own
    // merits rather than riding on the signature failure the tamper also causes.
    const result = validate(stage(forged), { key: false });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("which is not present in");
  });

  it("attack: LANE_C evidence with no deployment_id, or observed outside production", () => {
    const { artifact } = captureArtifact();
    const noDeployment = rederiveId({ ...artifact, lane: "LANE_C", environment: "production" });
    expect(validate(stage(noDeployment)).stdout).toContain("must name the deployment_id");

    const wrongEnvironment = rederiveId({ ...artifact, lane: "LANE_C", deployment_id: "dpl_x" });
    expect(validate(stage(wrongEnvironment)).stdout).toContain("must be observed in environment 'production'");
  });

  it("attack: downgrading the redaction attestation", () => {
    const { artifact } = captureArtifact();
    for (const attestation of [
      { ...artifact.redaction_attestation, attested: false },
      { ...artifact.redaction_attestation, scanner: "evidence-redaction-scan@1" },
      { ...artifact.redaction_attestation, patterns_checked: 1 },
    ]) {
      const forged = rederiveId({ ...artifact, redaction_attestation: attestation });
      expect(validate(stage(forged)).status).toBe(1);
    }
  });

  it("attack: an artifact for an invariant that does not exist", () => {
    const { artifact } = captureArtifact();
    const forged = rederiveId({ ...artifact, invariant_id: "S7-I99" });
    const result = validate(stage(forged));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("is not a canonical Stage 7 invariant");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Consistency with existing repository infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stage 7 evidence — canonicalisation matches the existing integrity helper", () => {
  it("agrees with canonicalStringify in src/services/integrity/hash.ts", () => {
    const samples: unknown[] = [
      null,
      42,
      "text",
      { b: 1, a: 2 },
      { nested: { z: [3, 2, 1], a: null }, top: "v" },
      [{ b: 1, a: 2 }, { d: 4, c: 3 }],
    ];
    for (const sample of samples) {
      expect(callLib("canonicalStringify", [sample])).toEqual(canonicalStringifyTs(sample));
    }
  });

  it("keeps the documented schema in step with the executable library", () => {
    const schema = JSON.parse(
      readFileSync(join(root, "docs", "opsiq", "evidence", "stage-7", "schema", "evidence-artifact.v1.schema.json"), "utf8"),
    );
    const properties = schema.properties as Record<string, { enum?: string[]; const?: string }>;

    // Every documented property is required, and nothing is required that is not documented.
    expect([...schema.required].sort()).toEqual(Object.keys(properties).sort());
    expect(properties.evidence_version.const).toEqual(libConst("EVIDENCE_VERSION"));

    const enumBindings: Array<[string, string]> = [
      ["invariant_id", "INVARIANT_IDS"],
      ["lane", "LANES"],
      ["environment", "ENVIRONMENTS"],
      ["method", "METHODS"],
      ["result", "RESULTS"],
      ["artifact_classification", "CLASSIFICATIONS"],
    ];
    for (const [property, exportName] of enumBindings) {
      expect(properties[property].enum).toEqual(libConst(exportName));
    }
    expect(properties.producer.enum).toBeUndefined();
    expect((schema.properties.producer.properties.type as { enum: string[] }).enum)
      .toEqual(libConst("PRODUCER_TYPES"));
  });

  it("derives an artifact id that is a pure function of the artifact's content", () => {
    const { artifact } = captureArtifact();
    const withoutSignature = { ...artifact, signature: null };
    expect(callLib("computeArtifactId", [artifact])).toEqual(artifact.artifact_id);
    expect(callLib("computeArtifactId", [withoutSignature])).toEqual(artifact.artifact_id);
  });
});

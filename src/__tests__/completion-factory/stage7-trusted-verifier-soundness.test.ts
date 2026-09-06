/**
 * Stage 7 trusted verifier — acceptance soundness (PR-G1).
 *
 * A green `stage7-evidence-trusted-verification` status is the last thing that
 * stands between a captured observation and an owner treating it as proof. The
 * pre-D16 closure audit drove the shipped verifier against a synthetic evidence
 * PR and found three ways that status could be posted while asserting more than
 * had actually been checked:
 *
 *   B1  The validator was run without --require-accepted, so it blocked only on
 *       REJECTED. An artifact whose AUTH_SHA key registry holds no ACTIVE key —
 *       revoked, still pending_owner_provisioning, or the registry file absent at
 *       that commit — leaves the signature UNCHECKED, which classifies as
 *       UNVERIFIED, which was not blocking. The verifier posted `success` and
 *       described the artifact as "signature verified".
 *
 *   B2  The add-only check and the payload id list were validated independently
 *       and nothing required them to describe the same set. A PR that added a
 *       second artifact the payload did not name passed; that file was never
 *       fetched, never parsed and never verified, and the PR still went green.
 *
 *   B5  `tr ',' '\n' | tr -d '[:space:]'` deleted the newlines it had just
 *       inserted, collapsing every id into one unparseable token. Any payload
 *       naming more than one artifact was refused wholesale.
 *
 * The invariant these tests hold the workflow to:
 *
 *   { artifacts the PR adds } == { artifacts the payload names }
 *                             == { artifacts validated as ACCEPTED }
 *
 * They do not re-implement the verifier. Following the idiom of
 * stage7-observation-validity.test.ts, the real `run:` bodies are extracted from
 * the shipped workflow and executed under bash with a stubbed `curl` on PATH, and
 * the acceptance-mode tests run the shipped validator against real signed
 * artifacts. Nothing here reaches the network and nothing mutates the repository.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateKeyPairSync } from "crypto";
import yaml from "js-yaml";

import {
  buildEvidenceArtifact,
  parseKeyRegistryYaml,
} from "../../../scripts/lib/evidence-artifact.mjs";

const REPO_ROOT = process.cwd();
const WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/stage7-trusted-verifier.yml",
);
const WORKFLOW_SRC = readFileSync(WORKFLOW_PATH, "utf-8");

const ARTIFACT_DIR = "docs/opsiq/evidence/stage-7/artifacts";

// ─── Step extraction ─────────────────────────────────────────────────────────

interface WorkflowStep {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
}

const STEPS = (
  yaml.load(WORKFLOW_SRC) as {
    jobs: { verify: { steps: WorkflowStep[] } };
    permissions: Record<string, string>;
  }
).jobs.verify.steps;

const PERMISSIONS = (
  yaml.load(WORKFLOW_SRC) as { permissions: Record<string, string> }
).permissions;

function step(idOrNamePrefix: string): WorkflowStep {
  const found = STEPS.find(
    (s) => s.id === idOrNamePrefix || s.name?.startsWith(idOrNamePrefix),
  );
  if (!found) throw new Error(`step '${idOrNamePrefix}' not found in ${WORKFLOW_PATH}`);
  return found;
}

function body(idOrNamePrefix: string): string {
  const run = step(idOrNamePrefix).run;
  if (!run) throw new Error(`step '${idOrNamePrefix}' has no run: body`);
  return run;
}

// ─── Executing the real add-only / set-equality step ─────────────────────────

interface PrFile {
  status: string;
  filename: string;
}

interface AddOnlyResult {
  exitCode: number;
  addOnly: string;
  expectedCount: string;
  artifactIds: string;
  stderr: string;
}

/**
 * Run the shipped `addonly` step against a synthetic PR file list.
 *
 * `curl` is stubbed to emit the file list and nothing else — the step performs
 * exactly one request. `jq`, `sort`, `comm` and bash are real, so what is proven
 * is the text that ships.
 */
function runAddOnly(options: {
  files: PrFile[];
  artifactIdsRaw: string;
  changedFiles?: number | string;
}): AddOnlyResult {
  const dir = mkdtempSync(join(tmpdir(), "s7-verifier-addonly-"));
  try {
    const filesJson = join(dir, "files.json");
    writeFileSync(filesJson, JSON.stringify(options.files), "utf-8");

    const binDir = join(dir, "bin");
    mkdirSync(binDir);
    const curlStub = join(binDir, "curl");
    writeFileSync(curlStub, `#!/usr/bin/env bash\ncat "${filesJson}"\n`, "utf-8");
    chmodSync(curlStub, 0o755);

    const scriptPath = join(dir, "addonly.sh");
    writeFileSync(scriptPath, `#!/usr/bin/env bash\n${body("addonly")}`, "utf-8");

    const runnerTemp = join(dir, "runner-temp");
    mkdirSync(runnerTemp);
    const githubOutput = join(dir, "github-output.txt");
    writeFileSync(githubOutput, "", "utf-8");

    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        RUNNER_TEMP: runnerTemp,
        GITHUB_OUTPUT: githubOutput,
        GH_TOKEN: "stub-token-not-a-secret",
        PR_NUMBER: "4242",
        REPO: "arnab-netizen/OPsIq",
        CHANGED_FILES: String(options.changedFiles ?? options.files.length),
        ARTIFACT_IDS_RAW: options.artifactIdsRaw,
      },
    });

    const outputs = readFileSync(githubOutput, "utf-8");
    const read = (key: string): string => {
      const matches = [...outputs.matchAll(new RegExp(`^${key}=(.*)$`, "gm"))];
      return matches.length > 0 ? matches[matches.length - 1][1] : "";
    };

    return {
      exitCode: result.status ?? -1,
      addOnly: read("add_only"),
      expectedCount: read("expected_count"),
      artifactIds: read("artifact_ids"),
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ID_A = "evd_" + "a".repeat(32);
const ID_B = "evd_" + "b".repeat(32);
const ID_C = "evd_" + "c".repeat(32);

const added = (id: string): PrFile => ({
  status: "added",
  filename: `${ARTIFACT_DIR}/${id}.json`,
});

// ─── Static contract ─────────────────────────────────────────────────────────

describe("trusted verifier — shipped contract", () => {
  it("validates with --require-accepted, so UNVERIFIED blocks instead of passing (B1)", () => {
    const validate = body("Validate fetched artifacts");
    expect(validate).toContain("--require-accepted");
    expect(validate).toContain("--from-auth-sha-registry");
    expect(validate).toContain("--require-provenance");
  });

  it("keeps the trust boundaries the acceptance change must not touch", () => {
    const checkout = STEPS.find((s) => s.name?.startsWith("Checkout main"));
    expect(JSON.stringify(checkout)).toContain("main");
    expect(PERMISSIONS).toEqual({
      contents: "read",
      actions: "read",
      "pull-requests": "read",
      statuses: "write",
    });
    // The verifier reads the PR as data. It must never check the PR branch out.
    expect(body("fetch")).toContain("api.github.com/repos/$REPO/contents/");
    expect(WORKFLOW_SRC).not.toMatch(/ref:\s*\$\{\{\s*github\.event\.client_payload/);
  });

  // The permissions block is explicit, so an unnamed permission is none, not
  // inherited. pull-requests went unnamed and both PR reads — GET /pulls/{n} and
  // GET /pulls/{n}/files — were refused 403 on this private repository, aborting
  // the verifier before it examined anything (run 33840013842, PR #406). The
  // grant is read and must stay read: a verifier that can write to the PR it is
  // judging is not a verifier.
  it("can read the PR it verifies, and cannot write to it", () => {
    expect(PERMISSIONS["pull-requests"]).toBe("read");
    expect(PERMISSIONS["pull-requests"]).not.toBe("write");
    expect(PERMISSIONS.statuses).toBe("write");
    expect(PERMISSIONS.contents).toBe("read");
    expect(PERMISSIONS.actions).toBe("read");
  });

  // Every PR endpoint the workflow calls must be covered by a declared
  // permission. Enumerated from the source rather than listed by hand, so a
  // future step that reaches for a new PR endpoint fails here instead of at
  // 403 in a live capture.
  it("declares a permission for every PR endpoint it calls", () => {
    const prCalls = [
      ...WORKFLOW_SRC.matchAll(/api\.github\.com\/repos\/\$REPO\/(pulls|issues)[^\s"']*/g),
    ].map((m) => m[0]);
    expect(prCalls.length).toBeGreaterThan(0);
    for (const call of prCalls) {
      // Read-only endpoints only: no POST/PATCH/DELETE against the PR.
      expect(PERMISSIONS["pull-requests"]).toBe("read");
      expect(call).not.toMatch(/\/(merge|reviews|comments)\b/);
    }
  });

  it("no longer parses payload ids with the newline-deleting idiom (B5)", () => {
    // The defect was specifically splitting on commas and then deleting the
    // newlines that split had just inserted. `tr -d` on its own is fine — the
    // step uses it to trim `wc -l` output — so the assertion targets the
    // pipeline, not the command, and reads executable lines only: the comments
    // quote the broken idiom on purpose, so a future reader knows what was wrong.
    for (const s of STEPS) {
      if (!s.run) continue;
      const executable = s.run
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      expect(executable).not.toMatch(/tr ',' '\\n'\s*\|\s*tr\s+-d/);
    }
    expect(body("addonly")).toContain("tr ',' '\\n'");
  });

  it("refuses a truncated file listing rather than concluding from a prefix", () => {
    const addonly = body("addonly");
    expect(addonly).toContain("CHANGED_FILES");
    expect(addonly).toMatch(/LISTED_COUNT.*-ne.*CHANGED_FILES|-ne "\$CHANGED_FILES"/s);
    expect(body("resolve_pr")).toContain("changed_files=");
  });

  it("enforces set equality in both directions (B2)", () => {
    const addonly = body("addonly");
    expect(addonly).toContain("comm -23");
    expect(addonly).toContain("comm -13");
    expect(addonly).toContain("uniq -d");
  });

  it("fetches only the verified id set and refuses — never skips — on failure", () => {
    const fetch = step("fetch");
    expect(fetch.if).toContain("steps.addonly.outputs.add_only == 'true'");
    expect(fetch.env?.ARTIFACT_IDS).toContain("steps.addonly.outputs.artifact_ids");
    const run = body("fetch");
    // The pre-G1 body reached `continue` on a non-canonical id and on a non-200
    // response, which is exactly how an artifact escaped verification. Both of
    // those branches must now end the step.
    const nonCanonical = run.slice(run.indexOf("is not a canonical artifact id"));
    expect(nonCanonical.slice(0, nonCanonical.indexOf("fi"))).toContain("exit 1");
    const nonOk = run.slice(run.indexOf('if [ "$HTTP_STATUS" != "200" ]'));
    expect(nonOk.slice(0, nonOk.indexOf("\n          fi"))).toContain("exit 1");
    expect(run).not.toMatch(/continue\s*\n\s*fi\s*\n\s*ARTIFACT_PATH/);
    expect(run).toContain('if [ "$count" -ne "$EXPECTED_COUNT" ]');
  });

  it("evaluates the set-equality gate before the fetch count when posting status", () => {
    const status = body("Post Commit Status");
    const addOnlyBranch = status.indexOf('"${ADD_ONLY:-false}" != "true"');
    const fetchBranch = status.indexOf('"${FETCH_COUNT:-0}" = "0"');
    expect(addOnlyBranch).toBeGreaterThan(-1);
    expect(fetchBranch).toBeGreaterThan(-1);
    expect(addOnlyBranch).toBeLessThan(fetchBranch);
  });

  it("posts success only when validation succeeded, and says what was checked", () => {
    const status = body("Post Commit Status");
    expect(status).toContain('STATE="success"');
    const successBlock = status.slice(
      status.indexOf('"${VALIDATE_OUTCOME:-}" = "success"'),
      status.indexOf('"${VALIDATE_OUTCOME:-}" = "failure"'),
    );
    expect(successBlock).toContain('STATE="success"');
    expect(successBlock).toMatch(/exactly the artifacts named/);
    expect(successBlock).toMatch(/ACCEPTED/);
    // Every other branch is failure or error.
    expect(status.match(/STATE="success"/g)).toHaveLength(1);
  });

  it("posts the status on the independently resolved live PR head", () => {
    const status = body("Post Commit Status");
    expect(status).toContain('TARGET_SHA="${LIVE_HEAD_SHA:-}"');
    expect(status).toContain("api.github.com/repos/$REPO/statuses/$TARGET_SHA");
  });

  it("fails the run unless every gate passed", () => {
    const assertBody = body("Assert verification passed");
    expect(assertBody).toContain('"${ADD_ONLY:-false}" != "true"');
    expect(assertBody).toContain('"${FETCH_COUNT:-0}" = "0"');
    expect(assertBody).toContain('"${VALIDATE_OUTCOME:-skipped}" != "success"');
  });
});

// ─── B2: exact set equality, executed ────────────────────────────────────────

describe("trusted verifier — PR artifact set must equal the payload set (B2)", () => {
  it("accepts one artifact named exactly once", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: ID_A });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("1");
    expect(r.artifactIds).toBe(ID_A);
  });

  it("accepts several artifacts when both sides agree", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B), added(ID_C)],
      artifactIdsRaw: `${ID_A},${ID_B},${ID_C}`,
    });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("3");
  });

  it("refuses an artifact the PR adds but the payload does not name", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B)],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("the PR adds artifact(s) the dispatch payload does not name");
    expect(r.stderr).toContain(ID_B);
  });

  it("refuses an artifact the payload names but the PR does not add", () => {
    const r = runAddOnly({
      files: [added(ID_A)],
      artifactIdsRaw: `${ID_A},${ID_B}`,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("names artifact(s) the PR does not add");
  });

  it("refuses a repeated artifact on the PR side", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_A)],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("the PR adds the same artifact id more than once");
  });

  it("refuses a repeated artifact on the payload side", () => {
    const r = runAddOnly({
      files: [added(ID_A)],
      artifactIdsRaw: `${ID_A},${ID_A}`,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("names the same artifact id more than once");
  });

  it("refuses a file outside the canonical artifacts directory", () => {
    const r = runAddOnly({
      files: [added(ID_A), { status: "added", filename: "src/app/api/evil/route.ts" }],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("is outside");
  });

  it("refuses a modified file", () => {
    const r = runAddOnly({
      files: [
        added(ID_A),
        { status: "modified", filename: `${ARTIFACT_DIR}/${ID_B}.json` },
      ],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("must be 'added'");
  });

  it("refuses a deleted file", () => {
    const r = runAddOnly({
      files: [
        added(ID_A),
        { status: "removed", filename: `${ARTIFACT_DIR}/${ID_B}.json` },
      ],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("must be 'added'");
  });

  it("refuses an artifact filed in a subdirectory", () => {
    const r = runAddOnly({
      files: [{ status: "added", filename: `${ARTIFACT_DIR}/sub/${ID_A}.json` }],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("nested below");
  });

  it("refuses a file that is not named <artifact_id>.json", () => {
    const r = runAddOnly({
      files: [{ status: "added", filename: `${ARTIFACT_DIR}/notes.json` }],
      artifactIdsRaw: ID_A,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("canonical artifact id");
  });

  it("refuses a truncated listing rather than verifying a prefix of the diff", () => {
    const r = runAddOnly({
      files: [added(ID_A)],
      artifactIdsRaw: ID_A,
      changedFiles: 137,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("truncated");
  });

  it("refuses when the PR object reports no changed_files count", () => {
    const r = runAddOnly({
      files: [added(ID_A)],
      artifactIdsRaw: ID_A,
      changedFiles: "null",
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("changed_files");
  });
});

// ─── B5: payload id parsing, executed ────────────────────────────────────────

describe("trusted verifier — payload artifact_ids parsing (B5)", () => {
  it("parses a single id", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: ID_A });
    expect(r.expectedCount).toBe("1");
  });

  it("parses two comma-separated ids", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B)],
      artifactIdsRaw: `${ID_A},${ID_B}`,
    });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("2");
  });

  it("parses two ids separated by a comma and a space", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B)],
      artifactIdsRaw: `${ID_A}, ${ID_B}`,
    });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("2");
  });

  it("parses ids padded with blanks on both sides", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B)],
      artifactIdsRaw: ` ${ID_A} , ${ID_B} `,
    });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("2");
  });

  it("parses three ids", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B), added(ID_C)],
      artifactIdsRaw: `${ID_A},${ID_B},${ID_C}`,
    });
    expect(r.addOnly).toBe("true");
    expect(r.expectedCount).toBe("3");
  });

  it("refuses a trailing comma", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: `${ID_A},` });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("empty entry");
  });

  it("refuses a leading comma", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: `,${ID_A}` });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("empty entry");
  });

  it("refuses an empty entry between two ids", () => {
    const r = runAddOnly({
      files: [added(ID_A), added(ID_B)],
      artifactIdsRaw: `${ID_A},,${ID_B}`,
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("empty entry");
  });

  it("refuses an id that is not canonical", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: "evd_NOTHEX" });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("not a canonical artifact id");
  });

  it("refuses a path-traversal id", () => {
    const r = runAddOnly({
      files: [added(ID_A)],
      artifactIdsRaw: "../../../../etc/passwd",
    });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("not a canonical artifact id");
  });

  it("refuses an empty payload — nothing examined is an error, never a pass", () => {
    const r = runAddOnly({ files: [added(ID_A)], artifactIdsRaw: "" });
    expect(r.addOnly).toBe("false");
    expect(r.stderr).toContain("client_payload.artifact_ids is empty");
  });
});

// ─── B1: acceptance mode, executed against the shipped validator ─────────────

const { privateKey: SIGNING_KEY } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "der" },
});

/** A commit SHA that is well-formed but is not an object in this repository. */
const UNRESOLVABLE_AUTH_SHA = "0".repeat(39) + "1";

/**
 * A structurally valid, correctly signed LANE_E artifact. S7-I12 rather than
 * S7-I11 on purpose: the D-4 guard is scoped to S7-I11 and would reject on its
 * own terms, which would mask the signature-state behaviour under test.
 */
function writeArtifact(dir: string, authorizationManifestSha: string): string {
  const artifact = buildEvidenceArtifact(
    {
      invariant_id: "S7-I12",
      lane: "LANE_E",
      proof_type: "simulation_runbook_recovery",
      artifact_classification: "INTERNAL_ONLY",
      environment: "isolated_simulation",
      method: "test_run",
      captured_at_utc: "2026-09-03T04:00:00.000Z",
      subject_sha: "0".repeat(40),
      authorization_manifest_sha: authorizationManifestSha,
      deployment_id: null,
      repository: "arnab-netizen/OPsIq",
      workflow: "Stage 7 — Evidence Capture (Canonical)",
      workflow_ref: null,
      job: "capture",
      run_id: "1",
      run_number: 1,
      run_attempt: 1,
      run_started_at: "2026-09-03T03:59:00Z",
      actor: "arnab-netizen",
      event_name: "workflow_dispatch",
      owner_identity: null,
      owner_attestation_ref: null,
      replay_command: "node scripts/stage7-probes/s7-i12-runbook-recovery.mjs",
      raw_observation: "=== S7-I12 ===\n\nRESULT: PASS\n",
      assertion: "acceptance-mode regression fixture",
      result: "PASS",
      supersedes: null,
    },
    { signingKey: SIGNING_KEY, signingKeyId: "stage7-pr-g1-regression" },
  ) as { artifact_id: string };

  writeFileSync(
    join(dir, `${artifact.artifact_id}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf-8",
  );
  return artifact.artifact_id;
}

function runValidator(dir: string, extraFlags: string[]): { status: number; out: string } {
  const result = spawnSync(
    "node",
    [
      join(REPO_ROOT, "scripts/validate-evidence-artifacts.mjs"),
      "--dir",
      dir,
      "--from-auth-sha-registry",
      ...extraFlags,
    ],
    { encoding: "utf-8", cwd: REPO_ROOT, env: { ...process.env, EVIDENCE_SIGNING_KEY: "" } },
  );
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe("trusted verifier — success requires ACCEPTED, not merely non-REJECTED (B1)", () => {
  it("an artifact whose AUTH_SHA registry yields no active key is UNVERIFIED, not REJECTED", () => {
    const dir = mkdtempSync(join(tmpdir(), "s7-verifier-accept-"));
    try {
      writeArtifact(dir, UNRESOLVABLE_AUTH_SHA);
      const lenient = runValidator(dir, []);
      expect(lenient.out).toContain("UNVERIFIED");
      expect(lenient.out).toContain("signature not checked");
      // This is the defect: without --require-accepted the validator exits 0, and
      // the verifier used that as licence to post `success`.
      expect(lenient.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--require-accepted turns that UNVERIFIED artifact into a blocking failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "s7-verifier-accept-"));
    try {
      writeArtifact(dir, UNRESOLVABLE_AUTH_SHA);
      const strict = runValidator(dir, ["--require-accepted"]);
      expect(strict.status).toBe(1);
      expect(strict.out).toContain("BLOCKING");
      expect(strict.out).toContain("require-accepted");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an artifact signed by a key the AUTH_SHA registry does not list is REJECTED", () => {
    const dir = mkdtempSync(join(tmpdir(), "s7-verifier-accept-"));
    try {
      // HEAD resolves, and its registry lists the production key id only, so the
      // regression key is unknown there — an unknown key is INVALID, not UNCHECKED.
      const head = spawnSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf-8",
        cwd: REPO_ROOT,
      }).stdout.trim();
      writeArtifact(dir, head);
      const strict = runValidator(dir, ["--require-accepted"]);
      expect(strict.status).toBe(1);
      expect(strict.out).toContain("REJECTED");
      expect(strict.out).toContain("signature does not verify");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("key registry states that leave a signature UNCHECKED", () => {
  const registry = (status: string): string =>
    [
      'version: "1"',
      "keys:",
      '  - key_id: "stage7-pr-g1-regression"',
      '    algorithm: "Ed25519"',
      `    status: "${status}"`,
      '    public_key_spki_der_base64: "MCowBQYDK2VwAyEAUz2VS2kBVF1PhY7HXBFyohGspFRfuq1p/HTjZAiUS/U="',
      "",
    ].join("\n");

  it("an active key is loaded", () => {
    expect(parseKeyRegistryYaml(registry("active")).size).toBe(1);
  });

  it("a revoked key is not", () => {
    expect(parseKeyRegistryYaml(registry("revoked")).size).toBe(0);
  });

  it("a key still pending owner provisioning is not", () => {
    expect(parseKeyRegistryYaml(registry("pending_owner_provisioning")).size).toBe(0);
  });

  it("an absent registry yields no key at all", () => {
    expect(parseKeyRegistryYaml("").size).toBe(0);
  });
});

// ─── PR-D18-SUPERSESSION: supersedes targets fetched from main, executed ──────
//
// A correcting artifact's `supersedes` field names a historical artifact_id that
// the validator's supersession-chain check can only resolve if that file is
// present in the same directory being validated. The "fetch" step now also
// fetches each such target — but from ref=main, hardcoded, never from the PR
// head, the payload, or any other caller-controlled value. These tests execute
// the real shipped step body under bash with a stubbed curl that serves
// different bytes/status per (artifact id, ref) pair, so what is proven is the
// text that ships, not a re-implementation of it.

interface FetchResponse {
  status: number;
  body?: Record<string, unknown>;
}

interface FetchResult {
  exitCode: number;
  count: string;
  stderr: string;
  requestedRefs: Array<{ id: string; ref: string }>;
  /** Contents of every file present in the fetch directory when the step exited, keyed by filename. Captured before the temp dir is cleaned up. */
  artifactFiles: Record<string, string>;
}

/**
 * Run the shipped `fetch` step body against a synthetic set of primary
 * artifact ids (as if just proven to equal the PR's own added set) and a
 * table of canned HTTP responses keyed by `${artifactId}@${ref}`.
 */
function runFetch(options: {
  artifactIds: string[];
  liveHeadSha: string;
  responses: Record<string, FetchResponse>;
}): FetchResult {
  const dir = mkdtempSync(join(tmpdir(), "s7-verifier-fetch-"));
  try {
    const responsesDir = join(dir, "responses");
    mkdirSync(responsesDir);
    const requestLog = join(dir, "requests.log");
    writeFileSync(requestLog, "", "utf-8");

    for (const [key, response] of Object.entries(options.responses)) {
      writeFileSync(join(responsesDir, `${key}.status`), String(response.status), "utf-8");
      writeFileSync(
        join(responsesDir, `${key}.body`),
        JSON.stringify(response.body ?? {}),
        "utf-8",
      );
    }

    const binDir = join(dir, "bin");
    mkdirSync(binDir);
    const curlStub = join(binDir, "curl");
    // Finds the `-o <file>` target and the final (URL) argument, extracts the
    // artifact id and `ref=` value from the URL, logs the (id, ref) pair the
    // step actually requested, and serves the canned status/body for that key
    // (defaulting to 404/empty for any key the test did not pre-populate).
    writeFileSync(
      curlStub,
      [
        "#!/usr/bin/env bash",
        "outfile=\"\"",
        "args=(\"$@\")",
        "for ((i=0; i<${#args[@]}; i++)); do",
        '  if [ "${args[$i]}" = "-o" ]; then outfile="${args[$((i+1))]}"; fi',
        "done",
        'url="${args[${#args[@]}-1]}"',
        'id=$(echo "$url" | sed -E \'s#.*/artifacts/(evd_[0-9a-f]+)\\.json.*#\\1#\')',
        'ref=$(echo "$url" | sed -E \'s#.*ref=([^&]*).*#\\1#\')',
        `echo "\${id}@\${ref}" >> "${requestLog}"`,
        `key="${responsesDir}/\${id}@\${ref}"`,
        'if [ -f "${key}.status" ]; then',
        '  status=$(cat "${key}.status")',
        '  cat "${key}.body" > "$outfile"',
        "else",
        '  status=404',
        '  : > "$outfile"',
        "fi",
        'printf "%s" "$status"',
        "",
      ].join("\n"),
      "utf-8",
    );
    chmodSync(curlStub, 0o755);

    const scriptPath = join(dir, "fetch.sh");
    writeFileSync(scriptPath, `#!/usr/bin/env bash\n${body("fetch")}`, "utf-8");

    const runnerTemp = join(dir, "runner-temp");
    mkdirSync(runnerTemp);
    const githubOutput = join(dir, "github-output.txt");
    writeFileSync(githubOutput, "", "utf-8");

    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        RUNNER_TEMP: runnerTemp,
        GITHUB_OUTPUT: githubOutput,
        GH_TOKEN: "stub-token-not-a-secret",
        REPO: "arnab-netizen/OPsIq",
        LIVE_HEAD_SHA: options.liveHeadSha,
        ARTIFACT_IDS: options.artifactIds.join(","),
        EXPECTED_COUNT: String(options.artifactIds.length),
      },
    });

    const outputs = readFileSync(githubOutput, "utf-8");
    const read = (key: string): string => {
      const matches = [...outputs.matchAll(new RegExp(`^${key}=(.*)$`, "gm"))];
      return matches.length > 0 ? matches[matches.length - 1][1] : "";
    };
    const requestedRefs = readFileSync(requestLog, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, ref] = line.split("@");
        return { id, ref };
      });

    // Read every file's content now, inside the try block — the temp dir
    // (including the fetch directory itself) is deleted in `finally` below,
    // which runs before this function returns to its caller.
    const artifactDirPath = read("artifact_dir");
    const artifactFiles: Record<string, string> = {};
    if (artifactDirPath) {
      for (const name of readdirSync(artifactDirPath)) {
        artifactFiles[name] = readFileSync(join(artifactDirPath, name), "utf-8");
      }
    }

    return {
      exitCode: result.status ?? -1,
      count: read("count"),
      stderr: result.stderr ?? "",
      requestedRefs,
      artifactFiles,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const LIVE_SHA = "deadbeef".repeat(5); // 40 hex chars, a plausible commit sha

describe("trusted verifier — supersedes targets are fetched from main, not the PR (PR-D18-SUPERSESSION)", () => {
  it("fetches a primary artifact from the live PR head, and its supersedes target from main — never from the PR head", () => {
    const r = runFetch({
      artifactIds: [ID_A],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_A, supersedes: ID_B } },
        [`${ID_B}@main`]: { status: 200, body: { artifact_id: ID_B, supersedes: null } },
      },
    });
    expect(r.exitCode).toBe(0);
    expect(r.count).toBe("1"); // count tracks only the primary (payload) set
    expect(r.requestedRefs).toContainEqual({ id: ID_A, ref: LIVE_SHA });
    expect(r.requestedRefs).toContainEqual({ id: ID_B, ref: "main" });
    // The critical property: B is never requested at the PR's own head SHA.
    expect(r.requestedRefs).not.toContainEqual({ id: ID_B, ref: LIVE_SHA });
    expect(r.artifactFiles[`${ID_B}.json`]).toContain(ID_B);
  });

  it("does not re-fetch a supersedes target that the PR itself already adds", () => {
    const r = runFetch({
      artifactIds: [ID_A, ID_B],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_A, supersedes: ID_B } },
        [`${ID_B}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_B, supersedes: null } },
      },
    });
    expect(r.exitCode).toBe(0);
    // B was already fetched as a primary artifact at the live head; the
    // supersedes-resolution loop must not issue a second request for it.
    expect(r.requestedRefs.filter((x) => x.id === ID_B)).toHaveLength(1);
    expect(r.requestedRefs).not.toContainEqual({ id: ID_B, ref: "main" });
  });

  it("a supersedes target absent from main (404) is left unfetched, and the step still succeeds", () => {
    const r = runFetch({
      artifactIds: [ID_A],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_A, supersedes: ID_B } },
        // No entry for ID_B@main — the stub defaults to 404.
      },
    });
    expect(r.exitCode).toBe(0);
    expect(r.count).toBe("1");
    expect(r.artifactFiles[`${ID_B}.json`]).toBeUndefined();
  });

  it("an API failure fetching a supersedes target hard-refuses the run, never silently treated as absent", () => {
    const r = runFetch({
      artifactIds: [ID_A],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_A, supersedes: ID_B } },
        [`${ID_B}@main`]: { status: 500, body: {} },
      },
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("must never be treated as proof the target is absent");
  });

  it("a non-canonical supersedes id never reaches a fetch URL", () => {
    const r = runFetch({
      artifactIds: [ID_A],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: {
          status: 200,
          // Not a canonical evd_<32hex> id — must be refused before any curl call.
          body: { artifact_id: ID_A, supersedes: "../../etc/passwd" },
        },
      },
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("is not a canonical artifact id");
    // The malformed id must never have reached the request log.
    expect(r.requestedRefs.some((x) => x.ref === "main")).toBe(false);
  });

  it("an artifact with no supersedes field triggers no second fetch at all", () => {
    const r = runFetch({
      artifactIds: [ID_A],
      liveHeadSha: LIVE_SHA,
      responses: {
        [`${ID_A}@${LIVE_SHA}`]: { status: 200, body: { artifact_id: ID_A, supersedes: null } },
      },
    });
    expect(r.exitCode).toBe(0);
    expect(r.requestedRefs).toHaveLength(1);
  });

  it("the fetch step hardcodes ref=main for supersedes resolution — never the payload or a caller-controlled value", () => {
    const fetchBody = body("fetch");
    const supersedesSection = fetchBody.slice(fetchBody.indexOf("SUPERSEDES_PATH"));
    expect(supersedesSection).toContain("?ref=main");
    expect(supersedesSection).not.toMatch(/ref=\$LIVE_HEAD_SHA/);
    expect(supersedesSection).not.toMatch(/ref=\$\{\{/);
  });
});

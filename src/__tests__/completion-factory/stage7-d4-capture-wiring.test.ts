/**
 * Stage 7 S7-I11 D-4 capture wiring — production caller supplies governance input.
 *
 * Incident this locks down: commit 1606102c added the D-4/A4 fail-closed guard to
 * BOTH `buildEvidenceArtifact` and `validateEvidenceArtifact`, reading the authorized
 * S7-I11 environment target out of a new `closureManifestYaml` option. The guard and
 * its hostile suite were correct. No production caller was ever wired to pass it.
 *
 * The result was a fail-closed dead end that no test could see, because every test
 * called the library directly and passed the manifest itself:
 *
 *   - capture-evidence.mjs called buildEvidenceArtifact without the manifest, so
 *     every S7-I11 capture died at MANIFEST_UNREADABLE;
 *   - the same script then re-validated without it;
 *   - loadEvidenceArtifactIndex — used by validate-evidence-artifacts.mjs, which is
 *     what the capture action AND the trusted verifier run — never passed it either;
 *   - invariant-closure.mjs, which decides whether an artifact can back a PROVEN
 *     invariant, likewise.
 *
 * A second, independent defect compounded it: the S7-I11 workflow contract emitted
 * `environment=isolated_simulation`, while D-4 authorizes `ci`. That label is also in
 * GENERIC_ENVIRONMENT_LABELS, so it could never satisfy D-4 under any wiring.
 *
 * These tests govern the DATAFLOW, not just the guard: a guard whose only caller
 * omits its input is indistinguishable from no guard at all — except that it refuses
 * everything instead of nothing. They are written to fail against the pre-repair tree.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { generateKeyPairSync } from "crypto";

const root = process.cwd();
const CAPTURE_WORKFLOW = join(root, ".github/workflows/stage7-capture.yml");
const CAPTURE_SCRIPT = join(root, "scripts/capture-evidence.mjs");
const VALIDATE_SCRIPT = join(root, "scripts/validate-evidence-artifacts.mjs");
const CLOSURE_LIB = join(root, "scripts/lib/invariant-closure.mjs");
const MANIFEST = join(root, "docs/opsiq/bundles/factory-stage-7-closure.yaml");

const captureWorkflow = readFileSync(CAPTURE_WORKFLOW, "utf-8");
const captureScript = readFileSync(CAPTURE_SCRIPT, "utf-8");
const validateScript = readFileSync(VALIDATE_SCRIPT, "utf-8");
const closureLib = readFileSync(CLOSURE_LIB, "utf-8");
const manifestYaml = readFileSync(MANIFEST, "utf-8");

/** The `S7-I11)` case arm of the contract step, up to its terminating `;;`. */
function s7i11ContractArm(src: string): string {
  const start = src.indexOf("            S7-I11)");
  if (start < 0) throw new Error("no S7-I11 contract arm found in stage7-capture.yml");
  const end = src.indexOf(";;", start);
  if (end < 0) throw new Error("unterminated S7-I11 contract arm");
  return src.slice(start, end);
}

/** Value of a `key=value` emitted into $GITHUB_OUTPUT within a contract arm. */
function emitted(arm: string, key: string): string | null {
  // Only non-comment lines: a '#' comment mentioning the key must not be read as
  // the contract. This is the same reasoning the D-4 resolver applies to the manifest.
  const re = new RegExp(`^\\s*echo "${key}=(.*)" >> "\\$GITHUB_OUTPUT"\\s*$`, "m");
  const m = re.exec(arm);
  return m ? m[1] : null;
}

const arm = s7i11ContractArm(captureWorkflow);

// ─── Blocker 2 — the S7-I11 contract must emit the D-4 authorized target ────────

describe("S7-I11 workflow contract — environment must equal the D-4 authorized target", () => {
  it("emits environment=ci, the concrete target D-4 authorizes", () => {
    expect(emitted(arm, "environment")).toBe("ci");
  });

  it("does not emit the generic label the D-4 resolver rejects", () => {
    // 'isolated_simulation' is a purpose category, not a concrete authorized target.
    // Emitting it made S7-I11 capture unsatisfiable regardless of manifest wiring.
    expect(arm).not.toMatch(/echo "environment=isolated_simulation"/);
  });

  it("matches s7_i11_environment_target in the live governance manifest", () => {
    const target = /^\s*s7_i11_environment_target:\s*["']?([^\s"'#\n]+)["']?/m.exec(manifestYaml);
    expect(target).not.toBeNull();
    expect(emitted(arm, "environment")).toBe(target![1]);
  });

  it("a mutation back to isolated_simulation is detected", () => {
    const mutated = arm.replace('echo "environment=ci"', 'echo "environment=isolated_simulation"');
    expect(mutated).not.toBe(arm);
    expect(emitted(mutated, "environment")).toBe("isolated_simulation");
    // The property under test, stated against the mutant: this is what must fail.
    const target = /^\s*s7_i11_environment_target:\s*["']?([^\s"'#\n]+)["']?/m.exec(manifestYaml)![1];
    expect(emitted(mutated, "environment")).not.toBe(target);
  });

  it("leaves every other governed S7-I11 contract field unchanged", () => {
    expect(emitted(arm, "lane")).toBe("LANE_E");
    expect(emitted(arm, "proof_type")).toBe("simulation_adversarial");
    expect(emitted(arm, "method")).toBe("test_run");
    expect(emitted(arm, "requires_deployment_id")).toBe("false");
    expect(emitted(arm, "assertion")).toBe(
      "Nine adversarial failure scenarios each fail safely, visibly, and recoverably in isolated simulation.",
    );
    expect(emitted(arm, "command")).toBe(
      "npx vitest run src/__tests__/completion-factory/stage7-evidence-artifact.test.ts " +
        "src/__tests__/completion-factory/stage7-ed25519-hostile.test.ts --reporter=default",
    );
  });

  it("keeps the governed observation command on --reporter=default", () => {
    expect(emitted(arm, "command")).toMatch(/--reporter=default$/);
  });
});

// ─── Blocker 1 — every production caller must supply the governance manifest ────

describe("production callers supply closureManifestYaml to the D-4 guard", () => {
  it("capture-evidence.mjs passes it to buildEvidenceArtifact", () => {
    const call = /buildEvidenceArtifact\(([\s\S]*?)\n\);/.exec(captureScript);
    expect(call).not.toBeNull();
    expect(call![1]).toMatch(/closureManifestYaml/);
  });

  it("capture-evidence.mjs passes it to its own post-build validateEvidenceArtifact", () => {
    const call = /validateEvidenceArtifact\(artifact,\s*\{([\s\S]*?)\}\);/.exec(captureScript);
    expect(call).not.toBeNull();
    expect(call![1]).toMatch(/closureManifestYaml/);
  });

  it("the authorization gate and the D-4 guard consume the SAME manifest bytes", () => {
    // Memoized single read: fetchMainManifest caches into closureManifestYaml, which
    // is the exact value handed to the builder. Not two independent reads that could
    // observe different revisions of main mid-run.
    expect(captureScript).toMatch(/let closureManifestYaml = null;/);
    expect(captureScript).toMatch(/if \(closureManifestYaml !== null\) return closureManifestYaml;/);
    expect(captureScript).toMatch(/closureManifestYaml = result\.stdout;/);
    // And exactly one git read of the manifest path exists in the script.
    const reads = captureScript.match(/factory-stage-7-closure\.yaml/g) ?? [];
    expect(reads.length).toBe(1);
  });

  it("validate-evidence-artifacts.mjs resolves it per artifact from that artifact's AUTH_SHA", () => {
    expect(validateScript).toMatch(/resolveClosureManifest:\s*loadClosureManifestAtSha/);
    expect(validateScript).toMatch(/function loadClosureManifestAtSha/);
    // Read from the commit the artifact names, never the working tree (INF_SHA) —
    // the same AUTH_SHA reasoning the key-registry pass already applies.
    expect(validateScript).toMatch(/git['"],\s*\['show['"],\s*`\$\{sha\}:docs\/opsiq\/bundles\/factory-stage-7-closure\.yaml`/);
  });

  it("invariant-closure.mjs forwards the contract being evaluated", () => {
    expect(closureLib).toMatch(/resolveClosureManifest:/);
    expect(closureLib).toMatch(/options\.manifestYaml/);
  });

  it("no production caller reaches the guard without governance input", () => {
    // The whole defect class in one assertion: every call site that can reach an
    // S7-I11 guard names the option. A new unwired caller fails here.
    for (const [label, src] of [
      ["capture-evidence.mjs", captureScript],
      ["validate-evidence-artifacts.mjs", validateScript],
      ["invariant-closure.mjs", closureLib],
    ] as const) {
      expect(src, `${label} must supply D-4 governance input`).toMatch(
        /closureManifestYaml|resolveClosureManifest/,
      );
    }
  });
});

// ─── Behavioural — the guard itself, exercised through the real library ────────

describe("D-4 guard behaviour through the real artifact builder", () => {
  const { privateKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  const input = (environment: string) => ({
    invariant_id: "S7-I11",
    lane: "LANE_E",
    proof_type: "simulation_adversarial",
    artifact_classification: "INTERNAL_ONLY",
    environment,
    method: "test_run",
    captured_at_utc: "2026-09-02T18:00:00Z",
    subject_sha: "a19d226d784d4eb48bf239ca5c5320f12efac541",
    authorization_manifest_sha: "b4b87f1f412dc6b1604f7571d61420cd5458f0dc",
    deployment_id: null,
    repository: "arnab-netizen/OPsIq",
    workflow: "Stage 7 — Evidence Capture (Canonical)",
    workflow_ref: "r",
    job: "capture",
    run_id: "1",
    run_number: "1",
    run_attempt: "1",
    run_started_at: "2026-09-02T18:00:00Z",
    actor: "arnab-netizen",
    event_name: "workflow_dispatch",
    owner_identity: null,
    owner_attestation_ref: null,
    replay_command: "npx vitest run a b --reporter=default",
    raw_observation: "Test Files  2 passed (2)\n     Tests  74 passed (74)\n",
    assertion:
      "Nine adversarial failure scenarios each fail safely, visibly, and recoverably in isolated simulation.",
    result: "PASS",
    supersedes: null,
  });

  const build = async (environment: string, opts: Record<string, unknown>) => {
    const { buildEvidenceArtifact } = await import("../../../scripts/lib/evidence-artifact.mjs");
    return buildEvidenceArtifact(input(environment), {
      signingKey: privateKey,
      signingKeyId: "stage7-evidence-v1",
      ...opts,
    });
  };

  it("1. correct manifest + environment=ci -> builds", async () => {
    const artifact = await build("ci", { closureManifestYaml: manifestYaml });
    expect(artifact.environment).toBe("ci");
    expect(artifact.invariant_id).toBe("S7-I11");
  });

  it("2. missing closureManifestYaml -> refuses (MANIFEST_UNREADABLE)", async () => {
    await expect(build("ci", {})).rejects.toThrow(/MANIFEST_UNREADABLE/);
  });

  it("3. malformed manifest -> refuses", async () => {
    await expect(build("ci", { closureManifestYaml: ":\n  - [unclosed" })).rejects.toThrow(
      /D-4 enforcement/,
    );
  });

  it("4. manifest without a D-4 target -> refuses", async () => {
    const stripped = manifestYaml.replace(/^s7_i11_environment_target:.*$/m, "");
    await expect(build("ci", { closureManifestYaml: stripped })).rejects.toThrow(/D-4 enforcement/);
  });

  it("5. manifest says ci, artifact says isolated_simulation -> refuses", async () => {
    await expect(build("isolated_simulation", { closureManifestYaml: manifestYaml })).rejects.toThrow(
      /does not match D-4 authorized target 'ci'/,
    );
  });

  it("6. the caller cannot inject a D-4 target independently of the manifest", async () => {
    // There is no parameter for a target. Supplying plausible ones changes nothing:
    // the environment still has to match what the MANIFEST says.
    await expect(
      build("isolated_simulation", {
        closureManifestYaml: manifestYaml,
        d4Target: "isolated_simulation",
        target: "isolated_simulation",
        s7_i11_environment_target: "isolated_simulation",
      }),
    ).rejects.toThrow(/does not match D-4 authorized target 'ci'/);
    // And the capture CLI exposes no flag that could carry one.
    expect(captureScript).not.toMatch(/'d4-target'|--d4-target/);
  });

  it("7. other non-authorized environments are refused", async () => {
    for (const env of ["production", "isolated_simulation"]) {
      await expect(build(env, { closureManifestYaml: manifestYaml })).rejects.toThrow(
        /does not match D-4 authorized target 'ci'/,
      );
    }
  });

  it("8. the generic-label rejection list is not weakened", async () => {
    const { GENERIC_ENVIRONMENT_LABELS } = await import(
      "../../../scripts/lib/d4-governance-resolver.mjs"
    );
    expect(GENERIC_ENVIRONMENT_LABELS).toContain("isolated_simulation");
    // A manifest naming a generic label is still refused, so the repair cannot be
    // "make the generic label acceptable".
    const generic = manifestYaml.replace(
      /^s7_i11_environment_target:.*$/m,
      's7_i11_environment_target: "isolated_simulation"',
    );
    await expect(build("isolated_simulation", { closureManifestYaml: generic })).rejects.toThrow(
      /D-4 enforcement/,
    );
  });
});

// ─── The index loader forwards per-artifact governance input ───────────────────

describe("loadEvidenceArtifactIndex forwards the resolved manifest", () => {
  it("passes resolveClosureManifest through to the validator", async () => {
    const lib = readFileSync(join(root, "scripts/lib/evidence-artifact.mjs"), "utf-8");
    const loader = lib.slice(lib.indexOf("export function loadEvidenceArtifactIndex"));
    // Keyed on the artifact's OWN authorization_manifest_sha, not the working tree.
    expect(loader).toMatch(/resolveClosureManifest\(/);
    expect(loader).toMatch(/authorization_manifest_sha/);
    expect(loader).toMatch(/validateEvidenceArtifact\(parsed, \{[^}]*closureManifestYaml[^}]*\}\)/);
  });

  it("defaults to null, so an unwired caller still fails closed", async () => {
    const lib = readFileSync(join(root, "scripts/lib/evidence-artifact.mjs"), "utf-8");
    expect(lib).toMatch(/resolveClosureManifest = null/);
  });
});

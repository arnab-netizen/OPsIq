/**
 * Stage 7 LANE_C capture inputs — governed wiring and fail-closed identity (PR-G2).
 *
 * Two defects, one root cause: the capture workflow did not supply the inputs the
 * governed LANE_C probes actually require, and the probes covered for it with
 * defaults instead of refusing.
 *
 *   B3  S7-I1 asserts "deployed SHA matches the authorized candidate". Run with
 *       the environment the workflow actually supplied it reported
 *       `10 PASS, 0 FAIL` and `RESULT: PASS` having never obtained a deployed
 *       SHA: `CLOSURE_SUBJECT_SHA` fell back to a hardcoded D-12 value, an absent
 *       `VERCEL_TOKEN` recorded `sha_verification: "SKIPPED"` as a PASSING
 *       observation, and the base URL fell back to a compiled-in alias. The
 *       deployed commit matched neither the stale default nor the governed
 *       subject, and the probe passed anyway.
 *
 *   B4  The observe step passed only OBSERVATION_COMMAND, METHOD and
 *       DEPLOYMENT_ID. S7-I2, S7-I4, S7-I5 and S7-I10-LANE_C therefore printed
 *       their own governed "RESULT: FAIL" for missing credentials — a verdict the
 *       downstream gate cannot distinguish from a real product failure, so it
 *       would have been signed, filed as an evidence PR and verified as though
 *       the invariant did not hold.
 *
 * The rule these tests hold the capture path to:
 *
 *   a governed observation runs only when the capture environment supplied every
 *   input it declares, and S7-I1 reports PASS only when a deployed SHA was
 *   actually obtained and compared to the authorized subject.
 *
 * The probe tests are hermetic: a local HTTP server stands in for the deployment,
 * so identity and health outcomes are driven exactly, with no network dependency.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import yaml from "js-yaml";

const REPO_ROOT = process.cwd();
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/stage7-capture.yml");
const WORKFLOW_SRC = readFileSync(WORKFLOW_PATH, "utf-8");
const PROBE_PATH = join(REPO_ROOT, "scripts/stage7-probes/s7-i1-health-probe.mjs");

interface Step {
  id?: string;
  name?: string;
  run?: string;
  env?: Record<string, string>;
}
const WORKFLOW = yaml.load(WORKFLOW_SRC) as {
  env?: Record<string, string>;
  jobs: { capture: { steps: Step[] } };
};
const STEPS = WORKFLOW.jobs.capture.steps;

function step(match: string): Step {
  const found = STEPS.find((s) => s.id === match || s.name?.startsWith(match));
  if (!found) throw new Error(`step '${match}' not found in ${WORKFLOW_PATH}`);
  return found;
}
function body(match: string): string {
  const run = step(match).run;
  if (!run) throw new Error(`step '${match}' has no run body`);
  return run;
}

const CONTRACT_ENTRIES = [
  "S7-I1",
  "S7-I2",
  "S7-I4",
  "S7-I5",
  "S7-I10-LANE_C",
  "S7-I10-LANE_E",
  "S7-I11",
  "S7-I12",
] as const;

/** Run the shipped contract step for one invariant and read back its outputs. */
function resolveContract(invariantId: string): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), "s7-contract-"));
  try {
    const script = join(dir, "contract.sh");
    writeFileSync(script, `#!/usr/bin/env bash\n${body("contract")}`, "utf-8");
    const out = join(dir, "out.txt");
    writeFileSync(out, "", "utf-8");
    const deploymentId = invariantId.startsWith("S7-I10-LANE_E") ? "" : "dpl_fixture";
    spawnSync("bash", [script], {
      encoding: "utf-8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: out,
        INVARIANT_ID: invariantId,
        DEPLOYMENT_ID: deploymentId,
      },
    });
    const parsed: Record<string, string> = {};
    for (const line of readFileSync(out, "utf-8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) parsed[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return parsed;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Run the shipped preflight step with a controlled environment. */
function runPreflight(env: Record<string, string>): { exitCode: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "s7-preflight-"));
  try {
    const script = join(dir, "preflight.sh");
    writeFileSync(script, `#!/usr/bin/env bash\n${body("Preflight governed capture inputs")}`, "utf-8");
    chmodSync(script, 0o755);
    const result = spawnSync("bash", [script], {
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH ?? "",
        INVARIANT_ID: "",
        REQUIRED_INPUTS: "",
        PROBE_BASE_URL: "",
        CLOSURE_SUBJECT_SHA: "",
        PRODUCTION_DATABASE_URL: "",
        PROBE_OWNER_EMAIL: "",
        PROBE_OWNER_PASSWORD: "",
        ...env,
      },
    });
    return { exitCode: result.status ?? -1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Static contract ─────────────────────────────────────────────────────────

describe("stage7-capture — governed LANE_C input contract", () => {
  it("names one canonical production endpoint at workflow level", () => {
    expect(WORKFLOW.env?.PROBE_BASE_URL).toBe("https://o-ps-iq.vercel.app");
  });

  it("declares required_inputs for every matrix entry", () => {
    for (const id of CONTRACT_ENTRIES) {
      const contract = resolveContract(id);
      expect(contract, `${id} resolved no contract`).toHaveProperty("required_inputs");
    }
  });

  it("requires the endpoint and the authorized subject for S7-I1", () => {
    const required = resolveContract("S7-I1").required_inputs.split(" ").filter(Boolean);
    expect(required).toContain("PROBE_BASE_URL");
    expect(required).toContain("CLOSURE_SUBJECT_SHA");
  });

  it("requires a production database URL for S7-I2", () => {
    expect(resolveContract("S7-I2").required_inputs).toContain("PRODUCTION_DATABASE_URL");
  });

  it.each(["S7-I4", "S7-I5", "S7-I10-LANE_C"])(
    "requires owner credentials and the endpoint for %s",
    (id) => {
      const required = resolveContract(id).required_inputs.split(" ").filter(Boolean);
      expect(required).toContain("PROBE_BASE_URL");
      expect(required).toContain("PROBE_OWNER_EMAIL");
      expect(required).toContain("PROBE_OWNER_PASSWORD");
    },
  );

  it.each(["S7-I10-LANE_E", "S7-I11", "S7-I12"])(
    "declares no production inputs for LANE_E entry %s",
    (id) => {
      expect(resolveContract(id).required_inputs.trim()).toBe("");
    },
  );

  it("runs the preflight before the observation, never after", () => {
    const preflightIdx = STEPS.findIndex((s) => s.name?.startsWith("Preflight governed capture inputs"));
    const observeIdx = STEPS.findIndex((s) => s.id === "observe");
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(observeIdx).toBeGreaterThan(-1);
    expect(preflightIdx).toBeLessThan(observeIdx);
  });

  it("supplies the governed inputs to the observation step", () => {
    const env = step("observe").env ?? {};
    expect(env.PROBE_BASE_URL).toContain("env.PROBE_BASE_URL");
    expect(env.DATABASE_URL).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(env.DATABASE_DIRECT_URL).toContain("secrets.PRODUCTION_DATABASE_URL");
    expect(env.PROBE_OWNER_EMAIL).toContain("secrets.PRODUCTION_ACCEPTANCE_EMAIL");
    expect(env.PROBE_OWNER_PASSWORD).toContain("secrets.PRODUCTION_ACCEPTANCE_PASSWORD");
  });

  it("derives the authorized subject from the capture commit, not a copied literal", () => {
    const env = step("observe").env ?? {};
    expect(env.CLOSURE_SUBJECT_SHA).toContain("github.sha");
    // A second, drifting source of the subject is exactly what B3 grew out of.
    expect(env.CLOSURE_SUBJECT_SHA).not.toMatch(/[0-9a-f]{40}/);
  });

  it("never interpolates a secret into a run body", () => {
    for (const s of STEPS) {
      if (s.run) expect(s.run).not.toMatch(/\$\{\{\s*secrets\./);
    }
  });

  it("never echoes a governed input value from the preflight", () => {
    const preflight = body("Preflight governed capture inputs");
    // Presence is reported by name; the value is only ever tested, never printed.
    expect(preflight).toContain('echo "  present: $name"');
    expect(preflight).not.toMatch(/echo[^\n]*\$\{!name\}/);
  });
});

// ─── Executable preflight behaviour ──────────────────────────────────────────

describe("stage7-capture preflight — missing capture inputs REFUSE (B4)", () => {
  it("refuses S7-I2 when the production database URL is absent", () => {
    const r = runPreflight({ INVARIANT_ID: "S7-I2", REQUIRED_INPUTS: "PRODUCTION_DATABASE_URL" });
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain("REFUSED");
    expect(r.out).toContain("PRODUCTION_DATABASE_URL");
  });

  it.each(["S7-I4", "S7-I5", "S7-I10-LANE_C"])(
    "refuses %s when owner credentials are absent",
    (id) => {
      const r = runPreflight({
        INVARIANT_ID: id,
        REQUIRED_INPUTS: "PROBE_BASE_URL PROBE_OWNER_EMAIL PROBE_OWNER_PASSWORD",
        PROBE_BASE_URL: "https://example.invalid",
      });
      expect(r.exitCode).toBe(1);
      expect(r.out).toContain("PROBE_OWNER_EMAIL");
      expect(r.out).toContain("PROBE_OWNER_PASSWORD");
    },
  );

  it("refuses when only half of the credential pair is present", () => {
    const r = runPreflight({
      INVARIANT_ID: "S7-I5",
      REQUIRED_INPUTS: "PROBE_BASE_URL PROBE_OWNER_EMAIL PROBE_OWNER_PASSWORD",
      PROBE_BASE_URL: "https://example.invalid",
      PROBE_OWNER_PASSWORD: "sentinel",
    });
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain("PROBE_OWNER_EMAIL");
  });

  it("refuses S7-I1 when the authorized subject is absent", () => {
    const r = runPreflight({
      INVARIANT_ID: "S7-I1",
      REQUIRED_INPUTS: "PROBE_BASE_URL CLOSURE_SUBJECT_SHA",
      PROBE_BASE_URL: "https://example.invalid",
    });
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain("CLOSURE_SUBJECT_SHA");
  });

  it("proceeds when every declared input is present", () => {
    const r = runPreflight({
      INVARIANT_ID: "S7-I1",
      REQUIRED_INPUTS: "PROBE_BASE_URL CLOSURE_SUBJECT_SHA",
      PROBE_BASE_URL: "https://example.invalid",
      CLOSURE_SUBJECT_SHA: "a".repeat(40),
    });
    expect(r.exitCode).toBe(0);
  });

  it("proceeds for a LANE_E entry, which declares no production inputs", () => {
    const r = runPreflight({ INVARIANT_ID: "S7-I11", REQUIRED_INPUTS: "" });
    expect(r.exitCode).toBe(0);
  });

  it("never prints a supplied value", () => {
    const secret = "SENTINEL_VALUE_do_not_print";
    const r = runPreflight({
      INVARIANT_ID: "S7-I4",
      REQUIRED_INPUTS: "PROBE_BASE_URL PROBE_OWNER_EMAIL PROBE_OWNER_PASSWORD",
      PROBE_BASE_URL: "https://example.invalid",
      PROBE_OWNER_EMAIL: "owner@example.invalid",
      PROBE_OWNER_PASSWORD: secret,
    });
    expect(r.exitCode).toBe(0);
    expect(r.out).not.toContain(secret);
  });
});

// ─── Executable S7-I1 identity behaviour ─────────────────────────────────────

interface StubState {
  buildInfoStatus: number;
  commit: string;
  environment: string;
  healthStatus: number;
}

/**
 * The stub deployment runs OUT OF PROCESS.
 *
 * The probe is driven with spawnSync, which blocks this process's event loop —
 * an in-process server would never accept the connection and every case would
 * "fail" on the probe's 15s timeout regardless of what it does. Behaviour is
 * steered through a JSON state file the stub re-reads per request.
 */
let stubProc: ReturnType<typeof spawn>;
let stubDir = "";
let statePath = "";
let baseUrl = "";

const stub: StubState = {
  buildInfoStatus: 200,
  commit: "",
  environment: "production",
  healthStatus: 200,
};

function setStub(patch: Partial<StubState>): void {
  Object.assign(stub, patch);
  writeFileSync(statePath, JSON.stringify(stub), "utf-8");
}

const STUB_SERVER = `
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const statePath = process.argv[2];
const read = () => JSON.parse(readFileSync(statePath, "utf-8"));
const server = createServer((req, res) => {
  const s = read();
  if (req.url.startsWith("/api/internal/build-info")) {
    res.writeHead(s.buildInfoStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({ commit: s.commit, environment: s.environment }));
    return;
  }
  if (req.url.startsWith("/api/health")) {
    res.writeHead(s.healthStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({
      status: s.healthStatus === 200 ? "healthy" : "unhealthy",
      timestamp: "2026-09-03T00:00:00.000Z",
      checks: { database: { status: s.healthStatus === 200 ? "healthy" : "unhealthy" } },
    }));
    return;
  }
  res.writeHead(404).end("{}");
});
server.listen(0, "127.0.0.1", () => console.log("PORT=" + server.address().port));
`;

beforeAll(async () => {
  stubDir = mkdtempSync(join(tmpdir(), "s7-i1-stub-"));
  statePath = join(stubDir, "state.json");
  writeFileSync(statePath, JSON.stringify(stub), "utf-8");
  const serverPath = join(stubDir, "stub-server.mjs");
  writeFileSync(serverPath, STUB_SERVER, "utf-8");

  stubProc = spawn("node", [serverPath, statePath], { stdio: ["ignore", "pipe", "pipe"] });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub server did not start")), 20000);
    stubProc.stdout?.on("data", (chunk: Buffer) => {
      const m = /PORT=(\d+)/.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
}, 30000);

afterAll(() => {
  stubProc?.kill();
  if (stubDir) rmSync(stubDir, { recursive: true, force: true });
});

interface ProbeResult {
  exitCode: number;
  out: string;
  result: "PASS" | "FAIL" | "NONE";
}

function runProbe(env: Record<string, string>): ProbeResult {
  const r = spawnSync("node", [PROBE_PATH], {
    encoding: "utf-8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const result = /^RESULT: PASS$/m.test(out)
    ? "PASS"
    : /^RESULT: FAIL$/m.test(out)
      ? "FAIL"
      : "NONE";
  return { exitCode: r.status ?? -1, out, result };
}

const SUBJECT = "c".repeat(40);

describe("S7-I1 — PASS requires a compared deployed SHA (B3)", () => {
  it("fails when no authorized subject is supplied", () => {
    setStub({ commit: SUBJECT });
    const r = runProbe({ PROBE_BASE_URL: baseUrl, DEPLOYMENT_ID: "dpl_fixture" });
    expect(r.result).toBe("FAIL");
    expect(r.exitCode).toBe(1);
    expect(r.out).toContain("CLOSURE_SUBJECT_SHA");
  });

  it("fails when no endpoint is supplied", () => {
    const r = runProbe({ CLOSURE_SUBJECT_SHA: SUBJECT, DEPLOYMENT_ID: "dpl_fixture" });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("PROBE_BASE_URL");
  });

  it("fails on a malformed authorized subject", () => {
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: "not-a-sha",
      DEPLOYMENT_ID: "dpl_fixture",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("MALFORMED");
  });

  it("fails when the deployment cannot report its identity", () => {
    setStub({ buildInfoStatus: 500, commit: SUBJECT });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    setStub({ buildInfoStatus: 200 });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("build_info_unavailable");
  });

  it("fails when the deployed commit is unknown", () => {
    setStub({ commit: "unknown" });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("deployed_sha_unresolvable");
  });

  it("fails when the deployment is not the production environment", () => {
    setStub({ commit: SUBJECT, environment: "preview" });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    setStub({ environment: "production" });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("deployed_environment_not_production");
  });

  it("fails when the deployed SHA is not the authorized subject", () => {
    setStub({ commit: "d".repeat(40) });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("sha_mismatch_detail");
  });

  it("fails when the identified deployment is unhealthy", () => {
    setStub({ commit: SUBJECT, healthStatus: 503 });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    setStub({ healthStatus: 200 });
    expect(r.result).toBe("FAIL");
  });

  // The deployed SHA is still compared from build-info exactly as before. What
  // changed is that build-info alone is no longer SUFFICIENT: S7-I1's canonical
  // evidence names a deployment dashboard, so the control-plane credential is now
  // a required input rather than an optional strengthening. The full PASS path,
  // with a stubbed control plane, lives in stage7-machine-probe-integrity.test.ts.
  it("compares the deployed SHA but refuses to pass without a deployment dashboard", () => {
    setStub({ commit: SUBJECT });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    // The comparison happened...
    expect(r.out).toMatch(/\[PASS\] sha_matches_closure_subject/);
    expect(r.out).toMatch(new RegExp(`deployed=${SUBJECT}`));
    // ...and the missing second authority is what withholds the verdict.
    expect(r.result).toBe("FAIL");
    expect(r.out).toContain("vercel_control_plane_credential");
  });

  it("never reports PASS alongside an unverified SHA", () => {
    setStub({ commit: SUBJECT });
    const r = runProbe({
      PROBE_BASE_URL: baseUrl,
      CLOSURE_SUBJECT_SHA: SUBJECT,
      DEPLOYMENT_ID: "dpl_fixture",
    });
    // The B3 signature: a skipped verification recorded as a passing observation.
    expect(r.out).not.toContain("SKIPPED");
    expect(r.out).not.toContain("NOT_REQUESTED");
    expect(r.out).toMatch(new RegExp(`deployed=${SUBJECT}`));
  });

  it("carries no hardcoded historical subject to fall back to", () => {
    const src = readFileSync(PROBE_PATH, "utf-8");
    expect(src).not.toContain("036c526940f349d7d06e05635f29c064c78ba71b");
    expect(src).not.toMatch(/D12_AUTHORIZED_SHA/);
    expect(src).not.toMatch(/DEFAULT_PRODUCTION_URL/);
  });
});

/**
 * Stage 7 capture — fail-closed test-runner validity gate.
 *
 * Incident this locks down: the observation step mapped ANY non-zero exit of the
 * hardcoded observation command to `result=FAIL`, and refused only when the
 * observation file was empty. A vitest run that dies during startup (removed
 * reporter, unknown CLI option, config parse error, unresolvable module, no
 * matching test files) exits non-zero AND writes to stderr, which is redirected
 * into the observation file — so it was non-empty, and the non-observation was
 * captured, signed, filed as an evidence PR and handed to the trusted verifier
 * as an observed invariant FAIL. That is a fabricated observation.
 *
 * The gate must draw exactly one boundary:
 *   tests executed and failed          -> FAIL artifact allowed
 *   runner never executed tests        -> REFUSE before any capture
 *
 * These tests do not re-implement the gate. They extract the REAL `run:` script
 * of the "Run observation" step out of the shipped workflow and execute it under
 * bash with a stubbed `npx` on PATH, so what is proven is the text that ships.
 * Following the repo idiom in src/__tests__/deployment/migrate-workflow-*.test.ts:
 * static-source assertions plus genuine execution of the extracted idiom.
 */
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/stage7-capture.yml");
const src = readFileSync(WORKFLOW_PATH, "utf-8");

/**
 * Pull the `run:` body of the "Run observation" step out of the workflow and
 * dedent it, so the exact shipped script can be executed.
 */
function extractObservationScript(): string {
  const stepIdx = src.indexOf("- name: Run observation (hardcoded command");
  if (stepIdx < 0) throw new Error("Run observation step not found");
  const runIdx = src.indexOf("run: |", stepIdx);
  if (runIdx < 0) throw new Error("run: block not found in Run observation step");
  const bodyStart = src.indexOf("\n", runIdx) + 1;
  const lines: string[] = [];
  for (const line of src.slice(bodyStart).split("\n")) {
    // The body is indented 10 spaces. Stop at the first line that is neither
    // blank nor part of the block.
    if (line.trim() !== "" && !line.startsWith("          ")) break;
    lines.push(line.length >= 10 ? line.slice(10) : line);
  }
  const script = lines.join("\n").trimEnd();
  if (script === "") throw new Error("extracted observation script is empty");
  return script;
}

const OBSERVATION_SCRIPT = extractObservationScript();

/** A realistic vitest summary block for a run that actually executed. */
const VITEST_PASS_OUTPUT = [
  "",
  " RUN  v4.1.7 /home/runner/work/OPsIq/OPsIq",
  "",
  " ✓ src/__tests__/completion-factory/stage7-audit-check.test.ts (20 tests) 11ms",
  "",
  " Test Files  1 passed (1)",
  "      Tests  20 passed (20)",
  "   Duration  6.84s",
  "",
].join("\n");

const VITEST_FAIL_OUTPUT = [
  "",
  " RUN  v4.1.7 /home/runner/work/OPsIq/OPsIq",
  "",
  " ❯ src/__tests__/completion-factory/stage7-audit-check.test.ts (20 tests | 1 failed) 13ms",
  "",
  " FAIL  src/__tests__/completion-factory/stage7-audit-check.test.ts > audit > attributes",
  "AssertionError: expected 'observed' to be 'expected'",
  "",
  " Test Files  1 failed (1)",
  "      Tests  1 failed | 19 passed (20)",
  "",
].join("\n");

/** Verbatim shape of a vitest 4.1.7 startup error (removed `basic` reporter). */
const VITEST_STARTUP_ERROR = [
  "",
  "⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯",
  "Error: Failed to load custom Reporter from basic",
  "    at loadCustomReporterModule (file:///home/runner/work/OPsIq/node_modules/vitest/dist/chunks/cli-api.js:11346:9)",
  "  [cause]: Error: Failed to load url basic (resolved id: basic). Does the file exist?",
  "",
].join("\n");

/** Vitest started but matched no test files — lowercase, must not satisfy the marker. */
const VITEST_NO_TEST_FILES = [
  "",
  " RUN  v4.1.7 /home/runner/work/OPsIq/OPsIq",
  "",
  "No test files found, exiting with code 1",
  "",
  "filter:  src/__tests__/completion-factory/missing.test.ts",
  "",
].join("\n");

interface StepResult {
  status: number;
  stderr: string;
  outputs: Record<string, string>;
}

/**
 * Execute the extracted step under bash.
 *
 * `stubOutput`/`stubExit` drive a fake `npx` placed first on PATH, so
 * OBSERVATION_COMMAND can be the byte-for-byte contract string.
 */
function runObservationStep(opts: {
  command: string;
  method: string;
  stubOutput: string;
  stubExit: number;
  stubStream?: "stdout" | "stderr";
}): StepResult {
  const dir = mkdtempSync(join(tmpdir(), "s7-obs-"));
  try {
    const payload = join(dir, "payload.txt");
    writeFileSync(payload, opts.stubOutput);

    const redirect = (opts.stubStream ?? "stdout") === "stderr" ? ">&2" : "";
    for (const bin of ["npx", "node"]) {
      const stub = join(dir, bin);
      writeFileSync(stub, `#!/usr/bin/env bash\ncat ${payload} ${redirect}\nexit ${opts.stubExit}\n`);
      chmodSync(stub, 0o755);
    }

    const githubOutput = join(dir, "github_output");
    writeFileSync(githubOutput, "");
    const scriptPath = join(dir, "step.sh");
    writeFileSync(scriptPath, OBSERVATION_SCRIPT);

    const proc = spawnSync("bash", [scriptPath], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: githubOutput,
        OBSERVATION_COMMAND: opts.command,
        METHOD: opts.method,
        DEPLOYMENT_ID: "",
      },
    });

    const outputs: Record<string, string> = {};
    for (const line of readFileSync(githubOutput, "utf-8").split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return { status: proc.status ?? -1, stderr: proc.stderr ?? "", outputs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VITEST_COMMAND =
  "npx vitest run src/__tests__/completion-factory/stage7-audit-check.test.ts --reporter=default";
const NODE_PROBE_COMMAND = "node scripts/stage7-probes/s7-i12-runbook-recovery.mjs";

describe("stage7-capture.yml — fail-closed test-runner validity gate", () => {
  describe("static source contract", () => {
    it("passes the hardcoded contract method into the observation step", () => {
      const stepIdx = src.indexOf("- name: Run observation (hardcoded command");
      const nextStepIdx = src.indexOf("- name:", stepIdx + 10);
      const step = src.slice(stepIdx, nextStepIdx);
      expect(step).toContain("METHOD: ${{ steps.contract.outputs.method }}");
    });

    it("does not write result= before the validity gate has run", () => {
      const gateIdx = OBSERVATION_SCRIPT.indexOf("REFUSED: the vitest run did not execute");
      const passIdx = OBSERVATION_SCRIPT.indexOf('echo "result=PASS"');
      const failIdx = OBSERVATION_SCRIPT.indexOf('echo "result=FAIL"');
      expect(gateIdx).toBeGreaterThan(-1);
      expect(passIdx).toBeGreaterThan(gateIdx);
      expect(failIdx).toBeGreaterThan(gateIdx);
    });

    it("matches the execution marker case-sensitively", () => {
      // A case-insensitive match would accept "No test files found", which is
      // precisely a run that executed nothing.
      expect(OBSERVATION_SCRIPT).toContain("Test Files");
      expect(OBSERVATION_SCRIPT).not.toMatch(/grep -[a-z]*i[a-z]*E? .*Test Files/i);
    });

    it("never emits BLOCKED or NOT_TESTED artifacts in place of refusing", () => {
      expect(OBSERVATION_SCRIPT).not.toContain("result=BLOCKED");
      expect(OBSERVATION_SCRIPT).not.toContain("result=NOT_TESTED");
    });
  });

  describe("behaviour", () => {
    it("1. valid vitest run that passes -> result=PASS, step succeeds", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_PASS_OUTPUT,
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
      expect(r.outputs.observation_file).toBeTruthy();
    });

    it("2. valid vitest run with a genuine assertion failure -> result=FAIL, step succeeds", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_FAIL_OUTPUT,
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
      expect(r.outputs.observation_file).toBeTruthy();
    });

    it("3. vitest startup failure -> REFUSED before capture, no result recorded", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_STARTUP_ERROR,
        stubExit: 1,
        stubStream: "stderr",
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("REFUSED");
      expect(r.outputs.result).toBeUndefined();
      expect(r.outputs.observation_file).toBeUndefined();
    });

    it("4. vitest ran but matched no test files -> REFUSED (lowercase message must not satisfy the marker)", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_NO_TEST_FILES,
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("REFUSED");
      expect(r.outputs.result).toBeUndefined();
    });

    it("5. S7-I12 node probe (method=test_run, not vitest) is unaffected on failure", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "runbook recovery probe: step 3 did not recover\n",
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("6. S7-I12 node probe is unaffected on success", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "runbook recovery probe: recovered using documented steps\n",
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
    });

    it("7. LANE_C http_probe failure is unaffected -> result=FAIL", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i1-health-probe.mjs",
        method: "http_probe",
        stubOutput: "health probe: expected 200, received 503\n",
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("8. LANE_C db_query success is unaffected -> result=PASS", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i2-migration-check.mjs",
        method: "db_query",
        stubOutput: "0 pending migrations\n",
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
    });

    it("9. empty observation output is still refused, before the validity gate", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: "",
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("produced no output");
      expect(r.outputs.result).toBeUndefined();
    });

    it("10. a startup error that exits 0 is still refused (exit status is not the gate)", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_STARTUP_ERROR,
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("REFUSED");
      expect(r.outputs.result).toBeUndefined();
    });

    it("11. prose mentioning test files does not satisfy the marker", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: "Could not resolve Test Files for the requested pattern\n",
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("REFUSED");
      expect(r.outputs.result).toBeUndefined();
    });

    it("12. the refusal surfaces the observation output for diagnosis", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: VITEST_STARTUP_ERROR,
        stubExit: 1,
        stubStream: "stderr",
      });
      expect(r.stderr).toContain("Failed to load custom Reporter");
    });
  });
});

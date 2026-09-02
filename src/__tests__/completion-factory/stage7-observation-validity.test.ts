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
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync, existsSync } from "fs";
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

/**
 * Stage 7 node probes end a governed run with exactly one terminal verdict line
 * and an exit status that agrees with it. Their per-check lines and summary line
 * both contain the words PASS and FAIL and must NOT be mistaken for a verdict.
 */
const PROBE_PASS_OUTPUT = [
  "=== S7-I12 RUNBOOK RECOVERY PROBE ===",
  "[PASS] runbook_step_1_documented: true",
  "[PASS] recovery_completed_without_undocumented_steps: true",
  "",
  "=== OBSERVATION SUMMARY ===",
  "Checks: 28 PASS, 0 FAIL",
  "",
  "RESULT: PASS",
  "",
].join("\n");

const PROBE_FAIL_OUTPUT = [
  "=== S7-I12 RUNBOOK RECOVERY PROBE ===",
  "[PASS] runbook_step_1_documented: true",
  "[FAIL] recovery_completed_without_undocumented_steps: false",
  "",
  "=== OBSERVATION SUMMARY ===",
  "Checks: 27 PASS, 1 FAIL",
  "",
  "RESULT: FAIL",
  "",
].join("\n");

/** Verbatim shape of the probes' unhandled-error path: no verdict line. */
const PROBE_MODULE_NOT_FOUND = [
  "node:internal/modules/esm/resolve:275",
  "  throw new ERR_MODULE_NOT_FOUND(",
  "        ^",
  "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/OPsIq/scripts/lib/probe-http.mjs'",
  "    at finalizeResolution (node:internal/modules/esm/resolve:275:11)",
  "  code: 'ERR_MODULE_NOT_FOUND'",
  "",
].join("\n");

const PROBE_SYNTAX_ERROR = [
  "file:///home/runner/work/OPsIq/scripts/stage7-probes/s7-i1-health-probe.mjs:41",
  "  const { ok = await probe(",
  "                    ^^^^^",
  "SyntaxError: Unexpected token 'await'",
  "    at compileSourceTextModule (node:internal/modules/esm/utils:346:16)",
  "",
].join("\n");

const PROBE_UNHANDLED_EXCEPTION = [
  "=== S7-I1 HEALTH PROBE ===",
  "[PASS] endpoint_reachable: true",
  "Unhandled error: TypeError: Cannot read properties of undefined (reading 'status')",
  "    at main (file:///home/runner/work/OPsIq/scripts/stage7-probes/s7-i1-health-probe.mjs:118:22)",
  "",
].join("\n");

/**
 * The genuine colourised summary block GitHub Actions produced for S7-I11 in
 * capture run 33633377692 — the run that was falsely refused. Reproduced here as
 * the exact escape sequences the runner emitted, so the regression is anchored to
 * observed reality rather than to a guess about how vitest colourises.
 *
 * Note where the escapes fall: "Test Files" is followed by a space and then
 * ESC[22m, NOT by the digit the pre-fix marker required.
 */
const REAL_CI_ANSI_PASS = [
  "",
  "\x1b[7m RUN \x1b[27m \x1b[36mv4.1.7\x1b[39m \x1b[90m/home/runner/work/OPsIq/OPsIq\x1b[39m",
  "",
  " \x1b[32m✓\x1b[39m src/__tests__/completion-factory/stage7-evidence-artifact.test.ts \x1b[2m(59 tests)\x1b[22m \x1b[90m4722ms\x1b[39m",
  " \x1b[32m✓\x1b[39m src/__tests__/completion-factory/stage7-ed25519-hostile.test.ts \x1b[2m(15 tests)\x1b[22m \x1b[90m975ms\x1b[39m",
  "",
  "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m2 passed\x1b[39m\x1b[22m\x1b[90m (2)\x1b[39m",
  "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m74 passed\x1b[39m\x1b[22m\x1b[90m (74)\x1b[39m",
  "",
].join("\n");

/** Same colourisation, but a genuinely failing assertion. */
const REAL_CI_ANSI_FAIL = [
  "",
  "\x1b[7m RUN \x1b[27m \x1b[36mv4.1.7\x1b[39m",
  "",
  "\x1b[31m FAIL \x1b[39m src/__tests__/completion-factory/stage7-audit-check.test.ts > audit > attributes",
  "\x1b[31mAssertionError: expected 'observed' to be 'expected'\x1b[39m",
  "",
  "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[90m (1)\x1b[39m",
  "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[90m | 19 passed (20)\x1b[39m",
  "",
].join("\n");

/** Colourised startup error — no summary block is ever printed. */
const REAL_CI_ANSI_STARTUP_ERROR = [
  "",
  "\x1b[31m⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯\x1b[39m",
  "\x1b[31mError: Failed to load custom Reporter from basic\x1b[39m",
  "  [cause]: Error: Failed to load url basic. Does the file exist?",
  "",
].join("\n");

/** Colourised "no test files" — lowercase, and must stay invalid. */
const REAL_CI_ANSI_NO_TEST_FILES = [
  "",
  "\x1b[7m RUN \x1b[27m \x1b[36mv4.1.7\x1b[39m",
  "",
  "\x1b[33mNo test files found, exiting with code 1\x1b[39m",
  "",
].join("\n");

/** Colourised Stage 7 node-probe output, verdict wrapped in SGR sequences. */
const ANSI_PROBE_PASS = [
  "\x1b[32m[PASS]\x1b[39m runbook_step_1_documented: true",
  "\x1b[1mChecks: 28 PASS, 0 FAIL\x1b[22m",
  "",
  "\x1b[32mRESULT: PASS\x1b[39m",
  "",
].join("\n");

const ANSI_PROBE_FAIL = [
  "\x1b[31m[FAIL]\x1b[39m recovery_completed: false",
  "\x1b[1mChecks: 27 PASS, 1 FAIL\x1b[22m",
  "",
  "\x1b[31mRESULT: FAIL\x1b[39m",
  "",
].join("\n");

interface StepResult {
  status: number;
  stderr: string;
  outputs: Record<string, string>;
  /** Bytes of $RUNNER_TEMP/observation.txt as the step left them, if it survived. */
  observationFileContent: string | null;
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
    const obsPath = join(dir, "observation.txt");
    const observationFileContent = existsSync(obsPath) ? readFileSync(obsPath, "utf-8") : null;
    return { status: proc.status ?? -1, stderr: proc.stderr ?? "", outputs, observationFileContent };
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

    it("classifies every hardcoded matrix command as vitest or a Stage 7 node probe", () => {
      // Nothing may fall through to the unclassified refusal today; if a future
      // matrix entry does, this test names it rather than letting it reach capture.
      const block = src.slice(
        src.indexOf('case "$INVARIANT_ID" in'),
        src.indexOf('*)\n              echo "REFUSED:'),
      );
      const commands = [...block.matchAll(/echo "command=([^"]*)"/g)].map((m) => m[1]);
      expect(commands.length).toBe(8);
      const classify = (c: string) =>
        c.includes("vitest run")
          ? "vitest"
          : c.startsWith("node scripts/stage7-probes/")
            ? "stage7_node_probe"
            : "unclassified";
      expect(commands.filter((c) => classify(c) === "unclassified")).toEqual([]);
      expect(commands.filter((c) => classify(c) === "vitest").length).toBe(2);
      expect(commands.filter((c) => classify(c) === "stage7_node_probe").length).toBe(6);
    });

    it("classifies the S7-I12 command as a node probe, not vitest, despite method=test_run", () => {
      const block = src.slice(src.indexOf("S7-I12)"), src.indexOf("S7-I12)") + 900);
      expect(block).toContain('echo "method=test_run"');
      const cmd = /echo "command=([^"]*)"/.exec(block)?.[1] ?? "";
      expect(cmd).toBe("node scripts/stage7-probes/s7-i12-runbook-recovery.mjs");
      expect(cmd.includes("vitest run")).toBe(false);
      expect(cmd.startsWith("node scripts/stage7-probes/")).toBe(true);
    });

    it("evaluates both validity gates against an ANSI-normalised copy, not the raw evidence", () => {
      expect(OBSERVATION_SCRIPT).toContain('validation_file="$RUNNER_TEMP/observation.normalized.txt"');
      // Gates read the copy...
      expect(OBSERVATION_SCRIPT).toMatch(/Test Files\[\[:space:\]\]\+\[0-9\]\+' "\$validation_file"/);
      expect(OBSERVATION_SCRIPT).toMatch(/RESULT:.*' "\$validation_file"/);
      // ...while the artifact still consumes the raw observation.
      expect(OBSERVATION_SCRIPT).toContain('echo "observation_file=$obs_file"');
      // The raw file is never overwritten by the normalisation.
      expect(OBSERVATION_SCRIPT).not.toMatch(/>\s*"\$obs_file"\s*$/m);
    });

    it("strips only CSI sequences, never arbitrary text", () => {
      // ESC '[' , digits/semicolons, one ASCII final byte. A '[' or digit with no
      // leading ESC is untouched, and a malformed escape is left in place.
      expect(OBSERVATION_SCRIPT).toContain("[0-9;]*[A-Za-z]//g");
      expect(OBSERVATION_SCRIPT).toContain("LC_ALL=C sed");
    });

    it("anchors the node-probe verdict match to a whole line", () => {
      expect(OBSERVATION_SCRIPT).toContain(
        "^[[:space:]]*RESULT:[[:space:]]+(PASS|FAIL)[[:space:]]*$",
      );
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

    it("5. S7-I12 node probe with a controlled FAIL verdict -> result=FAIL", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: PROBE_FAIL_OUTPUT,
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("6. S7-I12 node probe with a controlled PASS verdict -> result=PASS", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: PROBE_PASS_OUTPUT,
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
    });

    it("7. LANE_C http_probe with a controlled FAIL verdict -> result=FAIL", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i1-health-probe.mjs",
        method: "http_probe",
        stubOutput: "health probe: expected 200, received 503\n\nRESULT: FAIL\n",
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("8. LANE_C db_query with a controlled PASS verdict -> result=PASS", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i2-migration-check.mjs",
        method: "db_query",
        stubOutput: "0 pending migrations\n\nRESULT: PASS\n",
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

    // ── Stage 7 node-probe terminal-verdict gate ────────────────────────────
    it("13. node probe: exit 1 with no verdict line -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "runbook recovery probe: step 3 did not recover\n",
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.outputs.result).toBeUndefined();
    });

    it("14. node probe: exit 0 with no verdict line -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "runbook recovery probe: recovered using documented steps\n",
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.outputs.result).toBeUndefined();
    });

    it("15. node probe: RESULT: PASS but non-zero exit -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: PROBE_PASS_OUTPUT,
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("declared 'RESULT: PASS' but exited 1");
      expect(r.outputs.result).toBeUndefined();
    });

    it("16. node probe: RESULT: FAIL but exit 0 -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: PROBE_FAIL_OUTPUT,
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("declared 'RESULT: FAIL' but exited 0");
      expect(r.outputs.result).toBeUndefined();
    });

    it("17. node probe: both PASS and FAIL verdicts present -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "checks ran\n\nRESULT: PASS\nRESULT: FAIL\n",
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("2 terminal verdict lines");
      expect(r.outputs.result).toBeUndefined();
    });

    it("18. node probe: duplicate PASS verdicts -> REFUSED", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "checks ran\n\nRESULT: PASS\nRESULT: PASS\n",
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("2 terminal verdict lines");
      expect(r.outputs.result).toBeUndefined();
    });

    it("19. node probe: ERR_MODULE_NOT_FOUND on stderr only -> REFUSED", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i1-health-probe.mjs",
        method: "http_probe",
        stubOutput: PROBE_MODULE_NOT_FOUND,
        stubExit: 1,
        stubStream: "stderr",
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.stderr).toContain("ERR_MODULE_NOT_FOUND");
      expect(r.outputs.result).toBeUndefined();
    });

    it("20. node probe: SyntaxError before main() -> REFUSED", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i1-health-probe.mjs",
        method: "http_probe",
        stubOutput: PROBE_SYNTAX_ERROR,
        stubExit: 1,
        stubStream: "stderr",
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.outputs.result).toBeUndefined();
    });

    it("21. node probe: unhandled exception after partial output -> REFUSED", () => {
      const r = runObservationStep({
        command: "node scripts/stage7-probes/s7-i1-health-probe.mjs",
        method: "http_probe",
        stubOutput: PROBE_UNHANDLED_EXCEPTION,
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.outputs.result).toBeUndefined();
    });

    it("22. node probe: per-check and summary lines are not mistaken for a verdict", () => {
      // "[PASS] x: true" and "Checks: 28 PASS, 0 FAIL" both contain PASS/FAIL.
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: [
          "[PASS] runbook_step_1_documented: true",
          "[FAIL] recovery_completed: false",
          "Checks: 27 PASS, 1 FAIL",
          "RESULT: PASS is what a compliant probe would print",
          "",
        ].join("\n"),
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not reach a controlled verdict");
      expect(r.outputs.result).toBeUndefined();
    });

    it("23. node probe: empty output is refused before the verdict gate", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: "",
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("produced no output");
      expect(r.outputs.result).toBeUndefined();
    });

    it("24. an unclassified observation command is refused", () => {
      const r = runObservationStep({
        command: "bash scripts/some-future-observation.sh",
        method: "test_run",
        stubOutput: "RESULT: PASS\n",
        stubExit: 0,
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("not a governed Stage 7 observation");
      expect(r.outputs.result).toBeUndefined();
    });

    // ── ANSI normalisation (capture run 33633377692 false-refusal regression) ──
    it("25. the REAL colourised CI output that was falsely refused now yields PASS", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: REAL_CI_ANSI_PASS,
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
    });

    it("26. the pre-fix marker genuinely could not match those bytes", () => {
      // Guards the premise of test 25: if this ever starts matching, the runner
      // stopped colourising and test 25 would pass for the wrong reason.
      expect(REAL_CI_ANSI_PASS).toMatch(/Test Files/);
      expect(REAL_CI_ANSI_PASS).not.toMatch(/(^|\s)Test Files\s+[0-9]+/);
    });

    it("27. colourised legitimate assertion failure -> result=FAIL", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: REAL_CI_ANSI_FAIL,
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("28. colourised startup failure -> REFUSED", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: REAL_CI_ANSI_STARTUP_ERROR,
        stubExit: 1,
        stubStream: "stderr",
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("did not execute any tests");
      expect(r.outputs.result).toBeUndefined();
    });

    it("29. colourised 'No test files found' -> REFUSED (case-sensitivity survives stripping)", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: REAL_CI_ANSI_NO_TEST_FILES,
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.outputs.result).toBeUndefined();
    });

    it("30. colourised node RESULT: PASS + exit 0 -> result=PASS", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: ANSI_PROBE_PASS,
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("PASS");
    });

    it("31. colourised node RESULT: FAIL + non-zero exit -> result=FAIL", () => {
      const r = runObservationStep({
        command: NODE_PROBE_COMMAND,
        method: "test_run",
        stubOutput: ANSI_PROBE_FAIL,
        stubExit: 1,
      });
      expect(r.status).toBe(0);
      expect(r.outputs.result).toBe("FAIL");
    });

    it("32. colourised node verdict/exit mismatch still REFUSES", () => {
      const pass1 = runObservationStep({
        command: NODE_PROBE_COMMAND, method: "test_run", stubOutput: ANSI_PROBE_PASS, stubExit: 1,
      });
      expect(pass1.status).not.toBe(0);
      expect(pass1.outputs.result).toBeUndefined();

      const fail0 = runObservationStep({
        command: NODE_PROBE_COMMAND, method: "test_run", stubOutput: ANSI_PROBE_FAIL, stubExit: 0,
      });
      expect(fail0.status).not.toBe(0);
      expect(fail0.outputs.result).toBeUndefined();
    });

    it("33. the signed observation keeps the RAW bytes — normalisation is copy-only", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        stubOutput: REAL_CI_ANSI_PASS,
        stubExit: 0,
      });
      expect(r.status).toBe(0);
      // The artifact consumes observation.txt; it must still carry the escapes.
      expect(r.observationFileContent).toBe(REAL_CI_ANSI_PASS);
      expect(r.observationFileContent).toContain("\x1b[");
      // And the step must hand the artifact the raw file, not the normalised copy.
      expect(r.outputs.observation_file).toMatch(/observation\.txt$/);
      expect(r.outputs.observation_file).not.toMatch(/normalized/);
    });

    it("34. stripping does not manufacture a marker from unrelated prose", () => {
      const r = runObservationStep({
        command: VITEST_COMMAND,
        method: "test_run",
        // Escapes sit between the words; removing them yields "TestFiles1", not the marker.
        stubOutput: "Test\x1b[0mFiles\x1b[0m1\nnothing executed\n",
        stubExit: 1,
      });
      expect(r.status).not.toBe(0);
      expect(r.outputs.result).toBeUndefined();
    });

    it("35. non-ANSI observations behave exactly as before", () => {
      const pass = runObservationStep({
        command: VITEST_COMMAND, method: "test_run", stubOutput: VITEST_PASS_OUTPUT, stubExit: 0,
      });
      expect(pass.outputs.result).toBe("PASS");
      const fail = runObservationStep({
        command: VITEST_COMMAND, method: "test_run", stubOutput: VITEST_FAIL_OUTPUT, stubExit: 1,
      });
      expect(fail.outputs.result).toBe("FAIL");
      const probe = runObservationStep({
        command: NODE_PROBE_COMMAND, method: "test_run", stubOutput: PROBE_PASS_OUTPUT, stubExit: 0,
      });
      expect(probe.outputs.result).toBe("PASS");
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

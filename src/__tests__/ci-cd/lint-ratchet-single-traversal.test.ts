/**
 * Lint ratchet — one ESLint traversal per CI job, and fail-closed semantics.
 *
 * The CI lint job used to run `npm run lint` in a step whose result was discarded
 * (continue-on-error), and scripts/lint-ratchet.mjs then ran `npm run lint` a second
 * time internally. One job paid for two complete traversals of the repository inside
 * timeout-minutes: 10 and overran it non-deterministically — jobs 100920174479,
 * 100939368880, 100945566301 and 100956290102 each ran 10m15s–10m18s and were killed
 * mid-ratchet. GitHub reports a timeout as `cancelled` and branch-protection fails
 * closed on it, so a lint result that was inside the baseline surfaced as a red
 * required check four times.
 *
 * These tests exist so that cannot come back. The topology test does not merely grep
 * for command text — a second traversal could be reintroduced under any wording — it
 * executes the ratchet with every lint entry point on PATH replaced by a stub that
 * records being called, and proves the stub was never reached.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { load as yamlLoad } from "js-yaml";
import fs from "fs";
import os from "os";
import path from "path";

const root = process.cwd();
const RATCHET = path.join(root, "scripts", "lint-ratchet.mjs");
const CI_WORKFLOW = path.join(root, ".github", "workflows", "ci.yml");

const baseline = JSON.parse(
  fs.readFileSync(path.join(root, ".claude", "lint-baseline.json"), "utf8"),
) as { baseline_error_count: number; baseline_warning_count: number };

interface WorkflowStep {
  name?: string;
  run?: string;
  "continue-on-error"?: boolean;
}

const ciWorkflow = yamlLoad(fs.readFileSync(CI_WORKFLOW, "utf8")) as {
  jobs: Record<string, { steps: WorkflowStep[]; "timeout-minutes"?: number }>;
};

const lintSteps = ciWorkflow.jobs.lint.steps.filter((s) => typeof s.run === "string");

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-ratchet-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Write an ESLint JSON report fixture. Paths are absolute inside the repo so the
 *  freshness check treats it as belonging to this checkout. */
function writeReport(
  name: string,
  entries: Array<{ file: string; errorCount: number; warningCount: number; messages?: unknown[] }>,
): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(
    file,
    JSON.stringify(
      entries.map((e) => ({
        filePath: path.join(root, e.file),
        messages: e.messages ?? [],
        suppressedMessages: [],
        errorCount: e.errorCount,
        fatalErrorCount: 0,
        warningCount: e.warningCount,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      })),
    ),
  );
  return file;
}

function writeRaw(name: string, contents: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function runRatchet(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [RATCHET, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      env: opts.env ?? process.env,
      timeout: 120_000,
    });
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

const atBaseline = () => [
  {
    file: "src/infra/logger.ts",
    errorCount: baseline.baseline_error_count,
    warningCount: baseline.baseline_warning_count,
  },
];

describe("CI lint job — exactly one ESLint traversal", () => {
  // A traversal is any step that makes ESLint walk the repository. `npm run lint`
  // and a bare `eslint` invocation both do; `npm run lint:ratchet` does not, because
  // it is handed a report.
  function isTraversal(run: string): boolean {
    const withoutRatchet = run.replace(/npm run lint:ratchet[^\n]*/g, "");
    return /\bnpm run lint\b/.test(withoutRatchet) || /(^|\s|&&|\|)eslint\s/.test(withoutRatchet);
  }

  it("declares exactly one lint traversal in the job", () => {
    const traversals = lintSteps.filter((s) => isTraversal(s.run as string));
    expect(traversals).toHaveLength(1);
    expect(traversals[0].run).toContain("-f json");
    expect(traversals[0].run).toContain("-o eslint-report.json");
  });

  it("hands the report to the ratchet instead of re-linting", () => {
    const ratchet = lintSteps.find((s) => (s.run as string).includes("lint:ratchet"));
    expect(ratchet).toBeDefined();
    expect(ratchet!.run).toContain("--from-result eslint-report.json");
    // The ratchet, not the diagnostic traversal, decides the job.
    expect(ratchet!["continue-on-error"]).toBe(false);
  });

  it("keeps the generated report out of version control", () => {
    const ignored = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(ignored).toMatch(/^eslint-report\.json$/m);
    const tracked = execFileSync("git", ["ls-files", "eslint-report.json"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(tracked.trim()).toBe("");
  });

  // The real topology proof. Every lint entry point is replaced on PATH by a stub
  // that records the call and exits non-zero. If --from-result ever reintroduced a
  // traversal, the marker would exist and the run would fail.
  it("does not invoke ESLint at all when given a report", () => {
    const binDir = fs.mkdtempSync(path.join(tmpDir, "bin-"));
    const marker = path.join(binDir, "invoked.txt");
    for (const name of ["eslint", "npm", "npx"]) {
      const stub = path.join(binDir, name);
      fs.writeFileSync(stub, `#!/bin/sh\necho "$0 $@" >> ${JSON.stringify(marker)}\nexit 97\n`);
      fs.chmodSync(stub, 0o755);
    }

    const report = writeReport("topology.json", atBaseline());
    const result = runRatchet(["--from-result", report], {
      env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
    });

    expect(fs.existsSync(marker)).toBe(false);
    expect(result.output).toContain("no second ESLint run");
    expect(result.code).toBe(0);
  });
});

describe("lint ratchet — regression gate still fails closed", () => {
  it("passes at the baseline", () => {
    const result = runRatchet(["--from-result", writeReport("base.json", atBaseline())]);
    expect(result.output).toContain("LINT_RATCHET_PASS");
    expect(result.code).toBe(0);
  });

  it("passes on improvement", () => {
    const report = writeReport("better.json", [
      {
        file: "src/infra/logger.ts",
        errorCount: baseline.baseline_error_count - 1,
        warningCount: baseline.baseline_warning_count - 1,
      },
    ]);
    const result = runRatchet(["--from-result", report]);
    expect(result.output).toContain("LINT_RATCHET_PASS");
    expect(result.code).toBe(0);
  });

  it("fails when the error count increases", () => {
    const report = writeReport("more-errors.json", [
      {
        file: "src/infra/logger.ts",
        errorCount: baseline.baseline_error_count + 1,
        warningCount: baseline.baseline_warning_count,
      },
    ]);
    const result = runRatchet(["--from-result", report]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("Error count increased");
    expect(result.code).toBe(1);
  });

  it("fails when the warning count increases", () => {
    const report = writeReport("more-warnings.json", [
      {
        file: "src/infra/logger.ts",
        errorCount: baseline.baseline_error_count,
        warningCount: baseline.baseline_warning_count + 1,
      },
    ]);
    const result = runRatchet(["--from-result", report]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("Warning count increased");
    expect(result.code).toBe(1);
  });
});

describe("lint ratchet — an unusable result is a refusal, never a pass", () => {
  it("fails when the report is missing", () => {
    const result = runRatchet(["--from-result", path.join(tmpDir, "does-not-exist.json")]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("lint result not found");
    expect(result.code).toBe(1);
  });

  it("fails when the report is empty", () => {
    const result = runRatchet(["--from-result", writeRaw("empty.json", "   ")]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.code).toBe(1);
  });

  it("fails when the report is not valid JSON", () => {
    const result = runRatchet(["--from-result", writeRaw("bad.json", "{not json")]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("not valid JSON");
    expect(result.code).toBe(1);
  });

  it("fails when the report is JSON but not an ESLint array", () => {
    const result = runRatchet(["--from-result", writeRaw("object.json", '{"errorCount":0}')]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("not an ESLint JSON array");
    expect(result.code).toBe(1);
  });

  it("fails when the report lints no files — silence is not a clean tree", () => {
    const result = runRatchet(["--from-result", writeRaw("nofiles.json", "[]")]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("no linted files");
    expect(result.code).toBe(1);
  });

  it("fails when an entry is missing its counts", () => {
    const malformed = writeRaw(
      "malformed-entry.json",
      JSON.stringify([{ filePath: path.join(root, "src/infra/logger.ts"), messages: [] }]),
    );
    const result = runRatchet(["--from-result", malformed]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("malformed entry");
    expect(result.code).toBe(1);
  });

  it("fails when the report came from another checkout", () => {
    const foreign = writeRaw(
      "foreign.json",
      JSON.stringify([
        {
          filePath: "/somewhere/else/src/infra/logger.ts",
          messages: [],
          errorCount: 0,
          warningCount: 0,
        },
      ]),
    );
    const result = runRatchet(["--from-result", foreign]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("another checkout");
    expect(result.code).toBe(1);
  });

  it("fails when the report predates the sources it describes", () => {
    const report = writeReport("stale.json", atBaseline());
    // Backdate the report well behind every tracked source file.
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
    fs.utimesSync(report, past, past);
    const result = runRatchet(["--from-result", report]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("stale");
    expect(result.code).toBe(1);
  });

  it("rejects an unknown argument rather than silently linting everything", () => {
    const result = runRatchet(["--from-resultz", "x"]);
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.code).toBe(1);
  });

  it("fails when ESLint itself crashes in standalone mode", () => {
    // Standalone mode runs ESLint through `npm run lint`. A stub npm exiting 2
    // stands in for a crash — a status above 1 is never a lint verdict.
    const binDir = fs.mkdtempSync(path.join(tmpDir, "crashbin-"));
    const stub = path.join(binDir, "npm");
    fs.writeFileSync(stub, '#!/bin/sh\necho "boom" >&2\nexit 2\n');
    fs.chmodSync(stub, 0o755);

    const result = runRatchet([], {
      env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.output).toContain("LINT_RATCHET_FAIL");
    expect(result.output).toContain("crashed");
    expect(result.code).toBe(1);
  });
});

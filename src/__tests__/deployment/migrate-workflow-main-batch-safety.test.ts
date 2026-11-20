/**
 * Governance validator for migrate-production.yml's MAIN_BATCH mode.
 *
 * MAIN_BATCH applies a manifest-authorized ordered batch of migrations already committed to main. It is a mode of the
 * single production-migration workflow (so exactly one workflow can mutate production) and must NOT weaken MAIN's
 * exact-one-pending gate, the exact-host gate, the origin guard, the confirm phrases or the runtime-role gate.
 *
 * Three layers, each mutation-checked:
 *   1. static structure of the real workflow (violations() below, applied to the real file: must be empty);
 *   2. mutation tests: every gate is removed in turn from a copy of the workflow and violations() must name it;
 *   3. behaviour: the real `run:` scripts of the input/confirm/SHA steps are executed with bash against hostile inputs.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import YAML from "js-yaml";

const ROOT = join(__dirname, "../../..");
const WF_PATH = join(ROOT, ".github/workflows/migrate-production.yml");
const realText = readFileSync(WF_PATH, "utf8");

type Step = { name?: string; if?: string; run?: string; uses?: string; env?: Record<string, string>; with?: Record<string, string>; "continue-on-error"?: boolean };
type Wf = { on?: unknown; true?: unknown; jobs: { migrate: { environment: string; steps: Step[] } } };
const parse = (text: string): Wf => YAML.load(text) as Wf;
const steps = (text: string): Step[] => parse(text).jobs.migrate.steps;
const idx = (ss: Step[], prefix: string) => ss.findIndex((s) => (s.name ?? "").startsWith(prefix));

const N = {
  origin: "Assert workflow origin is main",
  validateBatch: "Validate MAIN_BATCH inputs",
  checkout: "Checkout code",
  shaAssert: "Assert checked-out HEAD equals the reviewed expected_main_sha",
  host: "Verify exact production database host",
  preflight: "MAIN_BATCH preflight",
  upload: "Upload batch recovery point",
  crosscheck: "MAIN_BATCH cross-check against prisma migrate status",
  classifier: "Check pending migrations (pre-deploy)",
  deploy: "Deploy migrations",
  postBatch: "MAIN_BATCH post-batch verification",
  postStatus: "Verify migration status (post-deploy)",
  reconcile: "Reconcile runtime role grants",
  redeploy: "Trigger production redeploy of main",
};

/** Every structural requirement of MAIN_BATCH. Returns human-readable violations; empty = compliant. */
function violations(text: string): string[] {
  const v: string[] = [];
  let wf: Wf;
  try {
    wf = parse(text);
  } catch (e) {
    return [`workflow is not valid YAML: ${(e as Error).message.slice(0, 80)}`];
  }
  const ss = wf.jobs.migrate.steps;
  const at = Object.fromEntries(Object.entries(N).map(([k, p]) => [k, idx(ss, p)])) as Record<keyof typeof N, number>;
  for (const [k, i] of Object.entries(at)) if (i < 0) v.push(`missing step: ${k}`);
  if (v.length) return v;
  const step = (k: keyof typeof N) => ss[at[k]];

  const on = (wf.on ?? wf.true) as { workflow_dispatch: { inputs: Record<string, { options?: string[]; required?: boolean }> } };
  const inputs = on.workflow_dispatch.inputs;
  if (!inputs.mode.options?.includes("MAIN_BATCH")) v.push("mode input lacks MAIN_BATCH");
  for (const k of ["batch_id", "expected_main_sha"]) if (!inputs[k]) v.push(`missing input ${k}`);
  if (inputs.expected_database_host?.required !== true) v.push("expected_database_host must stay required");
  if (!/MIGRATE PRODUCTION BATCH/.test(realTextOf(text, "Confirm explicit intent"))) v.push("confirm: MAIN_BATCH has no distinct phrase");

  // Ordering: nothing database-touching may precede the SHA and input gates.
  const order: (keyof typeof N)[] = ["origin", "validateBatch", "checkout", "shaAssert", "host", "preflight", "upload", "crosscheck", "classifier", "deploy", "postBatch", "postStatus", "reconcile", "redeploy"];
  for (let i = 1; i < order.length; i++) if (at[order[i]] <= at[order[i - 1]]) v.push(`order: ${order[i]} must come after ${order[i - 1]}`);
  if (at.origin !== 0) v.push("the origin guard must stay the FIRST step");

  const batchOnly: (keyof typeof N)[] = ["validateBatch", "shaAssert", "preflight", "upload", "crosscheck", "postBatch"];
  for (const k of batchOnly) if (!/inputs\.mode == 'MAIN_BATCH'/.test(step(k).if ?? "")) v.push(`${k} must be gated to MAIN_BATCH`);
  for (const k of batchOnly) if (step(k)["continue-on-error"]) v.push(`${k} must not be continue-on-error`);

  // Inputs are validated before checkout and only via env (no ${{ }} interpolation into shell text).
  const vb = step("validateBatch");
  for (const needle of ["^[a-z0-9][a-z0-9-]{2,63}$", "^[0-9a-f]{40}$", "MIGRATION_NAME$SOURCE_PR$SOURCE_SHA$MIGRATION_SHA256"]) if (!(vb.run ?? "").includes(needle)) v.push(`validateBatch lacks '${needle}'`);
  for (const k of ["validateBatch", "shaAssert", "preflight", "crosscheck", "postBatch"] as const) if (/\$\{\{/.test(step(k).run ?? "")) v.push(`${k} interpolates an expression into shell text`);

  // Exact main SHA.
  if (!/\[ "\$HEAD_SHA" != "\$EXPECTED_MAIN_SHA" \]/.test(step("shaAssert").run ?? "") || !/exit 1/.test(step("shaAssert").run ?? "")) v.push("shaAssert does not refuse a HEAD that differs from expected_main_sha");
  if (step("shaAssert").env?.EXPECTED_MAIN_SHA !== "${{ inputs.expected_main_sha }}") v.push("shaAssert must read inputs.expected_main_sha");

  // Existing gates unchanged and unconditional.
  if (step("host").if) v.push("the exact-host gate must stay unconditional (every mode)");
  if (!/validate-expected-db-host\.mjs/.test(step("host").run ?? "")) v.push("the exact-host gate must run validate-expected-db-host.mjs");
  if (step("classifier").if !== "inputs.mode != 'MAIN_BATCH'") v.push("the single-migration classifier must run for every mode except MAIN_BATCH");
  if (!/classify-migrate-status\.mjs/.test(step("classifier").run ?? "")) v.push("MAIN's classifier call was removed");
  if (!/EXPECTED_MIGRATION_NAME="\$\{\{ inputs\.migration_name \}\}"/.test(step("classifier").run ?? "")) v.push("MAIN's classifier lost EXPECTED_MIGRATION_NAME");

  // Preflight: read-only, fail-closed, parameterized script, recovery point.
  const pf = step("preflight");
  if (pf.env?.PGOPTIONS !== "-c default_transaction_read_only=on") v.push("preflight must set PGOPTIONS default_transaction_read_only=on");
  if (!/migration-batch\.mjs preflight/.test(pf.run ?? "")) v.push("preflight must run migration-batch.mjs preflight");
  if (!/grep -q '\^BATCH_GATE=PASS\$'/.test(pf.run ?? "")) v.push("preflight must require BATCH_GATE=PASS");
  if (!/set -euo pipefail/.test(pf.run ?? "")) v.push("preflight must run under set -euo pipefail");
  if (!/GITHUB_STEP_SUMMARY/.test(pf.run ?? "") || !/batch-recovery-point\.json/.test(pf.run ?? "")) v.push("preflight must record the recovery point in the job summary");
  if (!/secrets\.OPERATOR_DATABASE_URL/.test(pf.env?.DATABASE_URL ?? "")) v.push("preflight must use the production-operator secret only");
  const up = step("upload");
  if (!/actions\/upload-artifact@v4/.test(up.uses ?? "") || up.with?.["if-no-files-found"] !== "error") v.push("the recovery point must be uploaded as an artifact and fail if absent");
  if (!/batch\/\*\.json/.test(up.with?.path ?? "")) v.push("the artifact must contain the recovery point json");
  const cc = step("crosscheck");
  if (!/status-crosscheck/.test(cc.run ?? "") || !/set \+e/.test(cc.run ?? "")) v.push("crosscheck must classify prisma migrate status under the guarded capture idiom");
  if (!/PREFLIGHT_PASSED=true/.test(cc.run ?? "")) v.push("crosscheck must set PREFLIGHT_PASSED");

  // Deploy: the ONE prisma migrate deploy, unconditional, after every pre-mutation gate.
  if ((text.match(/npx prisma migrate deploy/g) ?? []).length !== 1) v.push("exactly one `prisma migrate deploy` is allowed");
  if (step("deploy").if) v.push("the deploy step must not be conditional");

  // Post-batch verification gates the success markers and the reconcile.
  const pb = step("postBatch");
  if (!/migration-batch\.mjs postverify/.test(pb.run ?? "") || !/grep -q '\^BATCH_POSTVERIFY=PASS\$'/.test(pb.run ?? "")) v.push("postBatch must run postverify and require BATCH_POSTVERIFY=PASS");
  if (!/set -euo pipefail/.test(pb.run ?? "")) v.push("postBatch must run under set -euo pipefail");

  // Runtime-role gate and redeploy hook run for MAIN_BATCH exactly as for MAIN.
  const rc = step("reconcile");
  if (!/inputs\.mode == 'MAIN_BATCH'/.test(rc.if ?? "") || !/inputs\.mode == 'MAIN'/.test(rc.if ?? "") || !/POST_VERIFY_SUCCEEDED == 'true'/.test(rc.if ?? "")) v.push("reconcile must run for MAIN and MAIN_BATCH after post-verify");
  if (rc["continue-on-error"] || !/runtime-role-reconcile-gate\.mjs/.test(rc.run ?? "") || !/RUNTIME_ROLE_GATE=PASS/.test(rc.run ?? "")) v.push("reconcile must stay blocking and use the unit-tested gate");
  const rd = step("redeploy");
  if (!/inputs\.mode == 'MAIN_BATCH'/.test(rd.if ?? "") || !/RUNTIME_ROLE_RECONCILED == 'true'/.test(rd.if ?? "")) v.push("redeploy must run for MAIN_BATCH only after the reconcile");
  if (/PINNED_PREDEPLOY/.test(rd.if ?? "") || /PINNED_PREDEPLOY/.test(rc.if ?? "")) v.push("PINNED_PREDEPLOY must never reconcile/redeploy");

  // Review F3: no step that EXECUTES in MAIN_BATCH (including the `if: always()` summary) may interpolate a dispatch input into shell text.
  for (const st of ss) {
    if (!executesInBatch(st)) continue;
    if (/\$\{\{\s*(github\.event\.)?inputs\./.test(st.run ?? "")) v.push(`step '${st.name}' executes in MAIN_BATCH and interpolates a dispatch input into shell text (use env:)`);
  }
  if (/secrets:\s*inherit/.test(text)) v.push("secrets: inherit is forbidden");
  if (/api\.neon\.tech|console\.neon\.tech|neon\.tech\/api/i.test(text)) v.push("the workflow must not call the provider API");
  if (/psql\s+-c|sql_statement|arbitrary_sql|raw_sql/i.test(text)) v.push("no arbitrary SQL");
  return v;
}

/** Does this step run when the workflow is dispatched in MAIN_BATCH mode? Judged from its `if:` (absent, always(), success() ... run; mode-exclusive guards do not). */
function executesInBatch(step: Step): boolean {
  const cond = step.if ?? "";
  if (/inputs\.mode == 'MAIN_BATCH'/.test(cond)) return true;
  if (/inputs\.mode != 'MAIN_BATCH'/.test(cond)) return false;
  if (/inputs\.mode == '(MAIN|PINNED_PREDEPLOY)'/.test(cond) && !/MAIN_BATCH/.test(cond)) return false;
  return true;
}

/** The raw `run` text of a step, for confirm-phrase checks. */
function realTextOf(text: string, stepName: string): string {
  return steps(text).find((s) => (s.name ?? "").startsWith(stepName))?.run ?? "";
}

describe("migrate-production.yml — MAIN_BATCH structure", () => {
  it("the real workflow satisfies every MAIN_BATCH gate", () => {
    expect(violations(realText)).toEqual([]);
  });

  it("exactly one workflow can reference the production operator secret or the batch script (no second production-writing workflow)", () => {
    const dir = join(ROOT, ".github/workflows");
    const refs = readdirSync(dir).filter((f) => /migration-batch\.mjs/.test(readFileSync(join(dir, f), "utf8")));
    expect(refs).toEqual(["migrate-production.yml"]);
  });

  it("the first step is still the verbatim fail-closed origin guard and the job still runs in production-operator", () => {
    const wf = parse(realText);
    expect(wf.jobs.migrate.environment).toBe("production-operator");
    expect(wf.jobs.migrate.steps[0].name).toMatch(/^Assert workflow origin is main/);
    expect(wf.jobs.migrate.steps[0].env).toBeUndefined();
  });

  it("the MAIN gates are present and unchanged in behaviour: MAIN still requires exactly one pending migration through the shared classifier", () => {
    const ss = steps(realText);
    const cl = ss[idx(ss, N.classifier)];
    expect(cl.if).toBe("inputs.mode != 'MAIN_BATCH'");
    expect(cl.run).toContain('EXPECTED_MIGRATION_NAME="${{ inputs.migration_name }}"');
    expect(realText.match(/node scripts\/classify-migrate-status\.mjs/g)).toHaveLength(1);
    const mainOnly = ss[idx(ss, "Verify migration exists on current main")];
    expect(mainOnly.if).toBe("inputs.mode == 'MAIN'");
  });
});

describe("migrate-production.yml — MAIN_BATCH gates are mutation-checked (remove a gate, a rule fails)", () => {
  const mutations: Array<[string, (t: string) => string, RegExp]> = [
    ["remove MAIN_BATCH from the mode choice", (t) => t.replace("          - MAIN_BATCH\n", ""), /mode input lacks MAIN_BATCH/],
    ["drop the distinct MAIN_BATCH confirm phrase", (t) => t.replace(/ *elif \[ "\$INPUT_MODE" == "MAIN_BATCH" \]; then[\s\S]*?\n          else/, "          else"), /distinct phrase/],
    ["drop the expected-SHA assertion step", (t) => t.replace('if [ "$HEAD_SHA" != "$EXPECTED_MAIN_SHA" ]; then', 'if false; then'), /shaAssert does not refuse/],
    ["move the SHA assertion after the database host gate", (t) => t.replace("name: Assert checked-out HEAD equals the reviewed expected_main_sha (MAIN_BATCH, before any database step)", "name: Zzz moved").replace("      - name: Setup Node.js 22", "      - name: Assert checked-out HEAD equals the reviewed expected_main_sha (MAIN_BATCH, before any database step)\n        run: echo late\n\n      - name: Setup Node.js 22"), /order|shaAssert/],
    ["make the exact-host gate MAIN-only", (t) => t.replace("      - name: Verify exact production database host matches owner-pinned expectation\n", "      - name: Verify exact production database host matches owner-pinned expectation\n        if: inputs.mode == 'MAIN'\n"), /exact-host gate must stay unconditional/],
    ["let the MAIN classifier run (or not run) for MAIN_BATCH incorrectly: remove its skip", (t) => t.replace("        if: inputs.mode != 'MAIN_BATCH'\n", ""), /single-migration classifier must run for every mode except/],
    ["remove MAIN's classifier call", (t) => t.replace("node scripts/classify-migrate-status.mjs", "echo skipped"), /classifier call was removed|exactly/],
    ["drop the read-only PGOPTIONS from the preflight", (t) => t.replace(/(MAIN_BATCH preflight[\s\S]*?)PGOPTIONS: "-c default_transaction_read_only=on"/, "$1PGOPTIONS: ''"), /PGOPTIONS/],
    ["make the preflight not require BATCH_GATE=PASS", (t) => t.replace("grep -q '^BATCH_GATE=PASS$' \"$RUNNER_TEMP/batch-preflight.txt\"", "true"), /BATCH_GATE=PASS/],
    ["drop the recovery-point upload", (t) => t.replace("          if-no-files-found: error\n", ""), /uploaded as an artifact/],
    ["drop the prisma status cross-check call", (t) => t.replace("node scripts/release/migration-batch.mjs status-crosscheck", "true"), /crosscheck must classify/],
    ["make the deploy conditional", (t) => t.replace("      - name: Deploy migrations\n", "      - name: Deploy migrations\n        if: always()\n"), /deploy step must not be conditional/],
    ["add a second prisma migrate deploy", (t) => t.replace("echo \"=== Post-deploy migration status ===\"", "npx prisma migrate deploy\n          echo \"=== Post-deploy migration status ===\""), /exactly one/],
    ["drop the post-batch verification requirement", (t) => t.replace("grep -q '^BATCH_POSTVERIFY=PASS$' \"$RUNNER_TEMP/batch-postverify.txt\"", "true"), /BATCH_POSTVERIFY=PASS/],
    ["let the post-batch verification continue on error", (t) => t.replace(/(name: MAIN_BATCH post-batch verification[^\n]*\n\s+if: inputs\.mode == 'MAIN_BATCH')/, "$1\n        continue-on-error: true"), /must not be continue-on-error/],
    ["stop reconciling the runtime role for MAIN_BATCH", (t) => t.replace(/(Reconcile runtime role grants[^\n]*\n\s+if: success\(\) && )\(inputs\.mode == 'MAIN' \|\| inputs\.mode == 'MAIN_BATCH'\)/, "$1inputs.mode == 'MAIN'"), /reconcile must run for MAIN and MAIN_BATCH/],
    ["make the reconcile non-blocking", (t) => t.replace(/(Reconcile runtime role grants[^\n]*\n\s+if:[^\n]*\n)/, "$1        continue-on-error: true\n"), /reconcile must stay blocking/],
    ["redeploy without requiring the reconcile", (t) => t.replace(" && env.RUNTIME_ROLE_RECONCILED == 'true'", ""), /redeploy must run for MAIN_BATCH only after the reconcile/],
    ["interpolate an input into the preflight shell text", (t) => t.replace("node scripts/release/migration-batch.mjs preflight |", "echo ${{ inputs.batch_id }}; node scripts/release/migration-batch.mjs preflight |"), /interpolates an expression/],
    ["allow migration_name alongside a batch", (t) => t.replace('if [ -n "$MIGRATION_NAME$SOURCE_PR$SOURCE_SHA$MIGRATION_SHA256" ]; then', "if false; then"), /validateBatch lacks/],
    ["loosen the batch_id format", (t) => t.replaceAll("^[a-z0-9][a-z0-9-]{2,63}$", ".*"), /validateBatch lacks/],
    ["re-interpolate an input into the always() summary step", (t) => t.replace('echo "| Mode | $INPUT_MODE |"', 'echo "| Mode | ${{ inputs.mode }} |"'), /executes in MAIN_BATCH and interpolates/],
    ["re-interpolate batch_id into the always() summary step", (t) => t.replace("\\`$INPUT_BATCH_ID\\`", "\\`${{ inputs.batch_id }}\\`"), /executes in MAIN_BATCH and interpolates/],
    ["re-interpolate the confirm input into the confirm step", (t) => t.replace('[ "$INPUT_CONFIRM" != "MIGRATE PRODUCTION BATCH" ]', '[ "${{ github.event.inputs.confirm }}" != "MIGRATE PRODUCTION BATCH" ]'), /executes in MAIN_BATCH and interpolates/],
    ["re-interpolate the mode input into the mode validator", (t) => t.replace('case "$INPUT_MODE" in', 'case "${{ inputs.mode }}" in'), /executes in MAIN_BATCH and interpolates/],
    ["add secrets: inherit", (t) => t + "\n# secrets: inherit\n", /secrets: inherit/],
    ["run arbitrary SQL via psql -c", (t) => t.replace("node scripts/release/migration-batch.mjs postverify |", "psql -c 'select 1'; node scripts/release/migration-batch.mjs postverify |"), /arbitrary SQL/],
  ];
  for (const [label, mutate, expected] of mutations) {
    it(`${label} -> detected`, () => {
      const mutated = mutate(realText);
      expect(mutated, "the mutation must actually change the workflow").not.toBe(realText);
      const found = violations(mutated).join(" | ");
      expect(found).toMatch(expected);
    });
  }
});

describe("migrate-production.yml — MAIN_BATCH step scripts behave correctly against hostile input", () => {
  const ss = steps(realText);
  const runOf = (prefix: string) => ss[idx(ss, prefix)].run as string;
  const bash = (script: string, env: Record<string, string>, cwd?: string) =>
    spawnSync("bash", ["-c", script], { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8", cwd });

  const goodEnv = { BATCH_ID: "2026-11-20-quota-reservations-and-stripe-ordering", EXPECTED_MAIN_SHA: "a".repeat(40), MIGRATION_NAME: "", SOURCE_PR: "", SOURCE_SHA: "", MIGRATION_SHA256: "" };

  it("Validate MAIN_BATCH inputs accepts exactly a well-formed batch dispatch", () => {
    const r = bash(runOf(N.validateBatch), goodEnv);
    expect(r.status).toBe(0);
  });
  const rejected: Array<[string, Record<string, string>]> = [
    ["empty batch_id", { BATCH_ID: "" }],
    ["batch_id with path traversal", { BATCH_ID: "../../etc/passwd" }],
    ["batch_id with a slash", { BATCH_ID: "a/b-c" }],
    ["batch_id with uppercase", { BATCH_ID: "Batch-One" }],
    ["batch_id with shell metacharacters", { BATCH_ID: "x$(id)y-z" }],
    ["batch_id too short", { BATCH_ID: "ab" }],
    ["short expected_main_sha", { EXPECTED_MAIN_SHA: "abc123" }],
    ["uppercase expected_main_sha", { EXPECTED_MAIN_SHA: "A".repeat(40) }],
    ["empty expected_main_sha", { EXPECTED_MAIN_SHA: "" }],
    ["a migration_name supplied alongside the batch", { MIGRATION_NAME: "20261119120000_usage_event_quota_reservations" }],
    ["a pinned-predeploy source_sha supplied alongside the batch", { SOURCE_SHA: "b".repeat(40) }],
    ["a pinned-predeploy source_pr supplied alongside the batch", { SOURCE_PR: "12" }],
    ["a pinned-predeploy migration_sha256 supplied alongside the batch", { MIGRATION_SHA256: "c".repeat(64) }],
  ];
  for (const [label, override] of rejected) {
    it(`Validate MAIN_BATCH inputs rejects ${label}`, () => {
      const r = bash(runOf(N.validateBatch), { ...goodEnv, ...override });
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
    });
  }

  it("the SHA assertion passes only when the checked-out HEAD equals expected_main_sha", () => {
    const dir = mkdtempSync(join(tmpdir(), "batchsha-"));
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"]);
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(bash(runOf(N.shaAssert), { EXPECTED_MAIN_SHA: head }, dir).status).toBe(0);
    const stale = bash(runOf(N.shaAssert), { EXPECTED_MAIN_SHA: "0".repeat(40) }, dir);
    expect(stale.status).not.toBe(0);
    expect(stale.stdout + stale.stderr).toContain("No database step has run");
  });

  describe("the confirm step: each mode needs its own phrase", () => {
    const run = (mode: string, phrase: string) => bash(runOf("Confirm explicit intent"), { INPUT_MODE: mode, INPUT_CONFIRM: phrase });
    it("MAIN_BATCH accepts only 'MIGRATE PRODUCTION BATCH'", () => {
      expect(run("MAIN_BATCH", "MIGRATE PRODUCTION BATCH").status).toBe(0);
      for (const wrong of ["MIGRATE PRODUCTION", "MIGRATE PRODUCTION PINNED PREDEPLOY", "migrate production batch", "MIGRATE PRODUCTION BATCH ", ""]) {
        expect(run("MAIN_BATCH", wrong).status, wrong).not.toBe(0);
      }
    });
    it("MAIN still needs exactly 'MIGRATE PRODUCTION' (the batch phrase does not satisfy it) and PINNED_PREDEPLOY keeps its own", () => {
      expect(run("MAIN", "MIGRATE PRODUCTION").status).toBe(0);
      expect(run("MAIN", "MIGRATE PRODUCTION BATCH").status).not.toBe(0);
      expect(run("PINNED_PREDEPLOY", "MIGRATE PRODUCTION PINNED PREDEPLOY").status).toBe(0);
      expect(run("PINNED_PREDEPLOY", "MIGRATE PRODUCTION BATCH").status).not.toBe(0);
    });
  });

  it("a hostile confirm or mode value cannot execute: it is data in an env var, not shell text (review F3)", () => {
    const marker = join(mkdtempSync(join(tmpdir(), "inj-")), "pwned");
    const payload = `x"; touch ${marker}; echo "`;
    bash(runOf("Confirm explicit intent"), { INPUT_MODE: "MAIN_BATCH", INPUT_CONFIRM: payload });
    bash(runOf("Validate mode input"), { INPUT_MODE: payload });
    expect(existsSync(marker)).toBe(false);
  });

  it("the Migration summary step (always() and runs in MAIN_BATCH) takes every input through env and never executes a hostile one", () => {
    const summary = ss[idx(ss, "Migration summary")];
    expect(summary.run).not.toMatch(/\$\{\{/);
    for (const k of ["INPUT_MODE", "INPUT_HOST", "INPUT_MIGRATION_NAME", "INPUT_BATCH_ID", "INPUT_EXPECTED_MAIN_SHA", "INPUT_SOURCE_PR", "INPUT_SOURCE_SHA", "INPUT_MIGRATION_SHA256"]) expect(summary.env?.[k], k).toMatch(/^\$\{\{ inputs\./);
    const marker = join(mkdtempSync(join(tmpdir(), "inj-")), "pwned2");
    const dir = mkdtempSync(join(tmpdir(), "sum-"));
    const hostile = `a"; touch ${marker}; echo "`;
    const r = bash(summary.run as string, { GITHUB_STEP_SUMMARY: join(dir, "s.md"), RUNNER_TEMP: dir, INPUT_MODE: "MAIN_BATCH", INPUT_HOST: hostile, INPUT_MIGRATION_NAME: hostile, INPUT_BATCH_ID: hostile, INPUT_EXPECTED_MAIN_SHA: hostile, INPUT_SOURCE_PR: hostile, INPUT_SOURCE_SHA: hostile, INPUT_MIGRATION_SHA256: hostile }, dir);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(join(dir, "s.md"), "utf8")).toContain("Batch id (manifest-authorized)");
  });

  it("the mode validator accepts the three modes and nothing else", () => {
    const run = (mode: string) => bash(runOf("Validate mode input"), { INPUT_MODE: mode });
    for (const m of ["MAIN", "MAIN_BATCH", "PINNED_PREDEPLOY"]) expect(run(m).status, m).toBe(0);
    for (const m of ["", "BATCH", "main_batch", "MAIN_BATCH2"]) expect(run(m).status, m).not.toBe(0);
  });

  it("the post-deploy status capture and preflight status capture stay errexit-safe (the unguarded idiom does not appear)", () => {
    const cc = runOf(N.crosscheck);
    expect(cc.indexOf("set +e")).toBeLessThan(cc.indexOf("PRISMA_STATUS_TEXT=$(npx prisma migrate status"));
    expect(cc.indexOf("set -e")).toBeGreaterThan(cc.indexOf("PRISMA_STATUS_TEXT=$(npx prisma migrate status"));
  });

  it("a hostile manifest path cannot be addressed: the script builds the path only from a validated id", () => {
    const script = readFileSync(join(ROOT, "scripts/release/migration-batch.mjs"), "utf8");
    expect(script).toMatch(/BATCH_ID_PATTERN\.test\(batchId \?\? ""\)/);
  });
});

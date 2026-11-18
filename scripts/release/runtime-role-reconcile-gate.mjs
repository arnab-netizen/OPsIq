#!/usr/bin/env node
/**
 * Fail-closed post-migration runtime-role gate (migrate-production.yml, MAIN mode).
 *
 * Sequence: stale-release check -> read-only PRE verify -> reconcile-only APPLY -> read-only POST verify.
 * Every stage must produce a valid exit status AND complete, internally consistent output; any ambiguity blocks.
 *
 * Production requires the opsiq_app runtime role. ABSENT blocks: this gate never creates the role, never sets a
 * password and never lets a release proceed on a privileged fallback connection. (Environments that legitimately
 * have no runtime role do not run this gate; they are not production.)
 *
 * The gate decides from captured tool output only. It never reads or prints a credential.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseRoleTopologyVerifyOutput } from "../db/parse-role-topology-verify.mjs";

export const APPLY_CONFIRM_PHRASE = "APPLY PRODUCTION RUNTIME ROLE TOPOLOGY";
const ALLOWED_TARGETS = ["production", "ci"];

function parseApply(text) {
  const lines = String(text ?? "").split("\n");
  const jsonLine = [...lines].reverse().find((l) => l.includes('"ROLE_TOPOLOGY_APPLY"'));
  if (!jsonLine) return null;
  let j;
  try { j = JSON.parse(jsonLine); } catch { return null; }
  const token = lines.map((l) => l.trim()).filter((l) => /^ROLE_TOPOLOGY_APPLY=[A-Z_]+$/.test(l)).pop();
  return { result: j.ROLE_TOPOLOGY_APPLY, committed: j.committed, dryRun: j.dryRun, target: j.target, failedChecks: j.failedChecks, tokenAgrees: token === `ROLE_TOPOLOGY_APPLY=${j.ROLE_TOPOLOGY_APPLY}` };
}

/** Strict, complete least-privilege verdict for ONE verify transcript. Returns a list of problems (empty = acceptable). */
export function strictVerifyProblems({ exitCode, output }, { target, phase = "post", requireConforming = true }) {
  const problems = [];
  const v = parseRoleTopologyVerifyOutput(output);
  if (!v) return ["verify output missing or malformed"];
  if (exitCode !== 0 && exitCode !== 1) problems.push(`verify exit status ${exitCode} is neither PASS(0) nor FAIL(1)`);
  if (!v.tokenAgrees) problems.push("verify token line missing or contradicts the JSON result");
  if (v.result === "PASS" && exitCode !== 0) problems.push("contradictory: verifier reported PASS but exited non-zero");
  if (v.result === "FAIL" && exitCode === 0) problems.push("contradictory: verifier reported FAIL but exited zero");
  if (v.target !== target) problems.push(`verify target '${v.target}' is not '${target}'`);
  if (v.phase !== phase) problems.push(`verify phase '${v.phase}' is not '${phase}'`);
  if (v.failedChecks === null) problems.push("verify output has no failedChecks list");
  if (v.runtimeRoleState === "ABSENT") problems.push("RUNTIME_ROLE_ABSENT: production requires the opsiq_app runtime role");
  if (requireConforming) {
    if (v.result !== "PASS") problems.push("verifier did not PASS");
    if (v.runtimeRoleState !== "CONFORMING") problems.push(`runtime role state is '${v.runtimeRoleState}', not CONFORMING`);
    if ((v.failedChecks ?? []).length > 0) problems.push(`failed checks: ${v.failedChecks.join("; ")}`);
    if (v.grantGapTables.length > 0) problems.push(`grant gap: ${v.grantGapTables.join(",")}`);
    if (v.unclassifiedTables.length > 0) problems.push(`unclassified tables: ${v.unclassifiedTables.join(",")}`);
    const f = v.facts ?? {};
    if (f.runtime_role_exists !== true) problems.push("facts.runtime_role_exists is not true");
    if (f.runtime_owned_objects !== 0) problems.push("runtime role owns objects (expected 0)");
    if (f.runtime_role_memberships !== 0) problems.push("runtime role has role memberships (expected 0)");
    if (f.public_table_grants_to_public !== 0) problems.push("PUBLIC holds table grants (expected 0)");
    if (!Array.isArray(f.grant_gap_tables) || !Array.isArray(f.unclassified_tables)) problems.push("facts incomplete: grant/unclassified lists missing");
  }
  return problems;
}

/**
 * @param {{ target?: string, expectedSha: string, actualSha: string,
 *           run: (stage: "pre"|"apply"|"post") => { exitCode: number|null, output: string } }} p
 * @returns {{ ok: boolean, code: string, problems: string[] }}
 */
export function runReconcileGate({ target = "production", expectedSha, actualSha, run }) {
  const block = (code, problems) => ({ ok: false, code, problems });
  if (!ALLOWED_TARGETS.includes(target)) return block("BAD_TARGET", [`target '${target}' not allowed`]);
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? "") || expectedSha !== actualSha) return block("STALE_OR_UNPINNED_RELEASE_SHA", ["checked-out HEAD does not equal the authorized release SHA"]);

  const pre = run("pre");
  if (pre.exitCode === null) return block("PRE_VERIFY_DID_NOT_RUN", ["pre-verify did not run"]);
  const pv = parseRoleTopologyVerifyOutput(pre.output);
  if (!pv) return block("PRE_VERIFY_MALFORMED", ["pre-verify output missing or malformed"]);
  if (pv.runtimeRoleState === "ABSENT") return block("RUNTIME_ROLE_ABSENT", ["production requires opsiq_app; the gate never creates it"]);
  const preProblems = strictVerifyProblems(pre, { target, phase: "post", requireConforming: false });
  if (preProblems.length) return block("PRE_VERIFY_INVALID", preProblems);

  const ap = run("apply");
  if (ap.exitCode !== 0) return block("APPLY_FAILED", [`apply exit status ${ap.exitCode}`]);
  const a = parseApply(ap.output);
  if (!a) return block("APPLY_OUTPUT_MALFORMED", ["apply output missing or malformed"]);
  const aProblems = [];
  if (a.result !== "PASS") aProblems.push(`apply result is '${a.result}', not PASS (SKIPPED_ROLE_ABSENT is a block in production)`);
  if (!a.tokenAgrees) aProblems.push("apply token line missing or contradicts the JSON result");
  if (a.committed !== true || a.dryRun !== false) aProblems.push("apply did not commit a real (non-dry-run) reconcile");
  if (a.target !== target) aProblems.push(`apply target '${a.target}' is not '${target}'`);
  if (!Array.isArray(a.failedChecks) || a.failedChecks.length > 0) aProblems.push("apply reported failed checks or none list");
  if (aProblems.length) return block("APPLY_INVALID", aProblems);

  const post = run("post");
  if (post.exitCode === null) return block("POST_VERIFY_DID_NOT_RUN", ["post-verify did not run"]);
  const postProblems = strictVerifyProblems(post, { target, phase: "post", requireConforming: true });
  if (postProblems.length) return block("POST_VERIFY_FAILED", postProblems);
  return { ok: true, code: "RUNTIME_ROLE_RECONCILED", problems: [] };
}

function cli() {
  const env = process.env;
  const target = env.OPSIQ_RECONCILE_TARGET || "production";
  const expectedHost = env.EXPECTED_DATABASE_HOST || "";
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const base = ["tsx", "scripts/db/opsiq-role-cutover.ts"];
  const hostArgs = expectedHost ? ["--expected-host", expectedHost] : [];
  const exec = (args, extraEnv = {}) => {
    const r = spawnSync("npx", [...base, ...args], { encoding: "utf8", env: { ...env, ...extraEnv } });
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    return { exitCode: r.status, output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };
  const readOnly = { PGOPTIONS: "-c default_transaction_read_only=on" };
  const result = runReconcileGate({
    target,
    expectedSha: env.EXPECTED_RELEASE_SHA,
    actualSha: (git.stdout ?? "").trim(),
    run: (stage) =>
      stage === "apply"
        ? exec(["apply", "--target", target, ...hostArgs, "--only-if-present", "--confirm", APPLY_CONFIRM_PHRASE])
        : exec(["verify", "--target", target, ...hostArgs, "--phase", "post"], readOnly),
  });
  console.log(`RUNTIME_ROLE_GATE=${result.ok ? "PASS" : "BLOCKED"}`);
  console.log(`RUNTIME_ROLE_GATE_CODE=${result.code}`);
  for (const p of result.problems) console.log(`::error::${p}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();

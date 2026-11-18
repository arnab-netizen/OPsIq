#!/usr/bin/env node
/**
 * Shared, read-only parser for scripts/db/opsiq-role-cutover.ts's `verify` command output.
 *
 * `verify` prints one machine-readable JSON line per invocation --
 * `{"ROLE_TOPOLOGY_VERIFY":"PASS"|"FAIL","target":...,"phase":"pre"|"post","runtimeRoleState":"ABSENT"|
 * "CONFORMING"|"NONCONFORMING","failedChecks":[...],"facts":{...,"grant_gap_tables":[...],
 * "unclassified_tables":[...]}}` -- followed by a plain `ROLE_TOPOLOGY_VERIFY=PASS|FAIL` token line. This
 * module finds and parses that JSON line from a captured transcript (stdout+stderr) and exposes the two
 * counts that matter to callers outside the tool itself:
 *
 *   grantGapTables       Prisma-modelled tables the runtime role is SUPPOSED to have full DML on but doesn't
 *                         (a pending reconcile -- e.g. a migration added a table and nobody has run
 *                         `apply --only-if-present` since).
 *   unclassifiedTables    any OTHER public table the verifier found that is neither a modelled (writable)
 *                         table nor the migration ledger nor the erasure ledger -- always denied to the
 *                         runtime by design, listed here only for visibility.
 *
 * Used by two governed callers: .github/workflows/reconcile-runtime-role.yml (to diff the pre/post grant
 * state around an APPLY) and .github/workflows/migrate-production.yml (a read-only, non-blocking
 * informational check after a migration is applied). Never connects to a database and never reads a secret
 * -- it only parses text that a database-connecting step already produced and printed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} text captured stdout+stderr from `opsiq-role-cutover.ts verify ...`
 * @returns {null | {
 *   result: "PASS" | "FAIL",
 *   runtimeRoleState: string,
 *   phase: string | undefined,
 *   grantGapTables: string[],
 *   unclassifiedTables: string[],
 * }}
 */
export function parseRoleTopologyVerifyOutput(text) {
  const lines = String(text ?? "").split("\n");
  let matched;
  // Last match wins: a transcript may contain earlier, unrelated JSON-shaped noise; the tool itself only
  // ever prints this line once per invocation, so "last" and "only" coincide for a well-formed transcript.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"ROLE_TOPOLOGY_VERIFY"')) {
      matched = lines[i];
      break;
    }
  }
  if (!matched) return null;
  let parsed;
  try {
    parsed = JSON.parse(matched);
  } catch {
    return null;
  }
  if (parsed.ROLE_TOPOLOGY_VERIFY !== "PASS" && parsed.ROLE_TOPOLOGY_VERIFY !== "FAIL") return null;
  const facts = parsed.facts && typeof parsed.facts === "object" ? parsed.facts : {};
  const grantGapTables = Array.isArray(facts.grant_gap_tables) ? facts.grant_gap_tables.map(String) : [];
  const unclassifiedTables = Array.isArray(facts.unclassified_tables) ? facts.unclassified_tables.map(String) : [];
  const failedChecks = Array.isArray(parsed.failedChecks) ? parsed.failedChecks.map(String) : null;
  // The tool also prints a plain `ROLE_TOPOLOGY_VERIFY=PASS|FAIL` token line; a transcript whose token contradicts its JSON is untrustworthy.
  const token = lines.map((l) => l.trim()).filter((l) => /^ROLE_TOPOLOGY_VERIFY=(PASS|FAIL)$/.test(l)).pop();
  return {
    result: parsed.ROLE_TOPOLOGY_VERIFY,
    runtimeRoleState: typeof parsed.runtimeRoleState === "string" ? parsed.runtimeRoleState : "UNKNOWN",
    phase: typeof parsed.phase === "string" ? parsed.phase : undefined,
    target: typeof parsed.target === "string" ? parsed.target : undefined,
    grantGapTables,
    unclassifiedTables,
    failedChecks,
    facts,
    tokenAgrees: token === undefined ? false : token === `ROLE_TOPOLOGY_VERIFY=${parsed.ROLE_TOPOLOGY_VERIFY}`,
  };
}

/** CLI: reads a captured transcript file and prints plain `KEY=value` lines a shell step can `grep`/parse. */
function main() {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error("usage: parse-role-topology-verify.mjs <path-to-captured-verify-output>");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.log("PARSE_RESULT=UNAVAILABLE");
    console.log("ROLE_TOPOLOGY_VERIFY_FOUND=false");
    return;
  }
  const parsed = parseRoleTopologyVerifyOutput(text);
  if (!parsed) {
    console.log("PARSE_RESULT=UNAVAILABLE");
    console.log("ROLE_TOPOLOGY_VERIFY_FOUND=false");
    return;
  }
  const truncate = (arr) => arr.slice(0, 20).join(",");
  console.log("PARSE_RESULT=OK");
  console.log("ROLE_TOPOLOGY_VERIFY_FOUND=true");
  console.log(`VERIFY_RESULT=${parsed.result}`);
  console.log(`RUNTIME_ROLE_STATE=${parsed.runtimeRoleState}`);
  console.log(`VERIFY_PHASE=${parsed.phase ?? "unknown"}`);
  console.log(`GRANT_GAP_COUNT=${parsed.grantGapTables.length}`);
  console.log(`UNCLASSIFIED_COUNT=${parsed.unclassifiedTables.length}`);
  console.log(`GRANT_GAP_TABLES=${truncate(parsed.grantGapTables)}`);
  console.log(`UNCLASSIFIED_TABLES=${truncate(parsed.unclassifiedTables)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

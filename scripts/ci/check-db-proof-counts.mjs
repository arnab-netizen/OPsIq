#!/usr/bin/env node
/**
 * Fail-closed count gate for the standalone real-database proofs that db-verify runs outside the runtime-proof manifest.
 *
 * Root cause this closes: both proofs are `describe.skipIf(...)`-gated on their own prerequisites (a dedicated owner database for the GSC
 * role proof; a pgbouncer binary + TEST_WITH_PGBOUNCER for the transaction-pooling proof). When CI provided neither, every test was
 * reported as skipped and the job stayed green, so released functionality was unprotected. A vitest exit code of 0 cannot distinguish
 * "all passed" from "all skipped", so each proof is accepted only when the JSON report shows EXACTLY the expected number of tests, ALL passed,
 * and none skipped, pending, todo or failed.
 *
 *   usage: check-db-proof-counts.mjs <proof-id> <vitest-json-report>
 *
 * Changing a proof's test count requires changing `expectedTests` here in the same commit (the unit test pins this table).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DB_PROOFS = Object.freeze({
  "gsc-role": Object.freeze({
    file: "src/__tests__/scripts/gsc-ingestion-role.db.test.ts",
    expectedTests: 16,
  }),
  pgbouncer: Object.freeze({
    file: "src/__tests__/lib/pgbouncer-transaction-safety-hostile.db.test.ts",
    expectedTests: 8,
  }),
});

/** @param {string} proofId @param {any} report vitest --reporter=json output @returns {{ problems: string[], total: number, passed: number }} */
export function evaluateDbProof(proofId, report) {
  const spec = Object.prototype.hasOwnProperty.call(DB_PROOFS, proofId) ? DB_PROOFS[proofId] : null;
  if (!spec) return { problems: [`unknown proof id "${proofId}" (known: ${Object.keys(DB_PROOFS).join(", ")})`], total: 0, passed: 0 };
  const results = Array.isArray(report?.testResults) ? report.testResults : null;
  if (!results) return { problems: ["vitest JSON report missing or malformed"], total: 0, passed: 0 };
  const entries = results.filter((r) => typeof r.name === "string" && r.name.replace(/\\/g, "/").endsWith(`/${spec.file}`));
  if (entries.length !== 1) return { problems: [`${spec.file}: expected exactly one result entry in the report, found ${entries.length}`], total: 0, passed: 0 };
  const entry = entries[0];
  const tests = Array.isArray(entry.assertionResults) ? entry.assertionResults : [];
  const passed = tests.filter((t) => t.status === "passed").length;
  const problems = [];
  if (entry.status === "failed" && tests.length === 0) problems.push(`${spec.file}: suite failed to run (${String(entry.message ?? "").slice(0, 160)})`);
  if (tests.length !== spec.expectedTests) problems.push(`${spec.file}: ran ${tests.length} tests, expected exactly ${spec.expectedTests}`);
  if (passed !== spec.expectedTests) problems.push(`${spec.file}: ${passed} passed, expected ${spec.expectedTests}`);
  const notPassed = tests.filter((t) => t.status !== "passed");
  if (notPassed.length) problems.push(`${spec.file}: ${notPassed.length} test(s) not passed (${[...new Set(notPassed.map((t) => t.status))].join(",")}), e.g. ${String(notPassed[0].title).slice(0, 80)}`);
  return { problems, total: tests.length, passed };
}

function cli() {
  const [proofId, reportPath] = process.argv.slice(2);
  if (!proofId || !reportPath) {
    console.error("usage: check-db-proof-counts.mjs <proof-id> <vitest-json-report>");
    process.exit(2);
  }
  let report;
  try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch { report = null; }
  const { problems, total, passed } = evaluateDbProof(proofId, report);
  for (const p of problems) console.log(`::error::${p.replace(/[\r\n]+/g, " ").replace(/::/g, ": :")}`);
  console.log(`DB_PROOF=${proofId} tests=${total} passed=${passed} verdict=${problems.length === 0 ? "PASS" : "FAIL"}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();

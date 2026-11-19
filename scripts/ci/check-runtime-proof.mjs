#!/usr/bin/env node
/**
 * Mandatory runtime-proof gate (owner decision 2026-11-19). Two checks, both fail closed:
 *
 *   report <vitest-json>   the db-verify step runs every manifest file with `--reporter=json`; this verifies, for EACH manifest file, that it
 *                          was collected, ran exactly `expectedTests` tests, and EVERY test PASSED (no skipped/pending/todo/failed), and that no
 *                          runtime-proof file exists on disk that the manifest does not list (so a new proof cannot silently stay outside CI).
 *   static                 non-DB, fast: counts `expect(true)` placeholders and `.skip(` / `.todo(` in each manifest file and requires the count to
 *                          EQUAL the recorded `vacuousBaseline` (never increase; when vacuity is removed the baseline must be lowered, so the debt
 *                          can only shrink). A file is `verified` only with baseline 0.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_PATH = ".claude/runtime-proof-manifest.json";
export const PROOF_DIR = "src/__tests__/runtime-proof";

/** Counts of vacuous constructs in test source text. */
export function vacuityCounts(text) {
  const t = String(text);
  return {
    expectTrue: (t.match(/expect\(\s*true\s*\)/g) ?? []).length,
    skip: (t.match(/\b(?:it|test|describe)\.skip\(/g) ?? []).length,
    todo: (t.match(/\b(?:it|test|describe)\.todo\(|\bit\.todo\b/g) ?? []).length,
  };
}

/** @returns {string[]} problems (empty = pass) */
export function staticVacuityProblems({ manifest, readFile }) {
  const problems = [];
  for (const [file, spec] of Object.entries(manifest.files ?? {})) {
    let text;
    try { text = readFile(file); } catch { problems.push(`${file}: listed in the manifest but not readable`); continue; }
    const c = vacuityCounts(text);
    const total = c.expectTrue + c.skip + c.todo;
    const base = spec.vacuousBaseline;
    if (!Number.isInteger(base) || base < 0) { problems.push(`${file}: vacuousBaseline missing or invalid`); continue; }
    if (total > base) problems.push(`${file}: ${total} vacuous constructs (expect(true)=${c.expectTrue}, skip=${c.skip}, todo=${c.todo}) exceed the recorded baseline ${base}`);
    if (total < base) problems.push(`${file}: vacuity fell to ${total} but the manifest still records ${base}; lower vacuousBaseline so the debt can only shrink`);
    if (spec.status === "verified" && total !== 0) problems.push(`${file}: marked verified but still contains ${total} vacuous constructs`);
    if (spec.status !== "verified" && spec.status !== "tracked-vacuous") problems.push(`${file}: status must be verified or tracked-vacuous`);
  }
  return problems;
}

/** @param {{ manifest: any, report: any, diskFiles: string[] }} p @returns {{ problems: string[], rows: {file:string, expected:number, actual:number}[] }} */
export function evaluateRuntimeProof({ manifest, report, diskFiles }) {
  const problems = [];
  const rows = [];
  const results = Array.isArray(report?.testResults) ? report.testResults : null;
  if (!results) return { problems: ["vitest JSON report missing or malformed"], rows };
  for (const [file, spec] of Object.entries(manifest.files ?? {})) {
    const entry = results.find((r) => typeof r.name === "string" && r.name.replace(/\\/g, "/").endsWith(`/${file}`));
    if (!entry) { problems.push(`${file}: not collected by the run (missing or failed to import)`); continue; }
    const tests = Array.isArray(entry.assertionResults) ? entry.assertionResults : [];
    rows.push({ file, expected: spec.expectedTests, actual: tests.length });
    if (entry.status === "failed" && tests.length === 0) problems.push(`${file}: suite failed to run (${String(entry.message ?? "").slice(0, 120)})`);
    if (tests.length !== spec.expectedTests) problems.push(`${file}: ran ${tests.length} tests, manifest expects ${spec.expectedTests}`);
    const notPassed = tests.filter((a) => a.status !== "passed");
    if (notPassed.length) problems.push(`${file}: ${notPassed.length} test(s) not passed (${[...new Set(notPassed.map((a) => a.status))].join(",")}), e.g. ${String(notPassed[0].title).slice(0, 80)}`);
  }
  const listed = new Set(Object.keys(manifest.files ?? {}));
  for (const f of diskFiles) if (!listed.has(f)) problems.push(`${f}: exists under ${PROOF_DIR}/ but is not in the manifest (a runtime proof must be mandatory)`);
  return { problems, rows };
}

export function listProofFiles(root) {
  const base = join(root, PROOF_DIR);
  if (!existsSync(base)) return [];
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.test\.tsx?$/.test(n)) out.push(relative(root, p).replace(/\\/g, "/")); } };
  walk(base);
  return out.sort();
}

function cli() {
  const [mode, arg] = process.argv.slice(2);
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"));
  if (mode === "static") {
    const problems = staticVacuityProblems({ manifest, readFile: (f) => readFileSync(join(root, f), "utf8") });
    for (const p of problems) console.log(`::error::${p.replace(/[\r\n]+/g, " ").replace(/::/g, ": :")}`);
    console.log(`RUNTIME_PROOF_STATIC=${problems.length === 0 ? "PASS" : "FAIL"}`);
    process.exit(problems.length ? 1 : 0);
  }
  if (mode === "report" && arg) {
    const { problems, rows } = evaluateRuntimeProof({ manifest, report: JSON.parse(readFileSync(arg, "utf8")), diskFiles: listProofFiles(root) });
    for (const r of rows) console.log(`::notice title=runtime-proof::${r.file} expected=${r.expected} actual=${r.actual}`);
    for (const p of problems) console.log(`::error::${p.replace(/[\r\n]+/g, " ").replace(/::/g, ": :")}`);
    const total = rows.reduce((a, r) => a + r.actual, 0);
    console.log(`RUNTIME_PROOF_FILES=${rows.length} RUNTIME_PROOF_TESTS=${total}`);
    console.log(`RUNTIME_PROOF=${problems.length === 0 ? "PASS" : "FAIL"}`);
    process.exit(problems.length ? 1 : 0);
  }
  console.error("usage: check-runtime-proof.mjs static | report <vitest-json>");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli();

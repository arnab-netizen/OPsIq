/**
 * Round 2 authored-case validator CLI (reproducible).
 *
 * Loads each authored Round 2 case as { input: 01_case_input.json, key: key.json }
 * and runs the committed intake validator over the pair. Unlike validate-intake.ts
 * (which validates Round 1 inputs with no key), this loads the hidden key from the
 * separate key.json file so the trigger-metric / safety-label / abstention checks
 * actually run. Writes a deterministic results file. No /tmp, no network.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/validate-round2-cases.ts \
 *     [--round 002] [--out simulation_runs/round_002/_PILOT_VALIDATION.json]
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type IntakeResult } from "@/services/benchmark/round2-intake-validator";

const args = process.argv.slice(2);
const round = (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ?? "002";
const out =
  (args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined) ??
  `simulation_runs/round_${round}/_PILOT_VALIDATION.json`;

const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", `round_${round}`);
const caseDirs = fs.readdirSync(roundDir).filter((d) => d.startsWith("case_")).sort();

const results: (IntakeResult & { bucket: string })[] = [];
for (const dir of caseDirs) {
  const inputPath = path.join(roundDir, dir, "01_case_input.json");
  const keyPath = path.join(roundDir, dir, "key.json");
  const manifestPath = path.join(roundDir, dir, "manifest_entry.json");
  if (!fs.existsSync(inputPath) || !fs.existsSync(keyPath)) continue;
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const bucket = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8")).diagnosis_bucket ?? "(unknown)"
    : "(unknown)";
  const r = validateRound2Case({ input, key });
  results.push({ ...r, bucket });
}

const pass = results.filter((r) => r.valid).length;
const summary = {
  authored: results.length,
  validator_pass: pass,
  summary: results.map((r) => ({
    id: r.caseId,
    bucket: r.bucket,
    valid: r.valid,
    failures: r.failures,
  })),
};
fs.writeFileSync(path.join(repoRoot, out), JSON.stringify(summary, null, 2) + "\n");

console.log(`\n=== ROUND ${round} AUTHORED-CASE VALIDATION ===`);
console.log(`authored: ${results.length}   validator-pass: ${pass}`);
for (const r of results) {
  console.log(`  ${r.valid ? "PASS" : "FAIL"}  ${r.caseId}  (${r.bucket})${r.valid ? "" : "  -> " + r.failures.map((f) => f.code).join(",")}`);
}
console.log(`written: ${out}`);

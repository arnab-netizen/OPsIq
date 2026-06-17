/**
 * Round 2 intake validator CLI.
 *
 * Runs the reusable validator over every Round 1 case input (wrapping each as a
 * Round 2 case with no hidden key) and writes a per-case results JSON. Round 1
 * cases are expected to FAIL Round-2 validity (no key + placeholder evidence) —
 * that is precisely why Round 2 is required.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/validate-intake.ts [--round 001] [--out ROUND_1_INTAKE_VALIDATION_RESULTS.json]
 */
import * as fs from "fs";
import * as path from "path";
import { validateRound2Case, type IntakeResult } from "@/services/benchmark/round2-intake-validator";

const args = process.argv.slice(2);
const round = (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ?? "001";
const out = (args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined) ?? "ROUND_1_INTAKE_VALIDATION_RESULTS.json";

const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", `round_${round}`);
const caseDirs = fs.readdirSync(roundDir).filter((d) => d.startsWith("case_")).sort();

const results: IntakeResult[] = [];
const failCounts: Record<string, number> = {};
for (const dir of caseDirs) {
  const inputPath = path.join(roundDir, dir, "01_case_input.json");
  if (!fs.existsSync(inputPath)) continue;
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  // Round 1 has no hidden key bundled with the input.
  const r = validateRound2Case({ input, key: undefined });
  results.push(r);
  for (const f of r.failures) failCounts[f.code] = (failCounts[f.code] ?? 0) + 1;
}

const pass = results.filter((r) => r.valid).length;
const contentPass = results.filter((r) => r.content_valid).length;
const summary = {
  round,
  total: results.length,
  round2_valid: pass,
  round2_invalid: results.length - pass,
  content_valid_only: contentPass,
  failure_code_counts: failCounts,
  results,
};
fs.writeFileSync(path.join(repoRoot, out), JSON.stringify(summary, null, 2) + "\n");

console.log(`\n=== ROUND ${round} INTAKE VALIDATION ===`);
console.log(`total: ${results.length}`);
console.log(`round2-valid: ${pass}   round2-invalid: ${results.length - pass}`);
console.log(`content-valid (evidence checks only): ${contentPass}`);
console.log("failure code counts:", JSON.stringify(failCounts, null, 1));
console.log(`written: ${out}`);

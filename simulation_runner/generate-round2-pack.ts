/**
 * Round 2 case-pack generator: writes the manifest and creates one empty
 * (UNFINISHED, validator-rejected) template per planned case. Does NOT author
 * real evidence. Idempotent; never overwrites a case folder that already
 * contains an authored (non-template) file.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/generate-round2-pack.ts
 */
import * as fs from "fs";
import * as path from "path";
import { buildRound2Manifest, makeUnfinishedTemplate } from "@/services/benchmark/round2-case-schema";

const repoRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(repoRoot, "simulation_runs", "round_002_case_pack_template");
fs.mkdirSync(templateRoot, { recursive: true });

const manifest = buildRound2Manifest();

// Manifest at repo root
fs.writeFileSync(
  path.join(repoRoot, "ROUND_2_CASE_PACK_MANIFEST.json"),
  JSON.stringify({ total: manifest.length, generatedAt: "deterministic", cases: manifest }, null, 2) + "\n"
);

// One UNFINISHED template per case + the manifest entry alongside it
let created = 0;
for (const entry of manifest) {
  const dir = path.join(templateRoot, `case_${entry.caseId}`);
  fs.mkdirSync(dir, { recursive: true });
  const inputPath = path.join(dir, "01_case_input.template.json");
  const authoredPath = path.join(dir, "01_case_input.json");
  if (fs.existsSync(authoredPath)) continue; // never clobber authored cases
  const tmpl = makeUnfinishedTemplate(entry);
  fs.writeFileSync(inputPath, JSON.stringify(tmpl.input, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "manifest_entry.json"), JSON.stringify(entry, null, 2) + "\n");
  created += 1;
}

console.log(`\n=== ROUND 2 PACK SCAFFOLD ===`);
console.log(`manifest cases: ${manifest.length}`);
console.log(`template folders created/refreshed: ${created}`);
console.log(`template root: simulation_runs/round_002_case_pack_template/`);
console.log("NOTE: templates are UNFINISHED (TODO) and are rejected by the intake validator until authored.");

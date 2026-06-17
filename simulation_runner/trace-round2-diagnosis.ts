/**
 * Round 2 diagnosis trace (audit aid; reproducible).
 *
 * Maps each authored Round 2 case's engine-visible evidence into EvidenceItem
 * shape and runs the deterministic diagnosis engine, printing the primary
 * diagnosis + confidence and all matched patterns. Used by the pilot hostile
 * audit to prove (a) diagnosable cases are diagnosed correctly and (b) abstention
 * cases do NOT trip a spurious confident diagnosis. No /tmp, no network.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/trace-round2-diagnosis.ts [--round 002]
 */
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import { ConfidenceLevel, type EvidenceItem } from "@/domain/consulting-engine/types";

const args = process.argv.slice(2);
const round = (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ?? "002";
const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", `round_${round}`);
const caseDirs = fs.readdirSync(roundDir).filter((d) => d.startsWith("case_")).sort();

function toEvidence(raw: any[]): EvidenceItem[] {
  return raw.map((e) => ({
    id: uuidv4(),
    dimension: e.dimension,
    finding: e.finding,
    confidence: (ConfidenceLevel as any)[e.confidence] ?? ConfidenceLevel.MEDIUM,
    source: e.source ?? "case",
    timestamp: new Date(0),
    isCritical: !!e.isCritical,
    supportingData: e.supportingData,
  }));
}

console.log(`\n=== ROUND ${round} DIAGNOSIS TRACE ===`);
for (const dir of caseDirs) {
  const inputPath = path.join(roundDir, dir, "01_case_input.json");
  const keyPath = path.join(roundDir, dir, "key.json");
  if (!fs.existsSync(inputPath)) continue;
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const key = fs.existsSync(keyPath) ? JSON.parse(fs.readFileSync(keyPath, "utf-8")) : {};
  const evidence = toEvidence(input.evidence ?? []);
  const result = diagnoseRootCause(evidence, input.businessProblem ?? "");
  const alt = result.alternativeRootCauses.map((a) => a.type).join(", ") || "(none)";
  console.log(
    `\n${input.caseId}\n  expected primary : ${key.true_primary_diagnosis ?? "?"}` +
      `\n  engine primary   : ${result.primaryRootCause.type}  [${result.confidence}]` +
      `\n  engine alts      : ${alt}` +
      `\n  readiness        : ${result.readinessForIntervention}`
  );
}
console.log("");

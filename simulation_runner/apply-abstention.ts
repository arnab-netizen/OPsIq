/**
 * Apply the abstention/safety gate to every frozen case in a round.
 *
 * Remediation step 1 for STAGE_A_SAFETY_VALIDATION_BLOCKER (B1): the abstention
 * engine was never exercised by the benchmark. This harness reads each
 * preserved 09_frozen_opsiq_output.json and runs it through the SAME wiring the
 * runner now uses (assessConsultingOutput), writing 12_abstention_decision.json.
 *
 * It does NOT re-run the consulting engine, does NOT touch frozen outputs
 * (02..09), scoring records (10), failure tickets (11), answer keys, or
 * thresholds. It only adds the engine-produced abstention decision (12) and
 * prints an aggregate over the fully-evaluated denominator (all cases).
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/apply-abstention.ts [--round 001]
 */
import * as fs from "fs";
import * as path from "path";
import { assessConsultingOutput } from "@/services/governance/consulting-safety-adapter";

const args = process.argv.slice(2);
const round =
  (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ??
  "001";

const outfile =
  (args.includes("--outfile") ? args[args.indexOf("--outfile") + 1] : undefined) ??
  "12_abstention_decision.json";

const repoRoot = path.resolve(__dirname, "..");
const roundDir = path.join(repoRoot, "simulation_runs", `round_${round}`);

if (!fs.existsSync(roundDir)) {
  console.error(`Round dir not found: ${roundDir}`);
  process.exit(1);
}

const caseDirs = fs
  .readdirSync(roundDir)
  .filter((d) => d.startsWith("case_"))
  .sort();

let evaluated = 0;
let abstained = 0;
let proceeded = 0;
const byState: Record<string, number> = {};
const byStatus: Record<string, { total: number; abstain: number }> = {};

for (const dir of caseDirs) {
  const caseDir = path.join(roundDir, dir);
  const frozenPath = path.join(caseDir, "09_frozen_opsiq_output.json");
  if (!fs.existsSync(frozenPath)) {
    console.error(`  SKIP ${dir}: no frozen output`);
    continue;
  }
  const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf-8"));
  const memo = frozen.decisionMemo;
  if (!memo) {
    console.error(`  SKIP ${dir}: frozen output has no decisionMemo`);
    continue;
  }
  // Revive the single Date field the schema requires before re-validation.
  if (typeof memo.timestamp === "string") memo.timestamp = new Date(memo.timestamp);

  // Total evidence available (production-available signal) from the case input.
  const inputPath = path.join(caseDir, "01_case_input.json");
  let totalEvidenceCount: number | undefined;
  if (fs.existsSync(inputPath)) {
    const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    totalEvidenceCount = Array.isArray(input.evidence) ? input.evidence.length : undefined;
  }

  const safety = assessConsultingOutput(
    { status: frozen.status, decisionMemo: memo },
    memo.id,
    "abstention-engine",
    { totalEvidenceCount }
  );

  fs.writeFileSync(
    path.join(caseDir, outfile),
    JSON.stringify(
      {
        step: "abstention_safety_gate",
        caseId: frozen.caseId,
        source: "09_frozen_opsiq_output.json (engine output preserved, not re-run)",
        engineEntryPoint:
          "assessConsultingOutput -> assessSafety/createAbstentionDecision",
        engine_status: frozen.status,
        derived_inputs: safety.inputs,
        abstain: safety.assessment.abstain,
        abstention_state: safety.assessment.abstention_state ?? null,
        is_safe: safety.assessment.is_safe,
        confidence_adjustment: safety.assessment.confidence_adjustment,
        unsafe_conditions: safety.assessment.unsafe_conditions,
        escalation_required: safety.escalation_required,
        fallback_action: safety.assessment.fallback_action ?? null,
        abstention_decision: safety.decision,
        gate_evaluated: true,
      },
      null,
      2
    ) + "\n"
  );

  evaluated += 1;
  const st = frozen.status as string;
  byStatus[st] ??= { total: 0, abstain: 0 };
  byStatus[st].total += 1;
  if (safety.assessment.abstain) {
    abstained += 1;
    byStatus[st].abstain += 1;
    const state = safety.assessment.abstention_state ?? "UNKNOWN";
    byState[state] = (byState[state] ?? 0) + 1;
  } else {
    proceeded += 1;
  }
}

console.log("\n=== ABSTENTION GATE APPLIED (engine-produced) ===");
console.log(`round:                round_${round}`);
console.log(`cases evaluated:      ${evaluated} (fully-evaluated denominator)`);
console.log(`abstained:            ${abstained}`);
console.log(`proceeded:            ${proceeded}`);
console.log(`abstention states:    ${JSON.stringify(byState)}`);
console.log(`by engine status:     ${JSON.stringify(byStatus)}`);
console.log("NOTE: wiring validation only. NOT a Stage A pass claim.");

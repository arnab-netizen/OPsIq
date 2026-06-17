/**
 * E1 re-run harness: re-runs the consulting engine (now with financial
 * archetypes) over the Round 1 case inputs and applies the unchanged safety
 * gate, writing a NEW artifact (18_abstention_decision_e1.json) per case.
 *
 * It does NOT overwrite frozen outputs (02..09), scoring records, or any prior
 * abstention output. It re-runs the engine in-memory from 01_case_input.json
 * (the engine is deterministic) and records the post-E1 diagnosis + gate result.
 *
 * Usage:
 *   npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/rerun-e1.ts [--round 001] [--outfile 18_abstention_decision_e1.json]
 */
import * as fs from "fs";
import * as path from "path";
import { v4 as uuid } from "uuid";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import { ConfidenceLevel, type ConsultingEngineInput, type EvidenceItem } from "@/domain/consulting-engine/types";
import { assessConsultingOutput } from "@/services/governance/consulting-safety-adapter";
import { classifyAbstentionCoverage } from "@/services/governance/coverage-classifier";

const args = process.argv.slice(2);
const round = (args.includes("--round") ? args[args.indexOf("--round") + 1] : undefined) ?? "001";
const outfile = (args.includes("--outfile") ? args[args.indexOf("--outfile") + 1] : undefined) ?? "18_abstention_decision_e1.json";
const roundDir = path.resolve(__dirname, "..", "simulation_runs", `round_${round}`);

const confMap: Record<string, ConfidenceLevel> = {
  LOW: ConfidenceLevel.LOW, MEDIUM: ConfidenceLevel.MEDIUM, HIGH: ConfidenceLevel.HIGH, PROVISIONAL: ConfidenceLevel.PROVISIONAL,
};

const caseDirs = fs.readdirSync(roundDir).filter((d) => d.startsWith("case_")).sort();
let proceeded = 0, abstained = 0, committed = 0;
const byType: Record<string, number> = {};

async function main() {
  for (const dir of caseDirs) {
    const caseDir = path.join(roundDir, dir);
    const inputPath = path.join(caseDir, "01_case_input.json");
    if (!fs.existsSync(inputPath)) continue;
    const ci = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

    const evidence: EvidenceItem[] = (ci.evidence ?? []).map((e: Record<string, unknown>) => ({
      id: uuid(),
      dimension: e.dimension,
      finding: e.finding,
      confidence: confMap[e.confidence as string] ?? ConfidenceLevel.MEDIUM,
      source: (e.source as string) ?? "case_input",
      timestamp: new Date("2026-06-16T00:00:00Z"),
      isCritical: !!e.isCritical,
      supportingData: e.supportingData,
    }));
    const engineInput: ConsultingEngineInput = {
      engagementId: uuid(),
      businessProblem: ci.businessProblem,
      evidence,
      clientContext: ci.clientContext,
    };
    const output = await runConsultingEngine(engineInput);
    const memo = output.decisionMemo;
    const isCommitted = output.status !== "INSUFFICIENT_EVIDENCE";
    if (isCommitted) { committed += 1; byType[memo.rootCauseDiagnosis.type] = (byType[memo.rootCauseDiagnosis.type] ?? 0) + 1; }

    const safety = assessConsultingOutput(
      { status: output.status, decisionMemo: memo },
      memo.id,
      "abstention-engine",
      {
        totalEvidenceCount: ci.evidence?.length,
        evidence: (ci.evidence ?? []).map((e: Record<string, unknown>) => ({ dimension: e.dimension, finding: e.finding, isCritical: e.isCritical, supportingData: e.supportingData })),
        ownerConstraintProfile: {
          budgetBand: ci.ownerConstraintProfile?.budgetBand,
          timeHorizonDays: ci.ownerConstraintProfile?.timeHorizonDays,
          legalComplianceSensitive: ci.ownerConstraintProfile?.legalComplianceSensitive,
          staffCapacity: ci.ownerConstraintProfile?.staffCapacity,
          cashRunwayMonths: ci.ownerConstraintProfile?.cashRunwayMonths,
          riskAppetite: ci.ownerIntake?.riskAppetite,
        },
      }
    );

    if (safety.assessment.abstain) abstained += 1; else proceeded += 1;

    fs.writeFileSync(path.join(caseDir, outfile), JSON.stringify({
      step: "abstention_safety_gate_e1",
      caseId: ci.caseId,
      source: "re-run engine (E1) from 01_case_input.json; frozen 09 NOT overwritten",
      engine_status: output.status,
      diagnosis: memo.rootCauseDiagnosis.type,
      first_action: memo.recommendedInterventions?.[0]?.intervention?.title ?? null,
      first_action_cost: memo.recommendedInterventions?.[0]?.intervention?.estimatedCostBand ?? null,
      derived_inputs: safety.inputs,
      abstain: safety.assessment.abstain,
      abstention_state: safety.assessment.abstention_state ?? null,
      unsafe_conditions: safety.assessment.unsafe_conditions,
      causal_challenge: safety.causal_challenge,
      constraint_alignment: safety.constraint_alignment,
      model_coverage_reason: classifyAbstentionCoverage({
        engineStatus: output.status,
        committed: isCommitted,
        evidence: (ci.evidence ?? []).map((e: Record<string, unknown>) => ({ dimension: e.dimension as string, isCritical: e.isCritical as boolean })),
      }),
      gate_evaluated: true,
    }, null, 2) + "\n");
  }

  console.log(`\n=== E1 RE-RUN (round_${round}) ===`);
  console.log(`committed diagnoses: ${committed}  byType=${JSON.stringify(byType)}`);
  console.log(`proceeded: ${proceeded}  abstained: ${abstained}`);
  console.log("NOTE: frozen 09 preserved; new outputs only. NOT a Stage A pass claim.");
}
main().catch((e) => { console.error("RERUN_E1_ERROR:", e); process.exit(1); });

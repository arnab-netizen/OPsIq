#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { EvidenceSynthesisEngine } from "../services/stage-a/evidence-synthesis-engine.js";
import { SymptomSeparator } from "../services/stage-a/symptom-separator.js";
import { HypothesisGenerator } from "../services/stage-a/hypothesis-generator.js";
import { HypothesisRanker } from "../services/stage-a/hypothesis-ranker.js";
import { EvidenceMapper } from "../services/stage-a/evidence-mapper.js";

interface CaseInput {
  caseId: string;
  evidence: any[];
}

interface RemediationOutput {
  caseId: string;
  synthesizedEvidence: any;
  hypotheses: any[];
  rankedHypotheses: any[];
  mappings: any[];
  evidenceTraceRate: number;
  topHypothesis: string;
  topConfidence: number;
}

async function selectBenchmarkCases(): Promise<string[]> {
  const cases = [
    "BLND-006",
    "BLND-007",
    "BLND-008",
    "BLND-009",
    "BLND-010",
    "ADV-011",
    "ADV-012",
    "ADV-013",
    "ADV-014",
    "RW-016",
    "RW-018",
    "RW-020",
    "RW-022",
    "RW-024",
    "PD-011",
    "PD-013",
    "PD-015",
    "PD-017",
    "PD-019",
    "SYN-011",
    "SYN-013",
  ];

  return cases;
}

function loadCaseInput(caseId: string): CaseInput | null {
  try {
    const caseDir = path.join(
      process.cwd(),
      `simulation_runs/round_002/cases/${caseId}`
    );
    const inputPath = path.join(caseDir, "01_case_input.json");

    if (!fs.existsSync(inputPath)) {
      console.error(`Case input not found: ${inputPath}`);
      return null;
    }

    const data = fs.readFileSync(inputPath, "utf-8");
    const caseData = JSON.parse(data);

    // Normalize evidence items: ensure they have UUIDs, convert confidence to enum
    const evidence = (caseData.evidence || []).map((e: any) => ({
      id: e.id || uuidv4(),
      dimension: e.dimension,
      finding: e.finding,
      confidence: e.confidence.toUpperCase(),
      source: e.source,
      isCritical: e.isCritical || false,
      timestamp: new Date(e.timestamp || new Date()),
      supportingData: e.supportingData,
    }));

    return {
      caseId,
      evidence,
    };
  } catch (error) {
    console.error(`Error loading case ${caseId}:`, error);
    return null;
  }
}

function executeStageA(caseInput: CaseInput): RemediationOutput {
  const synthesisEngine = new EvidenceSynthesisEngine();
  const separator = new SymptomSeparator();
  const generator = new HypothesisGenerator();
  const ranker = new HypothesisRanker();
  const mapper = new EvidenceMapper();

  const synthesized = synthesisEngine.synthesizeEvidence(caseInput.evidence);
  const hypotheses = generator.generateHypotheses(synthesized, caseInput.evidence);
  const ranked = ranker.rankHypotheses(hypotheses, caseInput.evidence);
  const mappings = ranked.map((h) => mapper.mapEvidence(h.rootCause, caseInput.evidence));

  return {
    caseId: caseInput.caseId,
    synthesizedEvidence: synthesized,
    hypotheses,
    rankedHypotheses: ranked,
    mappings,
    evidenceTraceRate: synthesized.evidenceTraceRate,
    topHypothesis: ranked.length > 0 ? ranked[0].rootCause : "UNKNOWN",
    topConfidence: ranked.length > 0 ? ranked[0].confidence : 0,
  };
}

async function runBenchmark() {
  console.log("=== STAGE A REMEDIATION BENCHMARK (Improved Hypothesis Ranking) ===\n");

  const caseIds = await selectBenchmarkCases();
  console.log(`Selected ${caseIds.length} benchmark cases\n`);

  const outputs: RemediationOutput[] = [];
  const outputDir = path.join(process.cwd(), "simulation_runs/round_002/stage_a_remediation_outputs");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const caseId of caseIds) {
    process.stdout.write(`Executing ${caseId}... `);

    const caseInput = loadCaseInput(caseId);
    if (!caseInput) {
      console.log("SKIPPED (input not found)");
      failureCount++;
      continue;
    }

    try {
      const output = executeStageA(caseInput);
      outputs.push(output);

      const outputPath = path.join(outputDir, `${caseId}_remediation_output.json`);
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

      console.log(`OK (confidence: ${output.topConfidence}%)`);
      successCount++;
    } catch (error) {
      console.log(`ERROR: ${error}`);
      failureCount++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Executed: ${successCount}/${caseIds.length}`);
  console.log(`Failed: ${failureCount}/${caseIds.length}`);

  if (outputs.length > 0) {
    const avgTraceRate = Math.round(
      outputs.reduce((sum, o) => sum + o.evidenceTraceRate, 0) / outputs.length
    );

    const avgConfidence = Math.round(
      outputs.reduce((sum, o) => sum + o.topConfidence, 0) / outputs.length
    );

    const maxConfidence = Math.max(...outputs.map((o) => o.topConfidence));
    const minConfidence = Math.min(...outputs.map((o) => o.topConfidence));
    const unknownCount = outputs.filter((o) => o.topHypothesis === "UNKNOWN").length;

    console.log(`\nMetrics:`);
    console.log(`  Average Evidence Trace Rate: ${avgTraceRate}%`);
    console.log(`  Average Top Hypothesis Confidence: ${avgConfidence}%`);
    console.log(`  Max Confidence: ${maxConfidence}%`);
    console.log(`  Min Confidence: ${minConfidence}%`);
    console.log(`  UNKNOWN Cases: ${unknownCount}`);

    const summaryPath = path.join(outputDir, "stage_a_remediation_results.json");
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          caseCount: outputs.length,
          avgTraceRate,
          avgConfidence,
          maxConfidence,
          minConfidence,
          unknownCount,
          outputs: outputs.map((o) => ({
            caseId: o.caseId,
            traceRate: o.evidenceTraceRate,
            topHypothesis: o.topHypothesis,
            confidence: o.topConfidence,
          })),
        },
        null,
        2
      )
    );

    console.log(`\nOutputs written to: ${outputDir}`);
  }
}

runBenchmark().catch(console.error);

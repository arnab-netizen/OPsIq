import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

// 21 benchmark cases
const BENCHMARK_CASES = [
  "BLND-006", "BLND-007", "BLND-008", "BLND-009", "BLND-010",
  "ADV-011", "ADV-012", "ADV-013", "ADV-014",
  "RW-016", "RW-018", "RW-020", "RW-022", "RW-024",
  "PD-011", "PD-013", "PD-015", "PD-017", "PD-019",
  "SYN-011", "SYN-013"
];

interface BenchmarkResult {
  caseId: string;
  expected: string;
  slice6Predicted: string;
  slice7Predicted: string;
  slice7Confidence: number;
  correct: boolean;
  changed: boolean;
  regression: boolean;
  improvement: boolean;
  reason: string;
}

async function runBenchmark(): Promise<void> {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();

  const baseDir = "simulation_runs/round_002/cases";
  const results: BenchmarkResult[] = [];
  let correctCount = 0;
  let improvementCount = 0;
  let regressionCount = 0;

  // Load SLICE_6 results for comparison
  const slice6ResultsPath = "simulation_runs/round_002/stage_a_remediation_outputs/SLICE_6_benchmark_validation.json";
  const slice6Results = JSON.parse(fs.readFileSync(slice6ResultsPath, "utf-8"));
  const slice6Map: Record<string, any> = {};
  slice6Results.results.forEach((r: any) => {
    slice6Map[r.caseId] = r;
  });

  console.log("Running SLICE_7 benchmark validation on 21 cases...\n");
  console.log("Comparing against SLICE_6 results (38.1% baseline)...\n");

  for (const caseId of BENCHMARK_CASES) {
    const caseDir = path.join(baseDir, caseId);
    const answerKeyPath = path.join(caseDir, `ANSWER_KEY_${caseId}.json`);
    const caseInputPath = path.join(caseDir, "01_case_input.json");

    if (!fs.existsSync(answerKeyPath) || !fs.existsSync(caseInputPath)) {
      console.error(`SKIP ${caseId}: Missing answer key or case input`);
      continue;
    }

    try {
      // Load answer key
      const answerKey = JSON.parse(fs.readFileSync(answerKeyPath, "utf-8"));
      const expected = answerKey.root_cause_diagnosis;

      // Load case input
      const caseInput = JSON.parse(fs.readFileSync(caseInputPath, "utf-8"));

      // Extract evidence
      const evidenceItems: EvidenceItem[] = (caseInput.evidence || []).map(
        (ev: any, idx: number) => ({
          id: `ev-${idx}`,
          dimension: ev.dimension || "unknown",
          finding: ev.finding || "",
          isCritical: ev.isCritical || false,
        })
      );

      if (evidenceItems.length === 0) {
        console.log(`${caseId}: No evidence found, skipping`);
        continue;
      }

      // Run diagnosis (SLICE_7)
      const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
      const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

      const slice7Predicted = hypotheses.length > 0
        ? hypotheses[0].rootCause.toString().replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase()
        : "UNKNOWN";

      const slice7Confidence = hypotheses.length > 0 ? hypotheses[0].confidence : 0;

      const isCorrect = slice7Predicted.toLowerCase().replace(/_/g, "_") ===
                        expected.toLowerCase().replace(/_/g, "_");

      if (isCorrect) correctCount++;

      // Compare against SLICE_6
      const slice6Data = slice6Map[caseId];
      const slice6Predicted = slice6Data?.predicted || "UNKNOWN";
      const wasCorrect = slice6Data?.correct || false;

      const changed = slice7Predicted !== slice6Predicted;
      const regression = changed && wasCorrect && !isCorrect;
      const improvement = changed && !wasCorrect && isCorrect;

      if (improvement) improvementCount++;
      if (regression) regressionCount++;

      let reason = "";
      if (!changed) {
        reason = "unchanged";
      } else if (improvement) {
        reason = "improvement";
      } else if (regression) {
        reason = "regression";
      } else if (isCorrect && !wasCorrect) {
        reason = "newly correct";
      } else if (!isCorrect && wasCorrect) {
        reason = "no longer correct";
      } else {
        reason = "changed but still incorrect";
      }

      results.push({
        caseId,
        expected,
        slice6Predicted,
        slice7Predicted,
        slice7Confidence,
        correct: isCorrect,
        changed,
        regression,
        improvement,
        reason,
      });

      const status = isCorrect ? "✓" : "✗";
      console.log(`${caseId}: ${status} Expected ${expected}, SLICE_6: ${slice6Predicted}, SLICE_7: ${slice7Predicted} (${reason}, conf: ${slice7Confidence})`);

    } catch (e) {
      console.error(`ERROR ${caseId}:`, (e as Error).message);
    }
  }

  // Report metrics
  const accuracy = (correctCount / BENCHMARK_CASES.length * 100).toFixed(1);
  const slice6Accuracy = 38.1;
  const improvementPP = parseFloat(accuracy) - slice6Accuracy;

  console.log("\n========================================");
  console.log(`SLICE_7 BENCHMARK RESULTS`);
  console.log(`========================================`);
  console.log(`Cases run: ${results.length}/21`);
  console.log(`Correct: ${correctCount}/${BENCHMARK_CASES.length}`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log(`SLICE_6 Baseline: 38.1%`);
  console.log(`Improvement: ${improvementPP >= 0 ? '+' : ''}${improvementPP.toFixed(1)}pp`);
  console.log(`Promotion gate (40%): ${parseFloat(accuracy) >= 40 ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`Regressions: ${regressionCount}`);
  console.log(`Improvements: ${improvementCount}`);
  console.log("");

  // Per-case breakdown
  console.log("Per-case results:");
  results.forEach(r => {
    console.log(`  ${r.caseId}: ${r.correct ? "✓" : "✗"} (${r.reason}, exp: ${r.expected}, s7: ${r.slice7Predicted})`);
  });

  // Save results
  const outputDir = "simulation_runs/round_002/stage_a_remediation_slice_7_outputs";
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "SLICE_7_benchmark_validation.json");
  fs.writeFileSync(outputPath, JSON.stringify({
    slice: "SLICE_7",
    timestamp: new Date().toISOString(),
    cases_run: results.length,
    correct: correctCount,
    total: BENCHMARK_CASES.length,
    accuracy_percent: parseFloat(accuracy),
    slice_6_baseline: 38.1,
    improvement_pp: improvementPP,
    promotion_gate_pass: parseFloat(accuracy) >= 40,
    regressions: regressionCount,
    improvements: improvementCount,
    results
  }, null, 2));

  console.log(`\nResults saved to: ${outputPath}`);
}

runBenchmark().catch(err => {
  console.error("Benchmark execution failed:", err);
  process.exit(1);
});

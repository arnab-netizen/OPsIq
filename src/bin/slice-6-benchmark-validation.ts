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
  predicted: string;
  correct: boolean;
  confidence: number;
}

async function runBenchmark(): Promise<void> {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();

  const baseDir = "simulation_runs/round_002/cases";
  const results: BenchmarkResult[] = [];
  let correctCount = 0;

  console.log("Running SLICE_6 benchmark validation on 21 cases...\n");

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

      // Extract evidence (simplified - just using evidence array from case input)
      const evidenceItems: EvidenceItem[] = (caseInput.evidence || []).map(
        (ev: any, idx: number) => ({
          id: `ev-${idx}`,
          dimension: ev.dimension || "unknown",
          finding: ev.finding || "",
          isCritical: ev.isCritical || false,
        })
      );

      if (evidenceItems.length === 0) {
        console.log(`${caseId}: No evidence found in case input, skipping`);
        continue;
      }

      // Run diagnosis
      const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
      const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

      const predicted = hypotheses.length > 0
        ? hypotheses[0].rootCause.toString().replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase()
        : "UNKNOWN";

      const confidence = hypotheses.length > 0 ? hypotheses[0].confidence : 0;

      const isCorrect = predicted.toLowerCase().replace(/_/g, "_") ===
                        expected.toLowerCase().replace(/_/g, "_");

      if (isCorrect) correctCount++;

      results.push({
        caseId,
        expected,
        predicted,
        correct: isCorrect,
        confidence
      });

      console.log(`${caseId}: ${isCorrect ? "✓" : "✗"} Expected ${expected}, Got ${predicted} (confidence: ${confidence})`);

    } catch (e) {
      console.error(`ERROR ${caseId}:`, (e as Error).message);
    }
  }

  // Report metrics
  const accuracy = (correctCount / BENCHMARK_CASES.length * 100).toFixed(1);

  console.log("\n========================================");
  console.log(`SLICE_6 BENCHMARK RESULTS`);
  console.log(`========================================`);
  console.log(`Cases run: ${results.length}/21`);
  console.log(`Correct: ${correctCount}/${BENCHMARK_CASES.length}`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log(`Baseline (SLICE_5): 28.6% (6/21)`);
  console.log(`Improvement: ${(parseFloat(accuracy) - 28.6).toFixed(1)}pp`);
  console.log(`Promotion gate (40%): ${parseFloat(accuracy) >= 40 ? "PASS ✓" : "FAIL ✗"}`);
  console.log("");

  // Per-case breakdown
  console.log("Per-case results:");
  results.forEach(r => {
    console.log(`  ${r.caseId}: ${r.correct ? "✓" : "✗"} (${r.expected} vs ${r.predicted}, conf ${r.confidence})`);
  });

  // Save results
  const outputPath = "simulation_runs/round_002/stage_a_remediation_outputs/SLICE_6_benchmark_validation.json";
  fs.writeFileSync(outputPath, JSON.stringify({
    slice: "SLICE_6",
    timestamp: new Date().toISOString(),
    cases_run: results.length,
    correct: correctCount,
    total: BENCHMARK_CASES.length,
    accuracy_percent: parseFloat(accuracy),
    baseline_accuracy: 28.6,
    improvement_pp: parseFloat(accuracy) - 28.6,
    promotion_gate_pass: parseFloat(accuracy) >= 40,
    results
  }, null, 2));

  console.log(`\nResults saved to: ${outputPath}`);
}

runBenchmark().catch(err => {
  console.error("Benchmark execution failed:", err);
  process.exit(1);
});

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType, ConfidenceLevel } from "@/domain/consulting-engine/types";

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
  slice7Predicted: string;
  slice8Predicted: string;
  slice8Confidence: number;
  correct: boolean;
  changed: boolean;
  regression: boolean;
  improvement: boolean;
  reason: string;
}

describe("STAGE_A_REMEDIATION_SLICE_8: Benchmark Validation (21 cases)", () => {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();
  let results: BenchmarkResult[] = [];
  let correctCount = 0;
  let improvementCount = 0;
  let regressionCount = 0;
  let slice7Accuracy = 0;

  beforeAll(() => {
    // Load SLICE_7 results for comparison
    const slice7ResultsPath = "simulation_runs/round_002/stage_a_remediation_slice_7_outputs/SLICE_7_benchmark_validation.json";
    if (!fs.existsSync(slice7ResultsPath)) {
      console.error(`Error: SLICE_7 results not found at ${slice7ResultsPath}`);
      throw new Error(`SLICE_7 benchmark results required at ${slice7ResultsPath}`);
    }

    const slice7Results = JSON.parse(fs.readFileSync(slice7ResultsPath, "utf-8"));
    const slice7Map: Record<string, any> = {};
    slice7Results.results.forEach((r: any) => {
      slice7Map[r.caseId] = r;
    });
    slice7Accuracy = slice7Results.accuracy_percent;

    const baseDir = "simulation_runs/round_002/cases";

    // Run all 21 cases
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

        // Extract evidence and ensure proper types
        const evidenceItems: EvidenceItem[] = (caseInput.evidence || []).map(
          (ev: any, idx: number) => ({
            id: `ev-${idx}`,
            dimension: ev.dimension || "unknown",
            finding: ev.finding || "",
            isCritical: ev.isCritical || false,
            confidence: ConfidenceLevel.HIGH,
            source: "benchmark",
            timestamp: new Date(),
          })
        );

        if (evidenceItems.length === 0) {
          console.log(`${caseId}: No evidence found, skipping`);
          continue;
        }

        // Run diagnosis (SLICE_8)
        const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
        const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

        const slice8Predicted = hypotheses.length > 0
          ? hypotheses[0].rootCause.toString().replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase()
          : "UNKNOWN";

        const slice8Confidence = hypotheses.length > 0 ? hypotheses[0].confidence : 0;

        const isCorrect = slice8Predicted.toLowerCase().replace(/_/g, "_") ===
                          expected.toLowerCase().replace(/_/g, "_");

        if (isCorrect) correctCount++;

        // Compare against SLICE_7
        const slice7Data = slice7Map[caseId];
        const slice7Predicted = slice7Data?.slice7Predicted || "UNKNOWN";
        const wasCorrect = slice7Data?.correct || false;

        const changed = slice8Predicted !== slice7Predicted;
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
          slice7Predicted,
          slice8Predicted,
          slice8Confidence,
          correct: isCorrect,
          changed,
          regression,
          improvement,
          reason,
        });

        const status = isCorrect ? "✓" : "✗";
        console.log(`${caseId}: ${status} Expected ${expected}, S7: ${slice7Predicted}, S8: ${slice8Predicted} (${reason}, conf: ${slice8Confidence})`);

      } catch (e) {
        console.error(`ERROR ${caseId}:`, (e as Error).message);
      }
    }

    // Save results
    const outputDir = "simulation_runs/round_002/stage_a_remediation_slice_8_outputs";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const accuracy = (correctCount / BENCHMARK_CASES.length * 100).toFixed(1);
    const improvementPP = parseFloat(accuracy) - slice7Accuracy;

    const outputPath = path.join(outputDir, "SLICE_8_benchmark_validation.json");
    fs.writeFileSync(outputPath, JSON.stringify({
      slice: "SLICE_8",
      timestamp: new Date().toISOString(),
      cases_run: results.length,
      correct: correctCount,
      total: BENCHMARK_CASES.length,
      accuracy_percent: parseFloat(accuracy),
      slice_7_baseline: slice7Accuracy,
      improvement_pp: improvementPP,
      promotion_gate_pass: parseFloat(accuracy) >= 40,
      regressions: regressionCount,
      improvements: improvementCount,
      results
    }, null, 2));

    console.log(`\n========================================`);
    console.log(`SLICE_8 BENCHMARK RESULTS`);
    console.log(`========================================`);
    console.log(`Cases run: ${results.length}/21`);
    console.log(`Correct: ${correctCount}/${BENCHMARK_CASES.length}`);
    console.log(`Accuracy: ${accuracy}%`);
    console.log(`SLICE_7 Baseline: ${slice7Accuracy}%`);
    console.log(`Improvement: ${improvementPP >= 0 ? '+' : ''}${improvementPP.toFixed(1)}pp`);
    console.log(`Promotion gate (40%): ${parseFloat(accuracy) >= 40 ? "PASS ✓" : "FAIL ✗"}`);
    console.log(`Regressions: ${regressionCount}`);
    console.log(`Improvements: ${improvementCount}`);
    console.log(`\nResults saved to: ${outputPath}`);
  });

  it("SLICE_8 benchmark must have zero regressions", () => {
    expect(regressionCount).toBe(0);
  });

  it("SLICE_8 benchmark must improve at least one case or maintain perfect accuracy", () => {
    // Either improve cases or maintain SLICE_7's accuracy
    const accuracy = (correctCount / BENCHMARK_CASES.length * 100);
    expect(improvementCount >= 1 || accuracy >= slice7Accuracy).toBe(true);
  });

  it("SLICE_8 benchmark accuracy must be >= 38% (no step backward from SLICE_7)", () => {
    const accuracy = (correctCount / BENCHMARK_CASES.length * 100);
    expect(accuracy).toBeGreaterThanOrEqual(slice7Accuracy);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType, ConfidenceLevel } from "@/domain/consulting-engine/types";

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
  slice8Predicted: string;
  slice9Predicted: string;
  slice9Confidence: number;
  correct: boolean;
  changed: boolean;
  regression: boolean;
  improvement: boolean;
  reason: string;
}

describe("STAGE_A_REMEDIATION_SLICE_9: Pattern Rebalancing Benchmark", () => {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();
  let results: BenchmarkResult[] = [];
  let correctCount = 0;
  let improvementCount = 0;
  let regressionCount = 0;
  let slice8Accuracy = 0;

  beforeAll(() => {
    const slice8ResultsPath = "simulation_runs/round_002/stage_a_remediation_slice_8_outputs/SLICE_8_benchmark_validation.json";
    if (!fs.existsSync(slice8ResultsPath)) {
      console.error(`Error: SLICE_8 results not found at ${slice8ResultsPath}`);
      throw new Error(`SLICE_8 benchmark results required`);
    }

    const slice8Results = JSON.parse(fs.readFileSync(slice8ResultsPath, "utf-8"));
    const slice8Map: Record<string, any> = {};
    slice8Results.results.forEach((r: any) => {
      slice8Map[r.caseId] = r;
    });
    slice8Accuracy = slice8Results.accuracy_percent;

    const baseDir = "simulation_runs/round_002/cases";

    for (const caseId of BENCHMARK_CASES) {
      const caseDir = path.join(baseDir, caseId);
      const answerKeyPath = path.join(caseDir, `ANSWER_KEY_${caseId}.json`);
      const caseInputPath = path.join(caseDir, "01_case_input.json");

      if (!fs.existsSync(answerKeyPath) || !fs.existsSync(caseInputPath)) {
        console.error(`SKIP ${caseId}: Missing answer key or case input`);
        continue;
      }

      try {
        const answerKey = JSON.parse(fs.readFileSync(answerKeyPath, "utf-8"));
        const expected = answerKey.root_cause_diagnosis;

        const caseInput = JSON.parse(fs.readFileSync(caseInputPath, "utf-8"));

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

        const synthesized = synthesizer.synthesizeEvidence(evidenceItems);
        const hypotheses = generator.generateHypotheses(synthesized, evidenceItems);

        const slice9Predicted = hypotheses.length > 0
          ? hypotheses[0].rootCause.toString().replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase()
          : "UNKNOWN";

        const slice9Confidence = hypotheses.length > 0 ? hypotheses[0].confidence : 0;

        const isCorrect = slice9Predicted.toLowerCase().replace(/_/g, "_") ===
                          expected.toLowerCase().replace(/_/g, "_");

        if (isCorrect) correctCount++;

        const slice8Data = slice8Map[caseId];
        const slice8Predicted = slice8Data?.slice8Predicted || "UNKNOWN";
        const wasCorrect = slice8Data?.correct || false;

        const changed = slice9Predicted !== slice8Predicted;
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
          slice8Predicted,
          slice9Predicted,
          slice9Confidence,
          correct: isCorrect,
          changed,
          regression,
          improvement,
          reason,
        });

        const status = isCorrect ? "✓" : "✗";
        console.log(`${caseId}: ${status} Expected ${expected}, S8: ${slice8Predicted}, S9: ${slice9Predicted} (${reason}, conf: ${slice9Confidence})`);

      } catch (e) {
        console.error(`ERROR ${caseId}:`, (e as Error).message);
      }
    }

    const outputDir = "simulation_runs/round_002/stage_a_remediation_slice_9_pattern_rebalance_outputs";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const accuracy = (correctCount / BENCHMARK_CASES.length * 100).toFixed(1);
    const improvementPP = parseFloat(accuracy) - slice8Accuracy;

    const outputPath = path.join(outputDir, "SLICE_9_benchmark_validation.json");
    fs.writeFileSync(outputPath, JSON.stringify({
      slice: "SLICE_9",
      timestamp: new Date().toISOString(),
      cases_run: results.length,
      correct: correctCount,
      total: BENCHMARK_CASES.length,
      accuracy_percent: parseFloat(accuracy),
      slice_8_baseline: slice8Accuracy,
      improvement_pp: improvementPP,
      promotion_gate_pass: parseFloat(accuracy) >= 40,
      regressions: regressionCount,
      improvements: improvementCount,
      results
    }, null, 2));

    console.log(`\n========================================`);
    console.log(`SLICE_9 BENCHMARK RESULTS`);
    console.log(`========================================`);
    console.log(`Cases run: ${results.length}/21`);
    console.log(`Correct: ${correctCount}/${BENCHMARK_CASES.length}`);
    console.log(`Accuracy: ${accuracy}%`);
    console.log(`SLICE_8 Baseline: ${slice8Accuracy}%`);
    console.log(`Improvement: ${improvementPP >= 0 ? '+' : ''}${improvementPP.toFixed(1)}pp`);
    console.log(`Promotion gate (40%): ${parseFloat(accuracy) >= 40 ? "PASS ✓" : "FAIL ✗"}`);
    console.log(`Regressions: ${regressionCount}`);
    console.log(`Improvements: ${improvementCount}`);
    console.log(`\nResults saved to: ${outputPath}`);
  });

  it("SLICE_9 pattern rebalancing must have zero regressions", () => {
    expect(regressionCount).toBe(0);
  });

  it("SLICE_9 should improve at least one case OR maintain SLICE_8 accuracy", () => {
    const accuracy = (correctCount / BENCHMARK_CASES.length * 100);
    expect(improvementCount >= 1 || accuracy >= slice8Accuracy).toBe(true);
  });

  it("SLICE_9 must not degrade below SLICE_8 accuracy", () => {
    const accuracy = (correctCount / BENCHMARK_CASES.length * 100);
    expect(accuracy).toBeGreaterThanOrEqual(slice8Accuracy - 0.5); // Allow small rounding differences
  });
});

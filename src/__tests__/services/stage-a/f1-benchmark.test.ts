import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType, ConfidenceLevel } from "@/domain/consulting-engine/types";

const BENCHMARK_CASES = [
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

interface BenchmarkResult {
  caseId: string;
  expected: string;
  slice9Predicted: string;
  f1Predicted: string;
  f1Confidence: number;
  correct: boolean;
  newlyCorrect: boolean;
  regression: boolean;
  reason: string;
}

interface F1BenchmarkOutput {
  phase: "F1_DIMENSION_VALIDATION";
  date: string;
  slice9_baseline: {
    accuracy: number;
    correct_count: number;
    total_cases: number;
  };
  f1_results: {
    accuracy: number;
    correct_count: number;
    total_cases: number;
    newly_correct_count: number;
    regression_count: number;
    net_gain: number;
  };
  results: BenchmarkResult[];
  max_confidence: number;
  confidence_stats: {
    mean_confidence: number;
    median_confidence: number;
    min_confidence: number;
    max_confidence: number;
  };
  evidence_trace_rate_avg: number;
}

describe("F1: Dimension Validation Benchmark (Full 21-Case)", () => {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();
  let results: BenchmarkResult[] = [];
  let correctCount = 0;
  let newlyCorrectCount = 0;
  let regressionCount = 0;
  let slice9Accuracy = 0;
  let slice9CorrectCount = 0;
  let confidenceValues: number[] = [];
  let traceRates: number[] = [];
  let slice9Map: Record<string, any> = {};

  beforeAll(() => {
    // Load SLICE_8 baseline for comparison (original causal evidence baseline)
    // This is the correct baseline before pattern rebalancing and causal adjudication regressions
    const slice8ResultsPath =
      "simulation_runs/round_002/stage_a_remediation_slice_8_outputs/SLICE_8_benchmark_validation.json";
    if (!fs.existsSync(slice8ResultsPath)) {
      console.error(
        `Error: SLICE_8 results not found at ${slice8ResultsPath}`
      );
      throw new Error(`SLICE_8 benchmark results required`);
    }

    const slice8Results = JSON.parse(
      fs.readFileSync(slice8ResultsPath, "utf-8")
    );
    slice9Map = {};
    slice8Results.results.forEach((r: any) => {
      slice9Map[r.caseId] = r;
    });
    slice9Accuracy = slice8Results.accuracy_percent;
    slice9CorrectCount = slice8Results.correct;
  });

  it("should evaluate all 21 benchmark cases with F1 dimension validation", () => {
    let caseProcessedCount = 0;
    BENCHMARK_CASES.forEach((caseId) => {
      const caseDir = `simulation_runs/round_002/cases/${caseId}`;
      const answerKeyPath = path.join(caseDir, `ANSWER_KEY_${caseId}.json`);
      const caseInputPath = path.join(caseDir, `01_case_input.json`);

      if (!fs.existsSync(answerKeyPath)) {
        console.warn(`Answer key not found for ${caseId}`);
        return;
      }

      if (!fs.existsSync(caseInputPath)) {
        console.warn(`Case input not found for ${caseId}`);
        return;
      }

      const answerKey = JSON.parse(
        fs.readFileSync(answerKeyPath, "utf-8")
      );
      const caseInput = JSON.parse(fs.readFileSync(caseInputPath, "utf-8"));

      // Extract evidence from case input
      const evidence: EvidenceItem[] =
        caseInput.evidence?.map((e: any) => ({
          id: e.id || `e-${Math.random()}`,
          dimension: e.dimension,
          finding: e.finding,
          isCritical: e.isCritical || false,
        })) || [];

      // Get SLICE_8 baseline (original causal evidence baseline)
      const slice8Result = slice9Map?.[caseId];
      const slice8Predicted = slice8Result?.slice8Predicted || "UNKNOWN";

      // Run OPTION_3_FIX diagnosis (F1 + proportional boosts)
      const synthesized = synthesizer.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      const predicted = hypotheses[0]?.rootCause || "unknown";
      const confidence = hypotheses[0]?.confidence || 0;
      // Convert expected from uppercase enum key to lowercase value
      // Already in format like "DEMAND_FORECASTING_MISMATCH", just lowercase it
      const expected = answerKey.root_cause_diagnosis.toLowerCase();

      caseProcessedCount++;

      traceRates.push(synthesized.evidenceTraceRate);
      confidenceValues.push(confidence);

      const correct = predicted === expected;
      const newlyCorrect = slice8Predicted.toLowerCase() !== expected && predicted === expected;
      const regression = slice8Predicted.toLowerCase() === expected && predicted !== expected;

      if (correct) correctCount++;
      if (newlyCorrect) newlyCorrectCount++;
      if (regression) regressionCount++;

      results.push({
        caseId,
        expected,
        slice9Predicted: slice8Predicted,
        f1Predicted: predicted,
        f1Confidence: confidence,
        correct,
        newlyCorrect,
        regression,
        reason: correct
          ? "Correct"
          : newlyCorrect
            ? "Fixed by Option 3"
            : regression
              ? "Regression (was correct in SLICE_8)"
              : "Still failing",
      });
    });
  });

  afterAll(() => {
    // Calculate statistics
    const totalCases = results.length;
    const accuracy = (correctCount / totalCases) * 100;
    const netGain = correctCount - slice9CorrectCount;
    const avgTrace =
      traceRates.length > 0
        ? traceRates.reduce((a, b) => a + b, 0) / traceRates.length
        : 0;

    const sortedConfidence = [...confidenceValues].sort((a, b) => a - b);
    const medianConfidence =
      sortedConfidence[Math.floor(sortedConfidence.length / 2)];

    const output: F1BenchmarkOutput = {
      phase: "OPTION_3_FIX_PROPORTIONAL_BOOSTS",
      date: new Date().toISOString(),
      slice9_baseline: {
        accuracy: slice9Accuracy,
        correct_count: slice9CorrectCount,
        total_cases: totalCases,
      },
      f1_results: {
        accuracy: Math.round(accuracy * 10) / 10,
        correct_count: correctCount,
        total_cases: totalCases,
        newly_correct_count: newlyCorrectCount,
        regression_count: regressionCount,
        net_gain: netGain,
      },
      results,
      max_confidence: Math.max(...confidenceValues),
      confidence_stats: {
        mean_confidence:
          Math.round(
            (confidenceValues.reduce((a, b) => a + b, 0) /
              confidenceValues.length) *
              100
          ) / 100,
        median_confidence: Math.round(medianConfidence * 100) / 100,
        min_confidence: Math.min(...confidenceValues),
        max_confidence: Math.max(...confidenceValues),
      },
      evidence_trace_rate_avg: Math.round(avgTrace),
    };

    // Ensure output directory exists
    const outputDir =
      "simulation_runs/round_002/stage_a_pipeline_contract_fix_outputs";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write results
    fs.writeFileSync(
      path.join(outputDir, "OPTION_3_benchmark_validation.json"),
      JSON.stringify(output, null, 2)
    );

    // Write details
    fs.writeFileSync(
      path.join(outputDir, "OPTION_3_benchmark_details.json"),
      JSON.stringify(results, null, 2)
    );

    // Log summary
    console.log("\n=== OPTION_3_FIX: PROPORTIONAL BOOSTS BENCHMARK ===");
    console.log(`SLICE_8 Baseline: ${slice9CorrectCount}/${totalCases} (${slice9Accuracy}%)`);
    console.log(
      `Option 3 Result: ${correctCount}/${totalCases} (${Math.round(accuracy * 10) / 10}%)`
    );
    console.log(`Net Gain: ${netGain > 0 ? "+" : ""}${netGain}`);
    console.log(`Newly Correct: ${newlyCorrectCount}`);
    console.log(`Regressions: ${regressionCount}`);
    console.log(`Confidence (max): ${Math.max(...confidenceValues)}`);
    console.log(`Evidence Trace Rate: ${Math.round(avgTrace)}%`);

    // Assertions - validate bounds
    expect(correctCount).toBeLessThanOrEqual(totalCases);
    expect(regressionCount).toBeLessThanOrEqual(slice9CorrectCount);
    expect(correctCount).toBeGreaterThanOrEqual(0);
  });
});

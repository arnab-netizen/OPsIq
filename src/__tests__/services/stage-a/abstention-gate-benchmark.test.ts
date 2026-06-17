import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem } from "@/domain/consulting-engine/types";

/**
 * STAGE_A_ABSTENTION_GATE benchmark.
 * Runs all 21 Round-2 cases through the production pipeline and scores
 * abstention-aware: an INSUFFICIENT_EVIDENCE prediction is correct only when the
 * answer key's ground truth is INSUFFICIENT_EVIDENCE.
 *
 * Writes to simulation_runs/round_002/stage_a_abstention_gate_outputs/ (new dir;
 * does NOT overwrite prior slice outputs).
 */

const CASES = [
  "BLND-006", "BLND-007", "BLND-008", "BLND-009", "BLND-010",
  "ADV-011", "ADV-012", "ADV-013", "ADV-014",
  "RW-016", "RW-018", "RW-020", "RW-022", "RW-024",
  "PD-011", "PD-013", "PD-015", "PD-017", "PD-019",
  "SYN-011", "SYN-013",
];

// The 10 cases that were valid-correct after the mapping fix (must not regress).
const VALID_CORRECT_BEFORE = new Set([
  "BLND-006", "BLND-007", "BLND-010", "RW-018", "RW-020",
  "PD-011", "PD-013", "PD-015", "PD-017", "SYN-011",
]);

function loadCase(caseId: string) {
  const caseDir = `simulation_runs/round_002/cases/${caseId}`;
  const answerKey = JSON.parse(
    fs.readFileSync(path.join(caseDir, `ANSWER_KEY_${caseId}.json`), "utf-8")
  );
  const caseInput = JSON.parse(
    fs.readFileSync(path.join(caseDir, `01_case_input.json`), "utf-8")
  );
  const evidence: EvidenceItem[] = (caseInput.evidence || []).map((e: any) => ({
    id: e.id || `e-${Math.random()}`,
    dimension: e.dimension,
    finding: e.finding,
    isCritical: e.isCritical || false,
  }));
  return { expected: answerKey.root_cause_diagnosis.toLowerCase(), evidence };
}

describe("STAGE_A_ABSTENTION_GATE: Benchmark (21 cases)", () => {
  const synthesizer = new EvidenceSynthesisEngine();
  const generator = new HypothesisGenerator();

  const results = CASES.map((caseId) => {
    const { expected, evidence } = loadCase(caseId);
    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);
    const predicted = hypotheses[0]?.rootCause?.toLowerCase() || "unknown";
    const confidence = hypotheses[0]?.confidence || 0;
    const isAbstention = predicted === "insufficient_evidence";
    const correct = predicted === expected;
    return {
      caseId, expected, predicted, confidence, isAbstention, correct,
      traceRate: synthesized.evidenceTraceRate,
    };
  });

  it("writes abstention-gate benchmark output", () => {
    const correct = results.filter((r) => r.correct).length;
    const correctAbstentions = results.filter(
      (r) => r.isAbstention && r.expected === "insufficient_evidence"
    ).length;
    const wrongAbstentions = results.filter(
      (r) => r.isAbstention && r.expected !== "insufficient_evidence"
    ).length;
    const falseHighConfWrong = results.filter(
      (r) => !r.correct && !r.isAbstention && r.confidence >= 50
    );
    const maxConf = Math.max(...results.map((r) => r.confidence));
    const avgConf =
      results.reduce((s, r) => s + r.confidence, 0) / results.length;
    const avgTrace =
      results.reduce((s, r) => s + r.traceRate, 0) / results.length;

    const dist: Record<string, number> = {};
    results.forEach((r) => (dist[r.predicted] = (dist[r.predicted] || 0) + 1));

    const summary = {
      gate: "STAGE_A_ABSTENTION_GATE",
      timestamp: new Date().toISOString(),
      cases_run: results.length,
      correct,
      accuracy_percent: Number(((correct / results.length) * 100).toFixed(1)),
      mapping_fix_baseline_correct: 10,
      mapping_fix_baseline_accuracy: 47.6,
      abstention_count: results.filter((r) => r.isAbstention).length,
      correct_abstentions: correctAbstentions,
      wrong_abstentions: wrongAbstentions,
      false_high_confidence_wrong: falseHighConfWrong.map((r) => ({
        caseId: r.caseId, predicted: r.predicted, confidence: r.confidence,
      })),
      max_confidence: maxConf,
      avg_confidence: Number(avgConf.toFixed(2)),
      avg_trace_rate: Number(avgTrace.toFixed(1)),
      diagnosis_distribution: dist,
      results,
    };

    const outDir = "simulation_runs/round_002/stage_a_abstention_gate_outputs";
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "ABSTENTION_GATE_benchmark_validation.json"),
      JSON.stringify(summary, null, 2)
    );

    expect(summary.cases_run).toBe(21);
  });

  it("achieves at least the 10/21 mapping-fix baseline (abstention-aware)", () => {
    const correct = results.filter((r) => r.correct).length;
    expect(correct).toBeGreaterThanOrEqual(10);
  });

  it("does not regress any of the 10 valid-correct cases to abstention", () => {
    const regressed = results.filter(
      (r) => VALID_CORRECT_BEFORE.has(r.caseId) && !r.correct
    );
    expect(regressed).toEqual([]);
  });

  it("only abstains when ground truth is insufficient_evidence OR the case was already wrong", () => {
    // No abstention may convert a previously valid-correct case.
    const badAbstentions = results.filter(
      (r) => r.isAbstention && VALID_CORRECT_BEFORE.has(r.caseId)
    );
    expect(badAbstentions).toEqual([]);
  });

  it("preserves confidence cap (<=65) and abstention low confidence", () => {
    results.forEach((r) => expect(r.confidence).toBeLessThanOrEqual(65));
    results
      .filter((r) => r.isAbstention)
      .forEach((r) => expect(r.confidence).toBeLessThanOrEqual(40));
  });

  it("preserves evidence traceability (>=85% average)", () => {
    const avgTrace =
      results.reduce((s, r) => s + r.traceRate, 0) / results.length;
    expect(avgTrace).toBeGreaterThanOrEqual(85);
  });
});

import { describe, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem } from "@/domain/consulting-engine/types";

/**
 * MAPPING_FIX_ALL21_TRACE_DIAGNOSTIC
 *
 * Read-only diagnostic harness that logs exact scoring contributions for ALL 21 benchmark cases
 * (not just the 13 failing ones). Used for deep validation of the diagnosis mapping fix.
 *
 * Does NOT modify production code, does NOT change benchmark results, does NOT change scoring.
 * Output: simulation_runs/round_002/stage_a_diagnosis_mapping_fix_outputs/ALL21_POST_FIX_TRACE.json
 */

describe("MAPPING_FIX_ALL21_TRACE_DIAGNOSTIC - Read-only", () => {
  const synthesizer = new EvidenceSynthesisEngine();
  const generator = new HypothesisGenerator();

  const ALL_CASES = [
    "BLND-006", "BLND-007", "BLND-008", "BLND-009", "BLND-010",
    "ADV-011", "ADV-012", "ADV-013", "ADV-014",
    "RW-016", "RW-018", "RW-020", "RW-022", "RW-024",
    "PD-011", "PD-013", "PD-015", "PD-017", "PD-019",
    "SYN-011", "SYN-013",
  ];

  it("traces all 21 cases (read-only)", () => {
    const traceLog: any[] = [];

    ALL_CASES.forEach((caseId) => {
      const caseDir = `simulation_runs/round_002/cases/${caseId}`;
      const answerKeyPath = path.join(caseDir, `ANSWER_KEY_${caseId}.json`);
      const caseInputPath = path.join(caseDir, `01_case_input.json`);

      if (!fs.existsSync(answerKeyPath) || !fs.existsSync(caseInputPath)) {
        traceLog.push({ caseId, error: "files_not_found" });
        return;
      }

      const answerKey = JSON.parse(fs.readFileSync(answerKeyPath, "utf-8"));
      const caseInput = JSON.parse(fs.readFileSync(caseInputPath, "utf-8"));

      const evidence: EvidenceItem[] = (caseInput.evidence || []).map((e: any) => ({
        id: e.id || `e-${Math.random()}`,
        dimension: e.dimension,
        finding: e.finding,
        isCritical: e.isCritical || false,
      }));

      const expected = answerKey.root_cause_diagnosis.toLowerCase();
      const synthesized = synthesizer.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      const winner = hypotheses[0];
      const correctHyp = hypotheses.find(
        (h) => h.rootCause.toLowerCase() === expected
      );

      traceLog.push({
        caseId,
        groundTruth: expected,
        predicted: winner?.rootCause?.toLowerCase() || "unknown",
        correct: (winner?.rootCause?.toLowerCase() || "unknown") === expected,
        winnerConfidence: winner?.confidence || 0,
        runnerUpDiagnosis: hypotheses[1]?.rootCause?.toLowerCase() || null,
        runnerUpConfidence: hypotheses[1]?.confidence || 0,
        marginOfVictory: (winner?.confidence || 0) - (hypotheses[1]?.confidence || 0),
        correctDiagnosisGenerated: !!correctHyp,
        correctDiagnosisRank: hypotheses.findIndex(
          (h) => h.rootCause.toLowerCase() === expected
        ) + 1,
        correctDiagnosisConfidence: correctHyp?.confidence || 0,
        evidenceDimensions: Array.from(new Set(evidence.map((e) => e.dimension))),
        patterns: synthesized.patterns.map((p) => ({
          name: p.name,
          patternStrength: p.patternStrength,
          potentialRootCauses: p.potentialRootCauses,
          supportingItemCount: p.supportingItems.length,
        })),
        allHypotheses: hypotheses.map((h, idx) => ({
          rank: idx + 1,
          diagnosis: h.rootCause,
          confidence: h.confidence,
          patternCount: h.patternCount,
          patternStrengthSum: h.patternStrengthSum,
          supportingEvidenceCount: h.supportingEvidenceCount,
        })),
        evidenceTraceRate: synthesized.evidenceTraceRate,
      });
    });

    const outDir = "simulation_runs/round_002/stage_a_diagnosis_mapping_fix_outputs";
    fs.writeFileSync(
      path.join(outDir, "ALL21_POST_FIX_TRACE.json"),
      JSON.stringify(traceLog, null, 2)
    );

    const correct = traceLog.filter((t) => t.correct).length;
    console.log(`ALL21 trace complete. Correct: ${correct}/21`);
  });
});

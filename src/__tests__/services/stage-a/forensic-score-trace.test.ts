import { describe, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

/**
 * FORENSIC_SCORE_TRACE_DIAGNOSTIC
 * 
 * Read-only diagnostic harness that logs exact scoring contributions for all 13 failing cases.
 * Does NOT modify production code, does NOT change benchmark results.
 * Captures: base confidence, adjustments, pattern strength, keyword boost, specificity, causal, etc.
 * 
 * Output: FORENSIC_SCORE_TRACE_LOGS.json with exact numeric scores per case
 */

describe("FORENSIC_SCORE_TRACE_DIAGNOSTIC - Exact Score Logging", () => {
  const synthesizer = new EvidenceSynthesisEngine();
  const generator = new HypothesisGenerator();

  // The 13 failing cases to trace
  const FAILING_CASES = [
    "BLND-006", "BLND-008", "BLND-009", "BLND-010",
    "ADV-011", "ADV-012", "ADV-013", "ADV-014",
    "RW-016", "RW-022", "RW-024",
    "PD-019",
    "SYN-013"
  ];

  it("should trace exact scores for all 13 failing cases", () => {
    const traceLog: any[] = [];

    FAILING_CASES.forEach((caseId) => {
      const caseDir = `simulation_runs/round_002/cases/${caseId}`;
      const answerKeyPath = path.join(caseDir, `ANSWER_KEY_${caseId}.json`);
      const caseInputPath = path.join(caseDir, `01_case_input.json`);

      if (!fs.existsSync(answerKeyPath) || !fs.existsSync(caseInputPath)) {
        console.log(`SKIP: ${caseId} - files not found`);
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

      // Synthesize evidence to get patterns
      const synthesized = synthesizer.synthesizeEvidence(evidence);

      // Generate hypotheses
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      // Log exact scores for this case
      const caseTrace = {
        caseId,
        groundTruth: expected,
        expectedDiagnosis: expected,
        predictedDiagnosis: hypotheses[0]?.rootCause?.toLowerCase() || "unknown",
        correct: (hypotheses[0]?.rootCause?.toLowerCase() || "unknown") === expected,
        
        // Pattern details
        patternsGenerated: synthesized.patterns.map((p) => ({
          name: p.name,
          patternStrength: p.patternStrength || 1,
          supportingItems: p.supportingItems,
          potentialRootCauses: p.potentialRootCauses,
        })),

        // Top 3 hypotheses with full scoring details
        allHypotheses: hypotheses.map((h, idx) => ({
          rank: idx + 1,
          diagnosis: h.rootCause,
          confidence: h.confidence,
          supportingEvidenceCount: h.supportingEvidenceCount,
          conflictingEvidenceCount: h.conflictingEvidenceCount,
          patternCount: h.patternCount,
          patternStrengthSum: h.patternStrengthSum,
          evidenceDiversity: h.evidenceDiversity,
          causalEvidenceFound: h.causalEvidenceFound,
          reasoning: h.reasoning,
        })),

        // Correct diagnosis analysis
        correctDiagnosisGenerated: hypotheses.some((h) => h.rootCause.toLowerCase() === expected),
        correctDiagnosisRank: hypotheses.findIndex((h) => h.rootCause.toLowerCase() === expected) + 1,
        correctDiagnosisConfidence: hypotheses.find((h) => h.rootCause.toLowerCase() === expected)?.confidence || 0,

        // Winner analysis
        winnerDiagnosis: hypotheses[0]?.rootCause,
        winnerConfidence: hypotheses[0]?.confidence || 0,

        // Score gap
        scoreGap: (hypotheses[0]?.confidence || 0) - (hypotheses.find((h) => h.rootCause.toLowerCase() === expected)?.confidence || 0),

        // Evidence details
        evidenceCount: evidence.length,
        evidenceDimensions: Array.from(new Set(evidence.map((e) => e.dimension))),
        criticalEvidence: evidence.filter((e) => e.isCritical),
      };

      traceLog.push(caseTrace);

      console.log(`\n=== ${caseId} ===`);
      console.log(`Expected: ${expected}`);
      console.log(`Predicted: ${caseTrace.predictedDiagnosis}`);
      console.log(`Winner Confidence: ${caseTrace.winnerConfidence}`);
      console.log(`Correct Diagnosis Generated: ${caseTrace.correctDiagnosisGenerated}`);
      if (caseTrace.correctDiagnosisGenerated) {
        console.log(`Correct Diagnosis Confidence: ${caseTrace.correctDiagnosisConfidence}`);
        console.log(`Score Gap: ${caseTrace.scoreGap}`);
      }
      console.log(`Patterns Generated: ${caseTrace.patternsGenerated.length}`);
    });

    // Write detailed log
    const outputPath = "simulation_runs/round_002/forensic_score_traces/FORENSIC_SCORE_TRACE_LOGS.json";
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(traceLog, null, 2));

    console.log(`\n\nFull trace logs written to: ${outputPath}`);
    console.log(`Cases traced: ${traceLog.length}`);

    // Summary statistics
    const correctlyGenerated = traceLog.filter((t) => t.correctDiagnosisGenerated).length;
    const correctlyPredicted = traceLog.filter((t) => t.correct).length;

    console.log(`\nSUMMARY:`);
    console.log(`Total cases: ${traceLog.length}`);
    console.log(`Correct diagnosis generated: ${correctlyGenerated}/${traceLog.length}`);
    console.log(`Correct diagnosis predicted: ${correctlyPredicted}/${traceLog.length}`);
    console.log(`Average score gap (correct vs winner): ${(traceLog.reduce((sum, t) => sum + Math.abs(t.scoreGap), 0) / traceLog.length).toFixed(2)}`);
  });
});

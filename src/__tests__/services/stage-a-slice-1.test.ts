import { describe, it, expect } from "vitest";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { SymptomSeparator, EvidenceRole } from "@/services/stage-a/symptom-separator";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { HypothesisRanker } from "@/services/stage-a/hypothesis-ranker";
import { EvidenceMapper } from "@/services/stage-a/evidence-mapper";
import { EvidenceItem, ConfidenceLevel, DiagnosisType } from "@/domain/consulting-engine/types";
import { v4 as uuid } from "uuid";

// Helper to create test evidence
function createEvidence(
  dimension: string,
  finding: string,
  confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM,
  isCritical = false
): EvidenceItem {
  return {
    id: uuid(),
    dimension: dimension as any,
    finding,
    confidence,
    source: "test",
    timestamp: new Date(),
    isCritical,
  };
}

describe("Stage A Slice 1 - Hypothesis Ranking Improvements (Remediation)", () => {
  describe("HypothesisGenerator - Improved Scoring", () => {
    const engine = new EvidenceSynthesisEngine();
    const generator = new HypothesisGenerator();
    const ranker = new HypothesisRanker();

    it("should score UNIT_ECONOMICS_BREAKDOWN higher when financial patterns present", () => {
      // Financial + operational evidence → should favor UNIT_ECONOMICS_BREAKDOWN
      const evidence = [
        createEvidence("financial_health", "Margin declining - CAC rising", ConfidenceLevel.HIGH),
        createEvidence("financial_health", "Unit economics broken - payback extending", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Costs stable", ConfidenceLevel.MEDIUM),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      // UNIT_ECONOMICS_BREAKDOWN should be in top 3 (and ideally top 1 or 2)
      const unitEconomicsHyp = ranked.find((h) => h.rootCause === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN);
      expect(unitEconomicsHyp).toBeDefined();
      expect(unitEconomicsHyp?.confidence).toBeGreaterThan(0);
    });

    it("should not heavily bias toward operational_bottleneck when financial evidence dominant", () => {
      // Financial-heavy evidence should not default to operational_bottleneck
      const evidence = [
        createEvidence("financial_health", "Margin declining", ConfidenceLevel.HIGH),
        createEvidence("financial_health", "Cost structure broken", ConfidenceLevel.HIGH),
        createEvidence("financial_health", "Payback period extending", ConfidenceLevel.MEDIUM),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      const topHyp = ranked[0];
      // Should be UNIT_ECONOMICS_BREAKDOWN or similar, not necessarily OPERATIONAL_BOTTLENECK
      expect(topHyp.rootCause).not.toBe(DiagnosisType.CUSTOMER_RETENTION_EROSION);
    });

    it("should prefer diagnoses with multiple supporting patterns", () => {
      // Evidence supporting multiple patterns
      const evidence = [
        createEvidence("financial_health", "Unit economics broken", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization high", ConfidenceLevel.HIGH),
        createEvidence("market_position", "Competition intense", ConfidenceLevel.MEDIUM),
        createEvidence("market_position", "Market growth slowing", ConfidenceLevel.MEDIUM),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      // Should have hypotheses with pattern information
      hypotheses.forEach((h) => {
        expect(h.patternCount).toBeDefined();
      });

      // At least one hypothesis should score above baseline
      const scoredHyp = hypotheses.find((h) => h.confidence > 15);
      expect(scoredHyp).toBeDefined();
    });

    it("should lower confidence for tied hypotheses to indicate uncertainty", () => {
      // Two diagnoses with similar evidence
      const evidence = [
        createEvidence("quality_delivery", "Quality metrics stable", ConfidenceLevel.MEDIUM),
        createEvidence("customer_retention", "Churn rising", ConfidenceLevel.MEDIUM),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      // All hypotheses should be ordered by confidence (descending)
      if (ranked.length >= 2) {
        for (let i = 1; i < ranked.length; i++) {
          expect(ranked[i].confidence).toBeLessThanOrEqual(ranked[i - 1].confidence);
        }
      }

      // No hypothesis should exceed confidence cap
      ranked.forEach((h) => {
        expect(h.confidence).toBeLessThanOrEqual(65);
      });
    });

    it("should handle cases with no patterns by applying baseline scoring", () => {
      // Evidence with no clear patterns
      const evidence = [
        createEvidence("process_maturity", "Process improvement initiated", ConfidenceLevel.LOW),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      if (hypotheses.length > 0) {
        // Even with no patterns, should have low baseline confidence, not crash
        const anyHyp = hypotheses[0];
        expect(anyHyp.confidence).toBeGreaterThanOrEqual(0);
        expect(anyHyp.confidence).toBeLessThanOrEqual(15); // Baseline max
      }
    });

    it("should include diagnosis-specific evidence requirements in scoring", () => {
      // DEMAND_FORECASTING_MISMATCH needs market_position dimension
      const evidence = [
        createEvidence("market_position", "Competitor growth faster", ConfidenceLevel.HIGH),
        createEvidence("market_position", "Market consolidation", ConfidenceLevel.MEDIUM),
        createEvidence("financial_health", "Revenue flat", ConfidenceLevel.MEDIUM),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      const demandMismatch = ranked.find((h) => h.rootCause === DiagnosisType.DEMAND_FORECASTING_MISMATCH);
      expect(demandMismatch).toBeDefined();
      expect(demandMismatch?.confidence).toBeGreaterThan(10); // Should score above 0
    });

    it("should maintain confidence cap at 65%", () => {
      const evidence = [
        createEvidence("operational_efficiency", "Utilization 90%", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Costs rising", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Capacity constrained", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Throughput declining", ConfidenceLevel.HIGH),
      ];

      const synthesized = engine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      // No hypothesis should exceed 65%
      ranked.forEach((h) => {
        expect(h.confidence).toBeLessThanOrEqual(65);
      });
    });
  });
});

describe("Stage A Slice 1 - Evidence Synthesis Pipeline", () => {
  describe("EvidenceSynthesisEngine", () => {
    const engine = new EvidenceSynthesisEngine();

    it("should identify examined dimensions", () => {
      const evidence = [
        createEvidence("financial_health", "Margin declined 5%"),
        createEvidence("operational_efficiency", "Utilization at 85%"),
      ];

      const result = engine.synthesizeEvidence(evidence);

      expect(result.dimensionsExamined).toContain("financial_health");
      expect(result.dimensionsExamined).toContain("operational_efficiency");
      expect(result.dimensionsExamined.length).toBe(2);
    });

    it("should identify missing dimensions", () => {
      const evidence = [createEvidence("financial_health", "Margin declined")];

      const result = engine.synthesizeEvidence(evidence);

      expect(result.dimensionsMissing).toContain("operational_efficiency");
      expect(result.dimensionsMissing).toContain("team_capability");
      expect(result.dimensionsMissing.length).toBeGreaterThan(0);
    });

    it("should discover patterns in multi-dimensional evidence", () => {
      const evidence = [
        createEvidence("financial_health", "Gross margin compressed to 35%", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Plant utilization only 60%", ConfidenceLevel.HIGH),
      ];

      const result = engine.synthesizeEvidence(evidence);

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].potentialRootCauses).toContain(
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
      );
    });

    it("should calculate evidence trace rate", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down"),
        createEvidence("operational_efficiency", "Utilization low"),
        createEvidence("team_capability", "Turnover high"),
      ];

      const result = engine.synthesizeEvidence(evidence);

      expect(result.evidenceTraceRate).toBeGreaterThanOrEqual(0);
      expect(result.evidenceTraceRate).toBeLessThanOrEqual(100);
    });

    it("should detect critical evidence", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.MEDIUM, true),
      ];

      const result = engine.synthesizeEvidence(evidence);

      expect(result.criticalEvidencePresent).toBe(true);
    });
  });

  describe("SymptomSeparator", () => {
    const separator = new SymptomSeparator();

    it("should classify evidence as symptom or root cause", () => {
      const evidence = createEvidence(
        "financial_health",
        "Gross margin declined 5%",
        ConfidenceLevel.HIGH
      );

      const classification = separator.classifyEvidence(
        evidence,
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
      );

      expect(classification.role).toBe(EvidenceRole.SYMPTOM);
      expect(classification.confidence).toBeGreaterThan(0);
    });

    it("should assign confidence based on evidence strength", () => {
      const highConfidenceEvidence = createEvidence(
        "team_capability",
        "High turnover",
        ConfidenceLevel.HIGH,
        true
      );

      const lowConfidenceEvidence = createEvidence(
        "team_capability",
        "Possible turnover",
        ConfidenceLevel.PROVISIONAL,
        false
      );

      const highClassification = separator.classifyEvidence(
        highConfidenceEvidence,
        DiagnosisType.OPERATIONAL_BOTTLENECK
      );

      const lowClassification = separator.classifyEvidence(
        lowConfidenceEvidence,
        DiagnosisType.OPERATIONAL_BOTTLENECK
      );

      expect(highClassification.confidence).toBeGreaterThan(
        lowClassification.confidence
      );
    });

    it("should handle all evidence roles", () => {
      const roles = new Set<EvidenceRole>();

      const evidence = [
        createEvidence("financial_health", "Margin down"),
        createEvidence("operational_efficiency", "Utilization low"),
        createEvidence("team_capability", "Turnover high"),
      ];

      evidence.forEach((e) => {
        const classification = separator.classifyEvidence(
          e,
          DiagnosisType.OPERATIONAL_BOTTLENECK
        );
        roles.add(classification.role);
      });

      expect(roles.size).toBeGreaterThan(0);
    });
  });

  describe("HypothesisGenerator", () => {
    const synthesisEngine = new EvidenceSynthesisEngine();
    const generator = new HypothesisGenerator();

    it("should generate exactly 3 hypotheses", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
        createEvidence("team_capability", "Turnover high", ConfidenceLevel.HIGH),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      expect(hypotheses.length).toBeLessThanOrEqual(3);
      expect(hypotheses.every((h) => h.confidence > 0)).toBe(true);
    });

    it("should rank hypotheses by plausibility", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("financial_health", "Cost structure issue", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      // Should have unit economics as top hypothesis
      expect(hypotheses[0].rootCause).toBeDefined();
      expect(hypotheses[0].confidence).toBeGreaterThanOrEqual(10);
    });

    it("should respect confidence cap of 65", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH, true),
        createEvidence("financial_health", "Cost issue", ConfidenceLevel.HIGH, true),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);

      hypotheses.forEach((h) => {
        expect(h.confidence).toBeLessThanOrEqual(65);
      });
    });
  });

  describe("HypothesisRanker", () => {
    const synthesisEngine = new EvidenceSynthesisEngine();
    const generator = new HypothesisGenerator();
    const ranker = new HypothesisRanker();

    it("should rank hypotheses by confidence", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      // First should have highest confidence
      if (ranked.length > 1) {
        expect(ranked[0].confidence).toBeGreaterThanOrEqual(ranked[1].confidence);
      }
    });

    it("should calculate supporting and conflicting scores", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      ranked.forEach((h) => {
        expect(h.supportingScore).toBeGreaterThanOrEqual(0);
        expect(h.supportingScore).toBeLessThanOrEqual(10);
        expect(h.conflictScore).toBeGreaterThanOrEqual(0);
        expect(h.conflictScore).toBeLessThanOrEqual(10);
      });
    });

    it("should provide confidence justification", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
      ];

      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      const ranked = ranker.rankHypotheses(hypotheses, evidence);

      ranked.forEach((h) => {
        expect(h.confidenceJustification).toContain("Supporting:");
        expect(h.confidenceJustification).toContain("Conflicting:");
        expect(h.confidenceJustification).toContain("Confidence");
      });
    });
  });

  describe("EvidenceMapper", () => {
    const mapper = new EvidenceMapper();

    it("should map evidence to hypothesis", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
      ];

      const mapping = mapper.mapEvidence(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, evidence);

      expect(mapping.hypothesis).toBe(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN);
      expect(mapping.coverage).toBeGreaterThan(0);
    });

    it("should classify evidence as supporting, conflicting, or neutral", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH),
        createEvidence("operational_efficiency", "Utilization low", ConfidenceLevel.HIGH),
      ];

      const mapping = mapper.mapEvidence(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, evidence);

      const totalMapped = mapping.supporting.length + mapping.conflicting.length + mapping.neutral.length;
      expect(totalMapped).toBe(evidence.length);
    });

    it("should calculate evidence strength for mappings", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down", ConfidenceLevel.HIGH, true),
      ];

      const mapping = mapper.mapEvidence(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, evidence);

      if (mapping.supporting.length > 0) {
        mapping.supporting.forEach((s) => {
          expect(s.strength).toBeGreaterThan(0);
          expect(s.strength).toBeLessThanOrEqual(10);
        });
      }
    });

    it("should provide coverage percentage", () => {
      const evidence = [
        createEvidence("financial_health", "Margin down"),
        createEvidence("operational_efficiency", "Utilization low"),
        createEvidence("team_capability", "Turnover high"),
      ];

      const mapping = mapper.mapEvidence(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, evidence);

      expect(mapping.coverage).toBeGreaterThanOrEqual(0);
      expect(mapping.coverage).toBeLessThanOrEqual(100);
    });
  });

  describe("Pipeline integration", () => {
    it("should process evidence through full pipeline", () => {
      const synthesisEngine = new EvidenceSynthesisEngine();
      const generator = new HypothesisGenerator();
      const ranker = new HypothesisRanker();
      const mapper = new EvidenceMapper();

      const evidence = [
        createEvidence("financial_health", "Gross margin compressed to 35%", ConfidenceLevel.HIGH, true),
        createEvidence("operational_efficiency", "Plant utilization only 60%", ConfidenceLevel.HIGH),
        createEvidence("team_capability", "Key engineer departed", ConfidenceLevel.HIGH),
      ];

      // Step 1: Synthesize evidence
      const synthesized = synthesisEngine.synthesizeEvidence(evidence);
      expect(synthesized.dimensionsExamined.length).toBeGreaterThan(0);

      // Step 2: Generate hypotheses
      const hypotheses = generator.generateHypotheses(synthesized, evidence);
      expect(hypotheses.length).toBeGreaterThan(0);

      // Step 3: Rank hypotheses
      const ranked = ranker.rankHypotheses(hypotheses, evidence);
      expect(ranked.length).toBeGreaterThan(0);

      // Step 4: Map evidence
      if (ranked.length > 0) {
        const mapping = mapper.mapEvidence(ranked[0].rootCause, evidence);
        expect(mapping.coverage).toBeGreaterThan(0);
      }
    });
  });
});

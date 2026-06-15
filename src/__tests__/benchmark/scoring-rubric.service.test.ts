/**
 * B20-S1: Consultant-Grade Scoring Rubrics — Unit Tests
 *
 * Tests scoring rubrics, fail gates, and recommendation evaluation.
 */

import {
  RUBRIC_DEFINITIONS,
  scoreRubricDimension,
  checkFailGates,
  scoreRecommendation,
  scoreMultipleRecommendations,
  validateScoringResult,
  type Recommendation,
  type RubricDimension,
} from "@/domain/benchmark/scoring-rubric";
import {
  getAllSampleRecommendations,
  getSampleRecommendation,
  scoreRecommendationWithRubric,
  scoreSampleRecommendations,
  getRubricDefinition,
  compareRecommendations,
} from "@/services/benchmark/scoring-rubric.service";

describe("B20-S1 — Consultant-Grade Scoring Rubrics", () => {
  describe("Rubric Definitions", () => {
    it("should have exactly 10 dimensions", () => {
      const dimensions = Object.keys(RUBRIC_DEFINITIONS);
      expect(dimensions).toHaveLength(10);
    });

    it("should have all required dimensions", () => {
      const required: RubricDimension[] = [
        "root_cause_accuracy",
        "financial_correctness",
        "strategic_quality",
        "operational_practicality",
        "evidence_discipline",
        "risk_awareness",
        "constraint_handling",
        "prioritisation",
        "owner_usefulness",
        "verification_plan",
      ];

      for (const dim of required) {
        expect(RUBRIC_DEFINITIONS[dim]).toBeDefined();
      }
    });

    it("should have 6 score levels (0,2,4,6,8,10) for each dimension", () => {
      for (const dimension of Object.values(RUBRIC_DEFINITIONS)) {
        const scores = Object.keys(dimension).map(Number);
        expect(scores).toEqual([0, 2, 4, 6, 8, 10]);
      }
    });

    it("should have meaningful descriptions at each level", () => {
      for (const [dim, levels] of Object.entries(RUBRIC_DEFINITIONS)) {
        for (const [score, description] of Object.entries(levels)) {
          expect(description).toBeTruthy();
          expect(description.length).toBeGreaterThan(10);
        }
      }
    });

    it("root_cause_accuracy should progress from wrong to completely ruled out alternatives", () => {
      const def = RUBRIC_DEFINITIONS.root_cause_accuracy;
      expect(def[0]).toContain("wrong");
      expect(def[10]).toContain("alternative");
    });

    it("financial_correctness should progress from incorrect to sensitivity analysis", () => {
      const def = RUBRIC_DEFINITIONS.financial_correctness;
      expect(def[0]).toContain("incorrect");
      expect(def[10]).toContain("sensitivity");
    });

    it("evidence_discipline should progress from no evidence to explicitly noting gaps", () => {
      const def = RUBRIC_DEFINITIONS.evidence_discipline;
      expect(def[0]).toContain("No evidence");
      expect(def[10]).toContain("explicitly");
    });
  });

  describe("Sample Recommendations", () => {
    it("should create 4 sample recommendations", () => {
      const samples = getAllSampleRecommendations();
      expect(samples).toHaveLength(4);
    });

    it("should have unique recommendation IDs", () => {
      const samples = getAllSampleRecommendations();
      const ids = samples.map((r) => r.recommendationId);
      expect(new Set(ids).size).toBe(4);
    });

    it("should retrieve sample by ID", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).not.toBeNull();
      expect(good?.recommendationId).toBe("rec_good_001");
    });

    it("should return null for unknown ID", () => {
      const unknown = getSampleRecommendation("unknown");
      expect(unknown).toBeNull();
    });

    it("good recommendation should have all fields populated", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      expect(good?.problem).toBeTruthy();
      expect(good?.rootCauses.length).toBeGreaterThan(0);
      expect(good?.suggestedActions.length).toBeGreaterThan(0);
      expect(good?.evidenceCitations.length).toBeGreaterThan(0);
      expect(good?.financial_impact).toBeGreaterThan(0);
      expect(good?.verificationMetric).toBeTruthy();
    });

    it("weak recommendation should have missing elements", () => {
      const weak = getSampleRecommendation("rec_weak_001");
      expect(weak?.evidenceCitations.length).toBe(0);
      expect(weak?.verificationMetric).toBeFalsy();
      expect(weak?.financial_impact).toBeFalsy();
    });
  });

  describe("Rubric Scoring", () => {
    it("should score dimension with evidence length mapping", () => {
      const score = scoreRubricDimension("root_cause_accuracy", "short");
      expect([0, 2, 4, 6, 8, 10]).toContain(score);
    });

    it("should assign 0 for very short evidence", () => {
      const score = scoreRubricDimension("root_cause_accuracy", "x");
      expect(score).toBe(0);
    });

    it("should assign 10 for long evidence", () => {
      const longEvidence = "a".repeat(300);
      const score = scoreRubricDimension("root_cause_accuracy", longEvidence);
      expect(score).toBe(10);
    });

    it("should be deterministic for same input", () => {
      const evidence = "sample evidence string of medium length";
      const score1 = scoreRubricDimension("root_cause_accuracy", evidence);
      const score2 = scoreRubricDimension("root_cause_accuracy", evidence);
      expect(score1).toBe(score2);
    });
  });

  describe("Fail Gates", () => {
    it("should identify all 5 fail gates", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const gates = checkFailGates(good!);
      expect(gates.size).toBe(5);
    });

    it("should check calculation_correct gate", () => {
      const gates = checkFailGates({
        recommendationId: "test",
        problem: "test",
        rootCauses: [],
        suggestedActions: [],
        confidence: 0.2, // Low confidence
        evidenceCitations: [],
      });
      const gate = gates.get("calculation_correct");
      expect(gate?.gate).toBe("calculation_correct");
      expect(gate?.triggered).toBe(true); // Should trigger with low confidence
    });

    it("should check cites_evidence gate", () => {
      const gates = checkFailGates({
        recommendationId: "test",
        problem: "test problem",
        rootCauses: ["cause1", "cause2"],
        suggestedActions: ["action1"],
        confidence: 0.7,
        evidenceCitations: [], // No citations
      });
      const gate = gates.get("cites_evidence");
      expect(gate?.gate).toBe("cites_evidence");
      expect(gate?.triggered).toBe(true); // Should trigger with no citations
    });

    it("should check hallucinated_fact gate", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const gates = checkFailGates(good!);
      const gate = gates.get("hallucinated_fact");
      expect(gate?.gate).toBe("hallucinated_fact");
      // Good recommendation has citations, so should not trigger
      expect(gate?.triggered).toBe(false);
    });

    it("should check unsafe_recommendation gate", () => {
      const weak = getSampleRecommendation("rec_weak_001");
      expect(weak).toBeDefined();
      const gates = checkFailGates(weak!);
      const gate = gates.get("unsafe_recommendation");
      expect(gate?.gate).toBe("unsafe_recommendation");
      // Weak has no risk flags, so should not trigger
      expect(gate?.triggered).toBe(false);
    });

    it("should trigger unsafe_recommendation for risky action without mitigation", () => {
      const risky: Recommendation = {
        recommendationId: "test",
        problem: "test",
        rootCauses: [],
        suggestedActions: ["expensive action"],
        confidence: 0.7,
        riskFlags: ["high financial risk", "execution risk"],
        evidenceCitations: [],
        // No verification metric
      };
      const gates = checkFailGates(risky);
      const gate = gates.get("unsafe_recommendation");
      expect(gate?.triggered).toBe(true);
    });
  });

  describe("Full Recommendation Scoring", () => {
    it("should score good recommendation with high overall score", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const result = scoreRecommendation(good!);
      expect(result.overallScore).toBeGreaterThan(50);
      expect(result.passed).toBe(true);
      expect(result.failureReasons.length).toBe(0);
    });

    it("should score weak recommendation with low overall score", () => {
      const weak = getSampleRecommendation("rec_weak_001");
      expect(weak).toBeDefined();
      const result = scoreRecommendation(weak!);
      expect(result.overallScore).toBeLessThan(50);
    });

    it("should have all 10 dimensions in result", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const result = scoreRecommendation(good!);
      expect(result.dimensionScores.size).toBe(10);
    });

    it("should keep overall score in 0-100 range", () => {
      const samples = getAllSampleRecommendations();
      for (const rec of samples) {
        const result = scoreRecommendation(rec);
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it("should fail if calculation_correct gate triggers", () => {
      const noFinance: Recommendation = {
        recommendationId: "test",
        problem: "test",
        rootCauses: ["cause"],
        suggestedActions: ["action"],
        confidence: 0.2, // Very low confidence
        // No financial_impact
        evidenceCitations: [
          { source: "source", metric: "metric", value: "value" },
        ],
      };
      const result = scoreRecommendation(noFinance);
      const calcGate = result.failGates.get("calculation_correct");
      if (calcGate?.triggered) {
        expect(result.passed).toBe(false);
      }
    });

    it("should include dimension scores in evidence", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const result = scoreRecommendation(good!);
      expect(result.evidence.length).toBeGreaterThan(0);
      // Should include all dimension scores
      expect(result.evidence.some((e) => e.includes("root_cause_accuracy"))).toBe(
        true
      );
    });
  });

  describe("Scoring Service", () => {
    it("should score recommendation with validation", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const result = scoreRecommendationWithRubric(good!);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.dimensionScores.size).toBe(10);
    });

    it("should aggregate sample recommendations", () => {
      const aggregated = scoreSampleRecommendations();
      expect(aggregated.recommendations).toHaveLength(4);
      expect(aggregated.averageScore).toBeGreaterThanOrEqual(0);
      expect(aggregated.averageScore).toBeLessThanOrEqual(100);
      expect(aggregated.passedCount + aggregated.failedCount).toBe(4);
    });

    it("should classify recommendations as passed/failed", () => {
      const aggregated = scoreSampleRecommendations();
      for (const rec of aggregated.recommendations) {
        if (rec.passed) {
          expect(rec.failureReasons.length).toBe(0);
        } else {
          expect(rec.failureReasons.length).toBeGreaterThan(0);
        }
      }
    });

    it("should retrieve rubric definition", () => {
      const def = getRubricDefinition("root_cause_accuracy", 8);
      expect(def).toContain("correct");
      expect(def.length).toBeGreaterThan(5);
    });

    it("should compare two recommendations", () => {
      const comparison = compareRecommendations(
        "rec_good_001",
        "rec_weak_001"
      );
      expect(comparison.rec1).not.toBeNull();
      expect(comparison.rec2).not.toBeNull();
      expect(comparison.winner).not.toBeNull();
      // Good should win over weak
      expect(comparison.rec1?.overallScore).toBeGreaterThan(
        comparison.rec2?.overallScore || 0
      );
    });
  });

  describe("Determinism", () => {
    it("should produce identical scores for identical recommendations", () => {
      const good1 = getSampleRecommendation("rec_good_001");
      const good2 = getSampleRecommendation("rec_good_001");

      const result1 = scoreRecommendation(good1!);
      const result2 = scoreRecommendation(good2!);

      expect(result1.overallScore).toBe(result2.overallScore);
      expect(result1.dimensionScores.size).toBe(result2.dimensionScores.size);
      expect(result1.passed).toBe(result2.passed);
    });

    it("should produce deterministic dimension ordering", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();

      const result1 = scoreRecommendation(good!);
      const result2 = scoreRecommendation(good!);

      const dims1 = Array.from(result1.dimensionScores.keys());
      const dims2 = Array.from(result2.dimensionScores.keys());

      expect(dims1).toEqual(dims2);
    });
  });

  describe("Validation", () => {
    it("should validate scoring result", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();
      const result = scoreRecommendation(good!);
      const validation = validateScoringResult(result);
      expect(validation.valid).toBe(true);
    });

    it("should reject result with missing dimensions", () => {
      const invalid = {
        recommendationId: "test",
        dimensionScores: new Map(),
        overallScore: 50,
        failGates: new Map(),
        passed: true,
        failureReasons: [],
        evidence: [],
      };
      const validation = validateScoringResult(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should reject result with invalid overall score", () => {
      const invalid = {
        recommendationId: "test",
        dimensionScores: new Map(),
        overallScore: 150, // Out of range
        failGates: new Map(),
        passed: true,
        failureReasons: [],
        evidence: [],
      };
      const validation = validateScoringResult(invalid);
      expect(validation.valid).toBe(false);
    });
  });

  describe("Integration: Full workflow", () => {
    it("should score all sample recommendations without errors", () => {
      const samples = getAllSampleRecommendations();
      expect(samples.length).toBeGreaterThan(0);

      for (const rec of samples) {
        const result = scoreRecommendationWithRubric(rec);
        expect(result).toBeDefined();
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it("should aggregate all recommendations and provide statistics", () => {
      const aggregated = scoreSampleRecommendations();
      expect(aggregated.recommendations.length).toBe(4);
      expect(aggregated.averageScore).toBeGreaterThanOrEqual(0);
      expect(aggregated.passedCount).toBeGreaterThanOrEqual(0);
      expect(aggregated.failedCount).toBeGreaterThanOrEqual(0);
      expect(aggregated.passedCount + aggregated.failedCount).toBe(4);
    });

    it("good recommendation should score higher than weak recommendation", () => {
      const good = getSampleRecommendation("rec_good_001");
      const weak = getSampleRecommendation("rec_weak_001");

      const goodScore = scoreRecommendation(good!).overallScore;
      const weakScore = scoreRecommendation(weak!).overallScore;

      expect(goodScore).toBeGreaterThan(weakScore);
    });

    it("should demonstrate rubric evaluation workflow", () => {
      const good = getSampleRecommendation("rec_good_001");
      expect(good).toBeDefined();

      // Score the recommendation
      const result = scoreRecommendationWithRubric(good!);

      // Check each dimension
      expect(result.dimensionScores.size).toBe(10);

      // Verify it's well-structured for consultant review
      expect(result.evidence.length).toBeGreaterThan(10); // At least 10 dimension scores
      expect(result.overallScore).toBeGreaterThan(0);

      // Verify fail gates are checked
      expect(result.failGates.size).toBe(5);
      const failedGates = Array.from(result.failGates.entries()).filter(
        ([_, v]) => v.triggered
      );
      if (result.passed) {
        expect(failedGates.length).toBe(0);
      }
    });
  });
});

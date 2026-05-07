/**
 * Phase 1 - Contradiction Engine & Confidence Gate Tests
 *
 * Verifies that contradictions downgrade confidence and weak evidence blocks claims:
 * - Contradiction detection is deterministic
 * - Contradictions lower confidence scores
 * - Confidence gate blocks unsupported claims
 * - Fail-closed: defaults to lowest confidence on uncertainty
 */

import { describe, it, expect } from "vitest";
import { detectContradictions, getContradictionConfidenceDowngrade } from "@/services/contradiction-engine";
import {
  calculateConfidenceScore,
  scoreToConfidenceLevel,
  validateConfidenceClaim,
  type ConfidenceLevel,
} from "@/services/confidence-gate";
import type { EvidenceReliabilityAssessment } from "@/services/evidence-reliability-engine";

describe("Phase 1 - Contradiction Engine & Confidence Gate", () => {
  describe("Contract - Contradiction Detection", () => {
    it("returns contradiction_score 0.0-1.0 for all inputs", () => {
      const emptyEvidence = detectContradictions([]);
      const mixedEvidence = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
        { id: "ev3", type: "document" },
      ]);

      expect(emptyEvidence.contradiction_score).toBeGreaterThanOrEqual(0);
      expect(emptyEvidence.contradiction_score).toBeLessThanOrEqual(1);
      expect(mixedEvidence.contradiction_score).toBeGreaterThanOrEqual(0);
      expect(mixedEvidence.contradiction_score).toBeLessThanOrEqual(1);
    });

    it("single evidence type has zero contradiction", () => {
      const analysis = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "metric" },
        { id: "ev3", type: "metric" },
      ]);

      expect(analysis.contradiction_score).toBe(0);
    });

    it("multiple evidence types increase contradiction risk", () => {
      const twoTypes = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
      ]);

      const threeTypes = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
        { id: "ev3", type: "document" },
      ]);

      expect(twoTypes.contradiction_score).toBeGreaterThan(0);
      expect(threeTypes.contradiction_score).toBeGreaterThan(twoTypes.contradiction_score);
    });

    it("recommendation adapts to contradiction level", () => {
      const noContradiction = detectContradictions([{ id: "ev1", type: "metric" }]);
      const someContradiction = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
      ]);

      expect(noContradiction.recommendation).toBe("PROCEED");
      expect(someContradiction.recommendation).toBe("DOWNGRADE_CONFIDENCE");
    });

    it("is deterministic - same input produces same output", () => {
      const analysis1 = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
      ]);

      const analysis2 = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
      ]);

      expect(analysis1.contradiction_score).toBe(analysis2.contradiction_score);
      expect(analysis1.recommendation).toBe(analysis2.recommendation);
    });
  });

  describe("Contract - Contradiction Downgrade", () => {
    it("returns downgrade_factor 0.0-1.0", () => {
      const factors = [0, 0.1, 0.3, 0.5, 0.9, 1.0].map((score) => {
        const result = getContradictionConfidenceDowngrade(score);
        return result.downgrade_factor;
      });

      factors.forEach((f) => {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      });
    });

    it("higher contradiction score produces lower downgrade_factor", () => {
      const low = getContradictionConfidenceDowngrade(0.1);
      const high = getContradictionConfidenceDowngrade(0.45);

      expect(low.downgrade_factor).toBeGreaterThan(high.downgrade_factor);
    });

    it("downgrade_factor decreases confidence progressively", () => {
      const base = 0.8; // 80% confidence

      const lowContradiction = base * getContradictionConfidenceDowngrade(0.05).downgrade_factor;
      const mediumContradiction = base * getContradictionConfidenceDowngrade(0.2).downgrade_factor;
      const highContradiction = base * getContradictionConfidenceDowngrade(0.45).downgrade_factor;

      expect(lowContradiction).toBeGreaterThan(mediumContradiction);
      expect(mediumContradiction).toBeGreaterThan(highContradiction);
    });

    it("is deterministic", () => {
      const result1 = getContradictionConfidenceDowngrade(0.35);
      const result2 = getContradictionConfidenceDowngrade(0.35);

      expect(result1.downgrade_factor).toBe(result2.downgrade_factor);
      expect(result1.new_confidence_level).toBe(result2.new_confidence_level);
    });
  });

  describe("Contract - Confidence Score Calculation", () => {
    it("returns score 0.0-1.0 for all evidence/contradiction combinations", () => {
      const combinations = [
        [1.0, 0, 3],
        [1.0, 1.0, 3],
        [0.5, 0.5, 1],
        [0, 0, 0],
      ];

      combinations.forEach(([evidence, contradiction, count]) => {
        const score = calculateConfidenceScore(evidence, contradiction, count);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it("high evidence + no contradiction = high score", () => {
      const score = calculateConfidenceScore(0.85, 0, 3);
      expect(score).toBeGreaterThan(0.75);
    });

    it("high evidence + high contradiction = lower score", () => {
      const withoutContradiction = calculateConfidenceScore(0.85, 0, 3);
      const withContradiction = calculateConfidenceScore(0.85, 0.45, 3);

      expect(withoutContradiction).toBeGreaterThan(withContradiction);
    });

    it("single evidence item reduces score", () => {
      const multipleEvidence = calculateConfidenceScore(0.8, 0, 3);
      const singleEvidence = calculateConfidenceScore(0.8, 0, 1);

      expect(multipleEvidence).toBeGreaterThan(singleEvidence);
    });

    it("zero evidence count produces zero score", () => {
      const score = calculateConfidenceScore(0.8, 0, 0);
      expect(score).toBe(0);
    });

    it("is deterministic", () => {
      const score1 = calculateConfidenceScore(0.75, 0.2, 2);
      const score2 = calculateConfidenceScore(0.75, 0.2, 2);

      expect(score1).toBe(score2);
    });
  });

  describe("Behavior - Score to Confidence Level Mapping", () => {
    it("maps score ranges to confidence levels", () => {
      expect(scoreToConfidenceLevel(0.8)).toBe("HIGH_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.6)).toBe("MEDIUM_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.3)).toBe("LOW_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.15)).toBe("NEED_MORE_DATA");
      expect(scoreToConfidenceLevel(0.05)).toBe("DANGER_DO_NOT_ACT");
    });

    it("boundary values map correctly", () => {
      expect(scoreToConfidenceLevel(0.75)).toBe("HIGH_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.74)).toBe("MEDIUM_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.5)).toBe("MEDIUM_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.25)).toBe("LOW_CONFIDENCE");
      expect(scoreToConfidenceLevel(0.1)).toBe("NEED_MORE_DATA");
    });

    it("is deterministic", () => {
      expect(scoreToConfidenceLevel(0.55)).toBe(scoreToConfidenceLevel(0.55));
    });
  });

  describe("Integration - Confidence Claim Validation", () => {
    const createMockEvidence = (score: number, count: number): EvidenceReliabilityAssessment => ({
      total_evidence_count: count,
      weighted_average_score: score,
      minimum_score: score * 0.9,
      maximum_score: score * 1.1,
      evidence_quality_verdict: score >= 0.7 ? "STRONG" : score >= 0.5 ? "ACCEPTABLE" : "WEAK",
      confidence_recommendation: score >= 0.7 ? "HIGH_CONFIDENCE" : "MEDIUM_CONFIDENCE",
      improvement_actions: [],
    });

    it("HIGH_CONFIDENCE claim valid with strong evidence and no contradiction", () => {
      const evidence = createMockEvidence(0.85, 3);
      const contradiction = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "metric" },
        { id: "ev3", type: "metric" },
      ]);

      const validation = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, contradiction);

      expect(validation.is_valid).toBe(true);
      expect(validation.blockers.length).toBe(0);
    });

    it("HIGH_CONFIDENCE claim invalid with weak evidence", () => {
      const evidence = createMockEvidence(0.4, 1);
      const contradiction = detectContradictions([{ id: "ev1", type: "estimate" }]);

      const validation = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, contradiction);

      expect(validation.is_valid).toBe(false);
      expect(validation.blockers.length).toBeGreaterThan(0);
    });

    it("contradiction analysis affects claim validity", () => {
      const evidence = createMockEvidence(0.75, 3);

      const noContradiction = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "metric" },
        { id: "ev3", type: "metric" },
      ]);

      const withContradiction = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
        { id: "ev3", type: "document" },
      ]);

      const validationNone = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, noContradiction);
      const validationSome = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, withContradiction);

      expect(validationNone.is_valid).toBe(true);
      expect(validationSome.is_valid).toBe(false);
    });

    it("fail-closed: defaults to lower confidence on weak evidence", () => {
      const evidence = createMockEvidence(0.3, 1);
      const contradiction = detectContradictions([{ id: "ev1", type: "assumption" }]);

      const validation = validateConfidenceClaim("MEDIUM_CONFIDENCE", evidence, contradiction);

      expect(validation.validated_confidence).toBe("NEED_MORE_DATA");
      expect(validation.final_confidence_score).toBeLessThan(0.5);
    });

    it("provides improvement recommendations", () => {
      const evidence: EvidenceReliabilityAssessment = {
        total_evidence_count: 1,
        weighted_average_score: 0.4,
        minimum_score: 0.36,
        maximum_score: 0.44,
        evidence_quality_verdict: "WEAK",
        confidence_recommendation: "MEDIUM_CONFIDENCE",
        improvement_actions: ["Add higher-quality evidence sources"],
      };
      const contradiction = detectContradictions([
        { id: "ev1", type: "estimate" },
        { id: "ev2", type: "interview" },
      ]);

      const validation = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, contradiction);

      expect(validation.recommendations.length).toBeGreaterThan(0);
    });

    it("is deterministic - same claim produces same result", () => {
      const evidence = createMockEvidence(0.6, 2);
      const contradiction = detectContradictions([
        { id: "ev1", type: "metric" },
        { id: "ev2", type: "interview" },
      ]);

      const validation1 = validateConfidenceClaim("MEDIUM_CONFIDENCE", evidence, contradiction);
      const validation2 = validateConfidenceClaim("MEDIUM_CONFIDENCE", evidence, contradiction);

      expect(validation1.final_confidence_score).toBe(validation2.final_confidence_score);
      expect(validation1.is_valid).toBe(validation2.is_valid);
      expect(validation1.validated_confidence).toBe(validation2.validated_confidence);
    });
  });

  describe("Fail-Closed Behavior - Gates Block Unsupported Claims", () => {
    it("blocks HIGH_CONFIDENCE when evidence insufficient", () => {
      const evidence = createMockEvidence(0.3, 1);
      const contradiction = detectContradictions([{ id: "ev1", type: "estimate" }]);

      const validation = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, contradiction);

      expect(validation.is_valid).toBe(false);
      expect(validation.blockers.some((b) => b.toLowerCase().includes("insufficient") || b.toLowerCase().includes("weak"))).toBe(true);
    });

    it("blocks claims when contradictions detected", () => {
      const evidence = createMockEvidence(0.8, 2);
      const contradiction = detectContradictions([
        { id: "ev1", type: "metric", description: "Revenue increased" },
        { id: "ev2", type: "interview", description: "Sales team says revenue decreased" },
      ]);

      const validation = validateConfidenceClaim("HIGH_CONFIDENCE", evidence, contradiction);

      expect(contradiction.contradiction_score).toBeGreaterThan(0);
      if (contradiction.recommendation === "BLOCK_HIGH_CONFIDENCE") {
        expect(validation.is_valid).toBe(false);
      }
    });

    it("allows LOW_CONFIDENCE when evidence weak", () => {
      const evidence = createMockEvidence(0.35, 1);
      const contradiction = detectContradictions([{ id: "ev1", type: "estimate" }]);

      const validation = validateConfidenceClaim("LOW_CONFIDENCE", evidence, contradiction);

      expect(validation.is_valid).toBe(true);
    });

    it("DANGER_DO_NOT_ACT on zero evidence", () => {
      const evidence = createMockEvidence(0, 0);
      const contradiction = detectContradictions([]);

      const level = scoreToConfidenceLevel(
        calculateConfidenceScore(evidence.weighted_average_score, contradiction.contradiction_score, 0)
      );

      expect(level).toBe("DANGER_DO_NOT_ACT");
    });
  });

  // Helper
  function createMockEvidence(score: number, count: number): EvidenceReliabilityAssessment {
    return {
      total_evidence_count: count,
      weighted_average_score: score,
      minimum_score: score * 0.9,
      maximum_score: score * 1.1,
      evidence_quality_verdict: score >= 0.7 ? "STRONG" : score >= 0.5 ? "ACCEPTABLE" : "WEAK",
      confidence_recommendation: score >= 0.7 ? "HIGH_CONFIDENCE" : "MEDIUM_CONFIDENCE",
      improvement_actions: [],
    };
  }
});

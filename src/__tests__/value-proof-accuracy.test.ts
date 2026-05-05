/**
 * Value Proof Accuracy Test Suite
 *
 * Tests prediction accuracy and impact validation across decision scenarios.
 * Validates that OpsIQ confidence levels accurately predict actual outcomes.
 */

import {
  validateImpactAccuracy,
  calculateImpactDelta,
  aggregateAccuracyScores,
  meetsAccuracyThreshold,
  PredictionMetrics,
  ActualOutcome,
  AccuracyAssessment,
} from "@/services/value-proof/impact-accuracy-validator";

describe("Value Proof - Impact Accuracy", () => {
  const basePrediction: PredictionMetrics = {
    predictedConfidence: 75,
    predictedSeverity: "high",
    predictedImpactLevel: "significant",
  };

  const baseOutcome: ActualOutcome = {
    actualConfidence: 82,
    actualSeverity: "high",
    actualImpactLevel: "significant",
    recordedAt: new Date(),
  };

  describe("Accuracy Validation", () => {
    it("should calculate accuracy score from confidence delta", () => {
      const assessment = validateImpactAccuracy(basePrediction, baseOutcome);

      expect(assessment).toBeDefined();
      expect(assessment.predictedConfidence).toBe(75);
      expect(assessment.actualConfidence).toBe(82);
      expect(assessment.confidenceGain).toBe(7); // 82 - 75
    });

    it("should rate excellent accuracy for close predictions", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 80,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 85,
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.accuracyScore).toBeGreaterThan(85);
      expect(assessment.accuracyStatus).toBe("excellent");
    });

    it("should rate good accuracy for reasonable predictions", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 70,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 82,
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.accuracyScore).toBeGreaterThan(70);
      expect(assessment.accuracyStatus).not.toBe("poor");
    });

    it("should rate poor accuracy for wildly inaccurate predictions", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 90,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 30,
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.accuracyScore).toBeLessThan(50);
      expect(assessment.accuracyStatus).toBe("poor");
    });

    it("should measure positive confidence gain", () => {
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 88, // Higher than predicted
      };

      const assessment = validateImpactAccuracy(basePrediction, outcome);

      expect(assessment.confidenceGain).toBeGreaterThan(0);
    });

    it("should measure negative confidence gain (degradation)", () => {
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 60, // Lower than predicted
      };

      const assessment = validateImpactAccuracy(basePrediction, outcome);

      expect(assessment.confidenceGain).toBeLessThan(0);
    });

    it("should calculate target gain based on predicted confidence", () => {
      const highConfidencePrediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 95,
      };
      const lowConfidencePrediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 40,
      };

      const highConfidenceOutcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 97,
      };
      const lowConfidenceOutcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 50,
      };

      const highAssessment = validateImpactAccuracy(
        highConfidencePrediction,
        highConfidenceOutcome
      );
      const lowAssessment = validateImpactAccuracy(
        lowConfidencePrediction,
        lowConfidenceOutcome
      );

      // High confidence should have higher target gain
      expect(highAssessment.targetGain).toBeGreaterThan(lowAssessment.targetGain);
    });
  });

  describe("Impact Delta Calculation", () => {
    it("should detect severity improvement", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedSeverity: "critical",
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualSeverity: "high", // Improved from critical
      };

      const delta = calculateImpactDelta(prediction, outcome);

      expect(delta.severityImproved).toBe(true);
      expect(delta.severityDelta).toContain("improved");
    });

    it("should detect severity degradation", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedSeverity: "medium",
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualSeverity: "critical", // Degraded from medium
      };

      const delta = calculateImpactDelta(prediction, outcome);

      expect(delta.severityImproved).toBe(false);
      expect(delta.severityDelta).toContain("degraded");
    });

    it("should detect unchanged severity", () => {
      const delta = calculateImpactDelta(basePrediction, baseOutcome);

      expect(delta.severityImproved).toBe(false);
      expect(delta.severityDelta).toContain("unchanged");
    });

    it("should detect impact level improvement", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedImpactLevel: "severe",
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualImpactLevel: "moderate", // Improved from severe
      };

      const delta = calculateImpactDelta(prediction, outcome);

      expect(delta.impactImproved).toBe(true);
      expect(delta.impactDelta).toContain("improved");
    });
  });

  describe("Accuracy Aggregation", () => {
    it("should aggregate multiple accuracy assessments", () => {
      const assessments: AccuracyAssessment[] = [
        validateImpactAccuracy(basePrediction, baseOutcome),
        validateImpactAccuracy(basePrediction, {
          ...baseOutcome,
          actualConfidence: 78,
        }),
        validateImpactAccuracy(basePrediction, {
          ...baseOutcome,
          actualConfidence: 85,
        }),
      ];

      const aggregate = aggregateAccuracyScores(assessments);

      expect(aggregate.averageScore).toBeGreaterThan(0);
      expect(aggregate.averageScore).toBeLessThanOrEqual(100);
      expect(aggregate.excellentCount + aggregate.goodCount + aggregate.fairCount + aggregate.poorCount).toBe(
        3
      );
    });

    it("should calculate success rate (>= 75% accuracy)", () => {
      const assessments: AccuracyAssessment[] = [
        validateImpactAccuracy(basePrediction, {
          ...baseOutcome,
          actualConfidence: 85, // Good/excellent
        }),
        validateImpactAccuracy(basePrediction, {
          ...baseOutcome,
          actualConfidence: 82, // Good
        }),
        validateImpactAccuracy(basePrediction, {
          ...baseOutcome,
          actualConfidence: 50, // Poor
        }),
      ];

      const aggregate = aggregateAccuracyScores(assessments);

      // At least 2/3 should be good or excellent
      expect(aggregate.successRate).toBeGreaterThanOrEqual(50);
    });

    it("should handle empty assessment list", () => {
      const aggregate = aggregateAccuracyScores([]);

      expect(aggregate.averageScore).toBe(0);
      expect(aggregate.excellentCount).toBe(0);
      expect(aggregate.successRate).toBe(0);
    });
  });

  describe("Threshold Validation", () => {
    it("should validate high confidence threshold (>= 85%)", () => {
      const excellentAssessment = validateImpactAccuracy(
        { ...basePrediction, predictedConfidence: 85 },
        { ...baseOutcome, actualConfidence: 88 }
      );

      expect(meetsAccuracyThreshold(excellentAssessment, "high")).toBe(true);
    });

    it("should validate medium confidence threshold (>= 75%)", () => {
      const goodAssessment = validateImpactAccuracy(
        { ...basePrediction, predictedConfidence: 75 },
        { ...baseOutcome, actualConfidence: 80 }
      );

      expect(meetsAccuracyThreshold(goodAssessment, "medium")).toBe(true);
    });

    it("should validate low confidence threshold (>= 65%)", () => {
      const fairAssessment = validateImpactAccuracy(
        { ...basePrediction, predictedConfidence: 65 },
        { ...baseOutcome, actualConfidence: 72 }
      );

      expect(meetsAccuracyThreshold(fairAssessment, "low")).toBe(true);
    });

    it("should reject assessments below threshold", () => {
      const poorAssessment = validateImpactAccuracy(
        { ...basePrediction, predictedConfidence: 90 },
        { ...baseOutcome, actualConfidence: 30 }
      );

      expect(meetsAccuracyThreshold(poorAssessment, "high")).toBe(false);
    });
  });

  describe("Workspace Isolation", () => {
    it("should maintain workspace context in assessments", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      // Assessment should not contain workspace data (should be added by caller)
      expect(assessment).toBeDefined();
      expect(assessment.predictedConfidence).toBe(prediction.predictedConfidence);
    });
  });

  describe("Deterministic Assessment", () => {
    it("should produce deterministic results", () => {
      const result1 = validateImpactAccuracy(basePrediction, baseOutcome);
      const result2 = validateImpactAccuracy(basePrediction, baseOutcome);

      expect(result1.accuracyScore).toBe(result2.accuracyScore);
      expect(result1.assessment).toBe(result2.assessment);
    });
  });

  describe("Edge Cases", () => {
    it("should handle 0 predicted confidence", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 0,
      };

      const assessment = validateImpactAccuracy(prediction, baseOutcome);

      expect(assessment.targetGain).toBe(0); // 0% of 0
      expect(assessment.accuracyScore).toBeDefined();
    });

    it("should handle 100 predicted confidence", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 100,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 100,
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.targetGain).toBeGreaterThan(0);
      expect(assessment.accuracyScore).toBeGreaterThanOrEqual(90);
    });

    it("should handle confidence gain greater than target", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 50,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 95, // Much higher than predicted
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.confidenceGain).toBeGreaterThan(40);
      expect(assessment.accuracyScore).toBeDefined();
    });

    it("should cap accuracy score at 100", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 50,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 55, // Slightly better than target
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.accuracyScore).toBeLessThanOrEqual(100);
    });

    it("should floor accuracy score at 0", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedConfidence: 95,
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualConfidence: 5, // Much worse than predicted
      };

      const assessment = validateImpactAccuracy(prediction, outcome);

      expect(assessment.accuracyScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle unknown severity level gracefully", () => {
      const prediction: PredictionMetrics = {
        ...basePrediction,
        predictedSeverity: "unknown",
      };
      const outcome: ActualOutcome = {
        ...baseOutcome,
        actualSeverity: "high",
      };

      const delta = calculateImpactDelta(prediction, outcome);

      expect(delta).toBeDefined();
      expect(delta.severityDelta).toBeDefined();
    });
  });

  describe("Integration with Real Scenarios", () => {
    it("should validate accuracy for improved outcomes", () => {
      // Scenario: Decision predicted to prevent 85% loss, actually prevented 92%
      const prediction: PredictionMetrics = {
        predictedConfidence: 85,
        predictedSeverity: "high",
        predictedImpactLevel: "significant",
      };
      const outcome: ActualOutcome = {
        actualConfidence: 92,
        actualSeverity: "medium",
        actualImpactLevel: "moderate",
        recordedAt: new Date(),
      };

      const assessment = validateImpactAccuracy(prediction, outcome);
      const delta = calculateImpactDelta(prediction, outcome);

      expect(assessment.accuracyScore).toBeGreaterThan(80);
      expect(assessment.accuracyStatus).toBe("excellent");
      expect(delta.severityImproved).toBe(true);
      expect(delta.impactImproved).toBe(true);
    });

    it("should identify prediction failures", () => {
      // Scenario: Decision predicted 75% confidence, actually achieved 15%
      const prediction: PredictionMetrics = {
        predictedConfidence: 75,
        predictedSeverity: "high",
        predictedImpactLevel: "significant",
      };
      const outcome: ActualOutcome = {
        actualConfidence: 15,
        actualSeverity: "critical",
        actualImpactLevel: "severe",
        recordedAt: new Date(),
      };

      const assessment = validateImpactAccuracy(prediction, outcome);
      const delta = calculateImpactDelta(prediction, outcome);

      expect(assessment.accuracyScore).toBeLessThan(50);
      expect(assessment.accuracyStatus).toBe("poor");
      expect(delta.severityImproved).toBe(false);
    });
  });
});

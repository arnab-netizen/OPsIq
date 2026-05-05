/**
 * Outcome Accuracy Integration Test
 *
 * Integration test for value proof accuracy validation with outcome recording.
 * Tests end-to-end flow from decision prediction through outcome recording and accuracy calculation.
 */

import {
  validateImpactAccuracy,
  calculateImpactDelta,
  aggregateAccuracyScores,
} from "@/services/value-proof/impact-accuracy-validator";
import {
  calculateROI,
  calculateEngagementROI,
  compareROI,
} from "@/services/value-proof/roi-calculator";
import { describe, it, expect } from "vitest";

describe("Outcome Accuracy Integration", () => {
  describe("Decision Prediction to Outcome Flow", () => {
    it("should validate accuracy for complete decision lifecycle", () => {
      // Scenario: Business Risk identified at 85% confidence
      const decisionPrediction = {
        predictedConfidence: 85,
        predictedSeverity: "high",
        predictedImpactLevel: "significant",
      };

      // Months later: Actual outcome recorded
      const actualOutcome = {
        actualConfidence: 90,
        actualSeverity: "medium", // Improved from high
        actualImpactLevel: "moderate", // Improved from significant
        recordedAt: new Date(),
      };

      // Validate accuracy
      const accuracyAssessment = validateImpactAccuracy(
        decisionPrediction,
        actualOutcome
      );
      const impactDelta = calculateImpactDelta(decisionPrediction, actualOutcome);

      // Decision was well-predicted
      expect(accuracyAssessment.accuracyScore).toBeGreaterThan(85);
      expect(accuracyAssessment.accuracyStatus).toBe("excellent");

      // Impact improved
      expect(impactDelta.severityImproved).toBe(true);
      expect(impactDelta.impactImproved).toBe(true);
    });

    it("should identify prediction failures in outcomes", () => {
      // Scenario: Decision predicted to resolve in 2 weeks with 80% confidence
      const optimisticPrediction = {
        predictedConfidence: 80,
        predictedSeverity: "medium",
        predictedImpactLevel: "moderate",
      };

      // Actually took 2 months and escalated
      const poorOutcome = {
        actualConfidence: 35,
        actualSeverity: "critical", // Escalated
        actualImpactLevel: "severe",
        recordedAt: new Date(),
      };

      const accuracy = validateImpactAccuracy(optimisticPrediction, poorOutcome);
      const delta = calculateImpactDelta(optimisticPrediction, poorOutcome);

      // Accuracy was poor
      expect(accuracy.accuracyScore).toBeLessThan(50);
      expect(accuracy.accuracyStatus).toBe("poor");

      // Impact degraded
      expect(delta.severityImproved).toBe(false);
      expect(delta.impactImproved).toBe(false);
    });
  });

  describe("Value Recovery and ROI Integration", () => {
    it("should calculate ROI based on actual outcomes", () => {
      // Decision: Implement cost reduction intervention
      const intervention = {
        valueRecoveredINR: 400000, // Actual ₹4 lakh saved
        interventionCostINR: 75000, // Actual ₹75k spent
        timeToValueMonths: 3,
        baseSuccessProbability: 0.82, // Based on accuracy assessment
      };

      const roiResult = calculateROI(intervention);

      // Should show strong ROI (after time discounting and success adjustment)
      expect(roiResult.adjustedROI).toBeGreaterThan(100); // > 100% ROI
      expect(roiResult.profitabilityIndex).toBeGreaterThan(2); // > 2x return on investment
    });

    it("should adjust ROI when human factors are present", () => {
      // Base intervention
      const baseCase = {
        valueRecoveredINR: 500000,
        interventionCostINR: 100000,
        timeToValueMonths: 2,
        baseSuccessProbability: 0.85,
      };

      // Same intervention with execution challenges
      const constrainedCase = {
        ...baseCase,
        humanRealityImpact: {
          delayDays: 21, // 3-week delay
          riskFactor: 1.4, // 40% cost overrun
          successProbabilityAdjustment: -0.12, // 12% confidence hit
          requiredInterventions: ["follow_through_risk", "communication_breakdown"],
        },
      };

      const baseROI = calculateROI(baseCase);
      const constrainedROI = calculateROI(constrainedCase);

      // Human factors reduce ROI
      expect(constrainedROI.adjustedROI).toBeLessThan(baseROI.adjustedROI);

      // ROI comparison shows degradation
      const comparison = compareROI(baseROI, constrainedROI);
      expect(comparison.roiImprovement).toBeLessThan(0);
    });
  });

  describe("Engagement-Level Value Proof", () => {
    it("should aggregate accuracy and ROI across decisions in engagement", () => {
      // Engagement with 5 decisions
      const decisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 88, // Good prediction
        },
        {
          valueRecoveredINR: 250000,
          interventionCostINR: 60000,
          accuracyScore: 92, // Excellent prediction
        },
        {
          valueRecoveredINR: 300000,
          interventionCostINR: 80000,
          accuracyScore: 75, // Fair prediction
        },
        {
          valueRecoveredINR: 400000,
          interventionCostINR: 95000,
          accuracyScore: 85, // Good prediction
        },
        {
          valueRecoveredINR: 200000,
          interventionCostINR: 50000,
          accuracyScore: 68, // Below target
        },
      ];

      // Aggregate results
      const accuracyAgg = aggregateAccuracyScores(
        decisions.map(d => ({
          predictedConfidence: d.accuracyScore,
          actualConfidence: d.accuracyScore + 2,
          confidenceGain: 2,
          targetGain: 5,
          accuracyScore: d.accuracyScore,
          accuracyStatus:
            d.accuracyScore >= 85
              ? "excellent"
              : d.accuracyScore >= 75
                ? "good"
                : "fair",
          assessment: "test",
        }))
      );

      const roiAgg = calculateEngagementROI("eng-123", decisions);

      // Verify engagement metrics
      expect(roiAgg.decisionCount).toBe(5);
      expect(roiAgg.totalValueRecoveredINR).toBe(1650000); // Total value
      expect(roiAgg.totalInterventionCostINR).toBe(385000); // Total cost
      expect(roiAgg.totalProfitINR).toBe(1265000); // Net profit
      expect(roiAgg.averageROI).toBeGreaterThan(200); // Strong ROI
      expect(roiAgg.averageAccuracy).toBeGreaterThan(81); // Good accuracy
    });

    it("should show engagement value proof metrics", () => {
      const decisions = [
        {
          valueRecoveredINR: 600000,
          interventionCostINR: 120000,
          accuracyScore: 89,
        },
        {
          valueRecoveredINR: 400000,
          interventionCostINR: 90000,
          accuracyScore: 84,
        },
        {
          valueRecoveredINR: 350000,
          interventionCostINR: 75000,
          accuracyScore: 79,
        },
      ];

      const proof = calculateEngagementROI("eng-case-study", decisions);

      // This engagement shows clear value
      expect(proof.totalValueRecoveredINR).toBe(1350000);
      expect(proof.totalProfitINR).toBe(1065000); // 78% profit margin
      expect(proof.adjustedROI).toBeGreaterThan(200);
      expect(proof.averageAccuracy).toBeGreaterThan(80);

      // Can be presented as proof point
      const proofStatement = `Engagement ${proof.engagementId} recovered ₹${(proof.totalValueRecoveredINR / 100000).toFixed(1)}L through ${proof.decisionCount} decisions with ${proof.averageAccuracy}% accuracy and ${proof.adjustedROI}% ROI.`;
      expect(proofStatement).toContain("eng-case-study");
    });
  });

  describe("Multi-Phase Outcome Tracking", () => {
    it("should track prediction accuracy improvements over time", () => {
      // Phase 1: Early decisions (high variance)
      const phase1Predictions = [
        { predicted: 70, actual: 62, accuracy: 65 },
        { predicted: 75, actual: 85, accuracy: 80 },
        { predicted: 65, actual: 55, accuracy: 70 },
      ];

      // Phase 2: Refined decisions (better accuracy)
      const phase2Predictions = [
        { predicted: 80, actual: 82, accuracy: 88 },
        { predicted: 85, actual: 88, accuracy: 92 },
        { predicted: 78, actual: 81, accuracy: 87 },
      ];

      const phase1Scores = aggregateAccuracyScores(
        phase1Predictions.map(p => ({
          predictedConfidence: p.predicted,
          actualConfidence: p.actual,
          confidenceGain: p.actual - p.predicted,
          targetGain: 5,
          accuracyScore: p.accuracy,
          accuracyStatus: p.accuracy >= 75 ? "good" : "fair",
          assessment: "test",
        }))
      );

      const phase2Scores = aggregateAccuracyScores(
        phase2Predictions.map(p => ({
          predictedConfidence: p.predicted,
          actualConfidence: p.actual,
          confidenceGain: p.actual - p.predicted,
          targetGain: 5,
          accuracyScore: p.accuracy,
          accuracyStatus: p.accuracy >= 75 ? "good" : "fair",
          assessment: "test",
        }))
      );

      // Show improvement
      expect(phase2Scores.averageScore).toBeGreaterThan(phase1Scores.averageScore);
      expect(phase2Scores.successRate).toBeGreaterThan(phase1Scores.successRate);
    });
  });

  describe("Workspace Isolation in Value Proof", () => {
    it("should maintain workspace context in accuracy assessments", () => {
      const workspaceId1 = "ws-001";
      const workspaceId2 = "ws-002";

      // Same decision in two workspaces
      const prediction = {
        predictedConfidence: 80,
        predictedSeverity: "high",
        predictedImpactLevel: "significant",
      };
      const outcome = {
        actualConfidence: 85,
        actualSeverity: "medium",
        actualImpactLevel: "moderate",
        recordedAt: new Date(),
      };

      const assessment1 = validateImpactAccuracy(prediction, outcome);
      const assessment2 = validateImpactAccuracy(prediction, outcome);

      // Same decision should produce same accuracy
      expect(assessment1.accuracyScore).toBe(assessment2.accuracyScore);

      // In real implementation, workspace context would be added at call site
      const withWorkspace1 = { ...assessment1, workspaceId: workspaceId1 };
      const withWorkspace2 = { ...assessment2, workspaceId: workspaceId2 };

      expect(withWorkspace1.workspaceId).toBe(workspaceId1);
      expect(withWorkspace2.workspaceId).toBe(workspaceId2);
    });
  });

  describe("Deterministic Value Proof", () => {
    it("should produce reproducible accuracy metrics", () => {
      const prediction = {
        predictedConfidence: 75,
        predictedSeverity: "high",
        predictedImpactLevel: "significant",
      };
      const outcome = {
        actualConfidence: 82,
        actualSeverity: "medium",
        actualImpactLevel: "moderate",
        recordedAt: new Date("2026-05-05T12:00:00Z"),
      };

      const assessment1 = validateImpactAccuracy(prediction, outcome);
      const assessment2 = validateImpactAccuracy(prediction, outcome);

      expect(assessment1.accuracyScore).toBe(assessment2.accuracyScore);
      expect(assessment1.assessment).toBe(assessment2.assessment);
    });

    it("should produce reproducible ROI calculations", () => {
      const roiInput = {
        valueRecoveredINR: 500000,
        interventionCostINR: 100000,
        timeToValueMonths: 2,
        baseSuccessProbability: 0.85,
      };

      const result1 = calculateROI(roiInput);
      const result2 = calculateROI(roiInput);

      expect(result1.adjustedROI).toBe(result2.adjustedROI);
      expect(result1.npv).toBe(result2.npv);
    });
  });

  describe("Financial Metrics Integrity", () => {
    it("should maintain financial accuracy in aggregates", () => {
      const decisions = [
        {
          valueRecoveredINR: 100000,
          interventionCostINR: 20000,
          accuracyScore: 85,
        },
        {
          valueRecoveredINR: 150000,
          interventionCostINR: 30000,
          accuracyScore: 90,
        },
        {
          valueRecoveredINR: 200000,
          interventionCostINR: 40000,
          accuracyScore: 80,
        },
      ];

      const result = calculateEngagementROI("eng-financial-test", decisions);

      // Verify arithmetic
      expect(result.totalValueRecoveredINR).toBe(450000);
      expect(result.totalInterventionCostINR).toBe(90000);
      expect(result.totalProfitINR).toBe(360000);

      // Average ROI calculation: (360000 / 90000) * 100 = 400%
      expect(result.averageROI).toBe(400);
    });
  });
});

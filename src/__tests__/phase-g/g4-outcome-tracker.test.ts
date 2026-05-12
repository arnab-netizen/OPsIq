import { describe, it, expect } from "vitest";
import {
  analyzeMetricAccuracy,
  calculateCredibilityAdjustment,
  createOutcomeRecord,
  PredictionAccuracy,
} from "../../services/decisions/outcome-tracker";
import { Recommendation, CredibilityBreakdown } from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G4: PREDICTED VS ACTUAL OUTCOME TRACKING
 *
 * HOSTILE TESTING:
 * - Predictions that fail get penalized
 * - Perfect predictions get rewarded
 * - Opposite direction outcomes reduce credibility significantly
 * - Underperformance penalizes confidence
 * - Concurrent actions reduce attribution confidence
 * - Measurement data drives recalibration
 */

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    recommendation_id: "rec-" + Math.random().toString(36).slice(2, 9),
    workspace_id: "ws-test-001",
    issued_date: now,
    issued_by: "test-system",
    decision_type: "OPERATIONAL",
    action: "Test action",
    why_now: "Test reason",
    expected_time_to_impact: "SHORT_TERM",
    evidence_refs: [
      {
        type: "METRIC_MEASUREMENT",
        source: "System metrics",
        timestamp: now,
        quote_or_measurement: "Measurement",
        freshness_days: 0,
      },
    ],
    constraints_considered: [],
    reversibility: {
      reversible: true,
      rollback_steps: ["Step 1"],
      rollback_time_minutes: 30,
      catastrophic_failure_modes: [],
    },
    risk_level: "MEDIUM",
    risk_description: "Normal risk",
    credibility_breakdown: {
      confidence_state: "MEDIUM_CONFIDENCE",
      evidence_quality_score: 75,
      freshness_penalty: 0,
      contradiction_penalty: 0,
      assumption_penalty: 0,
      missing_data_penalty: 0,
      historical_accuracy_weight: 1.0,
      reversibility_boost: 0.05,
      final_credibility_score: 75,
      credibility_reason: "Sufficient evidence",
      missing_information: [],
      contradictions_found: [],
    },
    confidence_state: "MEDIUM_CONFIDENCE",
    confidence_reason: "Medium confidence",
    success_metric: {
      name: "Latency reduction",
      unit: "ms",
      baseline: 500,
      expected_change_percent: -20,
      expected_change_direction: "DOWN",
      measurement_method: "APM",
      measurement_frequency: "DAILY",
    },
    failure_metric: {
      name: "Error rate",
      unit: "percent",
      baseline: 1.0,
      expected_change_percent: 0,
      expected_change_direction: "STABLE",
      measurement_method: "Logs",
      measurement_frequency: "DAILY",
    },
    stop_condition: "If error rate exceeds 5%",
    review_date: future,
    monitoring_frequency: "DAILY",
    assumptions: [
      {
        assumption: "System available",
        verified: true,
        can_fail: false,
        failure_impact: "REDUCES_ROI",
      },
    ],
    missing_information: [],
    ...overrides,
  } as Recommendation;
}

function makeCredibility(overrides: Partial<CredibilityBreakdown> = {}): CredibilityBreakdown {
  return {
    confidence_state: "MEDIUM_CONFIDENCE",
    evidence_quality_score: 75,
    freshness_penalty: 0,
    contradiction_penalty: 0,
    assumption_penalty: 0,
    missing_data_penalty: 0,
    historical_accuracy_weight: 1.0,
    reversibility_boost: 0.05,
    final_credibility_score: 75,
    credibility_reason: "Sufficient evidence",
    missing_information: [],
    contradictions_found: [],
    ...overrides,
  };
}

describe("PHASE G4: Predicted vs Actual Outcome Tracking", () => {
  describe("G4.1: Metric Accuracy Analysis", () => {
    it("should score perfect prediction as 100% accurate", async () => {
      const accuracy = analyzeMetricAccuracy(
        "Latency",
        -20, // Predict 20% reduction
        -20, // Actual 20% reduction
        [-24, -16]
      );

      expect(accuracy.accuracy_score).toBeGreaterThanOrEqual(95);
      expect(accuracy.is_within_sensitivity_range).toBe(true);
    });

    it("should penalize opposite direction predictions", async () => {
      const accuracy = analyzeMetricAccuracy(
        "Latency",
        -20, // Predict 20% reduction
        15, // ACTUAL increase (opposite)
        [-24, -16]
      );

      expect(accuracy.accuracy_score).toBeLessThan(60);
      expect(accuracy.variance_percent).toBeGreaterThan(30);
    });

    it("should allow variance within sensitivity range", async () => {
      const accuracy = analyzeMetricAccuracy(
        "Revenue",
        50, // Predict 50% increase
        48, // Actual 48% (within 80-120% range)
        [40, 60]
      );

      expect(accuracy.is_within_sensitivity_range).toBe(true);
      expect(accuracy.accuracy_score).toBeGreaterThanOrEqual(80);
    });

    it("should reduce attribution confidence with concurrent actions", async () => {
      const accuracy = analyzeMetricAccuracy(
        "CPU usage",
        -30,
        -28,
        [-36, -24],
        5 // Many concurrent actions
      );

      expect(accuracy.attribution_confidence).toBe("LOW");
    });
  });

  describe("G4.2: Credibility Recalibration", () => {
    it("should increase credibility for perfect predictions", async () => {
      const records: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "Latency",
          predicted_change_percent: -20,
          actual_change_percent: -20,
          accuracy_score: 98,
          is_within_sensitivity_range: true,
          attribution_confidence: "HIGH",
          notes: "Perfect match",
        },
      ];

      const adjustment = calculateCredibilityAdjustment(records);

      expect(adjustment.total_adjustment).toBeGreaterThan(0);
      expect(adjustment.total_adjustment).toBeGreaterThanOrEqual(2);
    });

    it("should decrease credibility for opposite direction", async () => {
      const records: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "Performance",
          predicted_change_percent: 30,
          actual_change_percent: -10,
          variance_percent: -40,
          accuracy_score: 20,
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Opposite direction",
        },
      ];

      const adjustment = calculateCredibilityAdjustment(records);

      expect(adjustment.total_adjustment).toBeLessThan(-5);
    });

    it("should moderate adjustment for concurrent actions", async () => {
      const records: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "Latency",
          predicted_change_percent: -20,
          actual_change_percent: -25,
          accuracy_score: 95,
          is_within_sensitivity_range: true,
          attribution_confidence: "LOW", // Many concurrent actions
          notes: "Good outcome but unclear attribution",
        },
      ];

      const high_confidence = calculateCredibilityAdjustment([
        {
          ...records[0],
          attribution_confidence: "HIGH",
        },
      ]);

      const low_confidence = calculateCredibilityAdjustment(records);

      // Low confidence adjustment should be smaller
      expect(Math.abs(low_confidence.total_adjustment)).toBeLessThan(
        Math.abs(high_confidence.total_adjustment)
      );
    });

    it("should cap adjustment at ±50", async () => {
      const records: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "M1",
          predicted_change_percent: 100,
          actual_change_percent: -100,
          accuracy_score: 5,
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Massive failure",
        },
        {
          recommendation_id: "r1",
          metric_name: "M2",
          predicted_change_percent: 50,
          actual_change_percent: -50,
          accuracy_score: 10,
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Bad outcome",
        },
      ];

      const adjustment = calculateCredibilityAdjustment(records);

      expect(Math.abs(adjustment.total_adjustment)).toBeLessThanOrEqual(50);
    });
  });

  describe("G4.3: Outcome Record Creation", () => {
    it("should create outcome record from recommendation", async () => {
      const rec = makeRec({
        action: "Optimize caching",
        success_metric: {
          name: "Latency",
          unit: "ms",
          baseline: 500,
          expected_change_percent: -20,
          expected_change_direction: "DOWN",
          measurement_method: "APM",
          measurement_frequency: "DAILY",
        },
      });

      const credibility = makeCredibility({ final_credibility_score: 75 });
      const now = new Date();
      const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const outcome = createOutcomeRecord(
        rec,
        credibility,
        now,
        "operator-1",
        now,
        future
      );

      expect(outcome.recommendation_id).toBe(rec.recommendation_id);
      expect(outcome.status).toBe("PENDING_MEASUREMENT");
      expect(outcome.confidence_before).toBe(75);
    });

    it("should update outcome with actual metrics", async () => {
      const rec = makeRec({
        success_metric: {
          name: "Latency",
          unit: "ms",
          baseline: 500,
          expected_change_percent: -20,
          expected_change_direction: "DOWN",
          measurement_method: "APM",
          measurement_frequency: "DAILY",
        },
      });

      const credibility = makeCredibility({ final_credibility_score: 75 });
      const now = new Date();
      const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const actual_metrics = {
        success: {
          metric_name: "Latency",
          baseline: 500,
          actual_change_percent: -22, // Close to predicted -20
          actual_absolute_change: -110,
          measurement_data_points: 1000,
          measurement_confidence_percent: 95,
        },
      };

      const outcome = createOutcomeRecord(
        rec,
        credibility,
        now,
        "operator-1",
        now,
        future,
        actual_metrics
      );

      expect(outcome.status).toBe("MEASURED_SUCCESS");
      expect(outcome.actual_metrics).toEqual(actual_metrics);
      expect(outcome.confidence_after).toBeGreaterThan(outcome.confidence_before);
    });

    it("should track variance analysis across metrics", async () => {
      const rec = makeRec({
        success_metric: {
          name: "Latency",
          unit: "ms",
          baseline: 500,
          expected_change_percent: -20,
          expected_change_direction: "DOWN",
          measurement_method: "APM",
          measurement_frequency: "DAILY",
        },
      });

      const credibility = makeCredibility({ final_credibility_score: 80 });
      const now = new Date();
      const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const actual_metrics = {
        success: {
          metric_name: "Latency",
          baseline: 500,
          actual_change_percent: -15, // Underperformed: expected -20, got -15
          actual_absolute_change: -75,
          measurement_data_points: 1000,
          measurement_confidence_percent: 95,
        },
      };

      const outcome = createOutcomeRecord(
        rec,
        credibility,
        now,
        "operator-1",
        now,
        future,
        actual_metrics
      );

      expect(outcome.variance_analysis.length).toBeGreaterThan(0);
      expect(outcome.variance_analysis[0].variance_percent).toEqual(5); // -15 - (-20)
      // Underperformance should reduce confidence
      expect(outcome.confidence_after).toBeLessThan(outcome.confidence_before);
    });
  });

  describe("G4.4: Hostile Scenarios", () => {
    it("should heavily penalize false positive recommendations", async () => {
      // Recommendation predicted improvement but action made things worse
      const records: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "Success rate",
          predicted_change_percent: 50, // Expected +50%
          actual_change_percent: -30, // Actually -30%
          variance_percent: -80,
          accuracy_score: 10,
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Opposite direction",
        },
      ];

      const adjustment = calculateCredibilityAdjustment(records);

      expect(adjustment.total_adjustment).toBeLessThan(-8);
    });

    it("should track underperformance vs outperformance separately", async () => {
      const underperform: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "ROI",
          predicted_change_percent: 100,
          actual_change_percent: 40, // Got 40% instead of 100%
          variance_percent: -60,
          accuracy_score: 40,
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Underperformed",
        },
      ];

      const outperform: PredictionAccuracy[] = [
        {
          recommendation_id: "r1",
          metric_name: "ROI",
          predicted_change_percent: 100,
          actual_change_percent: 200, // Got 200% instead of 100%
          variance_percent: 100,
          accuracy_score: 80, // Surprise is positive but unexpected
          is_within_sensitivity_range: false,
          attribution_confidence: "HIGH",
          notes: "Outperformed",
        },
      ];

      const under_adj = calculateCredibilityAdjustment(underperform);
      const over_adj = calculateCredibilityAdjustment(outperform);

      // Both should be penalized (outside sensitivity range)
      // but underperform worse
      expect(under_adj.total_adjustment).toBeLessThan(over_adj.total_adjustment);
    });
  });
});

import { z } from "zod";
import { Recommendation, CredibilityBreakdown } from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G4: PREDICTED VS ACTUAL OUTCOME TRACKING
 *
 * Closed-loop validation system that:
 * 1. Records recommendation issuance
 * 2. Captures operator implementation action
 * 3. Measures KPI deltas post-implementation
 * 4. Compares predicted vs actual outcomes
 * 5. Recalibrates confidence based on accuracy
 * 6. Updates heuristic credibility weights
 *
 * RULES:
 * - Every implemented recommendation must have follow-up measurement
 * - Predictions must be explicit and measurable
 * - Actual outcomes must come from system telemetry (not self-reported)
 * - Variance analysis drives credibility recalibration
 * - Prediction failures escalated for investigation
 * - Attribution model accounts for concurrent actions
 */

// ============================================================================
// OUTCOME TRACKING SCHEMA
// ============================================================================

export const OutcomeRecordSchema = z.object({
  outcome_id: z.string().min(1),
  workspace_id: z.string().min(1),
  recommendation_id: z.string().min(1),

  // Implementation record
  implementation_date: z.date(),
  implemented_by: z.string(),
  implementation_notes: z.string().optional(),

  // Predicted impact (from recommendation)
  predicted_metrics: z.record(z.string(), z.object({
    metric_name: z.string(),
    baseline: z.number(),
    predicted_change_percent: z.number(),
    predicted_absolute_change: z.number(),
    measurement_method: z.string(),
    measurement_frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  })),

  // Actual measured impact
  measurement_start_date: z.date(),
  measurement_end_date: z.date(),
  actual_metrics: z.record(z.string(), z.object({
    metric_name: z.string(),
    baseline: z.number(),
    actual_change_percent: z.number(),
    actual_absolute_change: z.number(),
    measurement_data_points: z.number(), // How many samples
    measurement_confidence_percent: z.number().min(0).max(100),
  })).optional(),

  // Variance analysis
  variance_analysis: z.array(z.object({
    metric_key: z.string(),
    predicted_change_percent: z.number(),
    actual_change_percent: z.number().optional(),
    variance_percent: z.number().optional(), // actual - predicted
    is_in_sensitivity_range: z.boolean().optional(),
    attribution_confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    concurrent_actions: z.array(z.string()).optional(), // Other actions affecting this metric
    confidence_adjustment: z.number().min(-0.5).max(0.5).optional(), // Adjustment to credibility
  })),

  // Overall outcome status
  status: z.enum([
    "PENDING_MEASUREMENT", // Waiting for post-implementation data
    "MEASURED_SUCCESS", // Actual matches predicted
    "MEASURED_UNDERPERFORMANCE", // Actual < predicted
    "MEASURED_SURPRISE", // Actual > predicted or unexpected
    "MEASUREMENT_INCONCLUSIVE", // Insufficient data
    "ACTION_NOT_IMPLEMENTED", // Was rejected or not executed
    "ACTION_REVERSED", // Was rolled back
  ]),

  // Credibility impact
  confidence_before: z.number().min(0).max(100),
  confidence_after: z.number().min(0).max(100),
  confidence_change: z.number().min(-100).max(100),
  credibility_recalibration_reason: z.string(),

  // Audit trail
  created_date: z.date(),
  updated_date: z.date(),
  measurement_complete_date: z.date().optional(),
});

export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;

// ============================================================================
// OUTCOME ANALYSIS
// ============================================================================

export interface PredictionAccuracy {
  recommendation_id: string;
  metric_name: string;
  predicted_change_percent: number;
  actual_change_percent?: number;
  variance_percent?: number;
  accuracy_score: number; // 0-100, 100=perfect, 0=completely wrong
  is_within_sensitivity_range: boolean;
  attribution_confidence: "HIGH" | "MEDIUM" | "LOW";
  notes: string;
}

/**
 * Compare predicted vs actual outcome for a metric
 */
export function analyzeMetricAccuracy(
  metric_name: string,
  predicted_change_percent: number,
  actual_change_percent: number | undefined,
  sensitivity_range?: [number, number],
  concurrent_actions?: number
): PredictionAccuracy {
  if (actual_change_percent === undefined) {
    return {
      recommendation_id: "",
      metric_name,
      predicted_change_percent,
      accuracy_score: 0,
      is_within_sensitivity_range: false,
      attribution_confidence: "LOW",
      notes: "Measurement not yet available",
    };
  }

  // Calculate variance
  const variance = actual_change_percent - predicted_change_percent;
  const variance_percent = predicted_change_percent !== 0
    ? (variance / Math.abs(predicted_change_percent)) * 100
    : variance;

  // Check sensitivity range
  const is_within_range = sensitivity_range
    ? actual_change_percent >= sensitivity_range[0] && actual_change_percent <= sensitivity_range[1]
    : false;

  // Accuracy score: how close to predicted
  // 100 = exact match, 0 = opposite direction or massive overshoot
  const abs_variance = Math.abs(variance);
  let accuracy_score = Math.max(0, 100 - abs_variance * 2); // Penalize by 2% per percentage point off

  // Check for opposite direction (sign mismatch)
  const predicted_positive = predicted_change_percent > 0;
  const actual_positive = actual_change_percent > 0;
  const opposite_direction = predicted_positive !== actual_positive &&
                             predicted_change_percent !== 0 &&
                             actual_change_percent !== 0;

  if (opposite_direction) {
    // Opposite direction: severely penalize
    accuracy_score = Math.max(0, 50 - abs_variance);
  }

  // Attribution confidence
  let attribution_confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
  if (!is_within_range) {
    attribution_confidence = "MEDIUM";
  }
  if (concurrent_actions && concurrent_actions > 2) {
    attribution_confidence = "LOW"; // Many concurrent actions = unclear attribution
  }

  const notes = is_within_range
    ? `Within sensitivity range [${sensitivity_range?.[0]}, ${sensitivity_range?.[1]}]`
    : `Outside range. Variance: ${variance_percent.toFixed(1)}%`;

  return {
    recommendation_id: "",
    metric_name,
    predicted_change_percent,
    actual_change_percent,
    variance_percent,
    accuracy_score: Math.max(0, Math.min(100, accuracy_score)),
    is_within_sensitivity_range: is_within_range,
    attribution_confidence,
    notes,
  };
}

/**
 * Calculate credibility adjustment based on outcome accuracy
 *
 * RULES:
 * - Perfect predictions (+5 to credibility)
 * - Within sensitivity range (+2)
 * - Same direction but outside range: -2 to +1 based on accuracy
 * - Wrong direction (-10)
 * - Magnitude off by 2x+ (-5)
 * - Not implemented (0 change)
 */
export function calculateCredibilityAdjustment(
  accuracy_records: PredictionAccuracy[]
): {
  total_adjustment: number;
  adjustment_by_metric: Record<string, number>;
  adjustment_reason: string;
  confidence_before: number;
  confidence_after: number;
} {
  let total_adjustment = 0;
  const adjustment_by_metric: Record<string, number> = {};

  for (const record of accuracy_records) {
    if (record.actual_change_percent === undefined) {
      adjustment_by_metric[record.metric_name] = 0;
      continue;
    }

    const predicted = record.predicted_change_percent;
    const actual = record.actual_change_percent;
    let adjustment = 0;

    if (record.accuracy_score >= 95) {
      adjustment = 5; // Perfect
    } else if (record.is_within_sensitivity_range) {
      adjustment = 2; // Within range
    } else if ((predicted > 0 && actual > 0) || (predicted < 0 && actual < 0)) {
      // Same direction but outside range
      if (record.accuracy_score >= 95) {
        adjustment = 1; // Close, acceptable
      } else if (record.accuracy_score >= 80) {
        adjustment = -1; // Noticeable miss
      } else {
        adjustment = -3; // Significant miss
      }
    } else {
      // Wrong direction
      adjustment = -10;
    }

    // Concurrent actions reduce attribution
    if (record.attribution_confidence === "LOW") {
      adjustment *= 0.5;
    } else if (record.attribution_confidence === "MEDIUM") {
      adjustment *= 0.75;
    }

    adjustment_by_metric[record.metric_name] = adjustment;
    total_adjustment += adjustment;
  }

  // Average adjustment across metrics
  const avg_adjustment = accuracy_records.length > 0
    ? total_adjustment / accuracy_records.length
    : 0;

  const reason_parts: string[] = [];
  for (const [metricLabel, adj] of Object.entries(adjustment_by_metric)) {
    if (adj > 0) {
      reason_parts.push(`${metricLabel}: +${adj.toFixed(1)}`);
    } else if (adj < 0) {
      reason_parts.push(`${metricLabel}: ${adj.toFixed(1)}`);
    }
  }

  return {
    total_adjustment: Math.max(-50, Math.min(50, avg_adjustment)), // Clamp to ±50
    adjustment_by_metric,
    adjustment_reason: reason_parts.join("; ") || "No measurable impact",
    confidence_before: 0, // Will be set by caller
    confidence_after: 0, // Will be set by caller
  };
}

/**
 * Build outcome record from recommendation and measurement
 */
export function createOutcomeRecord(
  rec: Recommendation,
  credibility: CredibilityBreakdown,
  implementation_date: Date,
  implemented_by: string,
  measurement_start_date: Date,
  measurement_end_date: Date,
  actual_metrics: Record<string, { metric_name: string; baseline: number; actual_change_percent: number; actual_absolute_change: number; measurement_data_points: number; measurement_confidence_percent: number }> | undefined = undefined,
  concurrent_actions: string[] = []
): OutcomeRecord {
  const now = new Date();
  const status = !actual_metrics
    ? "PENDING_MEASUREMENT"
    : "MEASURED_SUCCESS"; // Will be refined based on accuracy

  // Extract predicted metrics from success_metric and failure_metric
  const predicted_metrics: Record<string, any> = {};
  if (rec.success_metric) {
    predicted_metrics["success"] = {
      metric_name: rec.success_metric.name,
      baseline: rec.success_metric.baseline,
      predicted_change_percent: rec.success_metric.expected_change_percent,
      predicted_absolute_change: rec.success_metric.baseline * (rec.success_metric.expected_change_percent / 100),
      measurement_method: rec.success_metric.measurement_method,
      measurement_frequency: rec.success_metric.measurement_frequency,
    };
  }
  if (rec.failure_metric) {
    predicted_metrics["failure"] = {
      metric_name: rec.failure_metric.name,
      baseline: rec.failure_metric.baseline,
      predicted_change_percent: rec.failure_metric.expected_change_percent,
      predicted_absolute_change: rec.failure_metric.baseline * (rec.failure_metric.expected_change_percent / 100),
      measurement_method: rec.failure_metric.measurement_method,
      measurement_frequency: rec.failure_metric.measurement_frequency,
    };
  }

  // Analyze variance if actual metrics provided
  const variance_analysis = [];
  let confidence_after = credibility.final_credibility_score;

  if (actual_metrics) {
    const accuracy_records: PredictionAccuracy[] = [];

    for (const [key, predicted] of Object.entries(predicted_metrics)) {
      const actual = actual_metrics[key];
      if (actual) {
        const accuracy = analyzeMetricAccuracy(
          predicted.metric_name,
          predicted.predicted_change_percent,
          actual.actual_change_percent,
          [predicted.predicted_change_percent * 0.8, predicted.predicted_change_percent * 1.2],
          concurrent_actions.length
        );
        accuracy_records.push(accuracy);

        variance_analysis.push({
          metric_key: key,
          predicted_change_percent: predicted.predicted_change_percent,
          actual_change_percent: actual.actual_change_percent,
          variance_percent: actual.actual_change_percent - predicted.predicted_change_percent,
          is_in_sensitivity_range: accuracy.is_within_sensitivity_range,
          attribution_confidence: accuracy.attribution_confidence,
          concurrent_actions,
        });
      }
    }

    // Recalibrate confidence
    if (accuracy_records.length > 0) {
      const adjustment = calculateCredibilityAdjustment(accuracy_records);
      confidence_after = Math.max(0, Math.min(100, credibility.final_credibility_score + adjustment.total_adjustment));
    }
  }

  return {
    outcome_id: `outcome-${rec.recommendation_id}-${now.getTime()}`,
    workspace_id: rec.workspace_id,
    recommendation_id: rec.recommendation_id,
    implementation_date,
    implemented_by,
    predicted_metrics,
    measurement_start_date,
    measurement_end_date,
    actual_metrics,
    variance_analysis,
    status,
    confidence_before: credibility.final_credibility_score,
    confidence_after,
    confidence_change: confidence_after - credibility.final_credibility_score,
    credibility_recalibration_reason: variance_analysis.length > 0
      ? `Measured variance: ${variance_analysis.map((v) => `${v.metric_key}=${v.variance_percent?.toFixed(1)}%`).join(", ")}`
      : "Measurement pending",
    created_date: now,
    updated_date: now,
    measurement_complete_date: actual_metrics ? now : undefined,
  };
}

import type { OperatorItem } from "@/domain/operator/types";

export function calculateDeviation(
  predicted: number,
  actual: number
): number {
  if (predicted === 0) {
    return 1;
  }

  const deviation = Math.abs(predicted - actual) / Math.abs(predicted);

  return deviation;
}

/**
 * Calibration metrics for system reliability measurement.
 */
export interface CalibrationMetrics {
  avgAccuracy: number | null;
  avgError: number | null;
  weightedAccuracy: number | null;
  successRate: number | null;
  itemsAnalyzed: number;
  successCount: number;
  valid: boolean;
  reason?: string;
}

/**
 * Calibration metrics segmented by impact magnitude.
 */
export interface SegmentedCalibrationMetrics {
  low: CalibrationMetrics;
  medium: CalibrationMetrics;
  high: CalibrationMetrics;
}

/**
 * Complete calibration response with overall and segmented metrics.
 */
export interface SegmentedCalibrationResponse {
  overall: CalibrationMetrics;
  byImpactSegment: SegmentedCalibrationMetrics;
}

/**
 * Compute calibration metrics from completed items.
 *
 * Success is defined as: actualOutcome >= expectedImpact
 * Accuracy is computed only when decisionAccuracy is available.
 * Error is computed only when decisionError is available.
 * Weighted accuracy weights each accuracy by the absolute expected impact value.
 * Success rate is a percentage of successful items relative to total completed.
 *
 * @param items - Array of OperatorItems with completion data
 * @returns CalibrationMetrics with averages, weighted accuracy, and success rate
 *
 * Deterministic: Same inputs always produce same output
 */
export function computeCalibration(
  items: OperatorItem[]
): CalibrationMetrics {
  // Validate input
  if (!Array.isArray(items)) {
    return {
      avgAccuracy: null,
      avgError: null,
      weightedAccuracy: null,
      successRate: null,
      itemsAnalyzed: 0,
      successCount: 0,
      valid: false,
      reason: "Items must be an array",
    };
  }

  // Filter to completed items with actual outcome values.
  // "done" is the legacy status; "outcome_recorded" is the canonical status written
  // by the current decision-lifecycle service at OUTCOME_RECORDED state transition.
  // Both must be included so calibration is not blind to new completions.
  const COMPLETED_STATUSES = new Set(["done", "outcome_recorded"]);
  const completedItems = items.filter(
    (item) =>
      COMPLETED_STATUSES.has(item.status) &&
      item.actualOutcomeValue !== undefined &&
      item.actualOutcomeValue !== null &&
      item.impactExpected !== undefined &&
      item.impactExpected !== null
  );

  if (completedItems.length === 0) {
    return {
      avgAccuracy: null,
      avgError: null,
      weightedAccuracy: null,
      successRate: null,
      itemsAnalyzed: 0,
      successCount: 0,
      valid: false,
      reason: "No completed items with outcome data",
    };
  }

  // Calculate success count: actualOutcome >= expectedImpact
  let successCount = 0;
  for (const item of completedItems) {
    if (
      item.actualOutcomeValue !== null &&
      item.actualOutcomeValue !== undefined &&
      item.impactExpected !== null &&
      item.impactExpected !== undefined &&
      item.actualOutcomeValue >= item.impactExpected
    ) {
      successCount++;
    }
  }

  // Calculate success rate as percentage
  const successRate =
    Math.round((successCount / completedItems.length) * 10000) / 100; // 2 decimal places

  // Calculate average accuracy (only from items with decisionAccuracy)
  const itemsWithAccuracy = completedItems.filter(
    (item) =>
      item.decisionAccuracy !== undefined && item.decisionAccuracy !== null
  );

  let avgAccuracy: number | null = null;
  if (itemsWithAccuracy.length > 0) {
    const sumAccuracy = itemsWithAccuracy.reduce(
      (sum, item) => sum + (item.decisionAccuracy ?? 0),
      0
    );
    avgAccuracy =
      Math.round((sumAccuracy / itemsWithAccuracy.length) * 10000) / 10000; // 4 decimal places
  }

  // Calculate weighted accuracy
  // weight = abs(expectedImpact)
  // weightedAccuracy = sum(accuracy * weight) / sum(weight)
  let weightedAccuracy: number | null = null;
  const itemsWithWeightedAccuracy = completedItems.filter(
    (item) =>
      item.decisionAccuracy !== undefined &&
      item.decisionAccuracy !== null &&
      item.impactExpected !== undefined &&
      item.impactExpected !== null
  );

  if (itemsWithWeightedAccuracy.length > 0) {
    let sumWeightedAccuracy = 0;
    let sumWeights = 0;

    for (const item of itemsWithWeightedAccuracy) {
      const weight = Math.abs(item.impactExpected);
      const accuracy = item.decisionAccuracy ?? 0;
      sumWeightedAccuracy += accuracy * weight;
      sumWeights += weight;
    }

    if (sumWeights > 0) {
      weightedAccuracy =
        Math.round((sumWeightedAccuracy / sumWeights) * 10000) / 10000; // 4 decimal places
    }
  }

  // Calculate average error (only from items with decisionError)
  const itemsWithError = completedItems.filter(
    (item) => item.decisionError !== undefined && item.decisionError !== null
  );

  let avgError: number | null = null;
  if (itemsWithError.length > 0) {
    const sumError = itemsWithError.reduce(
      (sum, item) => sum + (item.decisionError ?? 0),
      0
    );
    avgError =
      Math.round((sumError / itemsWithError.length) * 100) / 100; // 2 decimal places
  }

  return {
    avgAccuracy,
    avgError,
    weightedAccuracy,
    successRate,
    itemsAnalyzed: completedItems.length,
    successCount,
    valid: true,
  };
}

/**
 * Compute calibration metrics segmented by impact magnitude.
 *
 * @param items - Array of OperatorItems with completion data
 * @returns SegmentedCalibrationMetrics with metrics for each impact segment
 *
 * Deterministic: Same inputs always produce same output
 */
export function computeCalibrationBySegment(
  items: OperatorItem[]
): SegmentedCalibrationMetrics {
  type ImpactSegment = "low" | "medium" | "high";

  const segments: Record<ImpactSegment, OperatorItem[]> = {
    low: [],
    medium: [],
    high: [],
  };

  // Categorize items by impact magnitude
  for (const item of items) {
    if (item.impactExpected < 1000) {
      segments.low.push(item);
    } else if (item.impactExpected <= 10000) {
      segments.medium.push(item);
    } else {
      segments.high.push(item);
    }
  }

  // Compute calibration metrics for each segment
  return {
    low: computeCalibration(segments.low),
    medium: computeCalibration(segments.medium),
    high: computeCalibration(segments.high),
  };
}

/**
 * Get calibration health status based on metrics.
 * Healthy: successRate > 70% and avgAccuracy within 0.8-1.2
 * At risk: successRate 50-70% or avgAccuracy outside range
 * Critical: successRate < 50%
 */
export function getCalibrationHealth(metrics: CalibrationMetrics): string {
  if (!metrics.valid || metrics.successRate === null) {
    return "unknown";
  }

  if (metrics.successRate < 50) {
    return "critical";
  }

  if (metrics.successRate < 70) {
    return "at_risk";
  }

  if (metrics.avgAccuracy !== null) {
    if (metrics.avgAccuracy < 0.8 || metrics.avgAccuracy > 1.2) {
      return "at_risk";
    }
  }

  return "healthy";
}

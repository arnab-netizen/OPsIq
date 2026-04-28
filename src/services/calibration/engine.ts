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
  successRate: number | null;
  itemsAnalyzed: number;
  successCount: number;
  valid: boolean;
  reason?: string;
}

/**
 * Compute calibration metrics from completed items.
 *
 * Success is defined as: actualOutcome >= expectedImpact
 * Accuracy is computed only when decisionAccuracy is available.
 * Error is computed only when decisionError is available.
 * Success rate is a percentage of successful items relative to total completed.
 *
 * @param items - Array of OperatorItems with completion data
 * @returns CalibrationMetrics with averages and success rate
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
      successRate: null,
      itemsAnalyzed: 0,
      successCount: 0,
      valid: false,
      reason: "Items must be an array",
    };
  }

  // Filter to completed items with actual outcome values
  const completedItems = items.filter(
    (item) =>
      item.status === "done" &&
      item.actualOutcomeValue !== undefined &&
      item.actualOutcomeValue !== null &&
      item.impactExpected !== undefined &&
      item.impactExpected !== null
  );

  if (completedItems.length === 0) {
    return {
      avgAccuracy: null,
      avgError: null,
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
    successRate,
    itemsAnalyzed: completedItems.length,
    successCount,
    valid: true,
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

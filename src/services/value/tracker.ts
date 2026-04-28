/**
 * Value Tracker
 *
 * Tracks financial impact across decisions by computing total expected vs actual value.
 * Measures how well decision-making system delivers financial outcomes.
 */

import type { OperatorItem } from "@/domain/operator/types";

export interface ValueMetrics {
  totalExpected: number;
  totalActual: number;
  totalDelta: number;
  itemsAnalyzed: number;
  valid: boolean;
  reason?: string;
}

/**
 * Calculate total value impact from completed items.
 *
 * totalExpected: sum of all impactExpected values
 * totalActual: sum of all actualOutcomeValue values
 * totalDelta: totalActual - totalExpected (value gained/lost vs prediction)
 *
 * @param items - Array of OperatorItems with completion data
 * @returns ValueMetrics with totals and delta
 *
 * Deterministic: Same inputs always produce same output
 */
export function calculateValue(items: OperatorItem[]): ValueMetrics {
  // Validate input
  if (!Array.isArray(items)) {
    return {
      totalExpected: 0,
      totalActual: 0,
      totalDelta: 0,
      itemsAnalyzed: 0,
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
      totalExpected: 0,
      totalActual: 0,
      totalDelta: 0,
      itemsAnalyzed: 0,
      valid: false,
      reason: "No completed items with outcome data",
    };
  }

  // Calculate totals
  let totalExpected = 0;
  let totalActual = 0;

  for (const item of completedItems) {
    if (
      item.impactExpected !== null &&
      item.impactExpected !== undefined
    ) {
      totalExpected += item.impactExpected;
    }

    if (
      item.actualOutcomeValue !== null &&
      item.actualOutcomeValue !== undefined
    ) {
      totalActual += item.actualOutcomeValue;
    }
  }

  // Calculate delta: actual - expected
  const totalDelta = totalActual - totalExpected;

  // Round to 2 decimal places for currency
  const roundedExpected = Math.round(totalExpected * 100) / 100;
  const roundedActual = Math.round(totalActual * 100) / 100;
  const roundedDelta = Math.round(totalDelta * 100) / 100;

  return {
    totalExpected: roundedExpected,
    totalActual: roundedActual,
    totalDelta: roundedDelta,
    itemsAnalyzed: completedItems.length,
    valid: true,
  };
}

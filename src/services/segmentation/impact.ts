import type { OperatorItem } from "@/domain/operator/types";

export type ImpactSegment = "low" | "medium" | "high";

export interface ImpactSegmentMetrics {
  segment: ImpactSegment;
  count: number;
  avgAccuracy: number | null;
}

export interface SegmentedImpactResult {
  low: ImpactSegmentMetrics;
  medium: ImpactSegmentMetrics;
  high: ImpactSegmentMetrics;
  valid: boolean;
  reason?: string;
}

function getImpactSegment(impactExpected: number | null | undefined): ImpactSegment | null {
  if (impactExpected === null || impactExpected === undefined) {
    return null;
  }

  if (impactExpected < 1000) {
    return "low";
  }

  if (impactExpected <= 10000) {
    return "medium";
  }

  return "high";
}

/**
 * Segment items by expected impact magnitude and calculate accuracy per segment.
 *
 * Segments:
 * - Low: impactExpected < 1000
 * - Medium: 1000 <= impactExpected <= 10000
 * - High: impactExpected > 10000
 *
 * Average accuracy is computed only from items with decisionAccuracy defined.
 *
 * @param items - Array of OperatorItems
 * @returns SegmentedImpactResult with counts and average accuracy per segment
 *
 * Deterministic: Same inputs always produce same output
 */
export function segmentImpact(
  items: OperatorItem[]
): SegmentedImpactResult {
  // Validate input
  if (!Array.isArray(items)) {
    return {
      low: { segment: "low", count: 0, avgAccuracy: null },
      medium: { segment: "medium", count: 0, avgAccuracy: null },
      high: { segment: "high", count: 0, avgAccuracy: null },
      valid: false,
      reason: "Items must be an array",
    };
  }

  // Initialize segment trackers
  const segments = {
    low: { segment: "low" as const, items: [] as OperatorItem[] },
    medium: { segment: "medium" as const, items: [] as OperatorItem[] },
    high: { segment: "high" as const, items: [] as OperatorItem[] },
  };

  // Categorize items by impact
  for (const item of items) {
    const segment = getImpactSegment(item.impactExpected);
    if (segment) {
      segments[segment].items.push(item);
    }
  }

  // Calculate metrics for each segment
  const result: SegmentedImpactResult = {
    low: calculateSegmentMetrics("low", segments.low.items),
    medium: calculateSegmentMetrics("medium", segments.medium.items),
    high: calculateSegmentMetrics("high", segments.high.items),
    valid: true,
  };

  return result;
}

function calculateSegmentMetrics(
  segment: ImpactSegment,
  items: OperatorItem[]
): ImpactSegmentMetrics {
  const count = items.length;

  // Calculate average accuracy only from items with decisionAccuracy
  let avgAccuracy: number | null = null;
  const itemsWithAccuracy = items.filter(
    (item) => item.decisionAccuracy !== undefined && item.decisionAccuracy !== null
  );

  if (itemsWithAccuracy.length > 0) {
    const sumAccuracy = itemsWithAccuracy.reduce(
      (sum, item) => sum + (item.decisionAccuracy ?? 0),
      0
    );
    avgAccuracy =
      Math.round((sumAccuracy / itemsWithAccuracy.length) * 10000) / 10000; // 4 decimal places
  }

  return {
    segment,
    count,
    avgAccuracy,
  };
}

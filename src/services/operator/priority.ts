import { OperatorItem } from "@/domain/operator/types";

interface PriorityScoreInput {
  impactExpected: number;
  confidence: number;
  dueAt?: Date | null;
  historicalAccuracy?: number | null;
  ageInDays?: number;
}

/**
 * Calculate recency weight factor.
 *
 * Reduces priority as items age:
 * - Day 0 (new): weight = 1.0
 * - Day 1: weight = 0.5
 * - Day 7: weight ≈ 0.125
 * - Day 30: weight ≈ 0.032
 *
 * Formula: recencyWeight = 1 / (1 + ageInDays)
 * Deterministic: same age always produces same weight
 */
export function getRecencyWeight(ageInDays: number = 0): number {
  if (ageInDays < 0) {
    ageInDays = 0;
  }
  const weight = 1 / (1 + ageInDays);
  return Math.round(weight * 10000) / 10000;
}

/**
 * Calculate calibration-based weight multiplier.
 *
 * Adjusts priority weight based on historical prediction accuracy:
 * - accuracy < 0.5: reduce weight (0.5x to 1.0x)
 * - accuracy 0.5-0.8: normal weight (1.0x)
 * - accuracy > 0.8: increase weight (1.0x to 1.5x)
 *
 * Bounded to prevent priority explosion: [0.5, 1.5]
 * Deterministic: same accuracy always produces same multiplier
 */
export function getCalibrationMultiplier(accuracy: number | null | undefined): number {
  // No historical data: use neutral multiplier
  if (accuracy === null || accuracy === undefined) {
    return 1.0;
  }

  // Validate bounded range
  if (accuracy < 0 || accuracy > 2) {
    return 1.0;
  }

  // Below 0.5: predictions are unreliable, reduce priority
  // Linear scale from 0 to 0.5 → 0.5 to 1.0
  if (accuracy < 0.5) {
    const multiplier = 0.5 + (accuracy / 0.5) * 0.5;
    return Math.round(multiplier * 10000) / 10000;
  }

  // Between 0.5 and 0.8: normal prediction accuracy
  if (accuracy <= 0.8) {
    return 1.0;
  }

  // Above 0.8: predictions are reliable, increase priority
  // Linear scale from 0.8 to 1.5 → 1.0 to 1.5
  // multiplier = 1.0 + ((accuracy - 0.8) / (1.5 - 0.8)) * (1.5 - 1.0)
  // = 1.0 + ((accuracy - 0.8) / 0.7) * 0.5
  const multiplier = Math.min(1.0 + ((accuracy - 0.8) / 0.7) * 0.5, 1.5);
  return Math.round(multiplier * 10000) / 10000;
}

/**
 * Deterministic priority scoring engine v2.
 *
 * Smart priority calculation based on impact, confidence, and recency.
 * Formula: expectedImpact * confidenceScore * recencyWeight
 * Where:
 * - expectedImpact: decision's expected impact
 * - confidenceScore: decision's confidence (0-1)
 * - recencyWeight: 1 / (1 + ageInDays)
 *
 * At creation (ageInDays=0): priority = expectedImpact * confidence
 * As items age, priority decays: older items have lower priority
 *
 * Always produces the same score for the same input (deterministic).
 * Result is clamped to 10000 and rounded to 2 decimals.
 */
export function calculatePriorityScore(input: PriorityScoreInput): number {
  // 1. Get recency weight (defaults to 0 days for new items)
  const ageInDays = input.ageInDays ?? 0;
  const recencyWeight = getRecencyWeight(ageInDays);

  // 2. Calculate priority: impact * confidence * recency
  const priorityScore = input.impactExpected * input.confidence * recencyWeight;

  // 3. Clamp to max 10000
  const clampedScore = Math.min(priorityScore, 10000);

  // 4. Round to 2 decimals for stability
  return Math.round(clampedScore * 100) / 100;
}

/**
 * Legacy function for backward compatibility.
 * Uses OperatorItem and applies deterministic priority scoring.
 */
export function calculatePriority(item: OperatorItem): number {
  // Validate impact
  if (item.impactExpected <= 0) {
    return 0;
  }

  return calculatePriorityScore({
    impactExpected: item.impactExpected,
    confidence: item.confidence,
    dueAt: item.dueAt ? new Date(item.dueAt) : null,
    historicalAccuracy: item.decisionAccuracy,
  });
}

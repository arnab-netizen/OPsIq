import { OperatorItem } from "@/domain/operator/types";

interface PriorityScoreInput {
  impactExpected: number;
  confidence: number;
  dueAt?: Date | null;
  historicalAccuracy?: number | null;
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
 * Deterministic priority scoring engine with calibration feedback.
 *
 * Calculates priority score based on impact, confidence, urgency, and historical accuracy.
 * Formula: base * urgency_multiplier * calibration_multiplier
 * Where base = impactExpected * confidence
 * And urgency multiplier depends on hours remaining until dueAt
 * And calibration multiplier depends on historical prediction accuracy
 *
 * Always produces the same score for the same input (deterministic).
 * Result is clamped to 10000 and rounded to 2 decimals.
 */
export function calculatePriorityScore(input: PriorityScoreInput): number {
  // 1. Calculate base score
  const base = input.impactExpected * input.confidence;

  // 2. Calculate urgency multiplier based on hours remaining
  let urgencyMultiplier = 1;

  if (input.dueAt) {
    const now = new Date();
    const dueDate = new Date(input.dueAt);
    const timeRemaining = dueDate.getTime() - now.getTime();
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);

    if (hoursRemaining < 6) {
      urgencyMultiplier = 3;
    } else if (hoursRemaining < 12) {
      urgencyMultiplier = 2;
    } else if (hoursRemaining < 24) {
      urgencyMultiplier = 1.5;
    }
  }

  // 3. Calculate calibration multiplier based on historical accuracy
  const calibrationMultiplier = getCalibrationMultiplier(
    input.historicalAccuracy
  );

  // 4. Calculate final score
  const priorityScore = base * urgencyMultiplier * calibrationMultiplier;

  // 5. Clamp to max 10000
  const clampedScore = Math.min(priorityScore, 10000);

  // 6. Round to 2 decimals for stability
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

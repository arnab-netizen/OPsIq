import { OperatorItem } from "@/domain/operator/types";

interface PriorityScoreInput {
  impactExpected: number;
  confidence: number;
  dueAt?: Date | null;
}

/**
 * Deterministic priority scoring engine.
 *
 * Calculates priority score based on impact, confidence, and urgency.
 * Formula: base * urgency_multiplier
 * Where base = impactExpected * confidence
 * And urgency multiplier depends on hours remaining until dueAt
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

  // 3. Calculate final score
  const priorityScore = base * urgencyMultiplier;

  // 4. Clamp to max 10000
  const clampedScore = Math.min(priorityScore, 10000);

  // 5. Round to 2 decimals for stability
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
  });
}

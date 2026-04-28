/**
 * Decision Accuracy Engine
 *
 * Computes decision correctness metrics:
 * - Accuracy: ratio of actual to expected (actual / expected if expected > 0)
 * - Error: absolute difference (actual - expected)
 */

interface DecisionAccuracyResult {
  accuracy: number | null;
  error: number | null;
  valid: boolean;
  reason?: string;
}

/**
 * Calculate decision accuracy and error metrics.
 *
 * @param expectedImpact - The predicted impact value
 * @param actualOutcome - The measured actual impact
 * @returns Object with accuracy (ratio), error (delta), valid flag, and reason if invalid
 *
 * Accuracy: actual / expected (only if expected !== 0, else null)
 * Error: actual - expected (rounded to 2 decimals)
 * Deterministic: Same inputs always produce same output
 */
export function calculateDecisionAccuracy(
  expectedImpact: number | null | undefined,
  actualOutcome: number | null | undefined
): DecisionAccuracyResult {
  // Handle null/undefined inputs
  if (
    expectedImpact === null ||
    expectedImpact === undefined ||
    actualOutcome === null ||
    actualOutcome === undefined
  ) {
    return {
      accuracy: null,
      error: null,
      valid: false,
      reason: "Missing expectedImpact or actualOutcome",
    };
  }

  // Handle non-numeric inputs
  if (typeof expectedImpact !== "number" || typeof actualOutcome !== "number") {
    return {
      accuracy: null,
      error: null,
      valid: false,
      reason: "Expected numeric values",
    };
  }

  // Handle NaN or Infinity
  if (!Number.isFinite(expectedImpact) || !Number.isFinite(actualOutcome)) {
    return {
      accuracy: null,
      error: null,
      valid: false,
      reason: "Values must be finite numbers",
    };
  }

  // Calculate error: actual - expected
  const rawError = actualOutcome - expectedImpact;
  const error = Math.round(rawError * 100) / 100;

  // Calculate accuracy: actual / expected (only if expected !== 0)
  let accuracy: number | null = null;
  if (expectedImpact !== 0) {
    const rawAccuracy = actualOutcome / expectedImpact;
    accuracy = Math.round(rawAccuracy * 10000) / 10000; // 4 decimal places for ratios
    // Convert -0 to 0 for consistency
    accuracy = accuracy === 0 ? 0 : accuracy;
  }

  return {
    accuracy,
    error,
    valid: true,
  };
}

/**
 * Get accuracy category for interpretation.
 * Categories: "on_track" (0.9-1.1), "underperforming" (<0.9), "overperforming" (>1.1)
 */
export function getAccuracyCategory(accuracy: number | null): string {
  if (accuracy === null) {
    return "unknown";
  }

  if (accuracy >= 0.9 && accuracy <= 1.1) {
    return "on_track";
  } else if (accuracy < 0.9) {
    return "underperforming";
  } else {
    return "overperforming";
  }
}

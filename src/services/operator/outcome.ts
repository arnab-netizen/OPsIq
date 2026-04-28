/**
 * Outcome Delta Engine
 *
 * Computes the difference between expected and actual impact.
 * Delta indicates how well the decision's prediction matched reality.
 * Positive delta = better than expected, Negative delta = worse than expected
 */

interface OutcomeDeltaInput {
  expectedImpact: number | null;
  actualOutcome: number | null;
}

interface OutcomeDeltaResult {
  delta: number | null;
  valid: boolean;
  reason?: string;
}

/**
 * Calculate the outcome delta (difference between actual and expected impact).
 *
 * Formula: delta = actualOutcome - expectedImpact
 *
 * @param expectedImpact - The predicted impact value
 * @param actualOutcome - The measured actual impact
 * @returns Object with delta (rounded to 2 decimals), valid flag, and reason if invalid
 *
 * Deterministic: Same inputs always produce same output (no randomness, no external data)
 */
export function calculateOutcomeDelta(
  expectedImpact: number | null | undefined,
  actualOutcome: number | null | undefined
): OutcomeDeltaResult {
  // Handle null/undefined inputs
  if (
    expectedImpact === null ||
    expectedImpact === undefined ||
    actualOutcome === null ||
    actualOutcome === undefined
  ) {
    return {
      delta: null,
      valid: false,
      reason: "Missing expectedImpact or actualOutcome",
    };
  }

  // Handle non-numeric inputs
  if (typeof expectedImpact !== "number" || typeof actualOutcome !== "number") {
    return {
      delta: null,
      valid: false,
      reason: "Expected numeric values",
    };
  }

  // Handle NaN or Infinity
  if (!Number.isFinite(expectedImpact) || !Number.isFinite(actualOutcome)) {
    return {
      delta: null,
      valid: false,
      reason: "Values must be finite numbers",
    };
  }

  // Calculate delta: actual - expected
  const rawDelta = actualOutcome - expectedImpact;

  // Round to 2 decimals for stability
  const delta = Math.round(rawDelta * 100) / 100;

  return {
    delta,
    valid: true,
  };
}

/**
 * Get delta category for display purposes.
 * Helps interpret whether the outcome was better, worse, or as expected.
 */
export function getDeltaCategory(delta: number | null): string {
  if (delta === null) {
    return "unknown";
  }

  if (delta > 0.01) {
    return "better_than_expected";
  } else if (delta < -0.01) {
    return "worse_than_expected";
  } else {
    return "as_expected";
  }
}

/**
 * Calculate deviation percentage (delta as % of expected impact).
 * Useful for relative assessment: how far off was the prediction?
 */
export function calculateDeviationPercent(
  expectedImpact: number,
  delta: number
): number | null {
  if (expectedImpact === 0) {
    return null; // Cannot calculate percentage with zero expected impact
  }

  const deviationPercent = (delta / expectedImpact) * 100;
  return Math.round(deviationPercent * 100) / 100; // Round to 2 decimals
}

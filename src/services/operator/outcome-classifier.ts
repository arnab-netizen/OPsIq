/**
 * Canonical Outcome Classifier
 *
 * Single source of truth for classifying outcomes as:
 * - success: achieved and reasonable
 * - failure: not achieved or blocked
 * - partial: achieved but significantly below expected
 * - uncertain: suspiciously high or ambiguous
 */

export type OutcomeCategory = "success" | "failure" | "partial" | "uncertain";

export interface ClassificationResult {
  category: OutcomeCategory;
  reason: string;
}

/**
 * Classify outcome based on actual value vs expected impact.
 *
 * Rules (applied in order):
 * 1. failure: actualOutcomeValue is null, undefined, or zero
 * 2. uncertain: variance >200% (suspiciously high)
 * 3. partial: actualOutcomeValue < 50% of expected
 * 4. success: otherwise (positive outcome in reasonable range)
 *
 * @param actualOutcomeValue - Reported actual outcome (numeric)
 * @param impactExpected - Expected/predicted impact (numeric)
 * @returns Classification with category and reasoning
 */
export function classifyOutcome(
  actualOutcomeValue: number | null | undefined,
  impactExpected: number | null | undefined
): ClassificationResult {
  // Rule 1: Failure - no outcome achieved
  if (actualOutcomeValue === null || actualOutcomeValue === undefined || actualOutcomeValue === 0) {
    return {
      category: "failure",
      reason: "No outcome achieved",
    };
  }

  // Handle missing expected impact
  if (impactExpected === null || impactExpected === undefined) {
    return {
      category: "success",
      reason: "Positive outcome recorded (no baseline to compare)",
    };
  }

  // Calculate variance
  const variance = impactExpected > 0
    ? Math.abs(actualOutcomeValue - impactExpected) / impactExpected
    : 0;

  // Rule 2: Uncertain - variance exceeds 200% (suspicious)
  if (variance > 2) {
    return {
      category: "uncertain",
      reason: `Outcome variance >200% from expected (${Math.round(variance * 100)}%)`,
    };
  }

  // Rule 3: Partial - achieved but less than half expected
  if (actualOutcomeValue > 0 && actualOutcomeValue < impactExpected * 0.5) {
    return {
      category: "partial",
      reason: `Outcome achieved but only ${Math.round((actualOutcomeValue / impactExpected) * 100)}% of expected`,
    };
  }

  // Rule 4: Success - positive outcome in reasonable range
  return {
    category: "success",
    reason: `Outcome achieved and reasonable (${Math.round((actualOutcomeValue / impactExpected) * 100)}% of expected)`,
  };
}

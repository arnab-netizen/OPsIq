/**
 * Recommendation Control Gate - Data Sufficiency Validation
 *
 * Validates that sufficient data exists before recommendation generation.
 * Fails closed - no recommendations without adequate patterns and confidence.
 */

import { DetectedPattern } from "@/services/intelligence/pattern-engine";

export interface DataSufficiencyResult {
  sufficient: boolean;
  status: "approved" | "blocked";
  reason?: string;
  details: {
    patternCount: number;
    minPatternsRequired: number;
    lowConfidenceVariables: string[];
    minConfidenceRequired: number;
  };
}

export interface VariableWithConfidence {
  name: string;
  confidence: number;
}

/**
 * Validate data sufficiency for recommendation generation.
 *
 * Requirements:
 * - At least 3 patterns available (minimum sample for reliable recommendations)
 * - All variables must have confidence >= 0.6 (60% minimum quality threshold)
 *
 * Fails closed: insufficient data blocks recommendation entirely.
 */
export function isDataSufficient(
  patterns: DetectedPattern[],
  variables: VariableWithConfidence[]
): DataSufficiencyResult {
  const MIN_PATTERNS_REQUIRED = 3;
  const MIN_CONFIDENCE_REQUIRED = 0.6;

  const patternCount = patterns ? patterns.length : 0;

  // Validate required patterns
  if (patternCount < MIN_PATTERNS_REQUIRED) {
    return {
      sufficient: false,
      status: "blocked",
      reason: "INSUFFICIENT_PATTERNS",
      details: {
        patternCount,
        minPatternsRequired: MIN_PATTERNS_REQUIRED,
        lowConfidenceVariables: [],
        minConfidenceRequired: MIN_CONFIDENCE_REQUIRED,
      },
    };
  }

  // Validate variable confidence (fail-closed if any variable is low confidence)
  const lowConfidenceVars = variables
    .filter((v) => v.confidence < MIN_CONFIDENCE_REQUIRED)
    .map((v) => v.name)
    .sort();

  if (lowConfidenceVars.length > 0) {
    return {
      sufficient: false,
      status: "blocked",
      reason: "LOW_CONFIDENCE_VARIABLES",
      details: {
        patternCount,
        minPatternsRequired: MIN_PATTERNS_REQUIRED,
        lowConfidenceVariables: lowConfidenceVars,
        minConfidenceRequired: MIN_CONFIDENCE_REQUIRED,
      },
    };
  }

  // All checks passed
  return {
    sufficient: true,
    status: "approved",
    details: {
      patternCount,
      minPatternsRequired: MIN_PATTERNS_REQUIRED,
      lowConfidenceVariables: [],
      minConfidenceRequired: MIN_CONFIDENCE_REQUIRED,
    },
  };
}

/**
 * Validate patterns exist for a given problem type.
 */
export function hasPatterns(
  patterns: DetectedPattern[],
  problemType: string
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => p.problemType === problemType);
}

/**
 * Get patterns matching a problem type.
 */
export function getPatternsByProblemType(
  patterns: DetectedPattern[],
  problemType: string
): DetectedPattern[] {
  if (!patterns) return [];
  return patterns.filter((p) => p.problemType === problemType).sort((a, b) => {
    // Sort by success rate descending
    return b.successRate - a.successRate;
  });
}

/**
 * Validate that patterns have sufficient success rate (>60%).
 */
export function hasHighSuccessRatePatterns(
  patterns: DetectedPattern[],
  minSuccessRate: number = 60
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => p.successRate > minSuccessRate);
}

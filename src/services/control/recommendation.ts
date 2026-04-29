/**
 * Recommendation Control Gate - Data Sufficiency Validation & Output Contract
 *
 * Validates that sufficient data exists before recommendation generation.
 * Fails closed - no recommendations without adequate patterns and confidence.
 * Provides enterprise-grade explainable recommendation output.
 */

import { DetectedPattern } from "@/services/intelligence/pattern-engine";
import { ScenarioComparison } from "@/services/control/scenario-comparison";

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

/**
 * Enterprise-grade recommendation output contract.
 * All fields ALWAYS present, NEVER null, deterministic values only.
 */
export interface RecommendationContract {
  recommendation: string; // The actual recommendation text
  confidence: number; // Confidence score (0.0 to 1.0)
  variablesUsed: string[]; // Actual inputs used (from registry, sorted)
  variablesIgnored: string[]; // Registered variables not in input (sorted)
  dataSufficiency: boolean; // true/false, not string
  scenarios: {
    baseline: { impact: number; assumptions: string[] };
    recommended: { impact: number; assumptions: string[] };
    alternatives: Array<{ name: string; impact: number; assumptions: string[] }>;
  };
  reasoning: string; // Deterministic explanation (no AI text)
}

/**
 * Validate recommendation contract shape.
 * Ensures all required fields are present and non-null.
 */
export function validateRecommendationContract(
  output: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!output || typeof output !== "object") {
    return { valid: false, errors: ["Output must be a non-null object"] };
  }

  const rec = output as Record<string, unknown>;

  // Check required fields exist and have correct types
  if (typeof rec.recommendation !== "string") {
    errors.push(
      `recommendation must be a string, got ${typeof rec.recommendation}`
    );
  }
  if (typeof rec.confidence !== "number") {
    errors.push(`confidence must be a number, got ${typeof rec.confidence}`);
  }
  if (!Array.isArray(rec.variablesUsed)) {
    errors.push("variablesUsed must be an array");
  } else {
    const invalidVars = (rec.variablesUsed as any[]).filter(
      (v) => typeof v !== "string"
    );
    if (invalidVars.length > 0) {
      errors.push("variablesUsed must contain only strings");
    }
  }
  if (!Array.isArray(rec.variablesIgnored)) {
    errors.push("variablesIgnored must be an array");
  } else {
    const invalidVars = (rec.variablesIgnored as any[]).filter(
      (v) => typeof v !== "string"
    );
    if (invalidVars.length > 0) {
      errors.push("variablesIgnored must contain only strings");
    }
  }
  if (typeof rec.dataSufficiency !== "boolean") {
    errors.push(
      `dataSufficiency must be a boolean, got ${typeof rec.dataSufficiency}`
    );
  }
  if (typeof rec.reasoning !== "string") {
    errors.push(`reasoning must be a string, got ${typeof rec.reasoning}`);
  }

  // Validate scenarios structure
  if (!rec.scenarios || typeof rec.scenarios !== "object") {
    errors.push("scenarios must be a non-null object");
  } else {
    const scenarios = rec.scenarios as Record<string, unknown>;

    if (!scenarios.baseline || typeof scenarios.baseline !== "object") {
      errors.push("scenarios.baseline must be a non-null object");
    } else {
      const baseline = scenarios.baseline as Record<string, unknown>;
      if (typeof baseline.impact !== "number") {
        errors.push(
          `scenarios.baseline.impact must be a number, got ${typeof baseline.impact}`
        );
      }
      if (!Array.isArray(baseline.assumptions)) {
        errors.push("scenarios.baseline.assumptions must be an array");
      }
    }

    if (!scenarios.recommended || typeof scenarios.recommended !== "object") {
      errors.push("scenarios.recommended must be a non-null object");
    } else {
      const recommended = scenarios.recommended as Record<string, unknown>;
      if (typeof recommended.impact !== "number") {
        errors.push(
          `scenarios.recommended.impact must be a number, got ${typeof recommended.impact}`
        );
      }
      if (!Array.isArray(recommended.assumptions)) {
        errors.push("scenarios.recommended.assumptions must be an array");
      }
    }

    if (!Array.isArray(scenarios.alternatives)) {
      errors.push("scenarios.alternatives must be an array");
    } else {
      for (let i = 0; i < (scenarios.alternatives as any[]).length; i++) {
        const alt = (scenarios.alternatives as any[])[i];
        if (typeof alt.name !== "string") {
          errors.push(
            `scenarios.alternatives[${i}].name must be a string, got ${typeof alt.name}`
          );
        }
        if (typeof alt.impact !== "number") {
          errors.push(
            `scenarios.alternatives[${i}].impact must be a number, got ${typeof alt.impact}`
          );
        }
        if (!Array.isArray(alt.assumptions)) {
          errors.push(`scenarios.alternatives[${i}].assumptions must be an array`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build deterministic reasoning explanation.
 * No AI text, pure logical statement of decisions and constraints.
 */
export function buildRecommendationReasoning(
  patternCount: number,
  successRate: number,
  variableCount: number,
  minConfidence: number,
  blocked: boolean
): string {
  if (blocked) {
    return `Recommendation blocked: insufficient data (${variableCount} variables, ${patternCount} patterns, ${minConfidence * 100}% confidence required)`;
  }

  return `Recommendation based on ${patternCount} patterns with ${successRate}% success rate using ${variableCount} variables (confidence threshold: ${minConfidence * 100}%)`;
}

/**
 * Create enterprise-grade recommendation contract from components.
 * ALWAYS produces fully-populated, deterministic output.
 */
export function createRecommendationContract(
  recommendation: string,
  confidence: number,
  variablesUsed: string[],
  variablesIgnored: string[],
  dataSufficiency: boolean,
  scenarios: ScenarioComparison,
  reasoning: string
): RecommendationContract {
  return {
    recommendation,
    confidence,
    variablesUsed: [...variablesUsed].sort(), // Ensure sorted
    variablesIgnored: [...variablesIgnored].sort(), // Ensure sorted
    dataSufficiency,
    scenarios: {
      baseline: {
        impact: scenarios.baseline.impact,
        assumptions: scenarios.baseline.assumptions,
      },
      recommended: {
        impact: scenarios.recommended.impact,
        assumptions: scenarios.recommended.assumptions,
      },
      alternatives: scenarios.alternatives.map((alt) => ({
        name: alt.name,
        impact: alt.impact,
        assumptions: alt.assumptions,
      })),
    },
    reasoning,
  };
}

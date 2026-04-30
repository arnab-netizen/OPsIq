/**
 * Governance Alert Configuration
 * Explicit thresholds for governance rule violations
 * These are system-wide constants, not user configurable
 */

export interface GovernanceAlertThresholds {
  // Block rate thresholds (as percentages 0-100)
  overallBlockRateThreshold: number; // Alert if overall block rate exceeds this
  guardrailBlockRateThreshold: number; // Alert if guardrail blocks exceed this percentage of all blocks

  // Confidence thresholds (0-1 scale)
  minAvgConfidenceBlocked: number; // Alert if avg confidence of blocked decisions is TOO LOW (inverse)

  // Error thresholds (as percentages 0-100)
  errorRateThreshold: number; // Alert if error rate exceeds this

  // Performance thresholds
  slowRunRateThreshold: number; // Alert if percentage of runs exceeding slow threshold exceeds this
  slowRunDurationMs: number; // What we consider "slow" for a run
}

/**
 * System-wide governance alert thresholds
 * These values are not configurable per user/workspace
 * They represent system safety guardrails
 */
export const GOVERNANCE_ALERT_THRESHOLDS: GovernanceAlertThresholds = {
  // Overall block rate: alert if >20% of decisions are blocked
  overallBlockRateThreshold: 20,

  // Guardrail blocks: alert if >50% of blocked decisions are due to guardrails
  guardrailBlockRateThreshold: 50,

  // Confidence in blocked decisions: alert if avg confidence < 0.3
  // (Low confidence in rejected decisions suggests unclear blocking criteria)
  minAvgConfidenceBlocked: 0.3,

  // Error rate: alert if >5% of runs result in errors
  errorRateThreshold: 5,

  // Slow run rate: alert if >10% of runs are slow
  slowRunRateThreshold: 10,

  // Duration threshold: consider a run "slow" if it exceeds 500ms
  slowRunDurationMs: 500,
};

/**
 * Validate thresholds are within reasonable bounds
 */
export function validateThresholds(thresholds: GovernanceAlertThresholds): void {
  if (thresholds.overallBlockRateThreshold < 0 || thresholds.overallBlockRateThreshold > 100) {
    throw new Error("overallBlockRateThreshold must be between 0 and 100");
  }

  if (thresholds.guardrailBlockRateThreshold < 0 || thresholds.guardrailBlockRateThreshold > 100) {
    throw new Error("guardrailBlockRateThreshold must be between 0 and 100");
  }

  if (thresholds.minAvgConfidenceBlocked < 0 || thresholds.minAvgConfidenceBlocked > 1) {
    throw new Error("minAvgConfidenceBlocked must be between 0 and 1");
  }

  if (thresholds.errorRateThreshold < 0 || thresholds.errorRateThreshold > 100) {
    throw new Error("errorRateThreshold must be between 0 and 100");
  }

  if (thresholds.slowRunRateThreshold < 0 || thresholds.slowRunRateThreshold > 100) {
    throw new Error("slowRunRateThreshold must be between 0 and 100");
  }

  if (thresholds.slowRunDurationMs < 0) {
    throw new Error("slowRunDurationMs must be >= 0");
  }
}

// Validate on module load
validateThresholds(GOVERNANCE_ALERT_THRESHOLDS);

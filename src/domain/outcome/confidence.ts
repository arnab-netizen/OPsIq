export interface ConfidenceUpdateInput {
  current_confidence: number; // 0-100%
  variance_pct: number; // Variance percentage from impact
  measurement_confidence: number; // 0-100% (confidence in measurement)
  previous_outcome?: "success" | "failure" | "unknown";
}

export interface ConfidenceUpdateResult {
  new_confidence: number; // 0-100%
  confidence_change: number; // +N or -N
  update_reason: string;
  capped_due_to_measurement: boolean;
  repeated_failure_penalty: boolean;
}

export const MAX_CONFIDENCE = 100;
export const MIN_CONFIDENCE = 0;

// Confidence change rules
export const CONFIDENCE_RULES = {
  positive_variance_max: 20, // Max increase from positive variance
  negative_variance_max: 30, // Max decrease from negative variance
  repeated_failure_penalty: 15, // Additional penalty for repeated failure
  low_measurement_confidence_cap: 10, // Cap update to ±10% if measurement confidence is low (< 60%)
  measurement_confidence_threshold: 60, // Below this, updates are capped
};

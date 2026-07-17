/**
 * Variable Confidence Engine - Phase 4 Control 2
 *
 * Evaluates confidence and completeness of variables before decision execution.
 * Checks for missing required variables, low confidence values, and stale data.
 * All assessments are deterministic and fail-closed.
 */

import { VariableDefinition } from "./variable-registry";

export interface VariableState {
  key: string;
  value: unknown;
  source: string; // e.g., "user_input", "database", "computed", "integration"
  confidence: number; // 0-1 range
  freshnessAt?: string; // ISO 8601 timestamp
  complete: boolean; // Whether the variable is complete/validated
  override?: boolean; // If true, bypass confidence checks
}

export interface VariableConfidenceResult {
  overallConfidence: number; // Average confidence of all variables
  missingRequired: string[]; // Required variables not present
  lowConfidence: Array<{
    key: string;
    confidence: number;
    threshold: number;
  }>; // Variables with confidence < 0.5
  staleVariables: Array<{
    key: string;
    freshnessAt: string;
    daysOld: number;
  }>; // Variables older than 30 days
  complete: boolean; // true if all required variables present and confident
  timestamp: string; // Evaluation timestamp (ISO 8601)
}

const CONFIDENCE_THRESHOLD = 0.5;
const STALENESS_DAYS = 30;
const STALENESS_MS = STALENESS_DAYS * 24 * 60 * 60 * 1000;

/**
 * Evaluate confidence and completeness of variables.
 * Deterministic assessment of variable quality before decision execution.
 *
 * Rules:
 * - Required variables missing => complete=false
 * - Confidence < 0.5 for any variable => added to lowConfidence
 * - freshnessAt older than 30 days => added to staleVariables
 * - overallConfidence = average of all variable confidences
 * - complete = no missing required AND no low confidence AND no stale (unless overridden)
 */
export function evaluateVariableConfidence(
  states: VariableState[],
  requiredVariables: VariableDefinition[]
): VariableConfidenceResult {
  const now = new Date();
  const nowMs = now.getTime();
  const nowISO = now.toISOString();

  const statesByKey = new Map(states.map((s) => [s.key, s]));

  // Check for missing required variables
  const missingRequired: string[] = [];
  for (const varDef of requiredVariables) {
    if (!statesByKey.has(varDef.key)) {
      missingRequired.push(varDef.key);
    }
  }

  // Evaluate confidence and freshness for present variables
  const lowConfidence: Array<{
    key: string;
    confidence: number;
    threshold: number;
  }> = [];
  const staleVariables: Array<{
    key: string;
    freshnessAt: string;
    daysOld: number;
  }> = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const state of states) {
    // Skip overridden variables from confidence checks
    if (state.override) {
      totalConfidence += 1.0; // Count as fully confident if overridden
      confidenceCount += 1;
      continue;
    }

    // Validate confidence range
    if (typeof state.confidence !== "number" || state.confidence < 0 || state.confidence > 1) {
      // Invalid confidence - treat as low confidence
      lowConfidence.push({
        key: state.key,
        confidence: 0,
        threshold: CONFIDENCE_THRESHOLD,
      });
    } else {
      totalConfidence += state.confidence;

      // Check low confidence
      if (state.confidence < CONFIDENCE_THRESHOLD) {
        lowConfidence.push({
          key: state.key,
          confidence: state.confidence,
          threshold: CONFIDENCE_THRESHOLD,
        });
      }
    }
    confidenceCount += 1;

    // Check staleness if freshnessAt is provided
    if (state.freshnessAt) {
      const freshnessTime = new Date(state.freshnessAt).getTime();
      const ageMs = nowMs - freshnessTime;
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

      if (ageMs > STALENESS_MS) {
        staleVariables.push({
          key: state.key,
          freshnessAt: state.freshnessAt,
          daysOld: ageDays,
        });
      }
    }
  }

  // Calculate overall confidence (average)
  const overallConfidence =
    confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) / 100 : 0;

  // Determine completeness
  // complete = true only if:
  // 1. No missing required variables
  // 2. No low confidence variables (unless overridden)
  // 3. No stale variables (unless overridden)
  // 4. All present variables marked as complete
  const hasNonOverriddenLowConfidence = lowConfidence.some((lc) => {
    const state = statesByKey.get(lc.key);
    return state && !state.override;
  });

  const hasNonOverriddenStale = staleVariables.some((sv) => {
    const state = statesByKey.get(sv.key);
    return state && !state.override;
  });

  const allVariablesComplete = states.every((s) => s.complete || s.override);

  const complete =
    missingRequired.length === 0 &&
    !hasNonOverriddenLowConfidence &&
    !hasNonOverriddenStale &&
    allVariablesComplete;

  // Sort results deterministically
  return {
    overallConfidence,
    missingRequired: [...missingRequired].sort(),
    lowConfidence: lowConfidence.sort((a, b) => a.key.localeCompare(b.key)),
    staleVariables: staleVariables.sort((a, b) => a.key.localeCompare(b.key)),
    complete,
    timestamp: nowISO,
  };
}

/**
 * Get the staleness threshold in milliseconds.
 */
export function getStalenessThresholdMs(): number {
  return STALENESS_MS;
}

/**
 * Check if a variable is stale given its freshness timestamp.
 */
export function isVariableStale(freshnessAt?: string): boolean {
  if (!freshnessAt) {
    return false; // No timestamp means not stale
  }

  const freshnessTime = new Date(freshnessAt).getTime();
  const ageMs = Date.now() - freshnessTime;

  return ageMs > STALENESS_MS;
}

/**
 * Calculate days since a timestamp.
 */
export function daysSinceTimestamp(timestamp: string): number {
  const time = new Date(timestamp).getTime();
  const ageMs = Date.now() - time;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

/**
 * Validate a variable state object for correctness.
 */
export function validateVariableState(state: VariableState): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!state.key || typeof state.key !== "string") {
    errors.push("key must be a non-empty string");
  }

  if (state.value === null || state.value === undefined) {
    errors.push("value cannot be null or undefined");
  }

  if (!state.source || typeof state.source !== "string") {
    errors.push("source must be a non-empty string");
  }

  if (typeof state.confidence !== "number" || state.confidence < 0 || state.confidence > 1) {
    errors.push("confidence must be a number between 0 and 1");
  }

  if (typeof state.complete !== "boolean") {
    errors.push("complete must be a boolean");
  }

  if (state.freshnessAt && typeof state.freshnessAt !== "string") {
    errors.push("freshnessAt must be a string (ISO 8601)");
  }

  if (state.freshnessAt) {
    try {
      new Date(state.freshnessAt);
    } catch {
      errors.push(`freshnessAt must be valid ISO 8601 date, got: ${state.freshnessAt}`);
    }
  }

  if (state.override !== undefined && typeof state.override !== "boolean") {
    errors.push("override must be a boolean");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

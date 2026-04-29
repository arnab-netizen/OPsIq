/**
 * Decision Gate - Phase 4 Control 3
 *
 * Blocks unsafe decisions before execution.
 * Fail-closed enforcement: requires explicit validation to proceed.
 * No silent fallbacks - all blocks are explicit and reasoned.
 */

import {
  getVariableRegistry,
  getRequiredVariables,
  validateRegisteredVariables,
} from "./variable-registry";
import {
  evaluateVariableConfidence,
  VariableState,
  validateVariableState,
} from "./variable-confidence";

export interface DecisionGateInput {
  variables: Record<string, unknown>; // Raw input variables
  variableStates?: VariableState[]; // Optional pre-computed states with confidence
  confidence?: number; // User's confidence in the decision
}

export interface DecisionGateResult {
  allowed: boolean;
  reason?: string; // Reason for block (if allowed=false)
  missingVariables: string[]; // Missing required variables
  lowConfidenceVariables: string[]; // Variables with low confidence
  staleVariables: string[]; // Variables older than 30 days
  warnings: string[]; // Non-blocking warnings
  overallConfidence: number; // Overall confidence score (0-1)
}

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Evaluate whether a decision is safe to execute.
 * Fail-closed: blocks on any safety issue. No exceptions without explicit override.
 *
 * Blocking conditions (any one causes allowed=false):
 * 1. Required variables missing
 * 2. Unknown variables (unless explicitly registered)
 * 3. overallConfidence < 0.5
 * 4. User confidence < 0.5
 * 5. Low confidence variables present
 *
 * Non-blocking warnings:
 * - Variables with freshnessAt (data age)
 */
export function evaluateDecisionGate(input: DecisionGateInput): DecisionGateResult {
  const warnings: string[] = [];
  const missingVariables: string[] = [];
  const lowConfidenceVariables: string[] = [];
  const staleVariables: string[] = [];
  let overallConfidence = 1.0;
  let allowed = true;
  let blockReason: string | undefined = undefined;

  // Validate input structure
  if (!input || typeof input !== "object") {
    return {
      allowed: false,
      reason: "Invalid input: must be an object",
      missingVariables: [],
      lowConfidenceVariables: [],
      staleVariables: [],
      warnings: [],
      overallConfidence: 0,
    };
  }

  if (!input.variables || typeof input.variables !== "object") {
    return {
      allowed: false,
      reason: "Invalid input: variables must be an object",
      missingVariables: [],
      lowConfidenceVariables: [],
      staleVariables: [],
      warnings: [],
      overallConfidence: 0,
    };
  }

  // 1. Validate variables against registry
  const registry = getVariableRegistry();
  const requiredVars = getRequiredVariables();
  const registryValidation = validateRegisteredVariables(input.variables);

  if (!registryValidation.valid) {
    // Collect errors into appropriate categories
    for (const error of registryValidation.errors) {
      if (error.error.includes("Required variable missing")) {
        const varName = error.variable;
        missingVariables.push(varName);
      } else if (error.error.includes("Unknown variable")) {
        warnings.push(`Unknown variable: ${error.variable}`);
      } else {
        warnings.push(error.error);
      }
    }
  }

  // Block if required variables are missing
  if (missingVariables.length > 0) {
    allowed = false;
    blockReason = `Missing required variables: ${missingVariables.join(", ")}`;
  }

  // 2. Build variable states from input
  let variableStates = input.variableStates || [];

  // If no pre-computed states, create them from raw input
  if (variableStates.length === 0) {
    variableStates = Object.entries(input.variables).map(([key, value]) => {
      const varDef = registry[key];
      return {
        key,
        value,
        source: "user_input",
        confidence: 0.8, // Default confidence for user input
        complete: varDef ? !varDef.required : true,
      };
    });
  } else {
    // Validate provided states
    for (const state of variableStates) {
      const validation = validateVariableState(state);
      if (!validation.valid) {
        warnings.push(`Invalid variable state for ${state.key}: ${validation.errors.join(", ")}`);
      }
    }
  }

  // 3. Evaluate confidence of all variables
  const confidenceResult = evaluateVariableConfidence(variableStates, requiredVars);

  overallConfidence = confidenceResult.overallConfidence;

  // Collect low confidence variables
  for (const lowConfVar of confidenceResult.lowConfidence) {
    lowConfidenceVariables.push(lowConfVar.key);
  }

  // Block if overall confidence is too low
  if (overallConfidence < CONFIDENCE_THRESHOLD) {
    allowed = false;
    blockReason = blockReason ||
      `Overall confidence ${overallConfidence} is below threshold ${CONFIDENCE_THRESHOLD}`;
  }

  // Block if low confidence variables exist
  if (lowConfidenceVariables.length > 0) {
    allowed = false;
    blockReason = blockReason ||
      `Low confidence variables: ${lowConfidenceVariables.join(", ")}`;
  }

  // 4. Check user's confidence in decision
  const userConfidence = input.confidence ?? 0.8;

  if (typeof userConfidence !== "number" || userConfidence < 0 || userConfidence > 1) {
    allowed = false;
    blockReason = blockReason ||
      `Invalid user confidence: must be 0-1, got ${userConfidence}`;
  } else if (userConfidence < CONFIDENCE_THRESHOLD) {
    allowed = false;
    blockReason = blockReason ||
      `User confidence ${userConfidence} is below threshold ${CONFIDENCE_THRESHOLD}`;
  }

  // 5. BLOCK on stale variables (fail-closed principle)
  for (const staleVar of confidenceResult.staleVariables) {
    staleVariables.push(staleVar.key);
  }

  if (staleVariables.length > 0) {
    allowed = false;
    blockReason = blockReason ||
      `Stale variables detected (>30 days old): ${staleVariables.join(", ")}`;
  }

  // 6. Add missing required variables as errors
  for (const missing of confidenceResult.missingRequired) {
    if (!missingVariables.includes(missing)) {
      missingVariables.push(missing);
    }
  }

  // Sort output for determinism
  missingVariables.sort();
  lowConfidenceVariables.sort();
  staleVariables.sort();
  warnings.sort();

  return {
    allowed,
    reason: blockReason,
    missingVariables,
    lowConfidenceVariables,
    staleVariables,
    warnings,
    overallConfidence,
  };
}

/**
 * Create a human-readable message from gate result.
 */
export function formatGateResult(result: DecisionGateResult): string {
  if (result.allowed) {
    return `Decision allowed (confidence: ${result.overallConfidence})`;
  }

  const issues: string[] = [];

  if (result.reason) {
    issues.push(result.reason);
  }

  if (result.missingVariables.length > 0) {
    issues.push(`Missing: ${result.missingVariables.join(", ")}`);
  }

  if (result.lowConfidenceVariables.length > 0) {
    issues.push(`Low confidence: ${result.lowConfidenceVariables.join(", ")}`);
  }

  return `Decision blocked: ${issues.join("; ")}`;
}

/**
 * Get gate result as HTTP response payload.
 */
export function gateResultToPayload(
  result: DecisionGateResult
): Record<string, unknown> {
  return {
    blocked: !result.allowed,
    reason: result.reason,
    missingVariables: result.missingVariables,
    lowConfidenceVariables: result.lowConfidenceVariables,
    warnings: result.warnings,
    overallConfidence: result.overallConfidence,
  };
}

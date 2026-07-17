/**
 * Control Layer Enforcement - Non-Bypassable Decision Flow
 *
 * All decisions MUST flow through this enforcement layer.
 * Direct calls to recommendation/decision services will be detected and blocked.
 * Zero exceptions to control layer requirements.
 */

import { validateDependencies } from "@/services/control/variable-registry";
import { isDataSufficient } from "@/services/control/recommendation";
import { evaluateDecisionGate } from "@/services/control/decision-gate";
import { evaluateGuardrails } from "@/services/control/guardrails";
import { ScenarioComparison } from "@/services/control/scenario-comparison";

export interface ControlLayerBypassError {
  status: "error";
  reason: "CONTROL_LAYER_BYPASS";
  message: string;
  details: {
    skippedValidations: string[];
    requiredValidations: string[];
  };
}

export interface ControlLayerExecutionResult {
  allowed: boolean;
  blockingReason?: string;
  violations?: Array<{
    layer: "dependency" | "data_sufficiency" | "decision_gate" | "guardrails";
    reason: string;
  }>;
}

/**
 * Execute decision through mandatory control layer.
 * All required validations must pass or decision is blocked.
 */
export async function executeDecisionThroughControlLayer(
  inputVariables: Record<string, unknown>,
  decisionMetrics: Record<string, number>,
  patterns: any[],
  variables: any[],
  blockReasons: string[] = []
): Promise<ControlLayerExecutionResult> {
  const violations: Array<{
    layer: "dependency" | "data_sufficiency" | "decision_gate" | "guardrails";
    reason: string;
  }> = [];

  // LAYER 1: Variable dependency validation
  const depValidation = validateDependencies(inputVariables);
  if (!depValidation.valid && depValidation.error) {
    violations.push({
      layer: "dependency",
      reason: depValidation.error.details,
    });
  }

  // LAYER 2: Data sufficiency validation
  const sufficiencyResult = isDataSufficient(patterns, variables);
  if (!sufficiencyResult.sufficient) {
    const detailMsg =
      sufficiencyResult.details.lowConfidenceVariables?.length > 0
        ? `Low confidence variables: ${sufficiencyResult.details.lowConfidenceVariables.join(", ")}`
        : `Insufficient patterns: ${sufficiencyResult.details.patternCount}/${sufficiencyResult.details.minPatternsRequired}`;
    violations.push({
      layer: "data_sufficiency",
      reason: detailMsg,
    });
  }

  // LAYER 3: Decision gate validation
  const gateResult = evaluateDecisionGate({
    variables: decisionMetrics,
    confidence: decisionMetrics.confidence || 0,
  });
  if (!gateResult.allowed) {
    violations.push({
      layer: "decision_gate",
      reason: gateResult.reason || "Gate validation failed",
    });
  }

  // LAYER 4: Guardrails validation
  const guardrailsResult = evaluateGuardrails({
    expectedImpact: decisionMetrics.expectedImpact || 0,
    confidence: decisionMetrics.confidence || 0,
    approvalFlag: false,
  });
  if (guardrailsResult.blocked) {
    violations.push({
      layer: "guardrails",
      reason: guardrailsResult.violations
        .map((v) => v.message)
        .join("; "),
    });
  }

  // If any violations exist, block the decision
  if (violations.length > 0) {
    return {
      allowed: false,
      blockingReason: `Decision blocked by ${violations.length} control layer violation(s)`,
      violations,
    };
  }

  return {
    allowed: true,
  };
}

/**
 * Verify that a decision went through the full control layer.
 * Used to detect and prevent bypasses.
 */
export function verifyControlLayerExecution(
  decisionSource: string,
  requiredLayers: string[] = [
    "variable_registry",
    "dependency_validation",
    "data_sufficiency",
    "decision_gate",
    "guardrails",
  ]
): { valid: boolean; error?: ControlLayerBypassError } {
  // Check if decision source came through the proper control layer
  const isControlLayerPath = decisionSource.includes(
    "executeDecisionThroughControlLayer"
  );

  // Check for bypass attempts with direct function calls
  const bypassPatterns = [
    "generateRecommendation",
    "generateMultipleRecommendations",
    "runDecisionEngine",
    "createRecommendation",
  ];

  const isDirectCall = bypassPatterns.some((pattern) =>
    decisionSource.includes(pattern)
  );

  if (isDirectCall && !isControlLayerPath) {
    return {
      valid: false,
      error: {
        status: "error",
        reason: "CONTROL_LAYER_BYPASS",
        message: "Decision attempted to bypass control layer",
        details: {
          skippedValidations: requiredLayers,
          requiredValidations: requiredLayers,
        },
      },
    };
  }

  return { valid: true };
}

/**
 * Detect if a code path attempts to directly call recommendation functions.
 * This helps catch bypass attempts at runtime.
 */
export function detectDirectRecommendationCall(
  functionName: string
): boolean {
  const bypassFunctions = [
    "generateRecommendation",
    "generateMultipleRecommendations",
    "runDecisionEngine",
    "createRecommendation",
  ];

  return bypassFunctions.some(
    (fn) =>
      functionName.includes(fn) &&
      !functionName.includes("executeDecisionThroughControlLayer")
  );
}

/**
 * Enforce control layer usage for all decision-making.
 * Throws error if control layer is bypassed.
 */
export function enforceControlLayer(
  decisionPath: string,
  executedValidations: string[]
): void {
  const requiredValidations = [
    "variable_registry",
    "dependency_validation",
    "data_sufficiency",
    "decision_gate",
    "guardrails",
  ];

  const missingValidations = requiredValidations.filter(
    (v) => !executedValidations.includes(v)
  );

  if (missingValidations.length > 0) {
    throw {
      status: "error",
      reason: "CONTROL_LAYER_BYPASS",
      message: `Control layer bypass detected in ${decisionPath}`,
      details: {
        skippedValidations: missingValidations,
        requiredValidations,
        executedValidations,
      },
    };
  }
}

/**
 * Wrap recommendation generation with control layer enforcement.
 * Prevents direct calls to recommendation functions.
 */
export function createControlledRecommendationGenerator(
  generateFn: (
    decision: any,
    patterns: any[],
    items: any[],
    inputVariables?: Record<string, unknown>,
    scenarios?: ScenarioComparison
  ) => any
) {
  return (
    decision: any,
    patterns: any[],
    items: any[],
    inputVariables?: Record<string, unknown>,
    scenarios?: ScenarioComparison
  ) => {
    // Verify control layer was executed
    const verification = verifyControlLayerExecution("controlled_recommendation_generator");
    if (!verification.valid) {
      throw verification.error;
    }

    return generateFn(decision, patterns, items, inputVariables, scenarios);
  };
}

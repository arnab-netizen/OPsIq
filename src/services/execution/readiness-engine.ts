import { ExecutionUnit } from "../../domain/execution/execution-unit-contracts";

/**
 * PHASE H-2: EXECUTION READINESS ENGINE
 *
 * Verify prerequisites before execution starts.
 * Unsafe execution must NOT proceed.
 */

export type ReadinessState = "READY" | "PARTIALLY_READY" | "BLOCKED" | "UNSAFE_TO_EXECUTE";

export interface ReadinessAssessment {
  execution_id: string;
  readiness_state: ReadinessState;
  is_ready: boolean;
  is_unsafe: boolean;
  blocking_issues: string[];
  safety_issues: string[];
  missing_prerequisites: string[];
  confidence_score: number;
}

/**
 * Assess execution readiness
 */
export function assessReadiness(
  execution: ExecutionUnit,
  prerequisites_met: boolean,
  operator_capacity_available: boolean,
  dependencies_available: boolean,
  evidence_fresh: boolean,
  scope_valid: boolean,
  recommendation_fresh: boolean,
  no_conflicting_executions: boolean,
  rollback_exists: boolean
): ReadinessAssessment {
  const blocking_issues: string[] = [];
  const safety_issues: string[] = [];
  const missing_prerequisites: string[] = [];
  let confidence_score = 1.0;

  // Check prerequisites
  if (!prerequisites_met) {
    blocking_issues.push("Prerequisites not met");
    missing_prerequisites.push("prerequisite_check");
    confidence_score -= 0.2;
  }

  // Check operator capacity
  if (!operator_capacity_available) {
    blocking_issues.push("Operator capacity exceeded");
    confidence_score -= 0.2;
  }

  // Check dependencies
  if (!dependencies_available) {
    blocking_issues.push("Dependencies unavailable");
    missing_prerequisites.push("dependencies");
    confidence_score -= 0.25;
  }

  // Check evidence freshness
  if (!evidence_fresh) {
    blocking_issues.push("Evidence not fresh");
    missing_prerequisites.push("fresh_evidence");
    confidence_score -= 0.15;
  }

  // Check scope validity
  if (!scope_valid) {
    safety_issues.push("Scope not valid for this execution");
    confidence_score -= 0.3;
  }

  // Check recommendation freshness
  if (!recommendation_fresh) {
    blocking_issues.push("Recommendation stale");
    confidence_score -= 0.2;
  }

  // Check for conflicting executions
  if (!no_conflicting_executions) {
    safety_issues.push("Conflicting executions detected");
    confidence_score -= 0.25;
  }

  // Check rollback plan for risky actions
  if (execution.execution_complexity === "VERY_COMPLEX" || execution.rollback_cost > 50) {
    if (!rollback_exists || !execution.rollback_plan) {
      safety_issues.push("Rollback plan missing for high-risk execution");
      confidence_score -= 0.4;
    }
  }

  // Determine readiness state
  let readiness_state: ReadinessState;
  let is_unsafe = false;

  if (safety_issues.length > 0 || (blocking_issues.length > 0 && confidence_score < 0.5)) {
    readiness_state = "UNSAFE_TO_EXECUTE";
    is_unsafe = true;
  } else if (blocking_issues.length > 0) {
    readiness_state = "BLOCKED";
  } else if (blocking_issues.length === 0 && missing_prerequisites.length === 0) {
    readiness_state = "READY";
  } else {
    readiness_state = "PARTIALLY_READY";
  }

  return {
    execution_id: execution.execution_id,
    readiness_state,
    is_ready: readiness_state === "READY",
    is_unsafe,
    blocking_issues,
    safety_issues,
    missing_prerequisites,
    confidence_score: Math.max(0, confidence_score),
  };
}

/**
 * Check if execution can proceed
 */
export function canProceedWithExecution(assessment: ReadinessAssessment): boolean {
  return assessment.is_ready && !assessment.is_unsafe;
}

/**
 * Get readiness summary
 */
export function getReadinessSummary(assessment: ReadinessAssessment): string {
  if (assessment.readiness_state === "UNSAFE_TO_EXECUTE") {
    return `UNSAFE: ${assessment.safety_issues.join("; ")}`;
  } else if (assessment.readiness_state === "BLOCKED") {
    return `BLOCKED: ${assessment.blocking_issues.join("; ")}`;
  } else if (assessment.readiness_state === "READY") {
    return "READY to execute";
  } else {
    return `PARTIALLY_READY: ${assessment.missing_prerequisites.length} prerequisites pending`;
  }
}

import { Precondition } from "../../domain/governance/governance-contracts";

/**
 * Precondition engine validates execution prerequisites.
 * Blocks execution if any blocking precondition fails.
 */

export interface PreconditionCheckResult {
  all_satisfied: boolean;
  blocking_failures: Precondition[];
  warnings: Precondition[];
  passed_conditions: Precondition[];
}

/**
 * Evaluate all preconditions
 */
export function evaluatePreconditions(preconditions: Precondition[]): PreconditionCheckResult {
  const blocking_failures: Precondition[] = [];
  const warnings: Precondition[] = [];
  const passed_conditions: Precondition[] = [];

  for (const precond of preconditions) {
    if (precond.is_satisfied) {
      passed_conditions.push(precond);
    } else if (precond.blocking) {
      blocking_failures.push(precond);
    } else {
      warnings.push(precond);
    }
  }

  return {
    all_satisfied: blocking_failures.length === 0,
    blocking_failures,
    warnings,
    passed_conditions,
  };
}

/**
 * Check if execution is allowed
 */
export function canExecute(preconditions: Precondition[]): boolean {
  const result = evaluatePreconditions(preconditions);
  return result.all_satisfied;
}

/**
 * Block execution with detailed reason
 */
export function getExecutionBlockReason(blocking_failures: Precondition[]): string {
  if (blocking_failures.length === 0) {
    return "";
  }

  const reasons = blocking_failures.map((f) => `${f.type}: ${f.check_result || f.description}`);
  return `Execution blocked: ${reasons.join("; ")}`;
}

import {
  Assumption,
  AssumptionValidationResult,
} from "../../domain/governance/assumption-contracts";
import { OperationalContext } from "./scope-enforcement";

/**
 * Assumption Validator: Validate assumptions for expiry, scope, and contradictions.
 * Fail-closed: invalid assumptions block execution.
 */

/**
 * Validate assumption against current context and expiry
 */
export function validateAssumption(
  assumption: Assumption,
  current_context: OperationalContext,
  current_date: Date = new Date()
): AssumptionValidationResult {
  const days_remaining = Math.ceil(
    (assumption.expiry_date.getTime() - current_date.getTime()) / (1000 * 60 * 60 * 24)
  );

  let validation_status = assumption.validation_status;
  let confidence_adjustment = 0;
  let scope_valid = true;
  const scope_mismatches: string[] = [];
  const contradictions_found = assumption.contradiction_refs.length;

  // Check expiry
  if (days_remaining < 0) {
    validation_status = "STALE";
    confidence_adjustment -= 40;
  } else if (days_remaining < 30) {
    validation_status = "PENDING_REVALIDATION";
    confidence_adjustment -= 20;
  }

  // Check scope validity
  if (!assumption.geography_scope.includes(current_context.geography)) {
    scope_valid = false;
    scope_mismatches.push(`Geography: ${current_context.geography} not in scope`);
    confidence_adjustment -= 25;
  }

  if (
    assumption.business_scope.length > 0 &&
    !assumption.business_scope.includes(current_context.business_type)
  ) {
    scope_valid = false;
    scope_mismatches.push(`Business type: ${current_context.business_type} not in scope`);
    confidence_adjustment -= 25;
  }

  if (
    assumption.segment_scope.length > 0 &&
    !assumption.segment_scope.includes(current_context.customer_segment)
  ) {
    scope_valid = false;
    scope_mismatches.push(`Segment: ${current_context.customer_segment} not in scope`);
    confidence_adjustment -= 25;
  }

  if (
    assumption.maturity_scope.length > 0 &&
    !assumption.maturity_scope.includes(current_context.maturity_level)
  ) {
    scope_valid = false;
    scope_mismatches.push(`Maturity: ${current_context.maturity_level} not in scope`);
    confidence_adjustment -= 20;
  }

  // Check contradictions
  if (contradictions_found > 0) {
    validation_status = "CONTRADICTED";
    confidence_adjustment -= 50;
  }

  // Check if superseded
  if (assumption.superseded_by) {
    validation_status = "SUPERSEDED";
    confidence_adjustment -= 60;
  }

  return {
    assumption_id: assumption.assumption_id,
    is_valid: validation_status === "VALID" && scope_valid,
    validation_status,
    confidence_adjustment: Math.max(-100, confidence_adjustment),
    expiration_days_remaining: days_remaining,
    scope_valid,
    scope_mismatches,
    contradictions_found,
    requires_revalidation: validation_status === "PENDING_REVALIDATION" || days_remaining < 30,
    revalidation_deadline:
      days_remaining < 30
        ? new Date(current_date.getTime() + 30 * 24 * 60 * 60 * 1000)
        : undefined,
  };
}

/**
 * Validate assumption set against context
 */
export function validateAssumptionSet(
  assumptions: Assumption[],
  current_context: OperationalContext
): AssumptionValidationResult[] {
  return assumptions.map((a) => validateAssumption(a, current_context));
}

/**
 * Check if any assumption is blocking
 */
export function hasBlockingAssumption(validations: AssumptionValidationResult[]): boolean {
  return validations.some((v) => v.validation_status === "INVALIDATED" || v.validation_status === "CONTRADICTED");
}

/**
 * Calculate confidence adjustment from assumptions
 */
export function calculateAssumptionConfidenceAdjustment(
  validations: AssumptionValidationResult[]
): number {
  let total_adjustment = 0;

  for (const validation of validations) {
    total_adjustment += validation.confidence_adjustment;
  }

  return Math.max(-100, total_adjustment);
}

/**
 * Get assumption validation summary
 */
export function getAssumptionSummary(validations: AssumptionValidationResult[]): {
  valid_count: number;
  stale_count: number;
  invalid_count: number;
  contradicted_count: number;
  superseded_count: number;
  blocking: boolean;
} {
  return {
    valid_count: validations.filter((v) => v.validation_status === "VALID").length,
    stale_count: validations.filter((v) => v.validation_status === "STALE").length,
    invalid_count: validations.filter((v) => v.validation_status === "INVALIDATED").length,
    contradicted_count: validations.filter((v) => v.validation_status === "CONTRADICTED").length,
    superseded_count: validations.filter((v) => v.validation_status === "SUPERSEDED").length,
    blocking: hasBlockingAssumption(validations),
  };
}

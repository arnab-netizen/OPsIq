import { Scope, ScopeValidationResult } from "../../domain/governance/governance-contracts";

/**
 * Scope enforcement validates recommendation applicability.
 * Blocks out-of-scope recommendations.
 */

export interface OperationalContext {
  geography: string;
  business_type: "SAAS" | "ECOMMERCE" | "SERVICES" | "MANUFACTURING" | "CONSULTING";
  customer_segment: "SMB" | "MID_MARKET" | "ENTERPRISE" | "STARTUP";
  maturity_level: "EARLY_STAGE" | "SCALING" | "MATURE" | "DECLINING";
  operational_scale: "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";
}

/**
 * Validate recommendation scope against operational context
 */
export function validateScope(
  recommended_scope: Scope,
  actual_context: OperationalContext
): ScopeValidationResult {
  const out_of_scope_reasons: string[] = [];
  let confidence_impact = 0;

  // Check geography
  if (!recommended_scope.geography.includes(actual_context.geography)) {
    out_of_scope_reasons.push(
      `Geography: recommendation for ${recommended_scope.geography.join(", ")}, actual ${actual_context.geography}`
    );
    confidence_impact -= 20;
  }

  // Check business type
  if (
    recommended_scope.business_types.length > 0 &&
    !recommended_scope.business_types.includes(actual_context.business_type)
  ) {
    out_of_scope_reasons.push(
      `Business type: recommendation for ${recommended_scope.business_types.join(", ")}, actual ${actual_context.business_type}`
    );
    confidence_impact -= 25;
  }

  // Check customer segment
  if (
    recommended_scope.customer_segments.length > 0 &&
    !recommended_scope.customer_segments.includes(actual_context.customer_segment)
  ) {
    out_of_scope_reasons.push(
      `Customer segment: recommendation for ${recommended_scope.customer_segments.join(", ")}, actual ${actual_context.customer_segment}`
    );
    confidence_impact -= 25;
  }

  // Check maturity level
  if (
    recommended_scope.maturity_levels.length > 0 &&
    !recommended_scope.maturity_levels.includes(actual_context.maturity_level)
  ) {
    out_of_scope_reasons.push(
      `Maturity: recommendation for ${recommended_scope.maturity_levels.join(", ")}, actual ${actual_context.maturity_level}`
    );
    confidence_impact -= 20;
  }

  // Check operational scale
  if (
    recommended_scope.operational_scales.length > 0 &&
    !recommended_scope.operational_scales.includes(actual_context.operational_scale)
  ) {
    out_of_scope_reasons.push(
      `Scale: recommendation for ${recommended_scope.operational_scales.join(", ")}, actual ${actual_context.operational_scale}`
    );
    confidence_impact -= 20;
  }

  return {
    is_valid: out_of_scope_reasons.length === 0,
    out_of_scope_reasons,
    confidence_impact: Math.max(-100, confidence_impact),
  };
}

/**
 * Check if scope mismatch should block execution
 */
export function shouldBlockForScopeMismatch(validation: ScopeValidationResult): boolean {
  return !validation.is_valid && validation.confidence_impact < -50;
}

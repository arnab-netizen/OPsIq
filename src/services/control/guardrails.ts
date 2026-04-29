/**
 * Guardrails Engine - Phase 4 Control 4
 *
 * Visible policy guardrails that explain which rules constrain decisions.
 * All violations are explicit and actionable - no silent constraints.
 */

export type ViolationSeverity = "block" | "warn";

export interface GuardrailViolation {
  ruleId: string;
  severity: ViolationSeverity;
  message: string;
  threshold: number | string;
  actual: number | string;
  overrideAllowed: boolean;
}

export interface GuardrailInput {
  expectedImpact: number;
  confidence: number;
  approvalFlag?: boolean;
}

export interface GuardrailResult {
  blocked: boolean;
  warnings: string[];
  violations: GuardrailViolation[];
}

// Guardrail rule definitions
const GUARDRAILS = {
  HIGH_IMPACT_APPROVAL: {
    ruleId: "HIGH_IMPACT_APPROVAL",
    description: "High-impact decisions require explicit approval",
    threshold: 100000,
    severity: "block",
    overrideAllowed: true,
  },
  LOW_CONFIDENCE_WARN: {
    ruleId: "LOW_CONFIDENCE_WARN",
    description: "Decisions with low confidence trigger warnings",
    threshold: 0.7,
    severity: "warn",
    overrideAllowed: false,
  },
  NEGATIVE_IMPACT_BLOCK: {
    ruleId: "NEGATIVE_IMPACT_BLOCK",
    description: "Decisions with non-positive impact are blocked",
    threshold: 0,
    severity: "block",
    overrideAllowed: false,
  },
};

/**
 * Evaluate decision against visible guardrails.
 * Returns explicit violations with thresholds and actual values.
 * All violations are actionable - violations can indicate they allow overrides.
 *
 * Rules:
 * 1. HIGH_IMPACT_APPROVAL: expectedImpact > 100000 requires approvalFlag=true (blockable, overridable)
 * 2. LOW_CONFIDENCE_WARN: confidence < 0.7 generates warning (not blockable)
 * 3. NEGATIVE_IMPACT_BLOCK: expectedImpact <= 0 blocks (not overridable)
 */
export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];
  let blocked = false;

  // Validate input
  if (!input || typeof input !== "object") {
    return {
      blocked: true,
      warnings: [],
      violations: [
        {
          ruleId: "INVALID_INPUT",
          severity: "block",
          message: "Invalid input to guardrails evaluation",
          threshold: "valid object",
          actual: typeof input,
          overrideAllowed: false,
        },
      ],
    };
  }

  if (typeof input.expectedImpact !== "number" || typeof input.confidence !== "number") {
    return {
      blocked: true,
      warnings: [],
      violations: [
        {
          ruleId: "INVALID_INPUT",
          severity: "block",
          message: "expectedImpact and confidence must be numbers",
          threshold: "number",
          actual: `expectedImpact:${typeof input.expectedImpact}, confidence:${typeof input.confidence}`,
          overrideAllowed: false,
        },
      ],
    };
  }

  // Rule 1: HIGH_IMPACT_APPROVAL
  if (input.expectedImpact > GUARDRAILS.HIGH_IMPACT_APPROVAL.threshold) {
    if (input.approvalFlag !== true) {
      violations.push({
        ruleId: GUARDRAILS.HIGH_IMPACT_APPROVAL.ruleId,
        severity: "block",
        message: `Decision impact (${input.expectedImpact}) exceeds approval threshold (${GUARDRAILS.HIGH_IMPACT_APPROVAL.threshold}). Explicit approval required.`,
        threshold: GUARDRAILS.HIGH_IMPACT_APPROVAL.threshold,
        actual: input.expectedImpact,
        overrideAllowed: GUARDRAILS.HIGH_IMPACT_APPROVAL.overrideAllowed,
      });
      blocked = true;
    }
  }

  // Rule 2: LOW_CONFIDENCE_WARN
  if (input.confidence < GUARDRAILS.LOW_CONFIDENCE_WARN.threshold) {
    violations.push({
      ruleId: GUARDRAILS.LOW_CONFIDENCE_WARN.ruleId,
      severity: "warn",
      message: `Decision confidence (${input.confidence.toFixed(2)}) is below recommended threshold (${GUARDRAILS.LOW_CONFIDENCE_WARN.threshold}). Proceed with caution.`,
      threshold: GUARDRAILS.LOW_CONFIDENCE_WARN.threshold,
      actual: input.confidence,
      overrideAllowed: GUARDRAILS.LOW_CONFIDENCE_WARN.overrideAllowed,
    });
    warnings.push(`Confidence warning: ${input.confidence.toFixed(2)} < ${GUARDRAILS.LOW_CONFIDENCE_WARN.threshold}`);
  }

  // Rule 3: NEGATIVE_IMPACT_BLOCK
  if (input.expectedImpact <= GUARDRAILS.NEGATIVE_IMPACT_BLOCK.threshold) {
    violations.push({
      ruleId: GUARDRAILS.NEGATIVE_IMPACT_BLOCK.ruleId,
      severity: "block",
      message: `Decision has non-positive expected impact (${input.expectedImpact}). Decisions must have positive impact.`,
      threshold: `> ${GUARDRAILS.NEGATIVE_IMPACT_BLOCK.threshold}`,
      actual: input.expectedImpact,
      overrideAllowed: GUARDRAILS.NEGATIVE_IMPACT_BLOCK.overrideAllowed,
    });
    blocked = true;
  }

  // Sort violations deterministically
  violations.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  warnings.sort();

  return {
    blocked,
    warnings,
    violations,
  };
}

/**
 * Get all defined guardrails.
 */
export function getGuardrailDefinitions(): Record<string, typeof GUARDRAILS[keyof typeof GUARDRAILS]> {
  return { ...GUARDRAILS };
}

/**
 * Get guardrail by rule ID.
 */
export function getGuardrail(ruleId: string) {
  return GUARDRAILS[ruleId as keyof typeof GUARDRAILS] || null;
}

/**
 * Format guardrail violations as human-readable text.
 */
export function formatGuardrailViolations(result: GuardrailResult): string {
  if (result.violations.length === 0) {
    return "No guardrail violations.";
  }

  const formatted = result.violations.map((v) => {
    const override = v.overrideAllowed ? " (override allowed)" : "";
    return `[${v.severity.toUpperCase()}] ${v.ruleId}: ${v.message}${override}`;
  });

  return formatted.join("\n");
}

/**
 * Create a summary of guardrail status.
 */
export function getGuardrailSummary(result: GuardrailResult): {
  blockingViolations: number;
  warnings: number;
  overridableViolations: number;
} {
  return {
    blockingViolations: result.violations.filter((v) => v.severity === "block").length,
    warnings: result.warnings.length,
    overridableViolations: result.violations.filter(
      (v) => v.severity === "block" && v.overrideAllowed
    ).length,
  };
}

import {
  AbstentionState,
  AbstentionMetadata,
  AbstentionDecision,
  UnsafeCondition,
  AbstentionMetadataSchema,
  AbstentionDecisionSchema,
} from "../../domain/governance/abstention-contracts";

/**
 * Abstention Engine: Detect unsafe recommendation conditions and safely refuse execution.
 * Fail-closed: unsafe conditions block execution explicitly.
 */

export interface SafetyAssessment {
  is_safe: boolean;
  unsafe_conditions: UnsafeCondition[];
  confidence_adjustment: number;
  abstain: boolean;
  abstention_state?: AbstentionState;
  fallback_action?: string;
}

/**
 * Evidence-support signal for the evidence-sufficiency rule (Option B).
 * Production-available only: derived from the engine output's evidence usage
 * and the engine's own `missingEvidenceFor` declaration. No answer keys, no
 * monitor flags.
 */
export interface EvidenceSupportSignal {
  /** Did the engine commit to a diagnosis (not INSUFFICIENT_EVIDENCE)? */
  committed: boolean;
  /** evidenceIds used by the diagnosis ÷ total evidence available, if known. */
  supportRatio?: number;
  /** Did the engine declare unresolved evidence gaps (missingEvidenceFor)? */
  hasMissingEvidence: boolean;
}

/**
 * Evidence-support sufficiency threshold (Option B, RC-3 fix).
 * A committed diagnosis is expected to rest on at least a majority of the
 * available evidence; below this, with unresolved gaps, the gate abstains.
 * This is the ONLY new threshold introduced; existing confidence cutoffs
 * (0.3 / 0.6 / 0.7) are unchanged.
 */
export const LOW_EVIDENCE_SUPPORT_THRESHOLD = 0.5;

/**
 * Evaluate recommendation for unsafe conditions
 */
export function assessSafety(
  confidence_score: number,
  has_evidence: boolean,
  evidence_contradictions: number,
  scope_valid: boolean,
  preconditions_met: boolean,
  irreversibility_score: number,
  operator_capacity_available: boolean,
  active_conflicts: number,
  evidence_support?: EvidenceSupportSignal
): SafetyAssessment {
  const unsafe_conditions: UnsafeCondition[] = [];
  let abstain = false;
  let abstention_state: AbstentionState | undefined;
  let confidence_adjustment = 0;

  // Check confidence level
  if (confidence_score < 0.3) {
    unsafe_conditions.push({
      condition_type: "LOW_CONFIDENCE",
      severity: "HIGH",
      description: `Confidence score ${confidence_score} below safety threshold (0.3)`,
      blocking: true,
    });
    abstain = true;
    abstention_state = "INSUFFICIENT_EVIDENCE";
    confidence_adjustment -= 30;
  }

  // Check evidence availability
  if (!has_evidence) {
    unsafe_conditions.push({
      condition_type: "MISSING_EVIDENCE",
      severity: "CRITICAL",
      description: "No evidence backing recommendation",
      blocking: true,
    });
    abstain = true;
    abstention_state = "INSUFFICIENT_EVIDENCE";
    confidence_adjustment -= 50;
  }

  // Check evidence contradictions
  if (evidence_contradictions > 0) {
    unsafe_conditions.push({
      condition_type: "CONTRADICTORY_EVIDENCE",
      severity: evidence_contradictions > 2 ? "CRITICAL" : "HIGH",
      description: `${evidence_contradictions} contradictory evidence sources detected`,
      blocking: evidence_contradictions > 2,
    });
    if (evidence_contradictions > 2) {
      abstain = true;
      abstention_state = "CONFLICTING_SIGNALS";
      confidence_adjustment -= 40;
    } else {
      confidence_adjustment -= 20;
    }
  }

  // Check scope validity
  if (!scope_valid) {
    unsafe_conditions.push({
      condition_type: "SCOPE_MISMATCH",
      severity: "HIGH",
      description: "Recommendation outside valid operational scope",
      blocking: true,
    });
    abstain = true;
    abstention_state = "OUTSIDE_VALID_SCOPE";
    confidence_adjustment -= 35;
  }

  // Check preconditions
  if (!preconditions_met) {
    unsafe_conditions.push({
      condition_type: "PRECONDITION_UNMET",
      severity: "CRITICAL",
      description: "Required preconditions not satisfied",
      blocking: true,
    });
    abstain = true;
    abstention_state = "MISSING_PRECONDITIONS";
    confidence_adjustment -= 45;
  }

  // Check irreversibility
  if (irreversibility_score > 0.7) {
    unsafe_conditions.push({
      condition_type: "HIGH_IRREVERSIBILITY",
      severity: "HIGH",
      description: `High irreversibility score (${irreversibility_score}) with uncertain evidence`,
      blocking: confidence_score < 0.6,
    });
    if (confidence_score < 0.6) {
      abstain = true;
      abstention_state = "HIGH_RISK_UNCERTAIN";
      confidence_adjustment -= 25;
    }
  }

  // Check operator capacity
  if (!operator_capacity_available) {
    unsafe_conditions.push({
      condition_type: "CAPACITY_OVERLOAD",
      severity: "MEDIUM",
      description: "Operator capacity exceeded",
      blocking: true,
    });
    abstain = true;
    abstention_state = "OPERATOR_CAPACITY_EXCEEDED";
    confidence_adjustment -= 15;
  }

  // Check active conflicts
  if (active_conflicts > 1) {
    unsafe_conditions.push({
      condition_type: "CONFLICTING_RECOMMENDATIONS",
      severity: active_conflicts > 3 ? "CRITICAL" : "HIGH",
      description: `${active_conflicts} conflicting recommendations active`,
      blocking: active_conflicts > 3,
    });
    if (active_conflicts > 3) {
      abstain = true;
      abstention_state = "CONFLICTING_SIGNALS";
      confidence_adjustment -= 30;
    }
  }

  // Evidence-support sufficiency (Option B, RC-3 fix): a COMMITTED diagnosis
  // that rests on insufficient evidence support AND carries unresolved evidence
  // gaps must not proceed, even when confidence clears the floor. This is the
  // rule that catches confident-but-undersupported outputs.
  if (
    evidence_support?.committed &&
    evidence_support.hasMissingEvidence &&
    evidence_support.supportRatio !== undefined &&
    evidence_support.supportRatio < LOW_EVIDENCE_SUPPORT_THRESHOLD
  ) {
    unsafe_conditions.push({
      condition_type: "MISSING_EVIDENCE",
      severity: "HIGH",
      description: `Committed diagnosis rests on insufficient evidence support (ratio ${evidence_support.supportRatio.toFixed(
        2
      )} < ${LOW_EVIDENCE_SUPPORT_THRESHOLD}) with unresolved evidence gaps declared`,
      blocking: true,
    });
    abstain = true;
    abstention_state = "INSUFFICIENT_EVIDENCE";
    confidence_adjustment -= 25;
  }

  return {
    is_safe: unsafe_conditions.every((c) => !c.blocking),
    unsafe_conditions,
    confidence_adjustment: Math.max(-100, confidence_adjustment),
    abstain,
    abstention_state: abstain ? abstention_state : undefined,
    fallback_action: abstain ? "escalate_to_operator" : undefined,
  };
}

/**
 * Create abstention decision with fail-closed enforcement
 */
export function createAbstentionDecision(
  recommendation_id: string,
  abstention_state: AbstentionState,
  blocking_factors: string[],
  confidence_score: number,
  escalation_required: boolean,
  actor: string
): AbstentionDecision {
  const metadata: AbstentionMetadata = {
    reason: `Recommendation abstained: ${abstention_state}`,
    blocking_factors,
    missing_evidence: abstention_state === "INSUFFICIENT_EVIDENCE" ? ["evidence"] : [],
    violated_constraints:
      abstention_state === "OUTSIDE_VALID_SCOPE" ? ["scope_constraint"] : [],
    confidence_score,
    escalation_required,
    safe_fallback_action: escalation_required ? "escalate_to_operator" : "revalidate_later",
    review_trigger: escalation_required ? "OPERATOR_REVIEW_REQUIRED" : undefined,
    review_date: new Date(),
  };

  // Validate metadata before creating decision
  AbstentionMetadataSchema.parse(metadata);

  const decision: AbstentionDecision = {
    recommendation_id,
    abstention_state,
    metadata,
    timestamp: new Date(),
    actor,
    immutable: true,
  };

  AbstentionDecisionSchema.parse(decision);
  return decision;
}

/**
 * Check if recommendation should abstain
 */
export function shouldAbstain(assessment: SafetyAssessment): boolean {
  return assessment.abstain;
}

/**
 * Get abstention reason
 */
export function getAbstentionReason(assessment: SafetyAssessment): string {
  if (!assessment.abstain) {
    return "";
  }

  const blocking_factors = assessment.unsafe_conditions
    .filter((c) => c.blocking)
    .map((c) => c.description);

  return `Abstaining: ${blocking_factors.join("; ")}`;
}

/**
 * Escalation required check
 */
export function requiresEscalation(assessment: SafetyAssessment): boolean {
  const critical_conditions = assessment.unsafe_conditions.filter(
    (c) => c.severity === "CRITICAL"
  );
  return critical_conditions.length > 0 || (assessment.abstain && assessment.confidence_adjustment < -40);
}

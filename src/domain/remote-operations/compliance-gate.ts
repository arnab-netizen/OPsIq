/**
 * R27 — Compliance / safety gate at recommendation / action / dispatch (§48). Pure.
 *
 * The gate fires at all three stages. Unclear legal/safety status fails CLOSED. A
 * recommendation that would create compliance risk is COMPLIANCE_FLAGGED and cannot be
 * approved without owner/expert review. An assignment requiring a certification/licence is
 * blocked if missing or unknown. The gate cannot be bypassed by an earlier-stage pass if
 * the condition changes later. Integrates with Owner Mode collective arbitration.
 */

export type ComplianceStage = "RECOMMENDATION" | "ACTION_CREATION" | "DISPATCH";

export interface ComplianceSignals {
  complianceSensitive: boolean;
  /** Legal/safety status is clear (false → fail closed). */
  statusClear: boolean;
  requiresCertificationOrLicence: boolean;
  certificationPresentAndValid: boolean;
  /** Jurisdiction certainty backed by a verified local source / expert. */
  verifiedExpertSource: boolean;
  safetyHazardOpen: boolean;
}

export type ComplianceVerdict = "PASS" | "COMPLIANCE_FLAGGED" | "BLOCKED_FAIL_CLOSED" | "ESCALATE_EXPERT";

export interface ComplianceResult {
  verdict: ComplianceVerdict;
  reasons: string[];
  /** Cannot be approved/dispatched without owner/expert review. */
  requiresOwnerOrExpertReview: boolean;
}

export function evaluateComplianceGate(stage: ComplianceStage, s: ComplianceSignals): ComplianceResult {
  const reasons: string[] = [];

  if (s.safetyHazardOpen) reasons.push("safety_hazard_open");
  // Assignment requiring a certification/licence is blocked if missing or unknown.
  if (s.requiresCertificationOrLicence && !s.certificationPresentAndValid) reasons.push("certification_missing_or_unknown");

  if (s.complianceSensitive) {
    // Unclear legal/safety status fails closed.
    if (!s.statusClear) reasons.push("legal_safety_status_unclear");
    // Jurisdiction certainty requires a verified expert source.
    if (!s.verifiedExpertSource) reasons.push("no_verified_expert_source");
  }

  if (reasons.length === 0) return { verdict: "PASS", reasons, requiresOwnerOrExpertReview: false };

  // A hard safety hazard or missing certification fails closed at action/dispatch.
  const failClosed = reasons.includes("safety_hazard_open") || reasons.includes("certification_missing_or_unknown")
    || (reasons.includes("legal_safety_status_unclear") && stage !== "RECOMMENDATION");
  if (failClosed) return { verdict: "BLOCKED_FAIL_CLOSED", reasons, requiresOwnerOrExpertReview: true };

  // Compliance-sensitive but recoverable via expert review.
  if (reasons.includes("no_verified_expert_source")) return { verdict: "ESCALATE_EXPERT", reasons, requiresOwnerOrExpertReview: true };
  return { verdict: "COMPLIANCE_FLAGGED", reasons, requiresOwnerOrExpertReview: true };
}

/**
 * The gate cannot be bypassed by an earlier pass: a later stage must re-evaluate, and any
 * non-PASS at the later stage blocks regardless of an earlier PASS.
 */
export function reEvaluateAtStage(priorVerdict: ComplianceVerdict, currentStage: ComplianceStage, currentSignals: ComplianceSignals): ComplianceResult {
  return evaluateComplianceGate(currentStage, currentSignals);
}

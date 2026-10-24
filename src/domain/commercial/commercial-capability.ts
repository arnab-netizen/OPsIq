/**
 * Commercial capability model (pure, no I/O).
 *
 * Contract: FIRST DIAGNOSIS FREE; CONTINUING OPSIQ LOOP = PRO.
 * Capabilities describe WHAT the owner is trying to do, never how payment is collected, so the
 * payment provider can change without touching any caller.
 */

export const COMMERCIAL_CAPABILITIES = {
  /** Create the workspace's very first diagnosis cycle. Free. */
  FIRST_DIAGNOSIS: "first_diagnosis",
  /** Create any diagnosis cycle after the workspace's first one (re-diagnosis, reassessment, new domain). */
  SUBSEQUENT_DIAGNOSIS: "subsequent_diagnosis",
  /** First governed execution of a recommendation: accept/start/complete/verify an action or task. */
  GOVERNED_EXECUTION: "governed_execution",
  /** Resolving governed approvals and recording owner decisions/outcomes. */
  APPROVAL_RESOLUTION: "approval_resolution",
  /** Reassessment / re-evaluation / generation of subsequent priorities and recommendations. */
  REASSESSMENT: "reassessment",
  /** Any other continuation step of the recurring loop. */
  CONTINUATION_ACTION: "continuation_action",
} as const;

export type CommercialCapability = (typeof COMMERCIAL_CAPABILITIES)[keyof typeof COMMERCIAL_CAPABILITIES];

export const ALL_COMMERCIAL_CAPABILITIES: readonly CommercialCapability[] = Object.values(COMMERCIAL_CAPABILITIES);

/** Semantic classes used by the route/capability census and the coverage registry. */
export const COMMERCIAL_CLASSES = [
  "FREE_FOUNDATION",
  "FREE_FIRST_VALUE",
  "FREE_READ",
  "PAID_CONTINUATION",
  /** One handler carries both free capture and paid continuation actions; the paid action is gated semantically. */
  "MIXED_ACTION_SPLIT",
  "ACCOUNT_LIFECYCLE",
  "NON_COMMERCIAL",
  "CLASSIFICATION_REQUIRES_DECISION",
] as const;

export type CommercialClass = (typeof COMMERCIAL_CLASSES)[number];

export type CommercialDenialReason = "subscription_required" | "first_diagnosis_used" | "entitlement_unverifiable";

export type CommercialDecision =
  | { allowed: true; reason: "not_enforced" | "entitled" | "first_diagnosis_available" }
  | { allowed: false; reason: CommercialDenialReason };

export interface CommercialDecisionInput {
  capability: CommercialCapability;
  /** True only when BILLING_PAYWALL_ENFORCEMENT is exactly "on". */
  enforced: boolean;
  /** Result of resolveAccess(): paid or within past-due grace. */
  entitled: boolean;
  /** Number of persisted diagnosis cycles already owned by the workspace (all domains, all businesses). */
  priorDiagnosisCount: number;
}

/**
 * Single decision function. Order matters: the kill switch wins (OFF = zero behaviour change), then
 * entitlement, then the one free allowance. Anything else is denied (fail closed).
 */
export function decideCommercialCapability(input: CommercialDecisionInput): CommercialDecision {
  if (!input.enforced) return { allowed: true, reason: "not_enforced" };
  if (input.entitled) return { allowed: true, reason: "entitled" };
  if (input.capability === COMMERCIAL_CAPABILITIES.FIRST_DIAGNOSIS) {
    return input.priorDiagnosisCount === 0
      ? { allowed: true, reason: "first_diagnosis_available" }
      : { allowed: false, reason: "first_diagnosis_used" };
  }
  return { allowed: false, reason: "subscription_required" };
}

/** Capability a diagnosis write needs, derived from persisted state only. */
export function diagnosisCapabilityFor(priorDiagnosisCount: number): CommercialCapability {
  return priorDiagnosisCount === 0 ? COMMERCIAL_CAPABILITIES.FIRST_DIAGNOSIS : COMMERCIAL_CAPABILITIES.SUBSEQUENT_DIAGNOSIS;
}

export const COMMERCIAL_DENIAL_MESSAGES: Record<CommercialDenialReason, string> = {
  subscription_required: "An active subscription is required to continue the OpsIQ loop",
  first_diagnosis_used: "Your free first diagnosis has been used. An active subscription is required to run another",
  entitlement_unverifiable: "Subscription status could not be verified, so this action is paused",
};

/**
 * Owner Override handling + outcome classification (Section 26). Pure.
 *
 * Owners may override most budget guidance, but NOT illegal/unsafe blocks
 * (unverified vendor bank change, statutory-reserve violation, unlawful employee
 * action). Override failure must NOT auto-prove the advice was correct unless the
 * predicted risk actually materialized with verified evidence.
 */

export type OverrideOutcome =
  | "ADVICE_CORRECT_EXECUTED_SUCCESS"
  | "ADVICE_CORRECT_NOT_EXECUTED"
  | "ADVICE_CORRECT_OWNER_OVERRIDDEN_FAILED"
  | "ADVICE_INCORRECT"
  | "ADVICE_INCOMPLETE_DUE_TO_DATA"
  | "EXECUTION_FAILED"
  | "EXTERNAL_EVENT_CHANGED_PLAN"
  | "RESULT_UNVERIFIED";

export type OwnerDecision = "followed" | "overrode" | "no_action";

export interface OverrideOutcomeInput {
  ownerDecision: OwnerDecision;
  outcomeVerified: boolean;
  /** Verified success/failure of the outcome (null = unknown). */
  outcomeSuccess: boolean | null;
  /** Did the risk OpsIQ predicted actually materialize (verified)? null = unknown. */
  predictedRiskMaterialized?: boolean | null;
  externalEventChangedPlan?: boolean;
  dataWasInsufficient?: boolean;
  executionFailed?: boolean;
}

/**
 * Classify the outcome of a recommendation/override. Deterministic precedence
 * ensures we never claim advice was correct without verified, materialized risk.
 */
export function classifyOverrideOutcome(i: OverrideOutcomeInput): OverrideOutcome {
  if (i.dataWasInsufficient) return "ADVICE_INCOMPLETE_DUE_TO_DATA";
  if (i.externalEventChangedPlan) return "EXTERNAL_EVENT_CHANGED_PLAN";
  if (!i.outcomeVerified) return "RESULT_UNVERIFIED";
  if (i.ownerDecision === "no_action") return "ADVICE_CORRECT_NOT_EXECUTED";
  if (i.executionFailed) return "EXECUTION_FAILED";

  if (i.ownerDecision === "followed") {
    return i.outcomeSuccess ? "ADVICE_CORRECT_EXECUTED_SUCCESS" : "ADVICE_INCORRECT";
  }

  // ownerDecision === "overrode"
  // Only credit the original advice if the predicted risk verifiably materialized.
  if (i.predictedRiskMaterialized === true && i.outcomeSuccess === false) {
    return "ADVICE_CORRECT_OWNER_OVERRIDDEN_FAILED";
  }
  if (i.outcomeSuccess === true) return "ADVICE_INCORRECT"; // override beat the advice
  return "RESULT_UNVERIFIED";
}

export interface OverrideSafetyInput {
  /** Vendor bank details changed and not yet independently verified. */
  vendorBankUnverified?: boolean;
  /** Override would breach the legal/statutory reserve. */
  statutoryReserveViolation?: boolean;
  /** Override requests an unlawful/unfair employee action. */
  unlawfulEmployeeAction?: boolean;
}

export interface OverrideSafetyResult {
  allowed: boolean;
  reason: string;
}

/** Owners can override business recommendations, but hard safety/legal blocks stand. */
export function assertOverrideAllowed(i: OverrideSafetyInput): OverrideSafetyResult {
  if (i.vendorBankUnverified) {
    return { allowed: false, reason: "Cannot override: vendor bank change must be independently verified first." };
  }
  if (i.statutoryReserveViolation) {
    return { allowed: false, reason: "Cannot override: would breach a legal/statutory reserve." };
  }
  if (i.unlawfulEmployeeAction) {
    return { allowed: false, reason: "Cannot override: requested employee action is unlawful/unfair." };
  }
  return { allowed: true, reason: "Override permitted; risk disclosed, logged, and scheduled for reassessment." };
}

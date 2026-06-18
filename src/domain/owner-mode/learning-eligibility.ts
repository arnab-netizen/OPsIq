import { assertWorkspaceScopedQuery } from "./security-rules";

export type LearningEligibilityStatus =
  | "not_reviewed"
  | "rejected"
  | "eligible_low_confidence"
  | "eligible_medium_confidence"
  | "eligible_high_confidence"
  | "needs_more_cases"
  | "quarantined"
  | "human_review_pending"
  | "human_approved"
  | "human_rejected";

export type LearningRejectionReason =
  | "opinion_only"
  | "not_executed"
  | "material_execution_deviation"
  | "missing_metric"
  | "unverified_evidence"
  | "invalid_measurement_window"
  | "external_event_contamination"
  | "single_weak_case"
  | "case_too_unique"
  | "insufficient_evidence"
  | "contradictory_evidence"
  | "causation_not_supported"
  | "harm_review_required"
  | "privacy_controls_missing";

// Statuses that allow downstream learning consumption
export const ELIGIBILITY_ALLOWS_LEARNING: Readonly<Record<LearningEligibilityStatus, boolean>> = {
  not_reviewed: false,
  rejected: false,
  eligible_low_confidence: true,
  eligible_medium_confidence: true,
  eligible_high_confidence: true,
  needs_more_cases: false,
  quarantined: false,
  human_review_pending: false,
  human_approved: true,
  human_rejected: false,
};

// Statuses that block learning absolutely (terminal rejections)
export const ELIGIBILITY_IS_TERMINAL_REJECTION: Readonly<
  Record<LearningEligibilityStatus, boolean>
> = {
  not_reviewed: false,
  rejected: true,
  eligible_low_confidence: false,
  eligible_medium_confidence: false,
  eligible_high_confidence: false,
  needs_more_cases: false,
  quarantined: false,
  human_review_pending: false,
  human_approved: false,
  human_rejected: true,
};

// Rejection reasons that are hard blocks (cannot be resolved by adding evidence)
export const REJECTION_IS_HARD_BLOCK: Readonly<Record<LearningRejectionReason, boolean>> = {
  opinion_only: true,
  not_executed: true,
  material_execution_deviation: true,
  missing_metric: false,
  unverified_evidence: false,
  invalid_measurement_window: false,
  external_event_contamination: true,
  single_weak_case: false,
  case_too_unique: false,
  insufficient_evidence: false,
  contradictory_evidence: false,
  causation_not_supported: true,
  harm_review_required: false,
  privacy_controls_missing: false,
};

export interface LearningEligibilityInput {
  workspaceId: string;
  businessId: string;
  actionId?: string;
  recommendationId?: string;
  outcomeId?: string;
  // Prior loop gate signals (all required to assess eligibility)
  actionWasExecuted: boolean;
  executionMateriallyDeviated: boolean;
  hasVerifiedEvidence: boolean;
  measurementPeriodComplete: boolean;
  adjudicationCompleted: boolean;
  adjudicationVerdict: string; // "validated_success" | "validated_failure" | others
  causalAttributionCompleted: boolean;
  causalAttributionClass: string; // "likely_caused" | "plausible_contributor" | others
  // Harm signals
  harmSeverity: string; // "none" | "low" | "medium" | "high" | "severe"
  // Evidence quality
  isOwnerOpinionOnly: boolean;
  hasContradictoryEvidence: boolean;
  hasPrivacyControls: boolean;
  // Scope signals
  broadImpactScope: boolean; // affects many customers/products
  // Supporting narrative
  eligibilityNotes: string;
}

export interface LearningEligibilityResult {
  valid: boolean;
  violations: string[];
  status: LearningEligibilityStatus;
  rejectionReasons: LearningRejectionReason[];
  requiresHumanReview: boolean;
  allowsLearning: boolean;
  isTerminalRejection: boolean;
}

const MIN_NOTES_LENGTH = 10;

// ELIG-RULE-1: eligibilityNotes must be non-trivial
// ELIG-RULE-2: at least one entity link required
// ELIG-RULE-3: if isOwnerOpinionOnly=true, actionWasExecuted must be false or adjudicationVerdict invalid
//              (opinion only is mutually exclusive with learning)

function deriveRejectionReasons(input: LearningEligibilityInput): LearningRejectionReason[] {
  const reasons: LearningRejectionReason[] = [];

  if (input.isOwnerOpinionOnly) reasons.push("opinion_only");
  if (!input.actionWasExecuted) reasons.push("not_executed");
  if (input.executionMateriallyDeviated) reasons.push("material_execution_deviation");
  if (!input.hasVerifiedEvidence) reasons.push("unverified_evidence");
  if (!input.measurementPeriodComplete) reasons.push("invalid_measurement_window");
  if (
    input.causalAttributionClass === "correlation_only" ||
    input.causalAttributionClass === "insufficient_evidence" ||
    input.causalAttributionClass === "not_assessed"
  ) {
    reasons.push("causation_not_supported");
  }
  if (input.causalAttributionClass === "external_event_dominant") {
    reasons.push("external_event_contamination");
  }
  if (input.hasContradictoryEvidence) reasons.push("contradictory_evidence");
  if (!input.adjudicationCompleted) reasons.push("insufficient_evidence");
  if (!input.causalAttributionCompleted) reasons.push("insufficient_evidence");
  if (!input.hasPrivacyControls) reasons.push("privacy_controls_missing");
  if (input.harmSeverity === "high" || input.harmSeverity === "severe") {
    reasons.push("harm_review_required");
  }

  return [...new Set(reasons)]; // deduplicate
}

function deriveStatus(
  input: LearningEligibilityInput,
  rejectionReasons: LearningRejectionReason[],
  requiresHumanReview: boolean
): LearningEligibilityStatus {
  if (rejectionReasons.some((r) => REJECTION_IS_HARD_BLOCK[r])) {
    if (input.hasContradictoryEvidence) return "quarantined";
    return "rejected";
  }

  const nonReviewReasons = rejectionReasons.filter((r) => r !== "harm_review_required");

  if (input.hasContradictoryEvidence) return "quarantined";

  if (requiresHumanReview) return "human_review_pending";

  if (nonReviewReasons.length > 0) {
    return "rejected";
  }

  // Determine confidence from causal class + adjudication
  const validVerdicts = ["validated_success", "validated_failure"];
  const verdictIsValid = validVerdicts.includes(input.adjudicationVerdict);

  if (!verdictIsValid) return "needs_more_cases";

  if (input.causalAttributionClass === "likely_caused") {
    return "eligible_high_confidence";
  }
  if (input.causalAttributionClass === "plausible_contributor") {
    return "eligible_medium_confidence";
  }
  if (input.causalAttributionClass === "confounded") {
    return "eligible_low_confidence";
  }

  return "needs_more_cases";
}

export function assessLearningEligibility(
  input: LearningEligibilityInput
): LearningEligibilityResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // ELIG-RULE-1
  if (!input.eligibilityNotes || input.eligibilityNotes.trim().length < MIN_NOTES_LENGTH) {
    violations.push(
      `eligibilityNotes must be at least ${MIN_NOTES_LENGTH} characters (ELIG-RULE-1)`
    );
  }

  // ELIG-RULE-2
  if (!input.actionId && !input.recommendationId && !input.outcomeId) {
    violations.push(
      "At least one of actionId, recommendationId, or outcomeId is required (ELIG-RULE-2)"
    );
  }

  const rejectionReasons = deriveRejectionReasons(input);

  // Human review required when: harm severity is high/severe, broad impact, or confounded attribution
  const requiresHumanReview =
    rejectionReasons.includes("harm_review_required") ||
    (input.broadImpactScope &&
      input.causalAttributionClass === "likely_caused" &&
      rejectionReasons.length === 0) ||
    input.causalAttributionClass === "confounded";

  const status = deriveStatus(input, rejectionReasons, requiresHumanReview);

  return {
    valid: violations.length === 0,
    violations,
    status,
    rejectionReasons,
    requiresHumanReview,
    allowsLearning: violations.length === 0 && ELIGIBILITY_ALLOWS_LEARNING[status],
    isTerminalRejection: ELIGIBILITY_IS_TERMINAL_REJECTION[status],
  };
}

export function learningIsAdmissible(result: LearningEligibilityResult): boolean {
  return result.allowsLearning;
}

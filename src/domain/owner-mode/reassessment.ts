import { assertWorkspaceScopedQuery } from "./security-rules";

export type ReassessmentTrigger =
  | "failed_outcome"
  | "disputed_outcome"
  | "harmful_outcome"
  | "external_event_invalidation"
  | "execution_invalidation"
  | "owner_dispute"
  | "evidence_retraction"
  | "new_contradicting_evidence";

export type ReassessmentStatus =
  | "pending"
  | "in_progress"
  | "diagnosis_reopened"
  | "corrective_action_issued"
  | "closed_no_correction_needed"
  | "closed_with_correction"
  | "blocked_awaiting_human_review";

export type AssumptionStatus =
  | "held"
  | "challenged"
  | "invalidated"
  | "confirmed";

export type CorrectiveActionClass =
  | "retry_same_action"
  | "modify_action_parameters"
  | "switch_action_type"
  | "escalate_to_owner"
  | "defer_pending_evidence"
  | "close_as_external_cause"
  | "close_as_invalid_test"
  | "reopen_diagnosis";

// Status transitions — AI does not control these
export const REASSESSMENT_STATUS_TRANSITIONS: Readonly<
  Record<ReassessmentStatus, ReadonlyArray<ReassessmentStatus>>
> = {
  pending: ["in_progress", "blocked_awaiting_human_review"],
  in_progress: [
    "diagnosis_reopened",
    "corrective_action_issued",
    "closed_no_correction_needed",
    "blocked_awaiting_human_review",
  ],
  diagnosis_reopened: [
    "corrective_action_issued",
    "closed_no_correction_needed",
    "blocked_awaiting_human_review",
  ],
  corrective_action_issued: ["closed_with_correction", "blocked_awaiting_human_review"],
  closed_no_correction_needed: [], // terminal
  closed_with_correction: [], // terminal
  blocked_awaiting_human_review: ["in_progress", "closed_no_correction_needed"],
};

// Triggers that always require human review before any corrective action
export const TRIGGER_REQUIRES_HUMAN_REVIEW: Readonly<Record<ReassessmentTrigger, boolean>> = {
  failed_outcome: false,
  disputed_outcome: true,
  harmful_outcome: true,
  external_event_invalidation: false,
  execution_invalidation: false,
  owner_dispute: true,
  evidence_retraction: true,
  new_contradicting_evidence: false,
};

// Triggers that reopen the original diagnosis
export const TRIGGER_REOPENS_DIAGNOSIS: Readonly<Record<ReassessmentTrigger, boolean>> = {
  failed_outcome: true,
  disputed_outcome: true,
  harmful_outcome: true,
  external_event_invalidation: false,
  execution_invalidation: false,
  owner_dispute: true,
  evidence_retraction: true,
  new_contradicting_evidence: true,
};

export interface ReassessmentInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  outcomeId?: string;
  trigger: ReassessmentTrigger;
  triggerDescription: string;
  // Prior loop signals
  failureAdjudicationId?: string;
  causalAttributionId?: string;
  harmEventId?: string;
  // Assumption review
  assumptionsChecked: boolean;
  invalidatedAssumptions: string[];
  // Corrective action
  proposedCorrectiveActionClass?: CorrectiveActionClass;
  correctiveActionRationale?: string;
  // Human factors
  ownerAcknowledged: boolean;
}

export interface ReassessmentResult {
  valid: boolean;
  violations: string[];
  requiresHumanReview: boolean;
  reopensDiagnosis: boolean;
  canIssueCorrectiveAction: boolean;
  proposedCorrectiveActionClass?: CorrectiveActionClass;
  initialStatus: ReassessmentStatus;
}

const MIN_DESCRIPTION_LENGTH = 10;

// REAS-RULE-1: triggerDescription must be non-trivial
// REAS-RULE-2: must link to at least one entity
// REAS-RULE-3: corrective action rationale required when proposedCorrectiveActionClass provided
// REAS-RULE-4: harmful_outcome and owner_dispute require ownerAcknowledged
// REAS-RULE-5: invalidatedAssumptions requires assumptionsChecked=true

export function initiateReassessment(input: ReassessmentInput): ReassessmentResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // REAS-RULE-1
  if (!input.triggerDescription || input.triggerDescription.trim().length < MIN_DESCRIPTION_LENGTH) {
    violations.push(
      `triggerDescription must be at least ${MIN_DESCRIPTION_LENGTH} characters (REAS-RULE-1)`
    );
  }

  // REAS-RULE-2
  if (!input.recommendationId && !input.actionId && !input.outcomeId) {
    violations.push(
      "At least one of recommendationId, actionId, or outcomeId is required (REAS-RULE-2)"
    );
  }

  // REAS-RULE-3
  if (input.proposedCorrectiveActionClass && !input.correctiveActionRationale) {
    violations.push(
      "correctiveActionRationale required when proposedCorrectiveActionClass is provided (REAS-RULE-3)"
    );
  }

  // REAS-RULE-4
  if (
    (input.trigger === "harmful_outcome" || input.trigger === "owner_dispute") &&
    !input.ownerAcknowledged
  ) {
    violations.push(
      "ownerAcknowledged must be true for harmful_outcome and owner_dispute triggers (REAS-RULE-4)"
    );
  }

  // REAS-RULE-5
  if (input.invalidatedAssumptions.length > 0 && !input.assumptionsChecked) {
    violations.push(
      "assumptionsChecked must be true when invalidatedAssumptions is non-empty (REAS-RULE-5)"
    );
  }

  const requiresHumanReview = TRIGGER_REQUIRES_HUMAN_REVIEW[input.trigger];
  const reopensDiagnosis = TRIGGER_REOPENS_DIAGNOSIS[input.trigger];

  const canIssueCorrectiveAction =
    violations.length === 0 &&
    !requiresHumanReview &&
    !!input.proposedCorrectiveActionClass &&
    !!input.correctiveActionRationale;

  let initialStatus: ReassessmentStatus = "pending";
  if (requiresHumanReview) {
    initialStatus = "blocked_awaiting_human_review";
  } else if (violations.length === 0) {
    initialStatus = "in_progress";
  }

  return {
    valid: violations.length === 0,
    violations,
    requiresHumanReview,
    reopensDiagnosis,
    canIssueCorrectiveAction,
    proposedCorrectiveActionClass: input.proposedCorrectiveActionClass,
    initialStatus,
  };
}

export function isValidReassessmentTransition(
  from: ReassessmentStatus,
  to: ReassessmentStatus
): boolean {
  return (REASSESSMENT_STATUS_TRANSITIONS[from] as ReadonlyArray<string>).includes(to);
}

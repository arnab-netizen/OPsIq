import { assertWorkspaceScopedQuery } from "./security-rules";

export type FailureClass =
  | "wrong_diagnosis"
  | "wrong_priority"
  | "wrong_action"
  | "wrong_timing"
  | "wrong_segment"
  | "wrong_assumption"
  | "constraint_ignored"
  | "bad_execution"
  | "partial_execution"
  | "not_executed"
  | "missing_data"
  | "bad_measurement"
  | "too_early_to_judge"
  | "external_event"
  | "insufficient_evidence"
  | "owner_preference_conflict"
  | "safety_or_compliance_risk"
  | "valid_recommendation_but_unproven";

export type AdjudicationVerdict =
  | "invalid_test"
  | "validated_failure"
  | "validated_success"
  | "reassessment_required"
  | "insufficient_evidence"
  | "too_early_to_judge";

// Verdicts that allow the learning loop to consume this adjudication
export const VERDICT_ENABLES_LEARNING: Readonly<Record<AdjudicationVerdict, boolean>> = {
  invalid_test: false,
  validated_failure: true,
  validated_success: true,
  reassessment_required: false,
  insufficient_evidence: false,
  too_early_to_judge: false,
};

// Verdicts that require a reassessment before closing the case
export const VERDICT_REQUIRES_REASSESSMENT: Readonly<Record<AdjudicationVerdict, boolean>> = {
  invalid_test: false,
  validated_failure: false,
  validated_success: false,
  reassessment_required: true,
  insufficient_evidence: false,
  too_early_to_judge: true,
};

export interface AdjudicationInput {
  workspaceId: string;
  businessId: string;
  recommendationId?: string;
  actionId?: string;
  outcomeId?: string;
  // Execution signals
  actionNotExecuted: boolean;
  executionMateriallyDeviated: boolean;
  // Evidence signals
  hasVerifiedEvidence: boolean;
  measurementPeriodComplete: boolean;
  // Outcome signals
  externalEventFlagged: boolean;
  ownerConstraintViolated: boolean;
  metricWorsened: boolean;
  successThresholdPassed: boolean;
  // Supporting narrative
  adjudicationReason: string;
}

export interface AdjudicationResult {
  valid: boolean;
  violations: string[];
  failureClass: FailureClass;
  verdict: AdjudicationVerdict;
  executionValid: boolean;
  evidenceSufficient: boolean;
  learningEligible: boolean;
  requiresReassessment: boolean;
}

// ADJ-RULE-1: adjudicationReason must be non-trivial
const MIN_REASON_LENGTH = 10;

// ADJ-RULE-2: must link to recommendation, action, or outcome
// ADJ-RULE-3: cannot have validated_success if evidence insufficient (guardrail)
// ADJ-RULE-4: cannot have validated_failure if execution was invalid
// Deterministic failure class + verdict derived from signals

function deriveFailureClass(input: AdjudicationInput): FailureClass {
  if (input.actionNotExecuted) return "not_executed";
  if (input.executionMateriallyDeviated) return "bad_execution";
  if (!input.hasVerifiedEvidence) return "insufficient_evidence";
  if (!input.measurementPeriodComplete) return "too_early_to_judge";
  if (input.externalEventFlagged) return "external_event";
  if (input.ownerConstraintViolated) return "constraint_ignored";
  if (input.metricWorsened) return "wrong_action";
  if (input.successThresholdPassed) return "valid_recommendation_but_unproven";
  return "missing_data";
}

function deriveVerdict(
  input: AdjudicationInput,
  executionValid: boolean,
  evidenceSufficient: boolean
): AdjudicationVerdict {
  if (input.actionNotExecuted || input.executionMateriallyDeviated) {
    return "invalid_test";
  }
  if (!input.hasVerifiedEvidence) return "insufficient_evidence";
  if (!input.measurementPeriodComplete) return "too_early_to_judge";
  if (input.externalEventFlagged) return "invalid_test";
  if (input.metricWorsened && executionValid && evidenceSufficient) {
    return "reassessment_required";
  }
  if (input.successThresholdPassed && executionValid && evidenceSufficient) {
    return "validated_success";
  }
  if (!input.successThresholdPassed && executionValid && evidenceSufficient) {
    return "validated_failure";
  }
  return "insufficient_evidence";
}

export function adjudicateFailure(input: AdjudicationInput): AdjudicationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // ADJ-RULE-1
  if (!input.adjudicationReason || input.adjudicationReason.trim().length < MIN_REASON_LENGTH) {
    violations.push(
      `adjudicationReason must be at least ${MIN_REASON_LENGTH} characters (ADJ-RULE-1)`
    );
  }

  // ADJ-RULE-2
  if (!input.recommendationId && !input.actionId && !input.outcomeId) {
    violations.push(
      "At least one of recommendationId, actionId, or outcomeId is required (ADJ-RULE-2)"
    );
  }

  const executionValid = !input.actionNotExecuted && !input.executionMateriallyDeviated;
  const evidenceSufficient = input.hasVerifiedEvidence && input.measurementPeriodComplete;

  const failureClass = deriveFailureClass(input);
  const verdict = deriveVerdict(input, executionValid, evidenceSufficient);

  // ADJ-RULE-3: cannot validate success without sufficient evidence
  if (verdict === "validated_success" && !evidenceSufficient) {
    violations.push(
      "validated_success requires hasVerifiedEvidence and measurementPeriodComplete (ADJ-RULE-3)"
    );
  }

  // ADJ-RULE-4: cannot validate failure if execution was invalid
  if (verdict === "validated_failure" && !executionValid) {
    violations.push(
      "validated_failure requires valid execution (ADJ-RULE-4)"
    );
  }

  const learningEligible =
    violations.length === 0 && VERDICT_ENABLES_LEARNING[verdict];

  return {
    valid: violations.length === 0,
    violations,
    failureClass,
    verdict,
    executionValid,
    evidenceSufficient,
    learningEligible,
    requiresReassessment: VERDICT_REQUIRES_REASSESSMENT[verdict],
  };
}

export function adjudicationAllowsLearning(result: AdjudicationResult): boolean {
  return result.learningEligible;
}

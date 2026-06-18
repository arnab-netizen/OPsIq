import { assertWorkspaceScopedQuery } from "./security-rules";

export type AttributionClass =
  | "not_assessed"
  | "correlation_only"
  | "plausible_contributor"
  | "likely_caused"
  | "confounded"
  | "external_event_dominant"
  | "insufficient_evidence";

export type LearningEligibilityFromAttribution =
  | "blocked"
  | "low"
  | "medium"
  | "high"
  | "requires_human_review";

// Attribution classes that block action-effectiveness learning entirely
export const ATTRIBUTION_BLOCKS_LEARNING: Readonly<Record<AttributionClass, boolean>> = {
  not_assessed: true,
  correlation_only: true,
  plausible_contributor: false,
  likely_caused: false,
  confounded: false,
  external_event_dominant: true,
  insufficient_evidence: true,
};

// Attribution classes that require human review before any learning admission
export const ATTRIBUTION_REQUIRES_HUMAN_REVIEW: Readonly<Record<AttributionClass, boolean>> = {
  not_assessed: false,
  correlation_only: false,
  plausible_contributor: false,
  likely_caused: false,
  confounded: true,
  external_event_dominant: false,
  insufficient_evidence: false,
};

// Maximum learning eligibility per attribution class
export const ATTRIBUTION_LEARNING_CEILING: Readonly<
  Record<AttributionClass, LearningEligibilityFromAttribution>
> = {
  not_assessed: "blocked",
  correlation_only: "blocked",
  plausible_contributor: "medium",
  likely_caused: "high",
  confounded: "requires_human_review",
  external_event_dominant: "blocked",
  insufficient_evidence: "blocked",
};

export interface CausalAttributionInput {
  workspaceId: string;
  businessId: string;
  actionId?: string;
  recommendationId?: string;
  outcomeId?: string;
  attributionClass: AttributionClass;
  // Signals
  hasTemporalProximity: boolean;
  hasControlledComparison: boolean;
  hasOwnerTestimony: boolean;
  hasExternalEventDuringPeriod: boolean;
  hasConfoundingFactors: boolean;
  // Supporting narrative
  attributionReason: string;
  confoundingNotes?: string;
}

export interface CausalAttributionResult {
  valid: boolean;
  violations: string[];
  attributionClass: AttributionClass;
  blocksLearning: boolean;
  requiresHumanReview: boolean;
  learningCeiling: LearningEligibilityFromAttribution;
  // Derived signals
  hasVerifiedCausalLink: boolean;
  isExternallyDominated: boolean;
}

const MIN_REASON_LENGTH = 10;

// CA-RULE-1: attributionReason must be non-trivial
// CA-RULE-2: must link to at least one entity (actionId, recommendationId, or outcomeId)
// CA-RULE-3: confounded classification requires confoundingNotes
// CA-RULE-4: hasExternalEventDuringPeriod without explanation contradicts non-external classes
// CA-RULE-5: likely_caused requires at minimum hasTemporalProximity

export function classifyCausalAttribution(
  input: CausalAttributionInput
): CausalAttributionResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // CA-RULE-1
  if (!input.attributionReason || input.attributionReason.trim().length < MIN_REASON_LENGTH) {
    violations.push(
      `attributionReason must be at least ${MIN_REASON_LENGTH} characters (CA-RULE-1)`
    );
  }

  // CA-RULE-2
  if (!input.actionId && !input.recommendationId && !input.outcomeId) {
    violations.push(
      "At least one of actionId, recommendationId, or outcomeId is required (CA-RULE-2)"
    );
  }

  // CA-RULE-3
  if (input.attributionClass === "confounded" && !input.confoundingNotes) {
    violations.push(
      "confoundingNotes required when attributionClass is confounded (CA-RULE-3)"
    );
  }

  // CA-RULE-4: if external event present but class is not external_event_dominant or confounded,
  // flag inconsistency only for likely_caused (strongest claim)
  if (
    input.hasExternalEventDuringPeriod &&
    input.attributionClass === "likely_caused"
  ) {
    violations.push(
      "likely_caused attribution is inconsistent with hasExternalEventDuringPeriod=true; consider confounded or external_event_dominant (CA-RULE-4)"
    );
  }

  // CA-RULE-5
  if (input.attributionClass === "likely_caused" && !input.hasTemporalProximity) {
    violations.push(
      "likely_caused requires hasTemporalProximity=true (CA-RULE-5)"
    );
  }

  const blocksLearning = ATTRIBUTION_BLOCKS_LEARNING[input.attributionClass];
  const requiresHumanReview = ATTRIBUTION_REQUIRES_HUMAN_REVIEW[input.attributionClass];
  const learningCeiling = ATTRIBUTION_LEARNING_CEILING[input.attributionClass];

  const hasVerifiedCausalLink =
    input.attributionClass === "likely_caused" &&
    input.hasTemporalProximity &&
    !input.hasExternalEventDuringPeriod &&
    !input.hasConfoundingFactors;

  const isExternallyDominated = input.attributionClass === "external_event_dominant";

  return {
    valid: violations.length === 0,
    violations,
    attributionClass: input.attributionClass,
    blocksLearning,
    requiresHumanReview,
    learningCeiling,
    hasVerifiedCausalLink,
    isExternallyDominated,
  };
}

export function attributionAllowsLearning(result: CausalAttributionResult): boolean {
  return result.valid && !result.blocksLearning && !result.requiresHumanReview;
}

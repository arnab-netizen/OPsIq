/**
 * Unified guided-execution learning gate (Slice 15, Addendum G).
 *
 * THE single service-level decision for whether a completed task may feed
 * learning. No UI route, API route, AI service, or background job may create a
 * learning candidate except through `determineLearningEligibility`. Fail-closed:
 * only verified, attributable, accepted, non-disputed, owner/system-approved
 * outcomes become eligible; everything else is blocked with a specific reason.
 *
 * This module also defines the input enums for the surrounding slices —
 * outcome status (12), implementation quality (13), profit confidence (14),
 * attribution (15) — so the gate has a single typed contract.
 */

/** Slice 12 — task outcome (separate from task completion). */
export enum OutcomeStatus {
  UNVERIFIED = "UNVERIFIED",
  MEASUREMENT_WINDOW_OPEN = "MEASUREMENT_WINDOW_OPEN",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  VERIFIED_SUCCESS = "VERIFIED_SUCCESS",
  VERIFIED_FAILURE = "VERIFIED_FAILURE",
  PARTIAL_SUCCESS = "PARTIAL_SUCCESS",
  DISPUTED = "DISPUTED",
  ATTRIBUTION_UNCLEAR = "ATTRIBUTION_UNCLEAR",
  NOT_ELIGIBLE_FOR_LEARNING = "NOT_ELIGIBLE_FOR_LEARNING",
}

/** Slice 15 — outcome attribution. */
export enum AttributionStatus {
  DIRECT = "DIRECT",
  LIKELY = "LIKELY",
  PARTIAL = "PARTIAL",
  UNCLEAR = "UNCLEAR",
  CONFLICTED = "CONFLICTED",
  NOT_ATTRIBUTABLE = "NOT_ATTRIBUTABLE",
}

/** Slice 13 — implementation/process quality (NOT employee discipline). */
export enum ImplementationQualityStatus {
  NOT_ASSESSED = "NOT_ASSESSED",
  HIGH_QUALITY = "HIGH_QUALITY",
  ACCEPTABLE = "ACCEPTABLE",
  WEAK = "WEAK",
  POOR = "POOR",
  INVALID_EXECUTION = "INVALID_EXECUTION",
  ATTRIBUTION_BLOCKED = "ATTRIBUTION_BLOCKED",
}

/** Slice 14 — profit-impact confidence. */
export enum ProfitImpactConfidence {
  MEASURED = "MEASURED",
  ESTIMATED_FROM_OWNER_INPUT = "ESTIMATED_FROM_OWNER_INPUT",
  ESTIMATED_FROM_DEFAULTS = "ESTIMATED_FROM_DEFAULTS",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  NOT_CALCULATED = "NOT_CALCULATED",
}

/** The proof's effective gate status as seen by the learning gate. */
export enum ProofGateStatus {
  NO_PROOF = "NO_PROOF",
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  DISPUTED = "DISPUTED",
  OVERRIDDEN_NOT_VERIFIED = "OVERRIDDEN_NOT_VERIFIED",
}

export enum OwnerLearningApproval {
  NOT_REQUIRED = "NOT_REQUIRED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PENDING = "PENDING",
}

export enum AiMutationAttemptStatus {
  NONE = "NONE",
  ATTEMPTED = "ATTEMPTED",
}

export enum LearningEligibilityStatus {
  BLOCKED_NO_PROOF = "BLOCKED_NO_PROOF",
  BLOCKED_PROOF_REJECTED = "BLOCKED_PROOF_REJECTED",
  BLOCKED_DISPUTED = "BLOCKED_DISPUTED",
  BLOCKED_POOR_EXECUTION = "BLOCKED_POOR_EXECUTION",
  BLOCKED_ATTRIBUTION_UNCLEAR = "BLOCKED_ATTRIBUTION_UNCLEAR",
  BLOCKED_OWNER_REJECTED = "BLOCKED_OWNER_REJECTED",
  BLOCKED_INSUFFICIENT_DATA = "BLOCKED_INSUFFICIENT_DATA",
  BLOCKED_OWNER_OVERRIDE_ONLY = "BLOCKED_OWNER_OVERRIDE_ONLY",
  BLOCKED_AI_MUTATION_ATTEMPT = "BLOCKED_AI_MUTATION_ATTEMPT",
  ELIGIBLE_VERIFIED_SUCCESS = "ELIGIBLE_VERIFIED_SUCCESS",
  ELIGIBLE_VERIFIED_FAILURE = "ELIGIBLE_VERIFIED_FAILURE",
  ELIGIBLE_PARTIAL_SUCCESS = "ELIGIBLE_PARTIAL_SUCCESS",
}

export const LEARNING_ELIGIBLE_STATUSES: ReadonlySet<LearningEligibilityStatus> = new Set([
  LearningEligibilityStatus.ELIGIBLE_VERIFIED_SUCCESS,
  LearningEligibilityStatus.ELIGIBLE_VERIFIED_FAILURE,
  LearningEligibilityStatus.ELIGIBLE_PARTIAL_SUCCESS,
]);

export function isLearningEligible(status: LearningEligibilityStatus): boolean {
  return LEARNING_ELIGIBLE_STATUSES.has(status);
}

export interface LearningGateInput {
  proofStatus: ProofGateStatus;
  proofRequired: boolean;
  implementationQuality: ImplementationQualityStatus;
  outcomeStatus: OutcomeStatus;
  attributionStatus: AttributionStatus;
  profitImpactRequired: boolean;
  profitImpactConfidence: ProfitImpactConfidence;
  ownerLearningApproval: OwnerLearningApproval;
  aiMutationAttempt: AiMutationAttemptStatus;
}

const POOR_QUALITY: ReadonlySet<ImplementationQualityStatus> = new Set([
  ImplementationQualityStatus.WEAK,
  ImplementationQualityStatus.POOR,
  ImplementationQualityStatus.INVALID_EXECUTION,
  ImplementationQualityStatus.ATTRIBUTION_BLOCKED,
]);

const UNCLEAR_ATTRIBUTION: ReadonlySet<AttributionStatus> = new Set([
  AttributionStatus.UNCLEAR,
  AttributionStatus.CONFLICTED,
  AttributionStatus.NOT_ATTRIBUTABLE,
]);

const INSUFFICIENT_OUTCOME: ReadonlySet<OutcomeStatus> = new Set([
  OutcomeStatus.UNVERIFIED,
  OutcomeStatus.MEASUREMENT_WINDOW_OPEN,
  OutcomeStatus.INSUFFICIENT_DATA,
  OutcomeStatus.NOT_ELIGIBLE_FOR_LEARNING,
]);

const WEAK_PROFIT: ReadonlySet<ProfitImpactConfidence> = new Set([
  ProfitImpactConfidence.ESTIMATED_FROM_DEFAULTS,
  ProfitImpactConfidence.INSUFFICIENT_DATA,
  ProfitImpactConfidence.NOT_CALCULATED,
]);

/**
 * The single learning-eligibility gate. Ordered, fail-closed checks: an AI
 * mutation attempt is rejected first; then proof; then disputes; then
 * owner-override-only; then execution quality; then outcome; then attribution;
 * then profit basis; then owner approval. Only a clean pass maps to an eligible
 * status.
 */
export function determineLearningEligibility(
  input: LearningGateInput
): LearningEligibilityStatus {
  // 1. An AI mutation attempt can never produce eligibility.
  if (input.aiMutationAttempt === AiMutationAttemptStatus.ATTEMPTED) {
    return LearningEligibilityStatus.BLOCKED_AI_MUTATION_ATTEMPT;
  }

  // 2. Proof gates.
  if (
    input.proofRequired &&
    (input.proofStatus === ProofGateStatus.NO_PROOF ||
      input.proofStatus === ProofGateStatus.PENDING)
  ) {
    return LearningEligibilityStatus.BLOCKED_NO_PROOF;
  }
  if (input.proofStatus === ProofGateStatus.REJECTED) {
    return LearningEligibilityStatus.BLOCKED_PROOF_REJECTED;
  }

  // 3. Disputes (proof or outcome).
  if (
    input.proofStatus === ProofGateStatus.DISPUTED ||
    input.outcomeStatus === OutcomeStatus.DISPUTED
  ) {
    return LearningEligibilityStatus.BLOCKED_DISPUTED;
  }

  // 4. Owner override only — never authentic verification.
  if (input.proofStatus === ProofGateStatus.OVERRIDDEN_NOT_VERIFIED) {
    return LearningEligibilityStatus.BLOCKED_OWNER_OVERRIDE_ONLY;
  }

  // 5. Execution quality.
  if (POOR_QUALITY.has(input.implementationQuality)) {
    return LearningEligibilityStatus.BLOCKED_POOR_EXECUTION;
  }

  // 6. Outcome must be verified (or a verified partial/failure).
  if (INSUFFICIENT_OUTCOME.has(input.outcomeStatus)) {
    return LearningEligibilityStatus.BLOCKED_INSUFFICIENT_DATA;
  }

  // 7. Attribution must be clear.
  if (
    UNCLEAR_ATTRIBUTION.has(input.attributionStatus) ||
    input.outcomeStatus === OutcomeStatus.ATTRIBUTION_UNCLEAR
  ) {
    return LearningEligibilityStatus.BLOCKED_ATTRIBUTION_UNCLEAR;
  }

  // 8. Profit basis, when required.
  if (input.profitImpactRequired && WEAK_PROFIT.has(input.profitImpactConfidence)) {
    return LearningEligibilityStatus.BLOCKED_INSUFFICIENT_DATA;
  }

  // 9. Owner learning approval.
  if (input.ownerLearningApproval === OwnerLearningApproval.REJECTED) {
    return LearningEligibilityStatus.BLOCKED_OWNER_REJECTED;
  }
  if (input.ownerLearningApproval === OwnerLearningApproval.PENDING) {
    return LearningEligibilityStatus.BLOCKED_INSUFFICIENT_DATA;
  }

  // 10. Clean pass → map the verified outcome to an eligible status.
  switch (input.outcomeStatus) {
    case OutcomeStatus.VERIFIED_SUCCESS:
      return LearningEligibilityStatus.ELIGIBLE_VERIFIED_SUCCESS;
    case OutcomeStatus.VERIFIED_FAILURE:
      return LearningEligibilityStatus.ELIGIBLE_VERIFIED_FAILURE;
    case OutcomeStatus.PARTIAL_SUCCESS:
      return LearningEligibilityStatus.ELIGIBLE_PARTIAL_SUCCESS;
    default:
      // Fail closed: any unmapped outcome is insufficient.
      return LearningEligibilityStatus.BLOCKED_INSUFFICIENT_DATA;
  }
}

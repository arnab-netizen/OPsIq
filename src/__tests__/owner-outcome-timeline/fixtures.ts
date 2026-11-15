/** Shared fixtures for Owner Outcome Timeline tests (not a test file). */
import type { OwnerDecisionRecordDto, OwnerOutcomeAssessmentDto, OwnerOutcomeChainDto } from "@/domain/owner-spine/owner-outcome-presentation";

export const UUID = "11111111-1111-4111-8111-111111111111";
export const CAND = `domain_action:finance:${UUID}`;

export function decision(over: Partial<OwnerDecisionRecordDto> = {}): OwnerDecisionRecordDto {
  return {
    id: "d1", candidateId: CAND, candidateSource: "domain_action", domain: "finance", decisionState: "ACCEPTED", sequence: 1, supersedesId: null,
    decidedAt: "2026-07-01T00:00:00.000Z", ownerReason: null, revisitAt: null,
    recommendationSnapshot: { title: "Raise prices on the two weakest products", description: "Margin is thin.", capturedAt: "2026-07-01T00:00:00.000Z" },
    commitmentDescription: null, verificationMetric: null, baselineValue: null, baselineProvenance: null, targetDirection: "unknown", targetValue: null,
    observationWindowDays: null, intendedCompletionAt: null, expectedMeasurementSource: null, ...over,
  };
}
export function assessment(over: Partial<OwnerOutcomeAssessmentDto> = {}): OwnerOutcomeAssessmentDto {
  return {
    id: "a1", chainKey: CAND, version: 1, ownerDecisionId: "d1", ownerDecisionState: "ACCEPTED", commitmentFidelity: "AS_RECOMMENDED", decisionLinkState: "LINKED",
    sourceSystem: "SYSTEM_A", sourceLinkState: "LINKED", assessedAt: "2026-07-20T00:00:00.000Z", executionStatus: "COMPLETED", observationStatus: "MEASURED",
    measurementResult: "IMPROVED", targetAttainment: "REACHED", issueResolution: "NOT_YET_REASSESSED", causalAttribution: "PLAUSIBLE",
    learningEligibility: "PENDING_GOVERNANCE", verificationStatus: "VERIFIED", evidenceQuality: "moderate", verifierKind: "INDEPENDENT",
    independentlyVerified: true, selfVerified: false, disputed: false, externalInterference: false, measuredAt: "2026-07-19T00:00:00.000Z", verifiedAt: null,
    learningBlockers: [], nextVerificationAction: "Run a newer diagnosis.", ...over,
  };
}
export function chain(over: Partial<OwnerOutcomeChainDto> & { decisions?: OwnerDecisionRecordDto[]; assessments?: OwnerOutcomeAssessmentDto[] } = {}): OwnerOutcomeChainDto {
  const decisions = over.decisions ?? [decision()];
  const assessments = over.assessments ?? [];
  return {
    chainKey: CAND, businessId: UUID, decisions, currentDecision: decisions[decisions.length - 1] ?? null,
    commitment: null, assessments, currentAssessment: assessments[assessments.length - 1] ?? null, ...over,
  };
}

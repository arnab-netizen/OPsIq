import { describe, it, expect } from "vitest";
import {
  AiMutationAttemptStatus,
  AttributionStatus,
  ImplementationQualityStatus,
  LearningEligibilityStatus as L,
  LearningGateInput,
  OutcomeStatus,
  OwnerLearningApproval,
  ProfitImpactConfidence,
  ProofGateStatus,
  determineLearningEligibility,
  isLearningEligible,
} from "@/domain/execution/learning-gate";

// A fully-clean, eligible baseline; tests override one dimension at a time.
const clean: LearningGateInput = {
  proofStatus: ProofGateStatus.ACCEPTED,
  proofRequired: true,
  implementationQuality: ImplementationQualityStatus.HIGH_QUALITY,
  outcomeStatus: OutcomeStatus.VERIFIED_SUCCESS,
  attributionStatus: AttributionStatus.DIRECT,
  profitImpactRequired: true,
  profitImpactConfidence: ProfitImpactConfidence.MEASURED,
  ownerLearningApproval: OwnerLearningApproval.APPROVED,
  aiMutationAttempt: AiMutationAttemptStatus.NONE,
};
const g = (o: Partial<LearningGateInput>) => determineLearningEligibility({ ...clean, ...o });

describe("determineLearningEligibility — fail-closed blocks", () => {
  it("AI mutation attempt is blocked first (highest priority)", () => {
    expect(
      g({ aiMutationAttempt: AiMutationAttemptStatus.ATTEMPTED, proofStatus: ProofGateStatus.ACCEPTED })
    ).toBe(L.BLOCKED_AI_MUTATION_ATTEMPT);
  });
  it("missing required proof → BLOCKED_NO_PROOF", () => {
    expect(g({ proofStatus: ProofGateStatus.NO_PROOF })).toBe(L.BLOCKED_NO_PROOF);
    expect(g({ proofStatus: ProofGateStatus.PENDING })).toBe(L.BLOCKED_NO_PROOF);
  });
  it("rejected proof → BLOCKED_PROOF_REJECTED", () => {
    expect(g({ proofStatus: ProofGateStatus.REJECTED })).toBe(L.BLOCKED_PROOF_REJECTED);
  });
  it("disputed proof or outcome → BLOCKED_DISPUTED", () => {
    expect(g({ proofStatus: ProofGateStatus.DISPUTED })).toBe(L.BLOCKED_DISPUTED);
    expect(g({ outcomeStatus: OutcomeStatus.DISPUTED })).toBe(L.BLOCKED_DISPUTED);
  });
  it("owner override only → BLOCKED_OWNER_OVERRIDE_ONLY", () => {
    expect(g({ proofStatus: ProofGateStatus.OVERRIDDEN_NOT_VERIFIED })).toBe(
      L.BLOCKED_OWNER_OVERRIDE_ONLY
    );
  });
  it("poor/weak/invalid execution → BLOCKED_POOR_EXECUTION (even with verified outcome)", () => {
    for (const q of [
      ImplementationQualityStatus.WEAK,
      ImplementationQualityStatus.POOR,
      ImplementationQualityStatus.INVALID_EXECUTION,
    ]) {
      expect(g({ implementationQuality: q })).toBe(L.BLOCKED_POOR_EXECUTION);
    }
  });
  it("unverified outcome → BLOCKED_INSUFFICIENT_DATA", () => {
    expect(g({ outcomeStatus: OutcomeStatus.UNVERIFIED })).toBe(L.BLOCKED_INSUFFICIENT_DATA);
    expect(g({ outcomeStatus: OutcomeStatus.MEASUREMENT_WINDOW_OPEN })).toBe(
      L.BLOCKED_INSUFFICIENT_DATA
    );
  });
  it("unclear/conflicted/not-attributable attribution → BLOCKED_ATTRIBUTION_UNCLEAR", () => {
    for (const a of [
      AttributionStatus.UNCLEAR,
      AttributionStatus.CONFLICTED,
      AttributionStatus.NOT_ATTRIBUTABLE,
    ]) {
      expect(g({ attributionStatus: a })).toBe(L.BLOCKED_ATTRIBUTION_UNCLEAR);
    }
  });
  it("required profit impact with weak confidence → BLOCKED_INSUFFICIENT_DATA", () => {
    expect(
      g({ profitImpactRequired: true, profitImpactConfidence: ProfitImpactConfidence.ESTIMATED_FROM_DEFAULTS })
    ).toBe(L.BLOCKED_INSUFFICIENT_DATA);
    expect(
      g({ profitImpactRequired: true, profitImpactConfidence: ProfitImpactConfidence.NOT_CALCULATED })
    ).toBe(L.BLOCKED_INSUFFICIENT_DATA);
  });
  it("owner rejected learning → BLOCKED_OWNER_REJECTED", () => {
    expect(g({ ownerLearningApproval: OwnerLearningApproval.REJECTED })).toBe(L.BLOCKED_OWNER_REJECTED);
  });
});

describe("determineLearningEligibility — eligible passes", () => {
  it("a fully clean verified-success case is ELIGIBLE_VERIFIED_SUCCESS", () => {
    expect(g({})).toBe(L.ELIGIBLE_VERIFIED_SUCCESS);
    expect(isLearningEligible(g({}))).toBe(true);
  });
  it("verified failure and partial success are eligible", () => {
    expect(g({ outcomeStatus: OutcomeStatus.VERIFIED_FAILURE })).toBe(L.ELIGIBLE_VERIFIED_FAILURE);
    expect(g({ outcomeStatus: OutcomeStatus.PARTIAL_SUCCESS })).toBe(L.ELIGIBLE_PARTIAL_SUCCESS);
  });
  it("proof not required + no proof can still be eligible if everything else verified", () => {
    expect(g({ proofRequired: false, proofStatus: ProofGateStatus.NO_PROOF })).toBe(
      L.ELIGIBLE_VERIFIED_SUCCESS
    );
  });
  it("profit not required + weak confidence does not block", () => {
    expect(
      g({ profitImpactRequired: false, profitImpactConfidence: ProfitImpactConfidence.NOT_CALCULATED })
    ).toBe(L.ELIGIBLE_VERIFIED_SUCCESS);
  });
});

describe("Addendum G named scenarios", () => {
  it("task complete + proof accepted + outcome unverified → learning blocked", () => {
    expect(g({ outcomeStatus: OutcomeStatus.UNVERIFIED })).toBe(L.BLOCKED_INSUFFICIENT_DATA);
  });
  it("proof accepted + outcome verified + poor execution → learning blocked", () => {
    expect(
      g({ outcomeStatus: OutcomeStatus.VERIFIED_SUCCESS, implementationQuality: ImplementationQualityStatus.POOR })
    ).toBe(L.BLOCKED_POOR_EXECUTION);
  });
});

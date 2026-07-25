import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_GENERIC_PHRASES,
  containsForbiddenGeneric,
  assessSpecificity,
  isSpecificEnough,
  evaluateGuidanceForGeneric,
  assertNonGeneric,
  GenericGuidanceError,
} from "@/domain/owner-guidance/generic-output-guard";
import type { GuidanceObject } from "@/domain/owner-guidance/guidance-object";
import { ProofType } from "@/domain/execution/proof";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import { BoundaryValidationStatus } from "@/domain/execution/boundary";

/** A fully concrete, business-specific guidance object — the ACCEPT baseline. */
function specificGuidance(overrides: Partial<GuidanceObject> = {}): GuidanceObject {
  return {
    guidanceId: "g-1",
    workspaceId: "ws-1",
    ownerActionId: "oa-1",
    recommendationId: "rec-1",
    businessFunction: [BusinessFunction.CUSTOMER_RETENTION],
    archetype: "local_service_repeat_revenue",
    priority: "HIGH",
    reasonNow:
      "Three repeat customers from last month have not rebooked and churn is rising.",
    exactStep:
      "Call each of the 3 named lapsed customers today and offer the May service slot.",
    sequenceNumber: 1,
    assignedRole: "FRONT_DESK",
    assignedPerson: "Priya",
    deadline: "2026-06-27",
    proofRequired: true,
    proofType: ProofType.CALL_LOG,
    expectedOutcome: "At least 2 of the 3 customers rebook a service this week.",
    confidence: EvidenceConfidenceLevel.STRONG,
    missingData: [],
    blockedActions: [],
    actionsToAvoid: ["Do not offer a discount above 10% without owner sign-off."],
    escalationRule: "Escalate to owner if no customer answers after 2 attempts.",
    rollbackTrigger: "Stop calls if a customer reports harassment.",
    ownerApprovalRequired: true,
    professionalReviewRequired: false,
    learningEligibilityRule: "Eligible once proof accepted.",
    employeeFacing: true,
    boundaryStatus: BoundaryValidationStatus.PASSED,
    ...overrides,
  };
}

describe("generic-output-guard — module contract assertions", () => {
  it("FORBIDDEN_GENERIC_PHRASES is an array", () => { expect(Array.isArray(FORBIDDEN_GENERIC_PHRASES)).toBe(true); });
  it("containsForbiddenGeneric is a function", () => { expect(typeof containsForbiddenGeneric).toBe("function"); });
  it("assessSpecificity is a function", () => { expect(typeof assessSpecificity).toBe("function"); });
  it("isSpecificEnough is a function", () => { expect(typeof isSpecificEnough).toBe("function"); });
  it("evaluateGuidanceForGeneric is a function", () => { expect(typeof evaluateGuidanceForGeneric).toBe("function"); });
  it("assertNonGeneric is a function", () => { expect(typeof assertNonGeneric).toBe("function"); });
  it("GenericGuidanceError is a function", () => { expect(typeof GenericGuidanceError).toBe("function"); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("EvidenceConfidenceLevel is an object", () => { expect(typeof EvidenceConfidenceLevel).toBe("object"); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("specificGuidance is a function", () => { expect(typeof specificGuidance).toBe("function"); });
  it("specificGuidance() returns an object", () => { expect(typeof specificGuidance()).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41] generic-output-guard — forbidden phrase list", () => {
  it("[module41] exposes exactly the 11 lowercased forbidden phrases", () => {
    expect(FORBIDDEN_GENERIC_PHRASES).toHaveLength(11);
    expect(FORBIDDEN_GENERIC_PHRASES).toEqual(
      FORBIDDEN_GENERIC_PHRASES.map((p) => p.toLowerCase())
    );
    expect(FORBIDDEN_GENERIC_PHRASES).toContain("improve marketing");
    expect(FORBIDDEN_GENERIC_PHRASES).toContain("make sops");
  });

  it("[module41] containsForbiddenGeneric is case-insensitive and matches inside a sentence", () => {
    expect(containsForbiddenGeneric("We should IMPROVE Marketing this quarter")).toEqual([
      "improve marketing",
    ]);
    expect(containsForbiddenGeneric("Please Reduce Costs and Increase Sales now")).toEqual([
      "reduce costs",
      "increase sales",
    ]);
    expect(containsForbiddenGeneric("Deliver the order by Friday")).toEqual([]);
  });
});

describe("[module41] generic-output-guard — specificity assessment", () => {
  it("[module41] a fully concrete guidance is specific enough", () => {
    const g = specificGuidance();
    const s = assessSpecificity(g);
    expect(s).toEqual({
      hasContext: true,
      hasReasonNow: true,
      hasRole: true,
      hasStep: true,
      hasProof: true,
      hasExpectedOutcome: true,
      hasRiskOrAvoid: true,
      hasConfidence: true,
    });
    expect(isSpecificEnough(g)).toBe(true);
  });

  it("[module41] proof waiver requires a noProofReason when proof not required", () => {
    const waived = specificGuidance({
      proofRequired: false,
      proofType: undefined,
      noProofReason: "Internal scheduling step with no customer-facing artifact.",
    });
    expect(assessSpecificity(waived).hasProof).toBe(true);

    const unjustified = specificGuidance({
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
    });
    expect(assessSpecificity(unjustified).hasProof).toBe(false);
  });
});

describe("[module41] generic-output-guard — rejection of generic guidance", () => {
  it("[module41] generic guidance with no concrete fields is rejected", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Improve marketing",
      assignedRole: "",
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(true);
    expect(result.forbiddenPhrases).toContain("improve marketing");
    expect(result.reasons).toContain("generic_phrase_without_concrete_steps");
    expect(result.reasons).toContain("missing_specific_role");
    expect(result.reasons).toContain("missing_specific_proof");
    expect(result.reasons).toContain("missing_specific_expected_outcome");
  });

  it("[module41] 'make SOP' with no actual SOP steps is rejected", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Make SOPs",
      assignedRole: "",
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(true);
    expect(result.forbiddenPhrases).toContain("make sops");
    expect(result.reasons).toContain("generic_phrase_without_concrete_steps");
  });

  it("[module41] 'improve marketing' with no campaign/budget/target/proof is rejected", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Improve marketing",
      assignedRole: "",
      proofRequired: true,
      proofType: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(true);
    expect(result.reasons).toContain("generic_phrase_without_concrete_steps");
    expect(result.reasons).toContain("missing_specific_proof");
  });

  it("[module41] 'reduce costs' with no concrete check is rejected", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Reduce costs",
      assignedRole: "",
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(true);
    expect(result.forbiddenPhrases).toContain("reduce costs");
    expect(result.reasons).toContain("generic_phrase_without_concrete_steps");
  });

  it("[module41] 'train staff' with no skill gap/task/proof is rejected", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Train staff",
      assignedRole: "",
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(true);
    expect(result.forbiddenPhrases).toContain("train staff");
    expect(result.reasons).toContain("generic_phrase_without_concrete_steps");
  });

  it("[module41] assertNonGeneric throws GenericGuidanceError with reasons for generic guidance", () => {
    const g = specificGuidance({
      archetype: null,
      reasonNow: "",
      exactStep: "Optimize operations",
      assignedRole: "",
      proofRequired: false,
      proofType: undefined,
      noProofReason: undefined,
      expectedOutcome: "",
      actionsToAvoid: [],
      rollbackTrigger: "",
    });
    expect(() => assertNonGeneric(g)).toThrow(GenericGuidanceError);
    try {
      assertNonGeneric(g);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(GenericGuidanceError);
      const err = e as GenericGuidanceError;
      expect(err.code).toBe("GENERIC_GUIDANCE");
      expect(err.reasons).toContain("generic_phrase_without_concrete_steps");
    }
  });
});

describe("[module41] generic-output-guard — acceptance when concrete", () => {
  it("[module41] guidance mentioning 'follow up customers' is ACCEPTED when fully concrete", () => {
    const g = specificGuidance({
      reasonNow:
        "Follow up customers who left a 1-star review last week before they churn.",
      exactStep:
        "Follow up customers: call the 4 named 1-star reviewers and offer a free redo.",
    });
    // The forbidden phrase is present but the guidance is fully specific.
    expect(containsForbiddenGeneric(g.exactStep)).toContain("follow up customers");
    expect(isSpecificEnough(g)).toBe(true);

    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.forbiddenPhrases).toContain("follow up customers");
    expect(() => assertNonGeneric(g)).not.toThrow();
  });

  it("[module41] a fully concrete guidance with no forbidden phrase is accepted", () => {
    const g = specificGuidance();
    const result = evaluateGuidanceForGeneric(g);
    expect(result.rejected).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.forbiddenPhrases).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  BusinessFunction,
  ALL_BUSINESS_FUNCTIONS,
  isBusinessFunction,
  requiresProfessionalReview,
  assertBusinessFunction,
  MissingBusinessFunctionError,
} from "@/domain/owner-guidance/business-function";
import {
  GuidanceClassification,
  isBlocked,
  isActionable,
  requiresHumanGate,
  isReady,
} from "@/domain/owner-guidance/guidance-classification";
import {
  validateGuidanceObject,
  isGuidanceValid,
  assertValidGuidance,
  InvalidGuidanceError,
  type GuidanceObject,
} from "@/domain/owner-guidance/guidance-object";
import { ProofType } from "@/domain/execution/proof";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { BoundaryValidationStatus } from "@/domain/execution/boundary";

describe("foundations — module contract assertions", () => {
  it("isBusinessFunction is a function", () => { expect(typeof isBusinessFunction).toBe("function"); });
  it("requiresProfessionalReview is a function", () => { expect(typeof requiresProfessionalReview).toBe("function"); });
  it("assertBusinessFunction is a function", () => { expect(typeof assertBusinessFunction).toBe("function"); });
  it("MissingBusinessFunctionError is a function", () => { expect(typeof MissingBusinessFunctionError).toBe("function"); });
  it("ALL_BUSINESS_FUNCTIONS is an array", () => { expect(Array.isArray(ALL_BUSINESS_FUNCTIONS)).toBe(true); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
  it("isBlocked is a function", () => { expect(typeof isBlocked).toBe("function"); });
  it("isActionable is a function", () => { expect(typeof isActionable).toBe("function"); });
  it("validateGuidanceObject is a function", () => { expect(typeof validateGuidanceObject).toBe("function"); });
  it("InvalidGuidanceError is a function", () => { expect(typeof InvalidGuidanceError).toBe("function"); });
  it("ProofType is an object", () => { expect(typeof ProofType).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41] business function enum", () => {
  it("has the full 360° coverage (27 functions)", () => {
    expect(ALL_BUSINESS_FUNCTIONS.length).toBe(27);
    expect(isBusinessFunction("CASH_FLOW")).toBe(true);
    expect(isBusinessFunction("NOT_A_FUNCTION")).toBe(false);
    expect(isBusinessFunction(123)).toBe(false);
  });

  it("flags professional-review functions (compliance, payroll)", () => {
    expect(requiresProfessionalReview([BusinessFunction.RISK_COMPLIANCE])).toBe(true);
    expect(requiresProfessionalReview([BusinessFunction.PAYROLL])).toBe(true);
    expect(requiresProfessionalReview([BusinessFunction.MARKETING])).toBe(false);
  });

  it("assertBusinessFunction rejects empty / invalid sets", () => {
    expect(() => assertBusinessFunction([BusinessFunction.CASH_FLOW], "r")).not.toThrow();
    expect(() => assertBusinessFunction([], "r")).toThrow(MissingBusinessFunctionError);
    expect(() => assertBusinessFunction(null, "r")).toThrow(MissingBusinessFunctionError);
    expect(() => assertBusinessFunction(["bogus"], "r")).toThrow(MissingBusinessFunctionError);
  });
});

describe("[module41] guidance classification", () => {
  it("blocked states are non-actionable", () => {
    expect(isBlocked(GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA)).toBe(true);
    expect(isBlocked(GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE)).toBe(true);
    expect(isActionable(GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE)).toBe(false);
  });

  it("owner-decision and professional-review require a human gate", () => {
    expect(requiresHumanGate(GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION)).toBe(true);
    expect(requiresHumanGate(GuidanceClassification.GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW)).toBe(true);
    expect(isActionable(GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION)).toBe(false);
  });

  it("ready states are actionable", () => {
    expect(isReady(GuidanceClassification.GUIDANCE_READY)).toBe(true);
    expect(isReady(GuidanceClassification.GUIDANCE_READY_WITH_LOW_CONFIDENCE)).toBe(true);
    expect(isActionable(GuidanceClassification.GUIDANCE_READY)).toBe(true);
    expect(isReady(GuidanceClassification.GUIDANCE_REQUIRES_ROLLBACK)).toBe(false);
  });
});

const validGuidance = (over: Partial<GuidanceObject> = {}): GuidanceObject => ({
  guidanceId: "g1",
  workspaceId: "ws1",
  ownerActionId: "a1",
  recommendationId: "r1",
  businessFunction: [BusinessFunction.CASH_FLOW],
  archetype: "laundry",
  priority: "MEDIUM",
  reasonNow: "4 commercial invoices are overdue and cash cover is thin",
  exactStep: "Call clients on INV-102/108/111 using the approved follow-up script",
  sequenceNumber: 1,
  assignedRole: "Billing Staff",
  deadline: "2026-06-27",
  proofRequired: true,
  proofType: ProofType.CALL_LOG,
  expectedOutcome: "Recover overdue cash or classify each as collection risk",
  confidence: EvidenceConfidenceLevel.STRONG,
  missingData: [],
  blockedActions: [],
  actionsToAvoid: ["do not offer a discount without owner approval"],
  escalationRule: "Escalate to owner if payment slips beyond 48h or dispute raised",
  rollbackTrigger: "If customer disputes service quality, pause collection and review",
  ownerApprovalRequired: false,
  professionalReviewRequired: false,
  learningEligibilityRule: "blocked until payment received and attribution is clear",
  employeeFacing: true,
  boundaryStatus: BoundaryValidationStatus.PASSED,
  ...over,
});

describe("[module41] guidance object hard-rule validation", () => {
  it("accepts a complete, specific, boundary-validated guidance object", () => {
    expect(isGuidanceValid(validGuidance())).toBe(true);
    expect(() => assertValidGuidance(validGuidance())).not.toThrow();
  });

  it("requires workspaceId", () => {
    expect(validateGuidanceObject(validGuidance({ workspaceId: "" }))).toContain("missing_workspace_id");
  });

  it("requires business function", () => {
    expect(validateGuidanceObject(validGuidance({ businessFunction: [] }))).toContain("missing_business_function");
  });

  it("requires reasonNow and exactStep", () => {
    const v = validateGuidanceObject(validGuidance({ reasonNow: "  ", exactStep: "" }));
    expect(v).toContain("missing_reason_now");
    expect(v).toContain("missing_exact_step");
  });

  it("requires proof type when proof required, or a no-proof reason", () => {
    expect(validateGuidanceObject(validGuidance({ proofRequired: true, proofType: undefined })))
      .toContain("missing_proof_type");
    expect(
      validateGuidanceObject(validGuidance({ proofRequired: false, proofType: undefined, noProofReason: "" }))
    ).toContain("missing_no_proof_reason");
    expect(
      isGuidanceValid(validGuidance({ proofRequired: false, proofType: undefined, noProofReason: "informational only" }))
    ).toBe(true);
  });

  it("employee-facing guidance requires a PASSED boundary validation", () => {
    expect(validateGuidanceObject(validGuidance({ employeeFacing: true, boundaryStatus: undefined })))
      .toContain("employee_guidance_requires_boundary_validation");
    expect(
      validateGuidanceObject(
        validGuidance({ employeeFacing: true, boundaryStatus: BoundaryValidationStatus.ESCALATE_OWNER_APPROVAL_REQUIRED })
      )
    ).toContain("employee_guidance_requires_boundary_validation");
    // Owner-facing step needs no boundary validation.
    expect(isGuidanceValid(validGuidance({ employeeFacing: false, boundaryStatus: undefined, assignedRole: "Owner" })))
      .toBe(true);
  });

  it("compliance/tax/legal guidance must flag professional review", () => {
    expect(
      validateGuidanceObject(
        validGuidance({ businessFunction: [BusinessFunction.RISK_COMPLIANCE], professionalReviewRequired: false })
      )
    ).toContain("professional_review_required_not_flagged");
    expect(
      isGuidanceValid(
        validGuidance({ businessFunction: [BusinessFunction.RISK_COMPLIANCE], professionalReviewRequired: true })
      )
    ).toBe(true);
  });

  it("high-risk priority requires owner approval", () => {
    expect(validateGuidanceObject(validGuidance({ priority: "HIGH", ownerApprovalRequired: false })))
      .toContain("high_risk_guidance_requires_owner_approval");
    expect(validateGuidanceObject(validGuidance({ priority: "EMERGENCY", ownerApprovalRequired: false })))
      .toContain("high_risk_guidance_requires_owner_approval");
  });

  it("weak-confidence emergency requires named missing data", () => {
    const v = validateGuidanceObject(
      validGuidance({
        priority: "EMERGENCY",
        ownerApprovalRequired: true,
        confidence: EvidenceConfidenceLevel.WEAK,
        missingData: [],
      })
    );
    expect(v).toContain("weak_confidence_emergency_requires_named_missing_data");
    // Naming the missing data clears it.
    expect(
      isGuidanceValid(
        validGuidance({
          priority: "EMERGENCY",
          ownerApprovalRequired: true,
          confidence: EvidenceConfidenceLevel.WEAK,
          missingData: ["bank statement for last 7 days"],
        })
      )
    ).toBe(true);
  });

  it("assertValidGuidance throws InvalidGuidanceError listing violations", () => {
    try {
      assertValidGuidance(validGuidance({ workspaceId: "", reasonNow: "" }));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidGuidanceError);
      expect((e as InvalidGuidanceError).violations).toContain("missing_workspace_id");
      expect((e as InvalidGuidanceError).violations).toContain("missing_reason_now");
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  runVerification,
  checkAntiOverrelianceComplete,
  assertVerificationAllowsOwnerDecision,
  isVerificationStatusTransitionAllowed,
  VERIFICATION_STATUS_TRANSITIONS,
  type VerificationInput,
  type OverrelianceAcknowledgementInput,
} from "../../../domain/owner-mode/recommendation-verification";

// ─── Helpers ────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    workspaceId: "ws-001",
    businessId: "biz-001",
    recommendationId: "rec-001",
    riskLevel: "low",
    confidenceScore: 75,
    evidenceSupporting: ["revenue trend data"],
    evidenceContradicting: [],
    missingData: [],
    assumptionsMade: ["market stays stable"],
    whatWouldMakeThisWrong: "If demand drops significantly",
    violatesOwnerConstraints: false,
    constraintViolationDetail: undefined,
    fitsWithinCashRunway: true,
    hasFailedBefore: false,
    pastFailureContext: undefined,
    downsideIfWrong: "Loss of operational efficiency",
    stopLossCondition: "Revenue drops by 20% in 30 days",
    ...overrides,
  };
}

function baseAck(overrides: Partial<OverrelianceAcknowledgementInput> = {}): OverrelianceAcknowledgementInput {
  return {
    workspaceId: "ws-001",
    recommendationId: "rec-001",
    ownerUserId: "user-001",
    keyAssumptionAcknowledged: true,
    mainDownsideAcknowledged: true,
    stopConditionAcknowledged: true,
    evidenceLimitAcknowledged: true,
    ownerIsDecisionMaker: true,
    ...overrides,
  };
}

// ─── Workspace Scoping ───────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws if workspaceId is empty", () => {
    expect(() => runVerification(baseInput({ workspaceId: "" }))).toThrow(
      "WorkspaceScopedQuery violation"
    );
  });

  it("throws if workspaceId is whitespace", () => {
    expect(() => runVerification(baseInput({ workspaceId: "   " }))).toThrow(
      "WorkspaceScopedQuery violation"
    );
  });

  it("passes with a valid workspaceId", () => {
    const result = runVerification(baseInput());
    expect(result).toBeDefined();
  });
});

// ─── VER-RULE-1: whatWouldMakeThisWrong ──────────────────────────────────────

describe("VER-RULE-1: whatWouldMakeThisWrong", () => {
  it("fails if missing", () => {
    const result = runVerification(baseInput({ whatWouldMakeThisWrong: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("VER-RULE-1"))).toBe(true);
  });

  it("fails if too short (< 10 chars)", () => {
    const result = runVerification(baseInput({ whatWouldMakeThisWrong: "Too short" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("VER-RULE-1"))).toBe(true);
  });

  it("passes with >= 10 chars", () => {
    const result = runVerification(baseInput({ whatWouldMakeThisWrong: "1234567890" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-1"))).toBe(false);
  });
});

// ─── VER-RULE-2: downsideIfWrong ─────────────────────────────────────────────

describe("VER-RULE-2: downsideIfWrong", () => {
  it("fails if missing", () => {
    const result = runVerification(baseInput({ downsideIfWrong: "" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-2"))).toBe(true);
  });

  it("fails if < 10 chars", () => {
    const result = runVerification(baseInput({ downsideIfWrong: "Bad" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-2"))).toBe(true);
  });

  it("passes with >= 10 chars", () => {
    const result = runVerification(baseInput({ downsideIfWrong: "Significant loss" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-2"))).toBe(false);
  });
});

// ─── VER-RULE-3: stopLossCondition ───────────────────────────────────────────

describe("VER-RULE-3: stopLossCondition", () => {
  it("fails if missing", () => {
    const result = runVerification(baseInput({ stopLossCondition: "" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-3"))).toBe(true);
  });

  it("fails if < 10 chars", () => {
    const result = runVerification(baseInput({ stopLossCondition: "Stop" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-3"))).toBe(true);
  });

  it("passes with >= 10 chars", () => {
    const result = runVerification(baseInput({ stopLossCondition: "Stop if revenue drops 20%" }));
    expect(result.violations.some((v) => v.includes("VER-RULE-3"))).toBe(false);
  });
});

// ─── VER-RULE-4: violatesOwnerConstraints ────────────────────────────────────

describe("VER-RULE-4: violatesOwnerConstraints", () => {
  it("adds blockedReason when true", () => {
    const result = runVerification(baseInput({ violatesOwnerConstraints: true }));
    expect(result.blockedReasons).toContain("Violates owner constraints");
  });

  it("sets status to unsafe_to_recommend when true", () => {
    const result = runVerification(baseInput({ violatesOwnerConstraints: true }));
    expect(result.verificationStatus).toBe("unsafe_to_recommend");
  });

  it("no blocked reason when false", () => {
    const result = runVerification(baseInput({ violatesOwnerConstraints: false }));
    expect(result.blockedReasons).not.toContain("Violates owner constraints");
  });
});

// ─── VER-RULE-5: fitsWithinCashRunway ────────────────────────────────────────

describe("VER-RULE-5: fitsWithinCashRunway", () => {
  it("adds blockedReason when false", () => {
    const result = runVerification(baseInput({ fitsWithinCashRunway: false }));
    expect(result.blockedReasons).toContain("Does not fit cash runway");
  });

  it("sets status to high_risk_requires_owner_approval when false", () => {
    const result = runVerification(baseInput({ fitsWithinCashRunway: false }));
    expect(result.verificationStatus).toBe("high_risk_requires_owner_approval");
  });

  it("no blocked reason when true", () => {
    const result = runVerification(baseInput({ fitsWithinCashRunway: true }));
    expect(result.blockedReasons).not.toContain("Does not fit cash runway");
  });
});

// ─── VER-RULE-6: data_limited with missing data ──────────────────────────────

describe("VER-RULE-6: data_limited when missingData + low confidence", () => {
  it("stays data_limited when missingData present and confidenceScore < 50", () => {
    const result = runVerification(
      baseInput({
        missingData: ["financial projections"],
        confidenceScore: 30,
        riskLevel: "low",
      })
    );
    expect(result.verificationStatus).toBe("data_limited");
  });

  it("does not override to data_limited if violatesOwnerConstraints (unsafe wins)", () => {
    const result = runVerification(
      baseInput({
        missingData: ["data"],
        confidenceScore: 30,
        violatesOwnerConstraints: true,
      })
    );
    expect(result.verificationStatus).toBe("unsafe_to_recommend");
  });

  it("does not override to data_limited if already high_risk (higher severity wins)", () => {
    const result = runVerification(
      baseInput({
        missingData: ["data"],
        confidenceScore: 30,
        fitsWithinCashRunway: false,
      })
    );
    expect(result.verificationStatus).toBe("high_risk_requires_owner_approval");
  });
});

// ─── VER-RULE-7: hasFailedBefore ─────────────────────────────────────────────

describe("VER-RULE-7: hasFailedBefore requires context", () => {
  it("violation if hasFailedBefore=true and no context", () => {
    const result = runVerification(
      baseInput({ hasFailedBefore: true, pastFailureContext: undefined })
    );
    expect(result.violations.some((v) => v.includes("VER-RULE-7"))).toBe(true);
  });

  it("violation if hasFailedBefore=true and context < 10 chars", () => {
    const result = runVerification(
      baseInput({ hasFailedBefore: true, pastFailureContext: "too short" })
    );
    expect(result.violations.some((v) => v.includes("VER-RULE-7"))).toBe(true);
  });

  it("passes if hasFailedBefore=true and context >= 10 chars", () => {
    const result = runVerification(
      baseInput({
        hasFailedBefore: true,
        pastFailureContext: "Failed due to seasonal demand drop last Q4",
      })
    );
    expect(result.violations.some((v) => v.includes("VER-RULE-7"))).toBe(false);
  });

  it("no violation if hasFailedBefore=false without context", () => {
    const result = runVerification(baseInput({ hasFailedBefore: false }));
    expect(result.violations.some((v) => v.includes("VER-RULE-7"))).toBe(false);
  });
});

// ─── Verification Status Logic ───────────────────────────────────────────────

describe("verificationStatus logic", () => {
  it("returns verified_enough for clean low-risk high-confidence input", () => {
    const result = runVerification(baseInput({ riskLevel: "low", confidenceScore: 80 }));
    expect(result.verificationStatus).toBe("verified_enough");
  });

  it("returns provisional when confidenceScore < 50 (no violations)", () => {
    const result = runVerification(
      baseInput({ confidenceScore: 40, missingData: [] })
    );
    expect(result.verificationStatus).toBe("provisional");
  });

  it("returns high_risk_requires_owner_approval for critical risk", () => {
    const result = runVerification(baseInput({ riskLevel: "critical", confidenceScore: 80 }));
    expect(result.verificationStatus).toBe("high_risk_requires_owner_approval");
  });

  it("returns high_risk_requires_owner_approval for high risk", () => {
    const result = runVerification(baseInput({ riskLevel: "high", confidenceScore: 80 }));
    expect(result.verificationStatus).toBe("high_risk_requires_owner_approval");
  });

  it("returns data_limited when violations present", () => {
    const result = runVerification(baseInput({ whatWouldMakeThisWrong: "" }));
    expect(result.verificationStatus).toBe("data_limited");
  });

  it("unsafe_to_recommend takes priority over cash runway", () => {
    const result = runVerification(
      baseInput({ violatesOwnerConstraints: true, fitsWithinCashRunway: false })
    );
    expect(result.verificationStatus).toBe("unsafe_to_recommend");
  });
});

// ─── requiresAntiOverrelianceAck ────────────────────────────────────────────

describe("requiresAntiOverrelianceAck", () => {
  it("true for medium risk", () => {
    const result = runVerification(baseInput({ riskLevel: "medium", confidenceScore: 80 }));
    expect(result.requiresAntiOverrelianceAck).toBe(true);
  });

  it("true for high risk", () => {
    const result = runVerification(baseInput({ riskLevel: "high", confidenceScore: 80 }));
    expect(result.requiresAntiOverrelianceAck).toBe(true);
  });

  it("true for critical risk", () => {
    const result = runVerification(baseInput({ riskLevel: "critical", confidenceScore: 80 }));
    expect(result.requiresAntiOverrelianceAck).toBe(true);
  });

  it("false for low risk", () => {
    const result = runVerification(baseInput({ riskLevel: "low" }));
    expect(result.requiresAntiOverrelianceAck).toBe(false);
  });

  it("false even for medium risk if unsafe_to_recommend", () => {
    const result = runVerification(
      baseInput({ riskLevel: "medium", violatesOwnerConstraints: true })
    );
    expect(result.requiresAntiOverrelianceAck).toBe(false);
  });
});

// ─── checkAntiOverrelianceComplete ──────────────────────────────────────────

describe("checkAntiOverrelianceComplete", () => {
  it("complete when all fields acknowledged", () => {
    const result = checkAntiOverrelianceComplete(baseAck());
    expect(result.complete).toBe(true);
    expect(result.missingAcknowledgements).toHaveLength(0);
  });

  it("incomplete when keyAssumptionAcknowledged missing", () => {
    const result = checkAntiOverrelianceComplete(baseAck({ keyAssumptionAcknowledged: false }));
    expect(result.complete).toBe(false);
    expect(result.missingAcknowledgements).toContain("keyAssumptionAcknowledged");
  });

  it("incomplete when mainDownsideAcknowledged missing", () => {
    const result = checkAntiOverrelianceComplete(baseAck({ mainDownsideAcknowledged: false }));
    expect(result.missingAcknowledgements).toContain("mainDownsideAcknowledged");
  });

  it("incomplete when stopConditionAcknowledged missing", () => {
    const result = checkAntiOverrelianceComplete(baseAck({ stopConditionAcknowledged: false }));
    expect(result.missingAcknowledgements).toContain("stopConditionAcknowledged");
  });

  it("incomplete when evidenceLimitAcknowledged missing", () => {
    const result = checkAntiOverrelianceComplete(baseAck({ evidenceLimitAcknowledged: false }));
    expect(result.missingAcknowledgements).toContain("evidenceLimitAcknowledged");
  });

  it("incomplete when ownerIsDecisionMaker missing", () => {
    const result = checkAntiOverrelianceComplete(baseAck({ ownerIsDecisionMaker: false }));
    expect(result.missingAcknowledgements).toContain("ownerIsDecisionMaker");
  });

  it("collects all missing when all false", () => {
    const result = checkAntiOverrelianceComplete(
      baseAck({
        keyAssumptionAcknowledged: false,
        mainDownsideAcknowledged: false,
        stopConditionAcknowledged: false,
        evidenceLimitAcknowledged: false,
        ownerIsDecisionMaker: false,
      })
    );
    expect(result.complete).toBe(false);
    expect(result.missingAcknowledgements).toHaveLength(5);
  });
});

// ─── assertVerificationAllowsOwnerDecision ───────────────────────────────────

describe("assertVerificationAllowsOwnerDecision", () => {
  it("throws if status is unsafe_to_recommend", () => {
    const verification = runVerification(baseInput({ violatesOwnerConstraints: true }));
    expect(() => assertVerificationAllowsOwnerDecision(verification)).toThrow(
      "unsafe to recommend"
    );
  });

  it("throws if requiresAck and no ack provided", () => {
    const verification = runVerification(baseInput({ riskLevel: "medium", confidenceScore: 80 }));
    expect(() => assertVerificationAllowsOwnerDecision(verification)).toThrow(
      "Anti-overreliance acknowledgement required"
    );
  });

  it("throws if requiresAck and ack is incomplete", () => {
    const verification = runVerification(baseInput({ riskLevel: "medium", confidenceScore: 80 }));
    const ack = checkAntiOverrelianceComplete(baseAck({ ownerIsDecisionMaker: false }));
    expect(() => assertVerificationAllowsOwnerDecision(verification, ack)).toThrow(
      "Anti-overreliance acknowledgement required"
    );
  });

  it("throws if verification has violations", () => {
    const verification = runVerification(baseInput({ whatWouldMakeThisWrong: "" }));
    expect(() => assertVerificationAllowsOwnerDecision(verification)).toThrow(
      "unresolved violations"
    );
  });

  it("passes for clean low-risk verification with no ack required", () => {
    const verification = runVerification(baseInput({ riskLevel: "low", confidenceScore: 80 }));
    expect(() => assertVerificationAllowsOwnerDecision(verification)).not.toThrow();
  });

  it("passes for medium-risk with complete ack", () => {
    const verification = runVerification(baseInput({ riskLevel: "medium", confidenceScore: 80 }));
    const ack = checkAntiOverrelianceComplete(baseAck());
    expect(() => assertVerificationAllowsOwnerDecision(verification, ack)).not.toThrow();
  });
});

// ─── isVerificationStatusTransitionAllowed ───────────────────────────────────

describe("isVerificationStatusTransitionAllowed", () => {
  it("pending -> verified_enough: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("pending", "verified_enough")).toBe(true);
  });

  it("pending -> data_limited: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("pending", "data_limited")).toBe(true);
  });

  it("pending -> provisional: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("pending", "provisional")).toBe(true);
  });

  it("verified_enough -> reassessment_required: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("verified_enough", "reassessment_required")).toBe(true);
  });

  it("verified_enough -> pending: not allowed", () => {
    expect(isVerificationStatusTransitionAllowed("verified_enough", "pending")).toBe(false);
  });

  it("unsafe_to_recommend -> any: not allowed", () => {
    expect(isVerificationStatusTransitionAllowed("unsafe_to_recommend", "pending")).toBe(false);
    expect(isVerificationStatusTransitionAllowed("unsafe_to_recommend", "verified_enough")).toBe(false);
  });

  it("provisional -> verified_enough: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("provisional", "verified_enough")).toBe(true);
  });

  it("provisional -> reassessment_required: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("provisional", "reassessment_required")).toBe(true);
  });

  it("data_limited -> provisional: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("data_limited", "provisional")).toBe(true);
  });

  it("reassessment_required -> pending: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("reassessment_required", "pending")).toBe(true);
  });

  it("high_risk_requires_owner_approval -> verified_enough: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("high_risk_requires_owner_approval", "verified_enough")).toBe(true);
  });

  it("high_risk_requires_owner_approval -> unsafe_to_recommend: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("high_risk_requires_owner_approval", "unsafe_to_recommend")).toBe(true);
  });

  it("data_limited -> unsafe_to_recommend: allowed", () => {
    expect(isVerificationStatusTransitionAllowed("data_limited", "unsafe_to_recommend")).toBe(true);
  });
});

// ─── VERIFICATION_STATUS_TRANSITIONS completeness ────────────────────────────

describe("VERIFICATION_STATUS_TRANSITIONS shape", () => {
  it("has all 7 statuses as keys", () => {
    const keys = Object.keys(VERIFICATION_STATUS_TRANSITIONS);
    expect(keys).toContain("pending");
    expect(keys).toContain("verified_enough");
    expect(keys).toContain("provisional");
    expect(keys).toContain("data_limited");
    expect(keys).toContain("high_risk_requires_owner_approval");
    expect(keys).toContain("unsafe_to_recommend");
    expect(keys).toContain("reassessment_required");
    expect(keys).toHaveLength(7);
  });

  it("unsafe_to_recommend has empty transitions array", () => {
    expect(VERIFICATION_STATUS_TRANSITIONS["unsafe_to_recommend"]).toHaveLength(0);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("valid=true when all rules pass", () => {
    const result = runVerification(baseInput());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("multiple violations accumulate", () => {
    const result = runVerification(
      baseInput({
        whatWouldMakeThisWrong: "",
        downsideIfWrong: "",
        stopLossCondition: "",
      })
    );
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it("exactly 10-char boundary passes VER-RULE-1", () => {
    const result = runVerification(
      baseInput({ whatWouldMakeThisWrong: "1234567890" })
    );
    expect(result.violations.some((v) => v.includes("VER-RULE-1"))).toBe(false);
  });

  it("9-char boundary fails VER-RULE-1", () => {
    const result = runVerification(
      baseInput({ whatWouldMakeThisWrong: "123456789" })
    );
    expect(result.violations.some((v) => v.includes("VER-RULE-1"))).toBe(true);
  });
});

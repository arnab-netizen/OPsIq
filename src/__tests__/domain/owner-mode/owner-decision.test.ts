import { describe, it, expect } from "vitest";
import {
  OWNER_DECISION_STATUS_TRANSITIONS,
  isOwnerDecisionStatusTransitionAllowed,
  validateOwnerDecision,
  validateDecisionRights,
  assertAllowsActionCreation,
  type OwnerDecisionStatus,
  type DecisionInput,
} from "@/domain/owner-mode/owner-decision";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";
const REC = "00000000-0000-0000-0000-000000000003";

function validInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: REC,
    ownerUserId: "owner-001",
    decisionStatus: "accepted",
    decisionReason: "Reviewed the evidence and agree with the recommendation.",
    riskLevel: "low",
    verificationStatus: "verified_enough",
    ...overrides,
  };
}

// ─── OWNER_DECISION_STATUS_TRANSITIONS ───────────────────────────────────────

describe("OWNER_DECISION_STATUS_TRANSITIONS", () => {
  it("has exactly 6 keys", () => {
    expect(Object.keys(OWNER_DECISION_STATUS_TRANSITIONS)).toHaveLength(6);
  });

  it("accepted is terminal (empty transitions)", () => {
    expect(OWNER_DECISION_STATUS_TRANSITIONS.accepted).toHaveLength(0);
  });

  it("rejected is terminal (empty transitions)", () => {
    expect(OWNER_DECISION_STATUS_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("needs_more_data → accepted is allowed", () => {
    expect(
      OWNER_DECISION_STATUS_TRANSITIONS.needs_more_data.includes("accepted")
    ).toBe(true);
  });

  it("needs_more_data → needs_human_review is allowed", () => {
    expect(
      OWNER_DECISION_STATUS_TRANSITIONS.needs_more_data.includes("needs_human_review")
    ).toBe(true);
  });

  it("deferred → accepted is allowed", () => {
    expect(OWNER_DECISION_STATUS_TRANSITIONS.deferred.includes("accepted")).toBe(true);
  });

  it("deferred → needs_more_data is allowed", () => {
    expect(
      OWNER_DECISION_STATUS_TRANSITIONS.deferred.includes("needs_more_data")
    ).toBe(true);
  });

  it("modified → rejected is allowed", () => {
    expect(OWNER_DECISION_STATUS_TRANSITIONS.modified.includes("rejected")).toBe(true);
  });

  it("modified → accepted is allowed", () => {
    expect(OWNER_DECISION_STATUS_TRANSITIONS.modified.includes("accepted")).toBe(true);
  });

  it("needs_human_review → accepted is allowed", () => {
    expect(
      OWNER_DECISION_STATUS_TRANSITIONS.needs_human_review.includes("accepted")
    ).toBe(true);
  });

  it("needs_human_review → needs_more_data is NOT allowed", () => {
    expect(
      OWNER_DECISION_STATUS_TRANSITIONS.needs_human_review.includes("needs_more_data")
    ).toBe(false);
  });
});

// ─── isOwnerDecisionStatusTransitionAllowed ───────────────────────────────────

describe("isOwnerDecisionStatusTransitionAllowed", () => {
  it("needs_more_data → accepted returns true", () => {
    expect(
      isOwnerDecisionStatusTransitionAllowed("needs_more_data", "accepted")
    ).toBe(true);
  });

  it("accepted → rejected returns false (terminal)", () => {
    expect(isOwnerDecisionStatusTransitionAllowed("accepted", "rejected")).toBe(false);
  });

  it("rejected → accepted returns false (terminal)", () => {
    expect(isOwnerDecisionStatusTransitionAllowed("rejected", "accepted")).toBe(false);
  });

  it("deferred → modified returns true", () => {
    expect(isOwnerDecisionStatusTransitionAllowed("deferred", "modified")).toBe(true);
  });

  it("modified → deferred returns true", () => {
    expect(isOwnerDecisionStatusTransitionAllowed("modified", "deferred")).toBe(true);
  });

  it("modified → needs_more_data returns false", () => {
    expect(
      isOwnerDecisionStatusTransitionAllowed("modified", "needs_more_data")
    ).toBe(false);
  });
});

// ─── validateOwnerDecision — DEC-RULE-1 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-1 (decisionReason length)", () => {
  it("empty decisionReason produces a violation", () => {
    const result = validateOwnerDecision(validInput({ decisionReason: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DEC-RULE-1"))).toBe(true);
  });

  it("short decisionReason (< 10 chars) produces a violation", () => {
    const result = validateOwnerDecision(validInput({ decisionReason: "Short" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DEC-RULE-1"))).toBe(true);
  });

  it("decisionReason of exactly 10 chars passes", () => {
    const result = validateOwnerDecision(
      validInput({ decisionReason: "1234567890" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-1"))).toBe(false);
  });

  it("long decisionReason produces no DEC-RULE-1 violation", () => {
    const result = validateOwnerDecision(
      validInput({ decisionReason: "This is a sufficiently long reason." })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-1"))).toBe(false);
  });
});

// ─── validateOwnerDecision — DEC-RULE-2 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-2 (rejected → no action)", () => {
  it("rejected status → allowsActionCreation = false", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "rejected" }));
    expect(result.allowsActionCreation).toBe(false);
  });

  it("rejected status with valid input → valid = true", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "rejected" }));
    expect(result.valid).toBe(true);
  });
});

// ─── validateOwnerDecision — DEC-RULE-3 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-3 (deferred → no action)", () => {
  it("deferred status → allowsActionCreation = false", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "deferred" }));
    expect(result.allowsActionCreation).toBe(false);
  });

  it("deferred status with valid input → valid = true", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "deferred" }));
    expect(result.valid).toBe(true);
  });
});

// ─── validateOwnerDecision — DEC-RULE-4 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-4 (unsafe_to_recommend)", () => {
  it("unsafe_to_recommend → violation includes DEC-RULE-4", () => {
    const result = validateOwnerDecision(
      validInput({ verificationStatus: "unsafe_to_recommend" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-4"))).toBe(true);
  });

  it("unsafe_to_recommend → allowsActionCreation = false", () => {
    const result = validateOwnerDecision(
      validInput({ verificationStatus: "unsafe_to_recommend" })
    );
    expect(result.allowsActionCreation).toBe(false);
  });

  it("unsafe_to_recommend → valid = false", () => {
    const result = validateOwnerDecision(
      validInput({ verificationStatus: "unsafe_to_recommend" })
    );
    expect(result.valid).toBe(false);
  });

  it("verified_enough → no DEC-RULE-4 violation", () => {
    const result = validateOwnerDecision(
      validInput({ verificationStatus: "verified_enough" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-4"))).toBe(false);
  });
});

// ─── validateOwnerDecision — DEC-RULE-5 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-5 (high risk approval)", () => {
  it("high risk without approvalRequiredBy → violation includes DEC-RULE-5", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "high", approvalRequiredBy: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(true);
  });

  it("critical risk without approvalRequiredBy → violation includes DEC-RULE-5", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "critical", approvalRequiredBy: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(true);
  });

  it("high risk with approvalRequiredBy → no DEC-RULE-5 violation", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "high", approvalRequiredBy: "ceo@example.com" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(false);
  });

  it("low risk without approvalRequiredBy → no DEC-RULE-5 violation", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "low", approvalRequiredBy: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(false);
  });

  it("medium risk without approvalRequiredBy → no DEC-RULE-5 violation", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "medium", approvalRequiredBy: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(false);
  });

  it("high risk → requiresApprovalFields = true", () => {
    const result = validateOwnerDecision(
      validInput({ riskLevel: "high", approvalRequiredBy: "ceo@example.com" })
    );
    expect(result.requiresApprovalFields).toBe(true);
  });

  it("low risk → requiresApprovalFields = false", () => {
    const result = validateOwnerDecision(validInput({ riskLevel: "low" }));
    expect(result.requiresApprovalFields).toBe(false);
  });
});

// ─── validateOwnerDecision — DEC-RULE-6 ──────────────────────────────────────

describe("validateOwnerDecision — DEC-RULE-6 (modified requires description)", () => {
  it("modified without modifiedDescription → violation includes DEC-RULE-6", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "modified", modifiedDescription: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(true);
  });

  it("modified with empty modifiedDescription → violation includes DEC-RULE-6", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "modified", modifiedDescription: "" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(true);
  });

  it("modified with short modifiedDescription (< 10) → violation includes DEC-RULE-6", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "modified", modifiedDescription: "Short" })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(true);
  });

  it("modified with sufficient modifiedDescription → no DEC-RULE-6 violation", () => {
    const result = validateOwnerDecision(
      validInput({
        decisionStatus: "modified",
        modifiedDescription: "Reduce scope to pilot team first.",
      })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(false);
  });

  it("accepted without modifiedDescription → no DEC-RULE-6 violation", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "accepted", modifiedDescription: undefined })
    );
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(false);
  });
});

// ─── validateOwnerDecision — allowsActionCreation ────────────────────────────

describe("validateOwnerDecision — allowsActionCreation", () => {
  it("accepted with valid input → allowsActionCreation = true", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "accepted" }));
    expect(result.allowsActionCreation).toBe(true);
  });

  it("modified with valid input and description → allowsActionCreation = true", () => {
    const result = validateOwnerDecision(
      validInput({
        decisionStatus: "modified",
        modifiedDescription: "Reduce scope to pilot team first.",
      })
    );
    expect(result.allowsActionCreation).toBe(true);
  });

  it("needs_more_data → allowsActionCreation = false", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "needs_more_data" })
    );
    expect(result.allowsActionCreation).toBe(false);
  });

  it("needs_human_review → allowsActionCreation = false", () => {
    const result = validateOwnerDecision(
      validInput({ decisionStatus: "needs_human_review" })
    );
    expect(result.allowsActionCreation).toBe(false);
  });
});

// ─── assertAllowsActionCreation ───────────────────────────────────────────────

describe("assertAllowsActionCreation", () => {
  it("throws for a rejected decision", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "rejected" }));
    expect(() => assertAllowsActionCreation(result)).toThrow();
  });

  it("throws for a deferred decision", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "deferred" }));
    expect(() => assertAllowsActionCreation(result)).toThrow();
  });

  it("does not throw for accepted decision", () => {
    const result = validateOwnerDecision(validInput({ decisionStatus: "accepted" }));
    expect(() => assertAllowsActionCreation(result)).not.toThrow();
  });

  it("does not throw for modified decision with description", () => {
    const result = validateOwnerDecision(
      validInput({
        decisionStatus: "modified",
        modifiedDescription: "Reduce scope to pilot team first.",
      })
    );
    expect(() => assertAllowsActionCreation(result)).not.toThrow();
  });

  it("thrown error message includes violation text when present", () => {
    const result = validateOwnerDecision(
      validInput({ verificationStatus: "unsafe_to_recommend" })
    );
    expect(() => assertAllowsActionCreation(result)).toThrow(/DEC-RULE-4/);
  });
});

// ─── validateDecisionRights ───────────────────────────────────────────────────

describe("validateDecisionRights", () => {
  it("empty decisionOwner → invalid", () => {
    const { valid, violations } = validateDecisionRights({
      workspaceId: WS,
      decisionOwner: "",
    });
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("DR-RULE-1"))).toBe(true);
  });

  it("valid decisionOwner → valid", () => {
    const { valid, violations } = validateDecisionRights({
      workspaceId: WS,
      decisionOwner: "ceo@example.com",
    });
    expect(valid).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it("optional fields are accepted without violations", () => {
    const { valid } = validateDecisionRights({
      workspaceId: WS,
      decisionOwner: "ceo@example.com",
      executionOwner: "ops@example.com",
      reviewOwner: "board@example.com",
      benefitOwner: "finance@example.com",
      riskOwner: "risk@example.com",
      approvalRequiredBy: "board@example.com",
    });
    expect(valid).toBe(true);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("validateOwnerDecision with empty workspaceId throws", () => {
    expect(() => validateOwnerDecision(validInput({ workspaceId: "" }))).toThrow(
      /workspaceId/
    );
  });

  it("validateOwnerDecision with whitespace workspaceId throws", () => {
    expect(() =>
      validateOwnerDecision(validInput({ workspaceId: "   " }))
    ).toThrow(/workspaceId/);
  });

  it("validateDecisionRights with empty workspaceId throws", () => {
    expect(() =>
      validateDecisionRights({ workspaceId: "", decisionOwner: "ceo@example.com" })
    ).toThrow(/workspaceId/);
  });
});

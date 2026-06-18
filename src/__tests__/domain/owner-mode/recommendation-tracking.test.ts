import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_STATUS_TRANSITIONS,
  isRecommendationStatusTransitionAllowed,
  validateRecommendation,
  assertOwnerDecisionReady,
  computeRecommendationConfidence,
  type RecommendationInput,
  type RecommendationStatus,
} from "@/domain/owner-mode/recommendation-tracking";
import type { DiagnosisEvidenceValidationResult } from "@/domain/owner-mode/diagnosis-evidence";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function baseInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    workspaceId: "ws-001",
    businessId: "biz-001",
    ownerUserId: "user-001",
    recommendationText: "Reduce headcount in non-revenue departments immediately",
    recommendationType: "tactical",
    priorityRank: 1,
    expectedOutcomeSummary: "Cost reduction within 30 days",
    confidenceScore: 75,
    confidenceReason: "Supported by three months of payroll data",
    riskLevel: "medium",
    evidenceFor: ["Payroll data shows 40% overhead"],
    assumptions: [],
    constraints: [],
    ...overrides,
  };
}

function validDiagnosis(): DiagnosisEvidenceValidationResult {
  return { valid: true, violations: [], evidenceCount: 3, hasConflictingEvidence: false };
}

function invalidDiagnosis(): DiagnosisEvidenceValidationResult {
  return {
    valid: false,
    violations: ["Missing revenue data"],
    evidenceCount: 1,
    hasConflictingEvidence: true,
  };
}

// ─────────────────────────────────────────────
// Status Machine
// ─────────────────────────────────────────────

describe("RECOMMENDATION_STATUS_TRANSITIONS", () => {
  it("has exactly 12 status keys", () => {
    expect(Object.keys(RECOMMENDATION_STATUS_TRANSITIONS)).toHaveLength(12);
  });

  it("contains all required statuses as keys", () => {
    const statuses: RecommendationStatus[] = [
      "draft",
      "recommended",
      "verification_required",
      "verified_enough",
      "provisional",
      "data_limited",
      "owner_decision_pending",
      "accepted",
      "rejected",
      "modified",
      "deferred",
      "superseded",
    ];
    for (const s of statuses) {
      expect(RECOMMENDATION_STATUS_TRANSITIONS).toHaveProperty(s);
    }
  });

  it("draft can transition to recommended", () => {
    expect(RECOMMENDATION_STATUS_TRANSITIONS.draft).toContain("recommended");
  });

  it("draft can transition to rejected", () => {
    expect(RECOMMENDATION_STATUS_TRANSITIONS.draft).toContain("rejected");
  });

  it("accepted only allows superseded", () => {
    expect(RECOMMENDATION_STATUS_TRANSITIONS.accepted).toEqual(["superseded"]);
  });

  it("rejected has no allowed transitions", () => {
    expect(RECOMMENDATION_STATUS_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("superseded has no allowed transitions", () => {
    expect(RECOMMENDATION_STATUS_TRANSITIONS.superseded).toHaveLength(0);
  });

  it("owner_decision_pending allows accepted, rejected, modified, deferred", () => {
    const allowed = RECOMMENDATION_STATUS_TRANSITIONS.owner_decision_pending;
    expect(allowed).toContain("accepted");
    expect(allowed).toContain("rejected");
    expect(allowed).toContain("modified");
    expect(allowed).toContain("deferred");
  });
});

// ─────────────────────────────────────────────
// isRecommendationStatusTransitionAllowed
// ─────────────────────────────────────────────

describe("isRecommendationStatusTransitionAllowed", () => {
  it("allows draft -> recommended", () => {
    expect(isRecommendationStatusTransitionAllowed("draft", "recommended")).toBe(true);
  });

  it("disallows draft -> accepted", () => {
    expect(isRecommendationStatusTransitionAllowed("draft", "accepted")).toBe(false);
  });

  it("allows recommended -> owner_decision_pending", () => {
    expect(isRecommendationStatusTransitionAllowed("recommended", "owner_decision_pending")).toBe(
      true
    );
  });

  it("disallows accepted -> rejected", () => {
    expect(isRecommendationStatusTransitionAllowed("accepted", "rejected")).toBe(false);
  });

  it("disallows rejected -> anything", () => {
    expect(isRecommendationStatusTransitionAllowed("rejected", "draft")).toBe(false);
    expect(isRecommendationStatusTransitionAllowed("rejected", "recommended")).toBe(false);
  });

  it("allows modified -> owner_decision_pending", () => {
    expect(isRecommendationStatusTransitionAllowed("modified", "owner_decision_pending")).toBe(
      true
    );
  });

  it("allows deferred -> superseded", () => {
    expect(isRecommendationStatusTransitionAllowed("deferred", "superseded")).toBe(true);
  });

  it("disallows superseded -> any", () => {
    expect(isRecommendationStatusTransitionAllowed("superseded", "recommended")).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — workspace scoping
// ─────────────────────────────────────────────

describe("validateRecommendation — workspace scoping", () => {
  it("throws when workspaceId is empty string", () => {
    expect(() => validateRecommendation(baseInput({ workspaceId: "" }))).toThrow(
      /workspaceId is required/
    );
  });

  it("throws when workspaceId is whitespace only", () => {
    expect(() => validateRecommendation(baseInput({ workspaceId: "   " }))).toThrow(
      /workspaceId is required/
    );
  });

  it("does not throw when workspaceId is present", () => {
    expect(() => validateRecommendation(baseInput())).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-1
// ─────────────────────────────────────────────

describe("REC-RULE-1: recommendationText length", () => {
  it("passes with text >= 20 chars", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "A".repeat(20) }));
    expect(result.violations).not.toContain(
      expect.stringContaining("REC-RULE-1")
    );
  });

  it("fails with text < 20 chars", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "Too short" }));
    expect(result.violations.some((v) => v.includes("REC-RULE-1"))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("fails with exactly 19 chars", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "A".repeat(19) }));
    expect(result.violations.some((v) => v.includes("REC-RULE-1"))).toBe(true);
  });

  it("passes with exactly 20 chars", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "A".repeat(20) }));
    expect(result.violations.some((v) => v.includes("REC-RULE-1"))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-2
// ─────────────────────────────────────────────

describe("REC-RULE-2: expectedOutcomeSummary length", () => {
  it("fails with summary < 10 chars", () => {
    const result = validateRecommendation(baseInput({ expectedOutcomeSummary: "Short" }));
    expect(result.violations.some((v) => v.includes("REC-RULE-2"))).toBe(true);
  });

  it("passes with summary >= 10 chars", () => {
    const result = validateRecommendation(
      baseInput({ expectedOutcomeSummary: "Exactly ten" })
    );
    expect(result.violations.some((v) => v.includes("REC-RULE-2"))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-3
// ─────────────────────────────────────────────

describe("REC-RULE-3: confidenceReason length", () => {
  it("fails with reason < 10 chars", () => {
    const result = validateRecommendation(baseInput({ confidenceReason: "Too short" }));
    expect(result.violations.some((v) => v.includes("REC-RULE-3"))).toBe(true);
  });

  it("passes with reason >= 10 chars", () => {
    const result = validateRecommendation(
      baseInput({ confidenceReason: "Based on data" })
    );
    expect(result.violations.some((v) => v.includes("REC-RULE-3"))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-4
// ─────────────────────────────────────────────

describe("REC-RULE-4: confidenceScore range", () => {
  it("fails with confidenceScore below 0", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: -1 }));
    expect(result.violations.some((v) => v.includes("REC-RULE-4"))).toBe(true);
  });

  it("fails with confidenceScore above 100", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 101 }));
    expect(result.violations.some((v) => v.includes("REC-RULE-4"))).toBe(true);
  });

  it("passes with confidenceScore = 0", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 0 }));
    expect(result.violations.some((v) => v.includes("REC-RULE-4"))).toBe(false);
  });

  it("passes with confidenceScore = 100", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 100 }));
    expect(result.violations.some((v) => v.includes("REC-RULE-4"))).toBe(false);
  });

  it("passes with confidenceScore = 50", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 50 }));
    expect(result.violations.some((v) => v.includes("REC-RULE-4"))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-5
// ─────────────────────────────────────────────

describe("REC-RULE-5: evidenceFor requirement", () => {
  it("fails with empty evidenceFor array", () => {
    const result = validateRecommendation(baseInput({ evidenceFor: [] }));
    expect(result.violations.some((v) => v.includes("REC-RULE-5"))).toBe(true);
  });

  it("passes with one evidence item", () => {
    const result = validateRecommendation(baseInput({ evidenceFor: ["Some evidence"] }));
    expect(result.violations.some((v) => v.includes("REC-RULE-5"))).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — REC-RULE-6
// ─────────────────────────────────────────────

describe("REC-RULE-6: confidence capping with invalid diagnosis", () => {
  it("caps confidence at 40 when diagnosis is invalid", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 80 }), invalidDiagnosis());
    expect(result.effectiveConfidenceScore).toBe(40);
  });

  it("does not cap confidence when diagnosis is valid", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 80 }), validDiagnosis());
    expect(result.effectiveConfidenceScore).toBe(80);
  });

  it("does not cap confidence when no diagnosis provided", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 80 }));
    expect(result.effectiveConfidenceScore).toBe(80);
  });

  it("marks status as data_limited when capped confidence < 50", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 80 }), invalidDiagnosis());
    expect(result.recommendationStatus).toBe("data_limited");
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — recommendationStatus derivation
// ─────────────────────────────────────────────

describe("validateRecommendation — recommendationStatus", () => {
  it("returns draft when validation fails", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "short" }));
    expect(result.recommendationStatus).toBe("draft");
  });

  it("returns data_limited when confidence < 50", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 30 }));
    expect(result.recommendationStatus).toBe("data_limited");
  });

  it("returns verification_required for critical risk level with sufficient confidence", () => {
    const result = validateRecommendation(baseInput({ riskLevel: "critical", confidenceScore: 75 }));
    expect(result.recommendationStatus).toBe("verification_required");
  });

  it("returns recommended for valid input with confidence >= 50 and non-critical risk", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 75, riskLevel: "medium" }));
    expect(result.recommendationStatus).toBe("recommended");
  });
});

// ─────────────────────────────────────────────
// validateRecommendation — allowsOwnerDecision
// ─────────────────────────────────────────────

describe("allowsOwnerDecision logic", () => {
  it("is false when validation fails", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "short" }));
    expect(result.allowsOwnerDecision).toBe(false);
  });

  it("is false when effectiveConfidenceScore < 50", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 49 }));
    expect(result.allowsOwnerDecision).toBe(false);
  });

  it("is true when valid and effectiveConfidenceScore >= 50", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 50 }));
    expect(result.allowsOwnerDecision).toBe(true);
  });

  it("is false when capped confidence drops below 50 due to invalid diagnosis", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 70 }), invalidDiagnosis());
    expect(result.allowsOwnerDecision).toBe(false);
  });
});

// ─────────────────────────────────────────────
// assertOwnerDecisionReady
// ─────────────────────────────────────────────

describe("assertOwnerDecisionReady", () => {
  it("does not throw for recommended status with valid result", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 75 }));
    expect(() => assertOwnerDecisionReady("recommended", result)).not.toThrow();
  });

  it("throws when validation result is invalid", () => {
    const result = validateRecommendation(baseInput({ recommendationText: "short" }));
    expect(() => assertOwnerDecisionReady("draft", result)).toThrow(/not allowed/);
  });

  it("throws when current status does not allow owner_decision_pending", () => {
    const result = validateRecommendation(baseInput());
    // accepted -> owner_decision_pending is not allowed
    expect(() => assertOwnerDecisionReady("accepted", result)).toThrow(
      /transition from "accepted"/
    );
  });

  it("throws when allowsOwnerDecision is false", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 49 }));
    expect(() => assertOwnerDecisionReady("data_limited", result)).toThrow(
      /effectiveConfidenceScore/
    );
  });

  it("does not throw for verified_enough with valid high confidence result", () => {
    const result = validateRecommendation(baseInput({ confidenceScore: 80 }));
    expect(() => assertOwnerDecisionReady("verified_enough", result)).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// computeRecommendationConfidence
// ─────────────────────────────────────────────

describe("computeRecommendationConfidence", () => {
  it("returns raw score when both flags are false", () => {
    expect(computeRecommendationConfidence(80, true, false)).toBe(80);
  });

  it("caps at 40 when diagnosisValid is false", () => {
    expect(computeRecommendationConfidence(80, false, false)).toBe(40);
  });

  it("caps at 60 when hasMissingData is true", () => {
    expect(computeRecommendationConfidence(80, true, true)).toBe(60);
  });

  it("caps at 40 when both diagnosis invalid and missing data", () => {
    expect(computeRecommendationConfidence(80, false, true)).toBe(40);
  });

  it("clamps to 0 for negative input", () => {
    expect(computeRecommendationConfidence(-10, true, false)).toBe(0);
  });

  it("clamps to 100 for input above 100", () => {
    expect(computeRecommendationConfidence(150, true, false)).toBe(100);
  });

  it("returns 0 for 0 score with valid diagnosis and no missing data", () => {
    expect(computeRecommendationConfidence(0, true, false)).toBe(0);
  });

  it("caps at 40 even when score is exactly 40 with invalid diagnosis", () => {
    expect(computeRecommendationConfidence(40, false, false)).toBe(40);
  });

  it("caps at 40 when score is 41 with invalid diagnosis", () => {
    expect(computeRecommendationConfidence(41, false, false)).toBe(40);
  });
});

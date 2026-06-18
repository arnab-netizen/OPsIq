import { describe, it, expect } from "vitest";
import {
  ELIGIBILITY_ALLOWS_LEARNING,
  ELIGIBILITY_IS_TERMINAL_REJECTION,
  REJECTION_IS_HARD_BLOCK,
  assessLearningEligibility,
  learningIsAdmissible,
  type LearningEligibilityInput,
} from "@/domain/owner-mode/learning-eligibility";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

// Ideal passing case: all gates satisfied
function eligible(overrides: Partial<LearningEligibilityInput> = {}): LearningEligibilityInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    actionWasExecuted: true,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    adjudicationCompleted: true,
    adjudicationVerdict: "validated_failure",
    causalAttributionCompleted: true,
    causalAttributionClass: "likely_caused",
    harmSeverity: "none",
    isOwnerOpinionOnly: false,
    hasContradictoryEvidence: false,
    hasPrivacyControls: true,
    broadImpactScope: false,
    eligibilityNotes:
      "All prior loop gates passed. Action executed, evidence verified, adjudicated, causal link established.",
    ...overrides,
  };
}

// ─── Policy table tests ───────────────────────────────────────────────────────

describe("ELIGIBILITY_ALLOWS_LEARNING", () => {
  it("not_reviewed → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.not_reviewed).toBe(false));
  it("rejected → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.rejected).toBe(false));
  it("quarantined → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.quarantined).toBe(false));
  it("needs_more_cases → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.needs_more_cases).toBe(false));
  it("human_review_pending → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.human_review_pending).toBe(false));
  it("human_rejected → does not allow learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.human_rejected).toBe(false));
  it("eligible_low_confidence → allows learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.eligible_low_confidence).toBe(true));
  it("eligible_medium_confidence → allows learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.eligible_medium_confidence).toBe(true));
  it("eligible_high_confidence → allows learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.eligible_high_confidence).toBe(true));
  it("human_approved → allows learning", () =>
    expect(ELIGIBILITY_ALLOWS_LEARNING.human_approved).toBe(true));
});

describe("ELIGIBILITY_IS_TERMINAL_REJECTION", () => {
  it("rejected → terminal", () =>
    expect(ELIGIBILITY_IS_TERMINAL_REJECTION.rejected).toBe(true));
  it("human_rejected → terminal", () =>
    expect(ELIGIBILITY_IS_TERMINAL_REJECTION.human_rejected).toBe(true));
  it("eligible_high_confidence → not terminal", () =>
    expect(ELIGIBILITY_IS_TERMINAL_REJECTION.eligible_high_confidence).toBe(false));
  it("quarantined → not terminal", () =>
    expect(ELIGIBILITY_IS_TERMINAL_REJECTION.quarantined).toBe(false));
  it("human_review_pending → not terminal", () =>
    expect(ELIGIBILITY_IS_TERMINAL_REJECTION.human_review_pending).toBe(false));
});

describe("REJECTION_IS_HARD_BLOCK", () => {
  it("opinion_only → hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.opinion_only).toBe(true));
  it("not_executed → hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.not_executed).toBe(true));
  it("material_execution_deviation → hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.material_execution_deviation).toBe(true));
  it("external_event_contamination → hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.external_event_contamination).toBe(true));
  it("causation_not_supported → hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.causation_not_supported).toBe(true));
  it("unverified_evidence → not hard block (can be resolved)", () =>
    expect(REJECTION_IS_HARD_BLOCK.unverified_evidence).toBe(false));
  it("missing_metric → not hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.missing_metric).toBe(false));
  it("single_weak_case → not hard block", () =>
    expect(REJECTION_IS_HARD_BLOCK.single_weak_case).toBe(false));
  it("harm_review_required → not hard block (resolvable by human review)", () =>
    expect(REJECTION_IS_HARD_BLOCK.harm_review_required).toBe(false));
});

// ─── ELIG-RULE-1: eligibilityNotes ───────────────────────────────────────────

describe("ELIG-RULE-1: eligibilityNotes required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = assessLearningEligibility(eligible({ eligibilityNotes: "" }));
    expect(result.violations.some((v) => v.includes("ELIG-RULE-1"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = assessLearningEligibility(eligible({ eligibilityNotes: "ok" }));
    expect(result.violations.some((v) => v.includes("ELIG-RULE-1"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = assessLearningEligibility(eligible());
    expect(result.violations.some((v) => v.includes("ELIG-RULE-1"))).toBe(false);
  });
});

// ─── ELIG-RULE-2: entity link ─────────────────────────────────────────────────

describe("ELIG-RULE-2: at least one entity link required", () => {
  it("violation when none provided", () => {
    const result = assessLearningEligibility(
      eligible({ actionId: undefined, recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("ELIG-RULE-2"))).toBe(true);
  });

  it("valid with only actionId", () => {
    const result = assessLearningEligibility(
      eligible({ recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("ELIG-RULE-2"))).toBe(false);
  });

  it("valid with only recommendationId", () => {
    const result = assessLearningEligibility(
      eligible({ actionId: undefined, recommendationId: "rec-001", outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("ELIG-RULE-2"))).toBe(false);
  });
});

// ─── Scenario: reject opinion only ───────────────────────────────────────────

describe("scenario: reject opinion only", () => {
  it("isOwnerOpinionOnly → rejected with opinion_only reason", () => {
    const result = assessLearningEligibility(eligible({ isOwnerOpinionOnly: true }));
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("opinion_only");
    expect(result.allowsLearning).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── Scenario: reject not executed ───────────────────────────────────────────

describe("scenario: reject not executed", () => {
  it("actionWasExecuted=false → rejected with not_executed reason", () => {
    const result = assessLearningEligibility(eligible({ actionWasExecuted: false }));
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("not_executed");
    expect(result.allowsLearning).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── Scenario: reject material deviation ─────────────────────────────────────

describe("scenario: reject material execution deviation", () => {
  it("executionMateriallyDeviated → rejected with material_execution_deviation", () => {
    const result = assessLearningEligibility(
      eligible({ executionMateriallyDeviated: true })
    );
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("material_execution_deviation");
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario: reject unverified evidence ────────────────────────────────────

describe("scenario: reject unverified evidence", () => {
  it("hasVerifiedEvidence=false → rejected with unverified_evidence", () => {
    const result = assessLearningEligibility(eligible({ hasVerifiedEvidence: false }));
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("unverified_evidence");
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario: reject correlation only ───────────────────────────────────────

describe("scenario: reject correlation only", () => {
  it("causalAttributionClass=correlation_only → rejected with causation_not_supported", () => {
    const result = assessLearningEligibility(
      eligible({ causalAttributionClass: "correlation_only" })
    );
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("causation_not_supported");
    expect(result.allowsLearning).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── Scenario: external event contamination ───────────────────────────────────

describe("scenario: external event contamination blocks learning", () => {
  it("external_event_dominant → rejected with external_event_contamination", () => {
    const result = assessLearningEligibility(
      eligible({ causalAttributionClass: "external_event_dominant" })
    );
    expect(result.status).toBe("rejected");
    expect(result.rejectionReasons).toContain("external_event_contamination");
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario: human review required for harm ─────────────────────────────────

describe("scenario: human review required for harm", () => {
  it("high harm → human_review_pending", () => {
    const result = assessLearningEligibility(eligible({ harmSeverity: "high" }));
    expect(result.status).toBe("human_review_pending");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.rejectionReasons).toContain("harm_review_required");
    expect(result.allowsLearning).toBe(false);
  });

  it("severe harm → human_review_pending", () => {
    const result = assessLearningEligibility(eligible({ harmSeverity: "severe" }));
    expect(result.status).toBe("human_review_pending");
    expect(result.requiresHumanReview).toBe(true);
  });

  it("medium harm → no harm review required", () => {
    const result = assessLearningEligibility(eligible({ harmSeverity: "medium" }));
    expect(result.rejectionReasons).not.toContain("harm_review_required");
  });
});

// ─── Scenario: admit eligible valid local learning ────────────────────────────

describe("scenario: admit eligible valid local learning", () => {
  it("all gates passed + likely_caused → eligible_high_confidence", () => {
    const result = assessLearningEligibility(eligible());
    expect(result.status).toBe("eligible_high_confidence");
    expect(result.valid).toBe(true);
    expect(result.rejectionReasons).toHaveLength(0);
    expect(result.allowsLearning).toBe(true);
    expect(result.isTerminalRejection).toBe(false);
  });

  it("plausible_contributor → eligible_medium_confidence", () => {
    const result = assessLearningEligibility(
      eligible({ causalAttributionClass: "plausible_contributor" })
    );
    expect(result.status).toBe("eligible_medium_confidence");
    expect(result.allowsLearning).toBe(true);
  });
});

// ─── Scenario: quarantine contradictory case ──────────────────────────────────

describe("scenario: quarantine contradictory evidence", () => {
  it("hasContradictoryEvidence=true → quarantined", () => {
    const result = assessLearningEligibility(
      eligible({ hasContradictoryEvidence: true })
    );
    expect(result.status).toBe("quarantined");
    expect(result.rejectionReasons).toContain("contradictory_evidence");
    expect(result.allowsLearning).toBe(false);
    expect(result.isTerminalRejection).toBe(false);
  });
});

// ─── Broad impact + human review ─────────────────────────────────────────────

describe("broad impact scope requires human review", () => {
  it("broadImpactScope + likely_caused + no other issues → human_review_pending", () => {
    const result = assessLearningEligibility(
      eligible({ broadImpactScope: true })
    );
    expect(result.status).toBe("human_review_pending");
    expect(result.requiresHumanReview).toBe(true);
  });

  it("broadImpactScope + plausible_contributor → does not trigger human review", () => {
    const result = assessLearningEligibility(
      eligible({ broadImpactScope: true, causalAttributionClass: "plausible_contributor" })
    );
    expect(result.requiresHumanReview).toBe(false);
  });
});

// ─── No adjudication ─────────────────────────────────────────────────────────

describe("missing adjudication or attribution", () => {
  it("adjudicationCompleted=false → insufficient_evidence in rejections", () => {
    const result = assessLearningEligibility(eligible({ adjudicationCompleted: false }));
    expect(result.rejectionReasons).toContain("insufficient_evidence");
  });

  it("causalAttributionCompleted=false → insufficient_evidence in rejections", () => {
    const result = assessLearningEligibility(
      eligible({ causalAttributionCompleted: false })
    );
    expect(result.rejectionReasons).toContain("insufficient_evidence");
  });
});

// ─── No privacy controls ─────────────────────────────────────────────────────

describe("missing privacy controls", () => {
  it("hasPrivacyControls=false → privacy_controls_missing in rejections", () => {
    const result = assessLearningEligibility(eligible({ hasPrivacyControls: false }));
    expect(result.rejectionReasons).toContain("privacy_controls_missing");
  });
});

// ─── learningIsAdmissible ─────────────────────────────────────────────────────

describe("learningIsAdmissible", () => {
  it("eligible_high_confidence → admissible", () => {
    const result = assessLearningEligibility(eligible());
    expect(learningIsAdmissible(result)).toBe(true);
  });

  it("rejected → not admissible", () => {
    const result = assessLearningEligibility(eligible({ isOwnerOpinionOnly: true }));
    expect(learningIsAdmissible(result)).toBe(false);
  });

  it("human_review_pending → not admissible", () => {
    const result = assessLearningEligibility(eligible({ harmSeverity: "high" }));
    expect(learningIsAdmissible(result)).toBe(false);
  });

  it("quarantined → not admissible", () => {
    const result = assessLearningEligibility(eligible({ hasContradictoryEvidence: true }));
    expect(learningIsAdmissible(result)).toBe(false);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => assessLearningEligibility(eligible({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => assessLearningEligibility(eligible({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("all gates passed is valid with no violations", () => {
    const result = assessLearningEligibility(eligible());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("opinion-only rejection is valid (violations empty, rejection captured in reasons)", () => {
    const result = assessLearningEligibility(eligible({ isOwnerOpinionOnly: true }));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.rejectionReasons).toContain("opinion_only");
  });
});

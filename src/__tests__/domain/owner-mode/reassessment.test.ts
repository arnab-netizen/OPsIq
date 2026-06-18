import { describe, it, expect } from "vitest";
import {
  REASSESSMENT_STATUS_TRANSITIONS,
  TRIGGER_REQUIRES_HUMAN_REVIEW,
  TRIGGER_REOPENS_DIAGNOSIS,
  initiateReassessment,
  isValidReassessmentTransition,
  type ReassessmentInput,
} from "@/domain/owner-mode/reassessment";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function base(overrides: Partial<ReassessmentInput> = {}): ReassessmentInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    trigger: "failed_outcome",
    triggerDescription: "Supplier accepted only 1.5% reduction, far below the 8% target.",
    assumptionsChecked: true,
    invalidatedAssumptions: ["supplier_price_flexibility"],
    proposedCorrectiveActionClass: "switch_action_type",
    correctiveActionRationale:
      "Supplier negotiation ineffective; switching to alternative sourcing strategy.",
    ownerAcknowledged: false,
    ...overrides,
  };
}

function harmfulBase(overrides: Partial<ReassessmentInput> = {}): ReassessmentInput {
  return base({
    trigger: "harmful_outcome",
    triggerDescription: "Price increase drove significant customer churn — outcome caused harm.",
    ownerAcknowledged: true,
    proposedCorrectiveActionClass: "escalate_to_owner",
    correctiveActionRationale: "Owner must review before corrective action is issued.",
    ...overrides,
  });
}

// ─── Policy table tests ───────────────────────────────────────────────────────

describe("TRIGGER_REQUIRES_HUMAN_REVIEW", () => {
  it("failed_outcome → does not require human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.failed_outcome).toBe(false));
  it("disputed_outcome → requires human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.disputed_outcome).toBe(true));
  it("harmful_outcome → requires human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.harmful_outcome).toBe(true));
  it("owner_dispute → requires human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.owner_dispute).toBe(true));
  it("evidence_retraction → requires human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.evidence_retraction).toBe(true));
  it("external_event_invalidation → does not require human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.external_event_invalidation).toBe(false));
  it("execution_invalidation → does not require human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.execution_invalidation).toBe(false));
  it("new_contradicting_evidence → does not require human review", () =>
    expect(TRIGGER_REQUIRES_HUMAN_REVIEW.new_contradicting_evidence).toBe(false));
});

describe("TRIGGER_REOPENS_DIAGNOSIS", () => {
  it("failed_outcome → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.failed_outcome).toBe(true));
  it("disputed_outcome → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.disputed_outcome).toBe(true));
  it("harmful_outcome → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.harmful_outcome).toBe(true));
  it("owner_dispute → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.owner_dispute).toBe(true));
  it("evidence_retraction → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.evidence_retraction).toBe(true));
  it("new_contradicting_evidence → reopens diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.new_contradicting_evidence).toBe(true));
  it("external_event_invalidation → does not reopen diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.external_event_invalidation).toBe(false));
  it("execution_invalidation → does not reopen diagnosis", () =>
    expect(TRIGGER_REOPENS_DIAGNOSIS.execution_invalidation).toBe(false));
});

// ─── Status transition table ──────────────────────────────────────────────────

describe("REASSESSMENT_STATUS_TRANSITIONS", () => {
  it("closed_no_correction_needed is terminal", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.closed_no_correction_needed).toHaveLength(0));
  it("closed_with_correction is terminal", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.closed_with_correction).toHaveLength(0));
  it("pending can move to in_progress", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.pending).toContain("in_progress"));
  it("pending can move to blocked_awaiting_human_review", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.pending).toContain("blocked_awaiting_human_review"));
  it("corrective_action_issued can close with correction", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.corrective_action_issued).toContain(
      "closed_with_correction"
    ));
  it("diagnosis_reopened can issue corrective action", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.diagnosis_reopened).toContain(
      "corrective_action_issued"
    ));
  it("blocked_awaiting_human_review can resume in_progress", () =>
    expect(REASSESSMENT_STATUS_TRANSITIONS.blocked_awaiting_human_review).toContain("in_progress"));
});

// ─── isValidReassessmentTransition ───────────────────────────────────────────

describe("isValidReassessmentTransition", () => {
  it("pending → in_progress is valid", () =>
    expect(isValidReassessmentTransition("pending", "in_progress")).toBe(true));
  it("pending → closed_with_correction is invalid", () =>
    expect(isValidReassessmentTransition("pending", "closed_with_correction")).toBe(false));
  it("closed_with_correction → in_progress is invalid (terminal)", () =>
    expect(isValidReassessmentTransition("closed_with_correction", "in_progress")).toBe(false));
  it("diagnosis_reopened → corrective_action_issued is valid", () =>
    expect(
      isValidReassessmentTransition("diagnosis_reopened", "corrective_action_issued")
    ).toBe(true));
  it("in_progress → closed_no_correction_needed is valid", () =>
    expect(
      isValidReassessmentTransition("in_progress", "closed_no_correction_needed")
    ).toBe(true));
});

// ─── REAS-RULE-1: triggerDescription ─────────────────────────────────────────

describe("REAS-RULE-1: triggerDescription required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = initiateReassessment(base({ triggerDescription: "" }));
    expect(result.violations.some((v) => v.includes("REAS-RULE-1"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = initiateReassessment(base({ triggerDescription: "failed" }));
    expect(result.violations.some((v) => v.includes("REAS-RULE-1"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = initiateReassessment(base());
    expect(result.violations.some((v) => v.includes("REAS-RULE-1"))).toBe(false);
  });
});

// ─── REAS-RULE-2: entity link ─────────────────────────────────────────────────

describe("REAS-RULE-2: at least one entity link required", () => {
  it("violation when none provided", () => {
    const result = initiateReassessment(
      base({ actionId: undefined, recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-2"))).toBe(true);
  });

  it("valid when only actionId provided", () => {
    const result = initiateReassessment(
      base({ recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-2"))).toBe(false);
  });

  it("valid when only recommendationId provided", () => {
    const result = initiateReassessment(
      base({ actionId: undefined, recommendationId: "rec-001", outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-2"))).toBe(false);
  });

  it("valid when only outcomeId provided", () => {
    const result = initiateReassessment(
      base({ actionId: undefined, recommendationId: undefined, outcomeId: "outcome-001" })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-2"))).toBe(false);
  });
});

// ─── REAS-RULE-3: rationale required with corrective action ──────────────────

describe("REAS-RULE-3: correctiveActionRationale required with proposedCorrectiveActionClass", () => {
  it("violation when class provided but rationale missing", () => {
    const result = initiateReassessment(
      base({ proposedCorrectiveActionClass: "retry_same_action", correctiveActionRationale: undefined })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-3"))).toBe(true);
  });

  it("no violation when both class and rationale provided", () => {
    const result = initiateReassessment(base());
    expect(result.violations.some((v) => v.includes("REAS-RULE-3"))).toBe(false);
  });

  it("no violation when neither class nor rationale provided", () => {
    const result = initiateReassessment(
      base({
        proposedCorrectiveActionClass: undefined,
        correctiveActionRationale: undefined,
      })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-3"))).toBe(false);
  });
});

// ─── REAS-RULE-4: harmful/dispute triggers require ownerAcknowledged ─────────

describe("REAS-RULE-4: harmful_outcome and owner_dispute require ownerAcknowledged", () => {
  it("harmful_outcome without ownerAcknowledged → violation", () => {
    const result = initiateReassessment(
      harmfulBase({ ownerAcknowledged: false })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-4"))).toBe(true);
  });

  it("owner_dispute without ownerAcknowledged → violation", () => {
    const result = initiateReassessment(
      base({
        trigger: "owner_dispute",
        triggerDescription: "Owner disputes the recommendation outcome and interpretation.",
        ownerAcknowledged: false,
      })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-4"))).toBe(true);
  });

  it("harmful_outcome with ownerAcknowledged → no violation", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.violations.some((v) => v.includes("REAS-RULE-4"))).toBe(false);
  });

  it("failed_outcome without ownerAcknowledged → no violation", () => {
    const result = initiateReassessment(base({ ownerAcknowledged: false }));
    expect(result.violations.some((v) => v.includes("REAS-RULE-4"))).toBe(false);
  });
});

// ─── REAS-RULE-5: invalidatedAssumptions requires assumptionsChecked ─────────

describe("REAS-RULE-5: invalidatedAssumptions requires assumptionsChecked=true", () => {
  it("violation when assumptions listed but not checked", () => {
    const result = initiateReassessment(
      base({ assumptionsChecked: false, invalidatedAssumptions: ["price_sensitivity"] })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-5"))).toBe(true);
  });

  it("no violation when assumptions checked and listed", () => {
    const result = initiateReassessment(base());
    expect(result.violations.some((v) => v.includes("REAS-RULE-5"))).toBe(false);
  });

  it("no violation when no assumptions invalidated and not checked", () => {
    const result = initiateReassessment(
      base({ assumptionsChecked: false, invalidatedAssumptions: [] })
    );
    expect(result.violations.some((v) => v.includes("REAS-RULE-5"))).toBe(false);
  });
});

// ─── requiresHumanReview ──────────────────────────────────────────────────────

describe("requiresHumanReview from trigger", () => {
  it("failed_outcome → does not require human review", () => {
    const result = initiateReassessment(base());
    expect(result.requiresHumanReview).toBe(false);
  });

  it("harmful_outcome → requires human review", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.requiresHumanReview).toBe(true);
  });

  it("disputed_outcome → requires human review", () => {
    const result = initiateReassessment(
      base({
        trigger: "disputed_outcome",
        triggerDescription: "Owner disputes the outcome measurement methodology.",
        ownerAcknowledged: true,
      })
    );
    expect(result.requiresHumanReview).toBe(true);
  });

  it("external_event_invalidation → does not require human review", () => {
    const result = initiateReassessment(
      base({
        trigger: "external_event_invalidation",
        triggerDescription: "Global supply shock invalidated the outcome measurement window.",
        invalidatedAssumptions: [],
      })
    );
    expect(result.requiresHumanReview).toBe(false);
  });
});

// ─── reopensDiagnosis ─────────────────────────────────────────────────────────

describe("reopensDiagnosis from trigger", () => {
  it("failed_outcome → reopens diagnosis", () => {
    const result = initiateReassessment(base());
    expect(result.reopensDiagnosis).toBe(true);
  });

  it("new_contradicting_evidence → reopens diagnosis", () => {
    const result = initiateReassessment(
      base({
        trigger: "new_contradicting_evidence",
        triggerDescription: "Invoice data contradicts the reported COGS reduction outcome.",
        invalidatedAssumptions: [],
      })
    );
    expect(result.reopensDiagnosis).toBe(true);
  });

  it("external_event_invalidation → does not reopen diagnosis", () => {
    const result = initiateReassessment(
      base({
        trigger: "external_event_invalidation",
        triggerDescription: "Global supply shock invalidated the outcome measurement window.",
        invalidatedAssumptions: [],
      })
    );
    expect(result.reopensDiagnosis).toBe(false);
  });

  it("execution_invalidation → does not reopen diagnosis", () => {
    const result = initiateReassessment(
      base({
        trigger: "execution_invalidation",
        triggerDescription: "Action was not executed as specified; results are invalid.",
        invalidatedAssumptions: [],
      })
    );
    expect(result.reopensDiagnosis).toBe(false);
  });
});

// ─── canIssueCorrectiveAction ─────────────────────────────────────────────────

describe("canIssueCorrectiveAction", () => {
  it("valid + no human review required + class + rationale → true", () => {
    const result = initiateReassessment(base());
    expect(result.canIssueCorrectiveAction).toBe(true);
  });

  it("requires human review → cannot issue corrective action", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.canIssueCorrectiveAction).toBe(false);
  });

  it("no proposed class → cannot issue corrective action", () => {
    const result = initiateReassessment(
      base({ proposedCorrectiveActionClass: undefined, correctiveActionRationale: undefined })
    );
    expect(result.canIssueCorrectiveAction).toBe(false);
  });

  it("invalid record → cannot issue corrective action", () => {
    const result = initiateReassessment(base({ triggerDescription: "" }));
    expect(result.canIssueCorrectiveAction).toBe(false);
  });
});

// ─── initialStatus ────────────────────────────────────────────────────────────

describe("initialStatus", () => {
  it("valid non-human-review trigger → in_progress", () => {
    const result = initiateReassessment(base());
    expect(result.initialStatus).toBe("in_progress");
  });

  it("human-review trigger → blocked_awaiting_human_review", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.initialStatus).toBe("blocked_awaiting_human_review");
  });

  it("invalid input → pending (violations present)", () => {
    const result = initiateReassessment(base({ triggerDescription: "" }));
    expect(result.initialStatus).toBe("pending");
  });
});

// ─── Scenario: price increase partially failed ────────────────────────────────

describe("scenario: price increase partially failed", () => {
  it("classifies as failed_outcome reopening diagnosis", () => {
    const result = initiateReassessment(
      base({
        trigger: "failed_outcome",
        triggerDescription:
          "Price increase yielded only 0.8% margin gain vs 5% target due to elasticity underestimation.",
        invalidatedAssumptions: ["price_elasticity_estimate"],
        proposedCorrectiveActionClass: "modify_action_parameters",
        correctiveActionRationale:
          "Reduce price increase magnitude; retest with elasticity-adjusted model.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.reopensDiagnosis).toBe(true);
    expect(result.canIssueCorrectiveAction).toBe(true);
  });
});

// ─── Scenario: execution invalidation ────────────────────────────────────────

describe("scenario: execution invalidation", () => {
  it("does not reopen diagnosis, allows corrective action", () => {
    const result = initiateReassessment(
      base({
        trigger: "execution_invalidation",
        triggerDescription:
          "Customer reactivation campaign was sent to wrong segment; execution was invalid.",
        assumptionsChecked: false,
        invalidatedAssumptions: [],
        proposedCorrectiveActionClass: "retry_same_action",
        correctiveActionRationale: "Re-execute with correct segment targeting.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.reopensDiagnosis).toBe(false);
    expect(result.canIssueCorrectiveAction).toBe(true);
  });
});

// ─── Scenario: external event invalidates outcome ────────────────────────────

describe("scenario: external event invalidates outcome", () => {
  it("closes without reopening diagnosis; requires no human review", () => {
    const result = initiateReassessment(
      base({
        trigger: "external_event_invalidation",
        triggerDescription:
          "Global recession reduced COGS across all suppliers, invalidating the outcome attribution.",
        assumptionsChecked: false,
        invalidatedAssumptions: [],
        proposedCorrectiveActionClass: "close_as_external_cause",
        correctiveActionRationale: "Outcome contaminated by macro event; close without learning.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.requiresHumanReview).toBe(false);
    expect(result.reopensDiagnosis).toBe(false);
  });
});

// ─── Scenario: harmful outcome triggers human review ─────────────────────────

describe("scenario: harmful action triggers human review", () => {
  it("blocks corrective action pending human review", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.valid).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.canIssueCorrectiveAction).toBe(false);
    expect(result.initialStatus).toBe("blocked_awaiting_human_review");
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => initiateReassessment(base({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => initiateReassessment(base({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("failed_outcome path is valid with no violations", () => {
    const result = initiateReassessment(base());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("harmful_outcome path is valid with no violations", () => {
    const result = initiateReassessment(harmfulBase());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  VERDICT_ENABLES_LEARNING,
  VERDICT_REQUIRES_REASSESSMENT,
  adjudicateFailure,
  adjudicationAllowsLearning,
  type AdjudicationInput,
} from "@/domain/owner-mode/failure-adjudication";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

// A clean "validated success" baseline: execution valid, evidence sufficient, metric improved
function successInput(overrides: Partial<AdjudicationInput> = {}): AdjudicationInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-001",
    recommendationId: "rec-001",
    actionNotExecuted: false,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    externalEventFlagged: false,
    ownerConstraintViolated: false,
    metricWorsened: false,
    successThresholdPassed: true,
    adjudicationReason: "Supplier renegotiation reduced COGS by 8% — within target range and verified by two invoices.",
    ...overrides,
  };
}

// A clean "validated failure" baseline: execution valid, evidence sufficient, threshold not met
function failureInput(overrides: Partial<AdjudicationInput> = {}): AdjudicationInput {
  return successInput({
    successThresholdPassed: false,
    adjudicationReason: "Supplier accepted only a 1.5% price reduction, far below the 8% target. Evidence verified.",
    ...overrides,
  });
}

// ─── Verdict policy tables ────────────────────────────────────────────────────

describe("VERDICT_ENABLES_LEARNING", () => {
  it("validated_success → enables learning", () =>
    expect(VERDICT_ENABLES_LEARNING.validated_success).toBe(true));
  it("validated_failure → enables learning", () =>
    expect(VERDICT_ENABLES_LEARNING.validated_failure).toBe(true));
  it("invalid_test → does not enable learning", () =>
    expect(VERDICT_ENABLES_LEARNING.invalid_test).toBe(false));
  it("insufficient_evidence → does not enable learning", () =>
    expect(VERDICT_ENABLES_LEARNING.insufficient_evidence).toBe(false));
  it("too_early_to_judge → does not enable learning", () =>
    expect(VERDICT_ENABLES_LEARNING.too_early_to_judge).toBe(false));
  it("reassessment_required → does not enable learning", () =>
    expect(VERDICT_ENABLES_LEARNING.reassessment_required).toBe(false));
});

describe("VERDICT_REQUIRES_REASSESSMENT", () => {
  it("reassessment_required → true", () =>
    expect(VERDICT_REQUIRES_REASSESSMENT.reassessment_required).toBe(true));
  it("too_early_to_judge → true", () =>
    expect(VERDICT_REQUIRES_REASSESSMENT.too_early_to_judge).toBe(true));
  it("validated_success → false", () =>
    expect(VERDICT_REQUIRES_REASSESSMENT.validated_success).toBe(false));
  it("validated_failure → false", () =>
    expect(VERDICT_REQUIRES_REASSESSMENT.validated_failure).toBe(false));
  it("invalid_test → false", () =>
    expect(VERDICT_REQUIRES_REASSESSMENT.invalid_test).toBe(false));
});

// ─── ADJ-RULE-1: adjudicationReason ──────────────────────────────────────────

describe("ADJ-RULE-1: adjudicationReason required (min 10 chars)", () => {
  it("violation when empty", () => {
    const result = adjudicateFailure(successInput({ adjudicationReason: "" }));
    expect(result.violations.some((v) => v.includes("ADJ-RULE-1"))).toBe(true);
  });

  it("violation when too short", () => {
    const result = adjudicateFailure(successInput({ adjudicationReason: "ok done" }));
    expect(result.violations.some((v) => v.includes("ADJ-RULE-1"))).toBe(true);
  });

  it("no violation when sufficient", () => {
    const result = adjudicateFailure(successInput());
    expect(result.violations.some((v) => v.includes("ADJ-RULE-1"))).toBe(false);
  });
});

// ─── ADJ-RULE-2: must link to entity ─────────────────────────────────────────

describe("ADJ-RULE-2: entity link required", () => {
  it("violation when no links", () => {
    const result = adjudicateFailure(
      successInput({ recommendationId: undefined, actionId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("ADJ-RULE-2"))).toBe(true);
  });

  it("valid when only actionId provided", () => {
    const result = adjudicateFailure(
      successInput({ recommendationId: undefined, outcomeId: undefined })
    );
    expect(result.violations.some((v) => v.includes("ADJ-RULE-2"))).toBe(false);
  });

  it("valid when only outcomeId provided", () => {
    const result = adjudicateFailure(
      successInput({ recommendationId: undefined, actionId: undefined, outcomeId: "outcome-001" })
    );
    expect(result.violations.some((v) => v.includes("ADJ-RULE-2"))).toBe(false);
  });
});

// ─── Deterministic rules: execution signals ───────────────────────────────────

describe("deterministic rule: action not executed → invalid_test", () => {
  it("not_executed → verdict is invalid_test", () => {
    const result = adjudicateFailure(successInput({ actionNotExecuted: true }));
    expect(result.verdict).toBe("invalid_test");
  });

  it("not_executed → failureClass is not_executed", () => {
    const result = adjudicateFailure(successInput({ actionNotExecuted: true }));
    expect(result.failureClass).toBe("not_executed");
  });

  it("not_executed → executionValid = false", () => {
    const result = adjudicateFailure(successInput({ actionNotExecuted: true }));
    expect(result.executionValid).toBe(false);
  });

  it("not_executed → learningEligible = false", () => {
    const result = adjudicateFailure(successInput({ actionNotExecuted: true }));
    expect(result.learningEligible).toBe(false);
  });
});

describe("deterministic rule: materially deviated → invalid_test / bad_execution", () => {
  it("materially deviated → verdict is invalid_test", () => {
    const result = adjudicateFailure(successInput({ executionMateriallyDeviated: true }));
    expect(result.verdict).toBe("invalid_test");
  });

  it("materially deviated → failureClass is bad_execution", () => {
    const result = adjudicateFailure(successInput({ executionMateriallyDeviated: true }));
    expect(result.failureClass).toBe("bad_execution");
  });
});

// ─── Deterministic rules: evidence signals ────────────────────────────────────

describe("deterministic rule: no verified evidence → insufficient_evidence", () => {
  it("no verified evidence → verdict is insufficient_evidence", () => {
    const result = adjudicateFailure(successInput({ hasVerifiedEvidence: false }));
    expect(result.verdict).toBe("insufficient_evidence");
  });

  it("no verified evidence → evidenceSufficient = false", () => {
    const result = adjudicateFailure(successInput({ hasVerifiedEvidence: false }));
    expect(result.evidenceSufficient).toBe(false);
  });
});

describe("deterministic rule: measurement period incomplete → too_early_to_judge", () => {
  it("period incomplete → verdict is too_early_to_judge", () => {
    const result = adjudicateFailure(
      successInput({ measurementPeriodComplete: false })
    );
    expect(result.verdict).toBe("too_early_to_judge");
  });

  it("period incomplete → requiresReassessment = true", () => {
    const result = adjudicateFailure(
      successInput({ measurementPeriodComplete: false })
    );
    expect(result.requiresReassessment).toBe(true);
  });
});

// ─── Deterministic rules: outcome signals ─────────────────────────────────────

describe("deterministic rule: external event → invalid_test", () => {
  it("external event flagged → verdict is invalid_test", () => {
    const result = adjudicateFailure(successInput({ externalEventFlagged: true }));
    expect(result.verdict).toBe("invalid_test");
  });

  it("external event → failureClass is external_event", () => {
    const result = adjudicateFailure(successInput({ externalEventFlagged: true }));
    expect(result.failureClass).toBe("external_event");
  });
});

describe("deterministic rule: metric worsened + valid execution → reassessment_required", () => {
  it("metric worsened → verdict is reassessment_required", () => {
    const result = adjudicateFailure(
      successInput({ metricWorsened: true, successThresholdPassed: false })
    );
    expect(result.verdict).toBe("reassessment_required");
  });

  it("metric worsened → failureClass is wrong_action", () => {
    const result = adjudicateFailure(
      successInput({ metricWorsened: true, successThresholdPassed: false })
    );
    expect(result.failureClass).toBe("wrong_action");
  });

  it("metric worsened → requiresReassessment = true", () => {
    const result = adjudicateFailure(
      successInput({ metricWorsened: true, successThresholdPassed: false })
    );
    expect(result.requiresReassessment).toBe(true);
  });
});

describe("deterministic rule: constraint violated → constraint_ignored", () => {
  it("constraint violated → failureClass is constraint_ignored", () => {
    const result = adjudicateFailure(
      successInput({ ownerConstraintViolated: true, successThresholdPassed: false })
    );
    expect(result.failureClass).toBe("constraint_ignored");
  });
});

// ─── ADJ-RULE-3 + ADJ-RULE-4: guardrails ─────────────────────────────────────

describe("ADJ-RULE-3: validated_success requires sufficient evidence", () => {
  it("validated_success without evidence → violation", () => {
    const result = adjudicateFailure(
      successInput({ hasVerifiedEvidence: false, successThresholdPassed: true })
    );
    // Evidence gate fires first (insufficient_evidence verdict), ADJ-RULE-3 not reached
    expect(result.verdict).toBe("insufficient_evidence");
    expect(result.learningEligible).toBe(false);
  });
});

describe("ADJ-RULE-4: validated_failure requires valid execution", () => {
  it("failure verdict with invalid execution → captured as invalid_test", () => {
    const result = adjudicateFailure(
      failureInput({ executionMateriallyDeviated: true })
    );
    // Execution gate fires first
    expect(result.verdict).toBe("invalid_test");
    expect(result.executionValid).toBe(false);
  });
});

// ─── Happy-path verdicts ──────────────────────────────────────────────────────

describe("validated_success path", () => {
  it("valid execution + evidence + threshold passed → validated_success", () => {
    const result = adjudicateFailure(successInput());
    expect(result.verdict).toBe("validated_success");
  });

  it("validated_success → learningEligible = true", () => {
    const result = adjudicateFailure(successInput());
    expect(result.learningEligible).toBe(true);
  });

  it("validated_success → requiresReassessment = false", () => {
    const result = adjudicateFailure(successInput());
    expect(result.requiresReassessment).toBe(false);
  });

  it("adjudicationAllowsLearning returns true", () => {
    const result = adjudicateFailure(successInput());
    expect(adjudicationAllowsLearning(result)).toBe(true);
  });
});

describe("validated_failure path", () => {
  it("valid execution + evidence + threshold not met → validated_failure", () => {
    const result = adjudicateFailure(failureInput());
    expect(result.verdict).toBe("validated_failure");
  });

  it("validated_failure → learningEligible = true", () => {
    const result = adjudicateFailure(failureInput());
    expect(result.learningEligible).toBe(true);
  });

  it("adjudicationAllowsLearning returns true for validated_failure", () => {
    const result = adjudicateFailure(failureInput());
    expect(adjudicationAllowsLearning(result)).toBe(true);
  });
});

// ─── Good recommendation badly executed ───────────────────────────────────────

describe("good recommendation badly executed", () => {
  it("deviated execution classifies as invalid_test not validated_failure", () => {
    const result = adjudicateFailure(
      failureInput({ executionMateriallyDeviated: true })
    );
    expect(result.verdict).toBe("invalid_test");
    expect(result.learningEligible).toBe(false);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => adjudicateFailure(successInput({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => adjudicateFailure(successInput({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("success path is valid with no violations", () => {
    const result = adjudicateFailure(successInput());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("failure path is valid with no violations", () => {
    const result = adjudicateFailure(failureInput());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

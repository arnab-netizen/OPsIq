/**
 * Full Loop Validation Tests — Owner Mode Reality Loop
 *
 * 15 scenarios covering the complete owner-mode loop:
 * input quality → recommendation tracking → owner decision → action tracking
 * → outcome tracking → failure adjudication → harm tracking → learning eligibility
 */

import { describe, it, expect } from "vitest";

import {
  assessInputQuality,
  assertAllowsStrongRecommendation,
  assertAllowsHighRiskAction,
  type InputQualityAssessmentInput,
  type InputFieldValue,
} from "../../../domain/owner-mode/input-quality";

import {
  validateRecommendation,
  assertOwnerDecisionReady,
  computeRecommendationConfidence,
  isRecommendationStatusTransitionAllowed,
  type RecommendationInput,
} from "../../../domain/owner-mode/recommendation-tracking";

import {
  validateOwnerDecision,
  assertAllowsActionCreation,
  isOwnerDecisionStatusTransitionAllowed,
  type DecisionInput,
} from "../../../domain/owner-mode/owner-decision";

import {
  validateAction,
  validateExecutionLog,
  computeCompletionRate,
  isActionStatusTransitionAllowed,
  type ActionInput,
  type ExecutionLogInput,
} from "../../../domain/owner-mode/action-tracking";

import {
  validateOutcome,
  outcomeAllowsLearning,
  OUTCOME_ENABLES_LEARNING,
  OUTCOME_INDICATES_HARM,
  type OutcomeInput,
} from "../../../domain/owner-mode/outcome-tracking";

import {
  adjudicateFailure,
  adjudicationAllowsLearning,
  type AdjudicationInput,
} from "../../../domain/owner-mode/failure-adjudication";

import {
  validateHarmEvent,
  harmAllowsLearning,
  type HarmEventInput,
} from "../../../domain/owner-mode/harm-tracking";

import {
  assessLearningEligibility,
  type LearningEligibilityInput,
} from "../../../domain/owner-mode/learning-eligibility";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WS = "workspace-test-001";
const BIZ = "biz-001";

function fullFieldSet(): InputFieldValue[] {
  return [
    { field: "revenue", value: 500000, isEstimate: false, freshness: "current" },
    { field: "gross_margin", value: 35, isEstimate: false, freshness: "current" },
    { field: "net_profit", value: 20000, isEstimate: false, freshness: "current" },
    { field: "cash_balance", value: 80000, isEstimate: false, freshness: "current" },
    { field: "cash_runway", value: 6, isEstimate: false, freshness: "current" },
    { field: "leads", value: 200, isEstimate: false, freshness: "current" },
    { field: "conversion_rate", value: 12, isEstimate: false, freshness: "current" },
  ];
}

function baseRecommendationInput(): RecommendationInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    ownerUserId: "owner-001",
    recommendationText: "Increase digital marketing spend by 20% to grow lead volume",
    recommendationType: "tactical",
    priorityRank: 1,
    expectedOutcomeSummary: "Lead volume increases by 30% within 60 days",
    confidenceScore: 75,
    confidenceReason: "Based on historical spend-to-lead correlation data",
    riskLevel: "medium",
    evidenceFor: ["historical-data-001"],
    assumptions: ["market demand stable"],
    constraints: ["budget cap"],
  };
}

function baseDecisionInput(): DecisionInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    ownerUserId: "owner-001",
    decisionStatus: "accepted",
    decisionReason: "Agree with recommendation and plan to execute immediately",
    riskLevel: "medium",
    verificationStatus: "verified",
  };
}

function baseActionInput(): ActionInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    actionTitle: "Launch digital ad campaign",
    actionSteps: ["Set budget", "Create creatives", "Launch campaign", "Monitor results"],
  };
}

function baseExecutionLog(): ExecutionLogInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    actionId: "act-001",
    plannedStepsCompletedCount: 4,
    plannedStepsTotalCount: 4,
    deadlineMet: true,
    executionComplianceScore: "fully_executed",
  };
}

function baseOutcomeInput(): OutcomeInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    outcomeStatus: "worked",
    actualMetricName: "lead_count",
    beforeValue: 200,
    afterValue: 260,
    measurementPeriodStart: new Date("2025-01-01"),
    measurementPeriodEnd: new Date("2025-03-01"),
  };
}

function baseAdjudicationInput(): AdjudicationInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    actionNotExecuted: false,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    externalEventFlagged: false,
    ownerConstraintViolated: false,
    metricWorsened: false,
    successThresholdPassed: true,
    adjudicationReason: "All evidence points to a validated success with strong causal link",
  };
}

function baseLearningEligibilityInput(): LearningEligibilityInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    actionWasExecuted: true,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    adjudicationCompleted: true,
    adjudicationVerdict: "validated_success",
    causalAttributionCompleted: true,
    causalAttributionClass: "likely_caused",
    harmSeverity: "none",
    isOwnerOpinionOnly: false,
    hasContradictoryEvidence: false,
    hasPrivacyControls: true,
    broadImpactScope: false,
    eligibilityNotes: "Clean execution with verified metrics and causal link established",
  };
}

// ─── Scenario 1: Happy Path ───────────────────────────────────────────────────

describe("Scenario 1: Happy path — complete data, accepted recommendation, full execution, worked outcome", () => {
  it("complete input quality gates strong recommendation", () => {
    const result = assessInputQuality({ workspaceId: WS, fields: fullFieldSet() });
    expect(result.qualityStatus).toBe("complete");
    expect(result.allowsStrongRecommendation).toBe(true);
    expect(result.allowsHighRiskAction).toBe(true);
  });

  it("assertAllowsStrongRecommendation does not throw on complete data", () => {
    const result = assessInputQuality({ workspaceId: WS, fields: fullFieldSet() });
    expect(() => assertAllowsStrongRecommendation(result)).not.toThrow();
  });

  it("valid recommendation passes validation and is recommended", () => {
    const result = validateRecommendation(baseRecommendationInput());
    expect(result.valid).toBe(true);
    expect(result.recommendationStatus).toBe("recommended");
    expect(result.allowsOwnerDecision).toBe(true);
  });

  it("assertOwnerDecisionReady does not throw for valid recommendation", () => {
    const validation = validateRecommendation(baseRecommendationInput());
    expect(() => assertOwnerDecisionReady("recommended", validation)).not.toThrow();
  });

  it("owner accepts decision and allows action creation", () => {
    const result = validateOwnerDecision(baseDecisionInput());
    expect(result.valid).toBe(true);
    expect(result.allowsActionCreation).toBe(true);
  });

  it("action validates with title and steps", () => {
    const result = validateAction(baseActionInput());
    expect(result.valid).toBe(true);
  });

  it("full execution log allows learning", () => {
    const result = validateExecutionLog(baseExecutionLog());
    expect(result.valid).toBe(true);
    expect(result.allowsLearning).toBe(true);
    expect(result.downgradedConfidence).toBe(false);
  });

  it("worked outcome enables learning", () => {
    const result = validateOutcome(baseOutcomeInput());
    expect(result.valid).toBe(true);
    expect(result.enablesLearning).toBe(true);
    expect(outcomeAllowsLearning(result)).toBe(true);
  });

  it("adjudication produces validated_success", () => {
    const result = adjudicateFailure(baseAdjudicationInput());
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe("validated_success");
    expect(adjudicationAllowsLearning(result)).toBe(true);
  });

  it("learning eligibility is eligible_high_confidence", () => {
    const result = assessLearningEligibility(baseLearningEligibilityInput());
    expect(result.valid).toBe(true);
    expect(result.allowsLearning).toBe(true);
    expect(result.status).toBe("eligible_high_confidence");
  });
});

// ─── Scenario 2: Cash Crisis ──────────────────────────────────────────────────

describe("Scenario 2: Cash crisis — missing cash_balance and cash_runway blocks high-risk action", () => {
  it("missing cash fields produce critical_missing status", () => {
    const fields = fullFieldSet().filter(
      (f) => f.field !== "cash_balance" && f.field !== "cash_runway"
    );
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(result.qualityStatus).toBe("critical_missing");
    expect(result.allowsStrongRecommendation).toBe(false);
    expect(result.allowsHighRiskAction).toBe(false);
  });

  it("assertAllowsStrongRecommendation throws when critical fields missing", () => {
    const fields = fullFieldSet().filter((f) => f.field !== "cash_balance");
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(() => assertAllowsStrongRecommendation(result)).toThrow();
  });

  it("assertAllowsHighRiskAction throws when cash runway missing", () => {
    const fields = fullFieldSet().filter((f) => f.field !== "cash_runway");
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(() => assertAllowsHighRiskAction(result)).toThrow();
  });

  it("missingFields summary includes critical severity for cash_balance", () => {
    const fields = fullFieldSet().filter((f) => f.field !== "cash_balance");
    const result = assessInputQuality({ workspaceId: WS, fields });
    const cashField = result.missingFields.find((f) => f.field === "cash_balance");
    expect(cashField).toBeDefined();
    expect(cashField?.severity).toBe("critical");
    expect(cashField?.blocksStrongRecommendation).toBe(true);
  });
});

// ─── Scenario 3: Leads / Conversion ──────────────────────────────────────────

describe("Scenario 3: Leads and conversion missing — partial data, limited recommendation", () => {
  it("missing leads and conversion produces partial or data_limited status", () => {
    const fields = fullFieldSet().filter(
      (f) => f.field !== "leads" && f.field !== "conversion_rate"
    );
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(["partial", "data_limited"]).toContain(result.qualityStatus);
  });

  it("recommendation with low confidence gets data_limited status", () => {
    const input = { ...baseRecommendationInput(), confidenceScore: 40 };
    const result = validateRecommendation(input);
    expect(result.valid).toBe(true);
    expect(result.recommendationStatus).toBe("data_limited");
    expect(result.allowsOwnerDecision).toBe(false);
  });

  it("assertOwnerDecisionReady throws when confidence below threshold", () => {
    const input = { ...baseRecommendationInput(), confidenceScore: 40 };
    const validation = validateRecommendation(input);
    expect(() => assertOwnerDecisionReady("data_limited", validation)).toThrow();
  });

  it("computeRecommendationConfidence caps at 60 with missing data", () => {
    const score = computeRecommendationConfidence(85, true, true);
    expect(score).toBe(60);
  });
});

// ─── Scenario 4: Pricing Failure With Harm ────────────────────────────────────

describe("Scenario 4: Pricing failure — made_worse outcome triggers harm, blocks learning", () => {
  it("made_worse outcome requires ownerReportedResult", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "made_worse",
      ownerReportedResult: undefined,
    };
    const result = validateOutcome(input);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("OUT-RULE-3"))).toBe(true);
  });

  it("made_worse with ownerReportedResult is valid and indicates harm", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "made_worse",
      ownerReportedResult: "Revenue dropped 15% after pricing change",
    };
    const result = validateOutcome(input);
    expect(result.valid).toBe(true);
    expect(result.indicatesHarm).toBe(true);
    expect(result.requiresAdjudication).toBe(true);
  });

  it("high severity harm event blocks learning", () => {
    const input: HarmEventInput = {
      workspaceId: WS,
      businessId: BIZ,
      recommendationId: "rec-001",
      harmCategory: "revenue_loss",
      harmSeverity: "high",
      harmAmountEstimate: 50000,
      harmDescription: "Pricing change caused significant revenue loss over 30 days",
      reversibility: "partially_reversible",
    };
    const result = validateHarmEvent(input);
    expect(result.valid).toBe(true);
    expect(result.blocksLearning).toBe(true);
    expect(harmAllowsLearning(result)).toBe(false);
  });

  it("adjudication with metric worsened produces reassessment_required", () => {
    const input: AdjudicationInput = {
      ...baseAdjudicationInput(),
      metricWorsened: true,
      successThresholdPassed: false,
    };
    const result = adjudicateFailure(input);
    expect(result.verdict).toBe("reassessment_required");
    expect(adjudicationAllowsLearning(result)).toBe(false);
  });
});

// ─── Scenario 5: Missing Data ─────────────────────────────────────────────────

describe("Scenario 5: Missing data — all estimates, owner_estimate_only status", () => {
  it("all estimate fields produce owner_estimate_only status", () => {
    const fields: InputFieldValue[] = fullFieldSet().map((f) => ({
      ...f,
      isEstimate: true,
    }));
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(result.qualityStatus).toBe("owner_estimate_only");
  });

  it("overall score is lower when all estimates", () => {
    const estimateFields: InputFieldValue[] = fullFieldSet().map((f) => ({
      ...f,
      isEstimate: true,
    }));
    const estimateResult = assessInputQuality({ workspaceId: WS, fields: estimateFields });
    const cleanResult = assessInputQuality({ workspaceId: WS, fields: fullFieldSet() });
    expect(estimateResult.overallScore).toBeLessThan(cleanResult.overallScore);
  });

  it("not_executed execution log does not allow learning", () => {
    const log: ExecutionLogInput = {
      ...baseExecutionLog(),
      executionComplianceScore: "not_executed",
      blockerReason: "Owner did not start",
    };
    const result = validateExecutionLog(log);
    expect(result.valid).toBe(true);
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario 6: Repeat Attempt ──────────────────────────────────────────────

describe("Scenario 6: Repeat attempt — deferred recommendation re-submitted", () => {
  it("deferred status can transition to owner_decision_pending", () => {
    expect(isRecommendationStatusTransitionAllowed("deferred", "owner_decision_pending")).toBe(true);
  });

  it("deferred owner decision can transition back to accepted", () => {
    expect(isOwnerDecisionStatusTransitionAllowed("deferred", "accepted")).toBe(true);
  });

  it("deferred owner decision does not allow action creation", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      decisionStatus: "deferred",
    };
    const result = validateOwnerDecision(input);
    expect(result.valid).toBe(true);
    expect(result.allowsActionCreation).toBe(false);
  });

  it("recommendation status machine: draft → recommended is allowed", () => {
    expect(isRecommendationStatusTransitionAllowed("draft", "recommended")).toBe(true);
  });

  it("recommendation status machine: accepted → superseded is allowed", () => {
    expect(isRecommendationStatusTransitionAllowed("accepted", "superseded")).toBe(true);
  });
});

// ─── Scenario 7: Staff Productivity ──────────────────────────────────────────

describe("Scenario 7: Staff productivity — partial execution, downgraded confidence", () => {
  it("partially_executed compliance score does not allow learning", () => {
    const log: ExecutionLogInput = {
      ...baseExecutionLog(),
      executionComplianceScore: "partially_executed",
      plannedStepsCompletedCount: 2,
      plannedStepsTotalCount: 4,
    };
    const result = validateExecutionLog(log);
    expect(result.valid).toBe(true);
    expect(result.allowsLearning).toBe(false);
  });

  it("mostly_executed compliance score allows learning", () => {
    const log: ExecutionLogInput = {
      ...baseExecutionLog(),
      executionComplianceScore: "mostly_executed",
    };
    const result = validateExecutionLog(log);
    expect(result.allowsLearning).toBe(true);
  });

  it("late execution downgrades confidence even if fully executed", () => {
    const log: ExecutionLogInput = {
      ...baseExecutionLog(),
      deadlineMet: false,
    };
    const result = validateExecutionLog(log);
    expect(result.downgradedConfidence).toBe(true);
    expect(result.downgradeReasons.some((r) => r.includes("deadline"))).toBe(true);
  });

  it("computeCompletionRate returns correct percentage", () => {
    expect(computeCompletionRate(3, 4)).toBe(75);
    expect(computeCompletionRate(4, 4)).toBe(100);
    expect(computeCompletionRate(0, 4)).toBe(0);
    expect(computeCompletionRate(0, 0)).toBe(0);
  });
});

// ─── Scenario 8: Partial Execution ───────────────────────────────────────────

describe("Scenario 8: Partial execution — partially_worked outcome, adjudication required", () => {
  it("partially_worked outcome enables learning", () => {
    expect(OUTCOME_ENABLES_LEARNING["partially_worked"]).toBe(true);
  });

  it("partially_worked outcome validates successfully", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "partially_worked",
    };
    const result = validateOutcome(input);
    expect(result.valid).toBe(true);
    expect(result.enablesLearning).toBe(true);
    expect(result.requiresAdjudication).toBe(false);
  });

  it("adjudication with material deviation produces invalid_test verdict", () => {
    const input: AdjudicationInput = {
      ...baseAdjudicationInput(),
      executionMateriallyDeviated: true,
    };
    const result = adjudicateFailure(input);
    expect(result.verdict).toBe("invalid_test");
    expect(result.executionValid).toBe(false);
    expect(adjudicationAllowsLearning(result)).toBe(false);
  });

  it("material deviation requires deviationSummary in execution log", () => {
    const log: ExecutionLogInput = {
      ...baseExecutionLog(),
      executionComplianceScore: "materially_deviated",
      deviationSummary: undefined,
    };
    const result = validateExecutionLog(log);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EXEC-RULE-1"))).toBe(true);
  });
});

// ─── Scenario 9: Debt Pressure ────────────────────────────────────────────────

describe("Scenario 9: Debt pressure — high-risk action blocked without fresh cash data", () => {
  it("stale cash fields produce stale status", () => {
    const fields: InputFieldValue[] = fullFieldSet().map((f) =>
      f.field === "cash_balance" ? { ...f, freshness: "stale" as const } : f
    );
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(result.qualityStatus).toBe("stale");
  });

  it("stale high-risk-action fields block high-risk action", () => {
    const fields: InputFieldValue[] = fullFieldSet().map((f) =>
      f.field === "cash_balance" ? { ...f, freshness: "stale" as const } : f
    );
    const result = assessInputQuality({ workspaceId: WS, fields });
    expect(result.allowsHighRiskAction).toBe(false);
  });

  it("high risk decision requires approvalRequiredBy", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      riskLevel: "high",
      approvalRequiredBy: undefined,
    };
    const result = validateOwnerDecision(input);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DEC-RULE-5"))).toBe(true);
  });

  it("high risk with approvalRequiredBy passes validation", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      riskLevel: "high",
      approvalRequiredBy: "CFO",
    };
    const result = validateOwnerDecision(input);
    expect(result.valid).toBe(true);
    expect(result.requiresApprovalFields).toBe(true);
  });
});

// ─── Scenario 10: Owner Constraint ────────────────────────────────────────────

describe("Scenario 10: Owner constraint — constraint_ignored failure class", () => {
  it("ownerConstraintViolated flag produces constraint_ignored failure class", () => {
    const input: AdjudicationInput = {
      ...baseAdjudicationInput(),
      ownerConstraintViolated: true,
      successThresholdPassed: false,
    };
    const result = adjudicateFailure(input);
    expect(result.failureClass).toBe("constraint_ignored");
  });

  it("modified decision requires modifiedDescription >= 10 chars", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      decisionStatus: "modified",
      modifiedDescription: "Too short",
    };
    const result = validateOwnerDecision(input);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DEC-RULE-6"))).toBe(true);
  });

  it("modified decision with valid description allows action creation", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      decisionStatus: "modified",
      modifiedDescription: "Modified to reduce scope to top 3 customer segments only",
    };
    const result = validateOwnerDecision(input);
    expect(result.valid).toBe(true);
    expect(result.allowsActionCreation).toBe(true);
  });

  it("assertAllowsActionCreation throws when rejected decision", () => {
    const input: DecisionInput = {
      ...baseDecisionInput(),
      decisionStatus: "rejected",
    };
    const result = validateOwnerDecision(input);
    expect(result.allowsActionCreation).toBe(false);
    expect(() => assertAllowsActionCreation(result)).toThrow();
  });
});

// ─── Scenario 11: Tenant Isolation (6 functions) ─────────────────────────────

describe("Scenario 11: Tenant isolation — empty workspaceId throws in 6 functions", () => {
  it("assessInputQuality throws on empty workspaceId", () => {
    expect(() =>
      assessInputQuality({ workspaceId: "", fields: fullFieldSet() })
    ).toThrow();
  });

  it("validateRecommendation throws on empty workspaceId", () => {
    expect(() =>
      validateRecommendation({ ...baseRecommendationInput(), workspaceId: "" })
    ).toThrow();
  });

  it("validateOwnerDecision throws on empty workspaceId", () => {
    expect(() =>
      validateOwnerDecision({ ...baseDecisionInput(), workspaceId: "" })
    ).toThrow();
  });

  it("validateAction throws on empty workspaceId", () => {
    expect(() =>
      validateAction({ ...baseActionInput(), workspaceId: "" })
    ).toThrow();
  });

  it("validateOutcome throws on empty workspaceId", () => {
    expect(() =>
      validateOutcome({ ...baseOutcomeInput(), workspaceId: "" })
    ).toThrow();
  });

  it("adjudicateFailure throws on empty workspaceId", () => {
    expect(() =>
      adjudicateFailure({ ...baseAdjudicationInput(), workspaceId: "" })
    ).toThrow();
  });
});

// ─── Scenario 12: External Shock ─────────────────────────────────────────────

describe("Scenario 12: External shock — external_event_interference outcome requires description", () => {
  it("external_event_interference without description is invalid", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "external_event_interference",
      externalEventDescription: undefined,
    };
    const result = validateOutcome(input);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("OUT-RULE-2"))).toBe(true);
  });

  it("external_event_interference with description is valid but does not enable learning", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "external_event_interference",
      externalEventDescription: "COVID lockdown disrupted supply chain",
    };
    const result = validateOutcome(input);
    expect(result.valid).toBe(true);
    expect(result.enablesLearning).toBe(false);
    expect(outcomeAllowsLearning(result)).toBe(false);
  });

  it("externalEventFlagged in adjudication produces invalid_test verdict", () => {
    const input: AdjudicationInput = {
      ...baseAdjudicationInput(),
      externalEventFlagged: true,
    };
    const result = adjudicateFailure(input);
    expect(result.verdict).toBe("invalid_test");
  });

  it("external_event_contamination is hard block in learning eligibility", () => {
    const input: LearningEligibilityInput = {
      ...baseLearningEligibilityInput(),
      causalAttributionClass: "external_event_dominant",
    };
    const result = assessLearningEligibility(input);
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario 13: AI Not Verifier ────────────────────────────────────────────

describe("Scenario 13: AI not verifier — confidence caps applied without valid diagnosis", () => {
  it("computeRecommendationConfidence caps at 40 when diagnosis invalid", () => {
    const score = computeRecommendationConfidence(90, false, false);
    expect(score).toBe(40);
  });

  it("recommendation with invalid diagnosis validation gets confidence capped at 40", () => {
    const input = baseRecommendationInput();
    const fakeValidation = { valid: false, violations: ["weak evidence"] } as any;
    const result = validateRecommendation(input, fakeValidation);
    expect(result.effectiveConfidenceScore).toBeLessThanOrEqual(40);
    expect(result.allowsOwnerDecision).toBe(false);
  });

  it("assertOwnerDecisionReady throws when validation has violations", () => {
    const invalidValidation = {
      valid: false,
      violations: ["REC-RULE-1: text too short"],
      recommendationStatus: "draft" as const,
      allowsOwnerDecision: false,
      effectiveConfidenceScore: 30,
    };
    expect(() =>
      assertOwnerDecisionReady("draft", invalidValidation)
    ).toThrow();
  });

  it("not_reviewed learning eligibility does not allow learning", () => {
    const input: LearningEligibilityInput = {
      ...baseLearningEligibilityInput(),
      adjudicationCompleted: false,
      causalAttributionCompleted: false,
    };
    const result = assessLearningEligibility(input);
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Scenario 14: Repeat Customer Decline ─────────────────────────────────────

describe("Scenario 14: Repeat customer decline — did_not_work outcome, validated_failure", () => {
  it("did_not_work outcome enables learning", () => {
    expect(OUTCOME_ENABLES_LEARNING["did_not_work"]).toBe(true);
  });

  it("did_not_work outcome does not indicate harm", () => {
    expect(OUTCOME_INDICATES_HARM["did_not_work"]).toBe(false);
  });

  it("did_not_work outcome does not require adjudication and allows learning", () => {
    const input: OutcomeInput = {
      ...baseOutcomeInput(),
      outcomeStatus: "did_not_work",
    };
    const result = validateOutcome(input);
    expect(result.requiresAdjudication).toBe(false);
    expect(outcomeAllowsLearning(result)).toBe(true);
  });

  it("validated_failure adjudication enables learning", () => {
    const input: AdjudicationInput = {
      ...baseAdjudicationInput(),
      successThresholdPassed: false,
      metricWorsened: false,
    };
    const result = adjudicateFailure(input);
    expect(result.verdict).toBe("validated_failure");
    expect(adjudicationAllowsLearning(result)).toBe(true);
  });

  it("learning eligibility with validated_failure and likely_caused is eligible_high_confidence", () => {
    const input: LearningEligibilityInput = {
      ...baseLearningEligibilityInput(),
      adjudicationVerdict: "validated_failure",
    };
    const result = assessLearningEligibility(input);
    expect(result.allowsLearning).toBe(true);
    expect(result.status).toBe("eligible_high_confidence");
  });
});

// ─── Scenario 15: Dashboard No Internal Fields ────────────────────────────────

describe("Scenario 15: Dashboard field integrity — result shapes have expected fields", () => {
  it("assessInputQuality result has qualityStatus not status", () => {
    const result = assessInputQuality({ workspaceId: WS, fields: fullFieldSet() });
    expect(result).toHaveProperty("qualityStatus");
    expect(result).not.toHaveProperty("status");
  });

  it("assessInputQuality result has workspaceId scoped correctly", () => {
    const result = assessInputQuality({ workspaceId: WS, fields: fullFieldSet() });
    expect(result.workspaceId).toBe(WS);
    expect(result.assessedBy).toBe("InputQualityService");
  });

  it("OutcomeValidationResult has absoluteChange and percentageChange computed", () => {
    const result = validateOutcome(baseOutcomeInput());
    expect(result.absoluteChange).toBe(60);
    expect(result.percentageChange).toBe(30);
  });

  it("AdjudicationResult has learningEligible field", () => {
    const result = adjudicateFailure(baseAdjudicationInput());
    expect(result).toHaveProperty("learningEligible");
    expect(result).toHaveProperty("requiresReassessment");
  });

  it("LearningEligibilityResult has allowsLearning field", () => {
    const result = assessLearningEligibility(baseLearningEligibilityInput());
    expect(result).toHaveProperty("allowsLearning");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("rejectionReasons");
    expect(result).toHaveProperty("isTerminalRejection");
  });

  it("ExecutionLogValidationResult has allowsLearning and downgradedConfidence", () => {
    const result = validateExecutionLog(baseExecutionLog());
    expect(result).toHaveProperty("allowsLearning");
    expect(result).toHaveProperty("downgradedConfidence");
    expect(result).toHaveProperty("downgradeReasons");
  });

  it("action status transitions are deterministic: pending → in_progress allowed", () => {
    expect(isActionStatusTransitionAllowed("pending", "in_progress")).toBe(true);
    expect(isActionStatusTransitionAllowed("completed", "pending")).toBe(false);
  });

  it("conflicting field values produce conflicting quality status", () => {
    const fieldsWithConflict: InputFieldValue[] = fullFieldSet().map((f) =>
      f.field === "revenue"
        ? { ...f, conflictingValue: 300000 }
        : f
    );
    const result = assessInputQuality({ workspaceId: WS, fields: fieldsWithConflict });
    expect(result.qualityStatus).toBe("conflicting");
    expect(result.conflictFields).toContain("revenue");
    expect(result.allowsStrongRecommendation).toBe(false);
  });
});

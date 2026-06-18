/**
 * Phase 24 — Full-Loop Validation Suite
 *
 * Proves the complete Owner Mode Reality Loop end-to-end across all scenario types.
 * No database calls. Pure domain logic only.
 *
 * Loop sequence:
 * input quality → recommendation → owner decision → action → evidence verification →
 * outcome → harm tracking → adjudication → causal attribution →
 * reassessment → learning eligibility → decision memory →
 * business timeline → dashboard proof
 */

import { describe, it, expect } from "vitest";

import {
  assessInputQuality,
  assertAllowsStrongRecommendation,
  type InputFieldValue,
} from "@/domain/owner-mode/input-quality";
import {
  validateRecommendation,
  assertOwnerDecisionReady,
} from "@/domain/owner-mode/recommendation-tracking";
import {
  validateOwnerDecision,
  assertAllowsActionCreation,
} from "@/domain/owner-mode/owner-decision";
import {
  validateAction,
  validateExecutionLog,
} from "@/domain/owner-mode/action-tracking";
import {
  validateEvidenceVerification,
  verificationAllowsLearning,
  ownerStatementRequiresCorroboration,
  AI_IS_NOT_A_VERIFIER,
  AI_VERIFIER_TYPES,
} from "@/domain/owner-mode/evidence-verification";
import {
  validateOutcome,
  outcomeAllowsLearning,
} from "@/domain/owner-mode/outcome-tracking";
import {
  validateHarmEvent,
  harmAllowsLearning,
} from "@/domain/owner-mode/harm-tracking";
import {
  adjudicateFailure,
  adjudicationAllowsLearning,
} from "@/domain/owner-mode/failure-adjudication";
import {
  classifyCausalAttribution,
  attributionAllowsLearning,
} from "@/domain/owner-mode/causal-attribution";
import { initiateReassessment } from "@/domain/owner-mode/reassessment";
import {
  assessLearningEligibility,
  learningIsAdmissible,
} from "@/domain/owner-mode/learning-eligibility";
import {
  recordDecisionMemory,
  repeatIsPermitted,
} from "@/domain/owner-mode/decision-memory";
import {
  validateBusinessStateSnapshot,
  analyzeBusinessTrend,
} from "@/domain/owner-mode/business-state-timeline";
import { buildOwnerLoopDashboard } from "@/domain/owner-mode/owner-dashboard";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";
const REC_ID = "rec-001";
const ACTION_ID = "action-001";

// Helper: build a complete input field set
function coreFields(): InputFieldValue[] {
  return [
    { field: "revenue", value: 280000, isEstimate: false, freshness: "current" },
    { field: "gross_margin", value: 72000, isEstimate: false, freshness: "current" },
    { field: "net_profit", value: 18000, isEstimate: false, freshness: "current" },
    { field: "cash_balance", value: 45000, isEstimate: false, freshness: "current" },
    { field: "cash_runway", value: 90, isEstimate: false, freshness: "current" },
  ];
}

// ─── SCENARIO 1: Successful intervention — full happy path ────────────────────

describe("Full-Loop Scenario 1: Successful supplier renegotiation (happy path)", () => {
  // Step 1: Input Quality
  const inputResult = assessInputQuality({
    workspaceId: WS,
    fields: coreFields(),
  });

  it("Step 1: input quality — sufficient for strong recommendation", () => {
    expect(["complete", "partial"]).toContain(inputResult.status);
    expect(() => assertAllowsStrongRecommendation(inputResult)).not.toThrow();
  });

  // Step 2: Recommendation
  const recResult = validateRecommendation({
    workspaceId: WS,
    businessId: BIZ,
    ownerUserId: "owner-001",
    recommendationText:
      "Renegotiate supplier contract to reduce COGS by 8%. Gross margin at 25.7%, below 30% target. Supplier contract renewal due in 4 weeks.",
    recommendationType: "tactical",
    priorityRank: 1,
    expectedOutcomeSummary:
      "Gross margin improves from 25.7% to 27.5% within 45 days of new terms.",
    targetMetricName: "gross_margin",
    targetDirection: "increase",
    confidenceScore: 0.8,
    confidenceReason:
      "Historical supplier data shows 8% reduction achievable at current volume levels.",
  });

  it("Step 2: recommendation validates successfully", () => {
    expect(recResult.valid).toBe(true);
    expect(recResult.violations).toHaveLength(0);
  });

  it("Step 2: recommendation is ready for owner decision", () => {
    expect(() => assertOwnerDecisionReady(recResult)).not.toThrow();
  });

  // Step 3: Owner Decision
  const decisionResult = validateOwnerDecision({
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: REC_ID,
    ownerUserId: "owner-001",
    decisionStatus: "approved",
    decisionReason:
      "Supplier has indicated willingness to negotiate. Timing aligns with contract renewal. Accepting recommendation.",
    riskLevel: "low",
    verificationStatus: "verified",
  });

  it("Step 3: owner decision is valid approved decision", () => {
    expect(decisionResult.valid).toBe(true);
  });

  it("Step 3: approved decision allows action creation", () => {
    expect(() => assertAllowsActionCreation(decisionResult)).not.toThrow();
  });

  // Step 4: Action
  const actionResult = validateAction({
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: REC_ID,
    actionTitle: "Negotiate 8% COGS reduction with primary supplier",
    actionSteps: [
      "Schedule meeting with supplier account manager",
      "Present volume commitment offer",
      "Target 8% unit cost reduction effective next month",
    ],
    dueAt: new Date(Date.now() + 30 * 86400 * 1000),
  });

  it("Step 4: action validates successfully", () => {
    expect(actionResult.valid).toBe(true);
    expect(actionResult.violations).toHaveLength(0);
  });

  // Step 5: Execution Log
  const execLog = validateExecutionLog({
    workspaceId: WS,
    businessId: BIZ,
    actionId: ACTION_ID,
    completedSteps: 3,
    totalSteps: 3,
    notes:
      "Met with supplier 2025-09-15. Agreed to 7% reduction on core SKUs effective 2025-10-01. Written agreement received.",
  });

  it("Step 5: execution log is valid with high completion", () => {
    expect(execLog.valid).toBe(true);
    expect(execLog.completionRate).toBeCloseTo(100);
  });

  // Step 6: Evidence Verification
  const evResult = validateEvidenceVerification({
    workspaceId: WS,
    businessId: BIZ,
    evidenceId: "evidence-001",
    verifierType: "accountant",
    verificationMethod: "document_review",
    verificationReason:
      "Three consecutive supplier invoices confirmed 7% price reduction versus September baseline.",
    sourceType: "supplier_invoice",
    confidenceLevel: "high",
    hasCorroboratingSource: true,
  });

  it("Step 6: evidence verification passes with high confidence", () => {
    expect(evResult.valid).toBe(true);
    expect(evResult.confidenceLevel).toBe("high");
    expect(verificationAllowsLearning(evResult)).toBe(true);
  });

  // Step 7: Outcome
  const outcomeResult = validateOutcome({
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: REC_ID,
    actionId: ACTION_ID,
    outcomeStatus: "positive",
    ownerReportedResult:
      "Gross margin improved from 25.7% to 27.4% within 45 days. COGS reduced 7%.",
    actualMetricName: "gross_margin",
    beforeValue: 72000,
    afterValue: 76720,
    evidenceQuality: "strong",
    externalEventFlag: false,
  });

  it("Step 7: outcome is positive", () => {
    expect(outcomeResult.valid).toBe(true);
    expect(outcomeAllowsLearning(outcomeResult)).toBe(true);
  });

  // Step 8: Adjudication (success — no failure to adjudicate, but run the gate)
  const adjResult = adjudicateFailure({
    workspaceId: WS,
    businessId: BIZ,
    actionId: ACTION_ID,
    recommendationId: REC_ID,
    actionNotExecuted: false,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    externalEventFlagged: false,
    ownerConstraintViolated: false,
    metricWorsened: false,
    successThresholdPassed: true,
    adjudicationReason:
      "Action executed as planned. Evidence verified by accountant. Gross margin improved as targeted.",
  });

  it("Step 8: adjudication verdict is validated_success", () => {
    expect(adjResult.valid).toBe(true);
    expect(adjResult.verdict).toBe("validated_success");
    expect(adjudicationAllowsLearning(adjResult)).toBe(true);
  });

  // Step 9: Causal Attribution
  const attrResult = classifyCausalAttribution({
    workspaceId: WS,
    businessId: BIZ,
    actionId: ACTION_ID,
    recommendationId: REC_ID,
    attributionClass: "likely_caused",
    hasTemporalProximity: true,
    hasControlledComparison: false,
    hasOwnerTestimony: true,
    hasExternalEventDuringPeriod: false,
    hasConfoundingFactors: false,
    attributionReason:
      "Supplier invoices confirm price reduction. Margin improvement directly follows renegotiation. No external events or confounds during period.",
  });

  it("Step 9: attribution is likely_caused — verified causal link", () => {
    expect(attrResult.valid).toBe(true);
    expect(attrResult.attributionClass).toBe("likely_caused");
    expect(attrResult.hasVerifiedCausalLink).toBe(true);
    expect(attributionAllowsLearning(attrResult)).toBe(true);
  });

  // Step 10: Learning Eligibility
  const eligibilityResult = assessLearningEligibility({
    workspaceId: WS,
    businessId: BIZ,
    actionId: ACTION_ID,
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
    hasPrivacyControls: false,
    broadImpactScope: false,
    eligibilityNotes:
      "Full loop complete. Evidence verified. Adjudication validated success. Causal link confirmed.",
  });

  it("Step 10: learning eligibility is high confidence", () => {
    expect(eligibilityResult.valid).toBe(true);
    expect(learningIsAdmissible(eligibilityResult)).toBe(true);
  });

  // Step 11: Decision Memory
  const memoryResult = recordDecisionMemory({
    workspaceId: WS,
    businessId: BIZ,
    actionId: ACTION_ID,
    category: "successful_action",
    summary:
      "Supplier renegotiation achieved 7% COGS reduction within 45 days. Gross margin improved from 25.7% to 27.4%.",
    contextSnapshot:
      "Q3 2025. Gross margin below 30% target. Supplier contract renewal due. Owner accepted tactical renegotiation recommendation.",
    isRepeatAttempt: false,
  });

  it("Step 11: decision memory recorded with learning signal", () => {
    expect(memoryResult.valid).toBe(true);
    expect(memoryResult.carriesLearningSignal).toBe(true);
    expect(memoryResult.blocksRepetition).toBe(false);
  });

  // Step 12: Business Timeline
  const snapshotResult = validateBusinessStateSnapshot({
    workspaceId: WS,
    businessId: BIZ,
    periodLabel: "2025-Q4",
    metrics: [
      { metricName: "gross_profit", value: 76720, periodLabel: "2025-Q4" },
      { metricName: "revenue", value: 280000, periodLabel: "2025-Q4" },
    ],
  });

  it("Step 12: business snapshot validates for Q4", () => {
    expect(snapshotResult.valid).toBe(true);
    expect(snapshotResult.metricsRecorded).toBe(2);
  });

  // Step 13: Dashboard proof
  const dashView = buildOwnerLoopDashboard({
    workspaceId: WS,
    businessId: BIZ,
    periodLabel: "2025-Q4",
    inputQuality: "complete",
    diagnosis: "complete",
    recommendation: "complete",
    ownerDecision: "complete",
    action: "complete",
    evidence: "complete",
    outcomeStatus: "complete",
    adjudication: "complete",
    reassessment: "not_applicable",
    learningEligibility: "complete",
    activeRecommendationSummary: "Supplier renegotiation complete. COGS reduced by 7%.",
    reassessmentRequired: false,
    ownerDecisionPending: false,
    harmFlagged: false,
  });

  it("Step 13: dashboard — full loop complete, no owner attention required", () => {
    expect(dashView.valid).toBe(true);
    expect(dashView.requiresOwnerAttention).toBe(false);
    expect(dashView.harmFlagged).toBe(false);
  });

  it("Full happy-path loop: all 13 gates pass end-to-end", () => {
    expect(inputResult.status).not.toBe("critical_missing");
    expect(recResult.valid).toBe(true);
    expect(decisionResult.valid).toBe(true);
    expect(actionResult.valid).toBe(true);
    expect(execLog.valid).toBe(true);
    expect(evResult.valid).toBe(true);
    expect(outcomeResult.valid).toBe(true);
    expect(adjResult.verdict).toBe("validated_success");
    expect(attrResult.attributionClass).toBe("likely_caused");
    expect(learningIsAdmissible(eligibilityResult)).toBe(true);
    expect(memoryResult.valid).toBe(true);
    expect(snapshotResult.valid).toBe(true);
    expect(dashView.valid).toBe(true);
  });
});

// ─── SCENARIO 2: Cash crisis — high revenue / low profit ─────────────────────

describe("Full-Loop Scenario 2: Cash crisis — revenue rising, cash falling", () => {
  it("detects cash_falling_sales_rising and revenue_up_profit_down trend alerts", () => {
    const trendResult = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "revenue", value: 320000, periodLabel: "2025-Q3" },
        { metricName: "cash_balance", value: 28000, periodLabel: "2025-Q3" },
        { metricName: "gross_profit", value: 60000, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "revenue", value: 280000, periodLabel: "2025-Q2" },
        { metricName: "cash_balance", value: 52000, periodLabel: "2025-Q2" },
        { metricName: "gross_profit", value: 72000, periodLabel: "2025-Q2" },
      ],
    });
    expect(trendResult.valid).toBe(true);
    const alerts = trendResult.trendAlerts.map((a) => a.alertType);
    expect(alerts).toContain("cash_falling_sales_rising");
    expect(alerts).toContain("revenue_up_profit_down");
    const cashAlert = trendResult.trendAlerts.find((a) => a.alertType === "cash_falling_sales_rising");
    expect(cashAlert?.severity).toBe("critical");
  });

  it("dashboard shows owner decision pending for cash crisis", () => {
    const dashView = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "complete",
      diagnosis: "complete",
      recommendation: "complete",
      ownerDecision: "requires_owner_action",
      action: "not_applicable",
      evidence: "not_applicable",
      outcomeStatus: "not_applicable",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "not_applicable",
      businessTrendWarnings: [
        "Cash balance falling despite rising revenue — check collections and expenses.",
        "Revenue rising but gross profit falling — margin compression detected.",
      ],
      ownerAttentionItems: ["Cash crisis alert: immediate owner review required."],
      reassessmentRequired: false,
      ownerDecisionPending: true,
      harmFlagged: false,
    });
    expect(dashView.valid).toBe(true);
    expect(dashView.businessTrendWarnings).toHaveLength(2);
    expect(dashView.requiresOwnerAttention).toBe(true);
  });
});

// ─── SCENARIO 3: High leads / low conversion ─────────────────────────────────

describe("Full-Loop Scenario 3: High leads, low conversion — lead quality failure", () => {
  it("detects leads_up_conversion_down trend alert", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "leads", value: 420, periodLabel: "2025-Q3" },
        { metricName: "conversion_rate", value: 3.2, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "leads", value: 280, periodLabel: "2025-Q2" },
        { metricName: "conversion_rate", value: 6.8, periodLabel: "2025-Q2" },
      ],
    });
    const alertTypes = trend.trendAlerts.map((a) => a.alertType);
    expect(alertTypes).toContain("leads_up_conversion_down");
  });

  it("marketing spend rising + CAC worsening triggers warning", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "marketing_spend", value: 18000, periodLabel: "2025-Q3" },
        { metricName: "cost_per_acquisition", value: 240, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "marketing_spend", value: 12000, periodLabel: "2025-Q2" },
        { metricName: "cost_per_acquisition", value: 180, periodLabel: "2025-Q2" },
      ],
    });
    const alertTypes = trend.trendAlerts.map((a) => a.alertType);
    expect(alertTypes).toContain("marketing_spend_up_cac_worsening");
  });
});

// ─── SCENARIO 4: Pricing action failure — harmful outcome ────────────────────

describe("Full-Loop Scenario 4: Pricing action failure — harm, adjudication, do-not-repeat", () => {
  // Outcome negative
  const outcomeResult = validateOutcome({
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-price-001",
    actionId: "action-price-001",
    outcomeStatus: "negative",
    ownerReportedResult:
      "15% price increase caused 18% churn spike within 30 days. Revenue declined despite higher unit price.",
    actualMetricName: "churn",
    beforeValue: 5.2,
    afterValue: 23.4,
    evidenceQuality: "strong",
    externalEventFlag: false,
  });

  it("Step 1: negative outcome does not allow learning directly", () => {
    expect(outcomeResult.valid).toBe(true);
    expect(outcomeAllowsLearning(outcomeResult)).toBe(false);
  });

  // Harm event
  const harmResult = validateHarmEvent({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    outcomeId: "outcome-price-001",
    harmCategory: "customer_loss",
    harmSeverity: "high",
    harmAmountEstimate: 52000,
    harmMetric: "revenue_lost",
    harmDescription:
      "18% churn spike within 30 days of 15% price increase. Estimated 52,000 revenue loss over 90 days. Partial recovery possible through win-back campaign.",
    reversibility: "partial",
  });

  it("Step 2: high severity harm requires human review", () => {
    expect(harmResult.valid).toBe(true);
    expect(harmResult.requiresHumanReview).toBe(true);
    expect(harmAllowsLearning(harmResult)).toBe(false);
  });

  // Adjudication
  const adjResult = adjudicateFailure({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    recommendationId: "rec-price-001",
    actionNotExecuted: false,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    externalEventFlagged: false,
    ownerConstraintViolated: false,
    metricWorsened: true,
    successThresholdPassed: false,
    adjudicationReason:
      "Price elasticity not modelled. NPS declining before action. Recommendation flawed — churn risk not adequately assessed.",
  });

  it("Step 3: adjudication triggers reassessment", () => {
    expect(adjResult.valid).toBe(true);
    expect(adjResult.requiresReassessment).toBe(true);
    expect(adjudicationAllowsLearning(adjResult)).toBe(true);
  });

  // Causal Attribution
  const attrResult = classifyCausalAttribution({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    attributionClass: "likely_caused",
    hasTemporalProximity: true,
    hasControlledComparison: false,
    hasOwnerTestimony: true,
    hasExternalEventDuringPeriod: false,
    hasConfoundingFactors: false,
    attributionReason:
      "Churn spike began within 14 days of price announcement. No external events coincide. Customer exit survey cites price as primary reason.",
  });

  it("Step 4: attribution is likely_caused — action caused the harm", () => {
    expect(attrResult.valid).toBe(true);
    expect(attrResult.attributionClass).toBe("likely_caused");
    expect(attrResult.hasVerifiedCausalLink).toBe(true);
  });

  // Reassessment
  const reassessResult = initiateReassessment({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    triggerDescription:
      "High-severity harm confirmed. Pricing model assumptions must be revisited. Customer price sensitivity was underestimated.",
    trigger: "harmful_outcome",
    ownerAcknowledged: true,
    assumptionsChecked: true,
    invalidatedAssumptions: [
      "Customer price sensitivity assumed low based on prior segment data",
      "NPS floor assumed stable — was already declining before price action",
    ],
    proposedCorrectiveActionClass: "diagnosis_revision",
    correctiveActionRationale:
      "Pricing model must be rebuilt with updated elasticity data and NPS threshold constraints.",
  });

  it("Step 5: reassessment triggered for harmful outcome — requires human review", () => {
    expect(reassessResult.valid).toBe(true);
    expect(reassessResult.requiresHumanReview).toBe(true);
    expect(reassessResult.reopensDiagnosis).toBe(true);
  });

  // Learning Eligibility — harm routes to human_review_pending
  const eligResult = assessLearningEligibility({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    actionWasExecuted: true,
    executionMateriallyDeviated: false,
    hasVerifiedEvidence: true,
    measurementPeriodComplete: true,
    adjudicationCompleted: true,
    adjudicationVerdict: "reassessment_required",
    causalAttributionCompleted: true,
    causalAttributionClass: "likely_caused",
    harmSeverity: "high",
    isOwnerOpinionOnly: false,
    hasContradictoryEvidence: false,
    hasPrivacyControls: false,
    broadImpactScope: false,
    eligibilityNotes:
      "High-severity harm confirmed. Pending human review before learning can proceed.",
  });

  it("Step 6: harm routes eligibility to human_review_pending", () => {
    expect(eligResult.valid).toBe(true);
    expect(eligResult.status).toBe("human_review_pending");
    expect(learningIsAdmissible(eligResult)).toBe(false);
  });

  // Decision Memory — do_not_repeat
  const memResult = recordDecisionMemory({
    workspaceId: WS,
    businessId: BIZ,
    actionId: "action-price-001",
    category: "do_not_repeat",
    summary:
      "Do not retry aggressive price increases above 12% without price-elasticity modelling and NPS floor check.",
    contextSnapshot:
      "Q2 2025. Post-price-increase churn review. 18% churn spike within 30 days of 15% price hike.",
    doNotRepeatReason:
      "18% churn increase within 30 days — customers highly price-sensitive. Existing NPS decline not factored into model.",
    isRepeatAttempt: false,
  });

  it("Step 7: do_not_repeat memory recorded — blocks repetition", () => {
    expect(memResult.valid).toBe(true);
    expect(memResult.blocksRepetition).toBe(true);
    expect(memResult.carriesLearningSignal).toBe(true);
  });

  // Dashboard shows harm flag + reassessment required
  const dashView = buildOwnerLoopDashboard({
    workspaceId: WS,
    businessId: BIZ,
    periodLabel: "2025-Q3",
    inputQuality: "complete",
    diagnosis: "complete",
    recommendation: "complete",
    ownerDecision: "complete",
    action: "complete",
    evidence: "complete",
    outcomeStatus: "complete",
    adjudication: "complete",
    reassessment: "in_progress",
    learningEligibility: "in_progress",
    reassessmentRequired: true,
    ownerDecisionPending: false,
    harmFlagged: true,
    ownerAttentionItems: ["High-severity harm confirmed. Reassessment in progress. Owner review required."],
  });

  it("Step 8: dashboard shows harm flag and reassessment required", () => {
    expect(dashView.valid).toBe(true);
    expect(dashView.harmFlagged).toBe(true);
    expect(dashView.reassessmentRequired).toBe(true);
    expect(dashView.requiresOwnerAttention).toBe(true);
  });
});

// ─── SCENARIO 5: Missing data — abstention ───────────────────────────────────

describe("Full-Loop Scenario 5: Missing data — recommendation abstention", () => {
  it("insufficient input blocks strong recommendation", () => {
    const inputResult = assessInputQuality({
      workspaceId: WS,
      fields: [
        { field: "revenue", value: 280000, isEstimate: false, freshness: "current" },
        // Missing gross_margin, net_profit, cash_balance, cash_runway
      ],
    });
    expect(() => assertAllowsStrongRecommendation(inputResult)).toThrow();
  });

  it("dashboard shows missing_data stages correctly", () => {
    const dashView = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "missing_data",
      diagnosis: "pending",
      recommendation: "missing_data",
      ownerDecision: "not_applicable",
      action: "not_applicable",
      evidence: "not_applicable",
      outcomeStatus: "not_applicable",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "not_applicable",
      reassessmentRequired: false,
      ownerDecisionPending: false,
      harmFlagged: false,
    });
    expect(dashView.missingDataStages).toContain("Input Quality");
    expect(dashView.missingDataStages).toContain("Recommendation");
  });
});

// ─── SCENARIO 6: Repeat attempt with changed context ─────────────────────────

describe("Full-Loop Scenario 6: Repeat attempt of previously failed action", () => {
  it("do_not_repeat blocks repeat without changed context explanation", () => {
    expect(repeatIsPermitted("do_not_repeat", undefined)).toBe(false);
    expect(repeatIsPermitted("do_not_repeat", "slight change")).toBe(false);
  });

  it("repeat allowed with adequate changed context explanation", () => {
    expect(
      repeatIsPermitted(
        "do_not_repeat",
        "Situation changed: new elasticity model shows 5% increase safe for premium segment only. NPS now at 48 vs 30 at time of original failure."
      )
    ).toBe(true);
  });

  it("repeat attempt records with priorMemoryId + changed context", () => {
    const result = recordDecisionMemory({
      workspaceId: WS,
      businessId: BIZ,
      actionId: "action-price-002",
      category: "failed_action",
      summary:
        "Retry of pricing action with 5% increase applied to premium segment only after elasticity re-modelling.",
      contextSnapshot:
        "Q4 2025. NPS recovered to 48. New elasticity model available. Premium segment sensitivity confirmed lower.",
      isRepeatAttempt: true,
      priorMemoryId: "mem-price-failure-001",
      changedContextExplanation:
        "New elasticity model with segment data. Premium segment tested separately. NPS floor confirmed at 45+.",
    });
    expect(result.valid).toBe(true);
    expect(result.repeatAllowed).toBe(true);
  });
});

// ─── SCENARIO 7: Staff productivity failure ───────────────────────────────────

describe("Full-Loop Scenario 7: Staff count rising, productivity falling", () => {
  it("detects staff_up_productivity_down alert", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "staff_count", value: 18, periodLabel: "2025-Q3" },
        { metricName: "staff_productivity", value: 14200, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "staff_count", value: 14, periodLabel: "2025-Q2" },
        { metricName: "staff_productivity", value: 18000, periodLabel: "2025-Q2" },
      ],
    });
    const alertTypes = trend.trendAlerts.map((a) => a.alertType);
    expect(alertTypes).toContain("staff_up_productivity_down");
  });
});

// ─── SCENARIO 8: Partial execution — compliance deviation ────────────────────

describe("Full-Loop Scenario 8: Partial execution — material deviation from plan", () => {
  it("partial execution log captures low completion rate", () => {
    const execLog = validateExecutionLog({
      workspaceId: WS,
      businessId: BIZ,
      actionId: "action-partial-001",
      completedSteps: 1,
      totalSteps: 4,
      notes:
        "Only 1 of 4 planned supplier meetings completed. Remaining 3 cancelled due to owner travel schedule.",
    });
    expect(execLog.valid).toBe(true);
    expect(execLog.completionRate).toBeCloseTo(25);
  });

  it("material deviation adjudication returns invalid_test verdict", () => {
    const adjResult = adjudicateFailure({
      workspaceId: WS,
      businessId: BIZ,
      actionId: "action-partial-001",
      actionNotExecuted: false,
      executionMateriallyDeviated: true,
      hasVerifiedEvidence: false,
      measurementPeriodComplete: false,
      externalEventFlagged: false,
      ownerConstraintViolated: false,
      metricWorsened: false,
      successThresholdPassed: false,
      adjudicationReason:
        "Only 25% of planned steps executed. Owner cancelled majority of planned meetings. Cannot attribute outcome to recommendation.",
    });
    expect(adjResult.valid).toBe(true);
    expect(adjResult.verdict).toBe("invalid_test");
    expect(adjudicationAllowsLearning(adjResult)).toBe(false);
  });
});

// ─── SCENARIO 9: Debt pressure growing faster than cash ──────────────────────

describe("Full-Loop Scenario 9: Debt growing faster than cash", () => {
  it("detects debt_growing_faster_than_cash critical alert", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "debt", value: 180000, periodLabel: "2025-Q3" },
        { metricName: "cash_balance", value: 32000, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "debt", value: 120000, periodLabel: "2025-Q2" },
        { metricName: "cash_balance", value: 45000, periodLabel: "2025-Q2" },
      ],
    });
    const alert = trend.trendAlerts.find((a) => a.alertType === "debt_growing_faster_than_cash");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("critical");
  });
});

// ─── SCENARIO 10: Owner constraint — blocks repeat ────────────────────────────

describe("Full-Loop Scenario 10: Owner constraint blocks headcount reduction", () => {
  it("owner_constraint memory blocks repetition", () => {
    const result = recordDecisionMemory({
      workspaceId: WS,
      businessId: BIZ,
      category: "owner_constraint",
      summary:
        "Owner will not reduce headcount below 12 employees for operational continuity and morale.",
      contextSnapshot:
        "Current staff at 14. Minimum viable operations require 12. Owner has stated this is non-negotiable.",
      isRepeatAttempt: false,
    });
    expect(result.valid).toBe(true);
    expect(result.blocksRepetition).toBe(true);
    expect(result.carriesLearningSignal).toBe(false);
  });

  it("dashboard with owner decision pending requires ownerAttentionItems", () => {
    const dashView = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "complete",
      diagnosis: "complete",
      recommendation: "complete",
      ownerDecision: "requires_owner_action",
      action: "not_applicable",
      evidence: "not_applicable",
      outcomeStatus: "not_applicable",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "not_applicable",
      ownerDecisionPending: true,
      reassessmentRequired: false,
      harmFlagged: false,
      ownerAttentionItems: ["Recommendation ready — your decision is required before action can proceed."],
    });
    expect(dashView.valid).toBe(true);
    expect(dashView.ownerDecisionPending).toBe(true);
    expect(dashView.requiresOwnerAttention).toBe(true);
  });
});

// ─── SCENARIO 11: Tenant isolation ───────────────────────────────────────────

describe("Full-Loop Scenario 11: Tenant isolation — wrong workspace throws at every loop stage", () => {
  it("assessInputQuality throws for empty workspaceId", () => {
    expect(() =>
      assessInputQuality({ workspaceId: "", fields: coreFields() })
    ).toThrow();
  });

  it("validateRecommendation throws for whitespace workspaceId", () => {
    expect(() =>
      validateRecommendation({
        workspaceId: "   ",
        businessId: BIZ,
        ownerUserId: "owner-001",
        recommendationText: "Cut costs by reducing supplier spend across all product lines.",
        recommendationType: "tactical",
        priorityRank: 1,
        expectedOutcomeSummary: "Net margin improves by 3% within 60 days.",
        confidenceScore: 0.7,
        confidenceReason: "Historical data supports 3% margin gain from supplier consolidation.",
      })
    ).toThrow();
  });

  it("validateOutcome throws for empty workspaceId", () => {
    expect(() =>
      validateOutcome({
        workspaceId: "",
        businessId: BIZ,
        outcomeStatus: "positive",
        ownerReportedResult: "Costs reduced as planned — margin improved by 3% within 60 days.",
        evidenceQuality: "strong",
      })
    ).toThrow();
  });

  it("adjudicateFailure throws for empty workspaceId", () => {
    expect(() =>
      adjudicateFailure({
        workspaceId: "",
        businessId: BIZ,
        actionNotExecuted: false,
        executionMateriallyDeviated: false,
        hasVerifiedEvidence: true,
        measurementPeriodComplete: true,
        externalEventFlagged: false,
        ownerConstraintViolated: false,
        metricWorsened: false,
        successThresholdPassed: true,
        adjudicationReason: "All signals positive — validated success confirmed by accountant review.",
      })
    ).toThrow();
  });

  it("assessLearningEligibility throws for empty workspaceId", () => {
    expect(() =>
      assessLearningEligibility({
        workspaceId: "",
        businessId: BIZ,
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
        hasPrivacyControls: false,
        broadImpactScope: false,
        eligibilityNotes: "Full loop complete.",
      })
    ).toThrow();
  });

  it("buildOwnerLoopDashboard throws for empty workspaceId", () => {
    expect(() =>
      buildOwnerLoopDashboard({
        workspaceId: "",
        businessId: BIZ,
        periodLabel: "2025-Q3",
        inputQuality: "complete",
        diagnosis: "complete",
        recommendation: "complete",
        ownerDecision: "complete",
        action: "complete",
        evidence: "complete",
        outcomeStatus: "complete",
        adjudication: "not_applicable",
        reassessment: "not_applicable",
        learningEligibility: "complete",
        reassessmentRequired: false,
        ownerDecisionPending: false,
        harmFlagged: false,
      })
    ).toThrow();
  });
});

// ─── SCENARIO 12: External market shock — confounded attribution ──────────────

describe("Full-Loop Scenario 12: External market shock — attribution confounded", () => {
  it("confounded attribution requires human review", () => {
    const attrResult = classifyCausalAttribution({
      workspaceId: WS,
      businessId: BIZ,
      actionId: "action-shock-001",
      attributionClass: "confounded",
      hasTemporalProximity: true,
      hasControlledComparison: false,
      hasOwnerTestimony: false,
      hasExternalEventDuringPeriod: true,
      hasConfoundingFactors: true,
      attributionReason:
        "National supply chain disruption during action period — industry-wide revenue impact coincides with intervention.",
      confoundingNotes: "External supply chain event affects all competitors simultaneously.",
    });
    expect(attrResult.valid).toBe(true);
    expect(attrResult.requiresHumanReview).toBe(true);
    expect(attributionAllowsLearning(attrResult)).toBe(false);
  });

  it("external_event_dominant attribution blocks learning", () => {
    const attrResult = classifyCausalAttribution({
      workspaceId: WS,
      businessId: BIZ,
      actionId: "action-ext-001",
      attributionClass: "external_event_dominant",
      hasTemporalProximity: true,
      hasControlledComparison: false,
      hasOwnerTestimony: true,
      hasExternalEventDuringPeriod: true,
      hasConfoundingFactors: false,
      attributionReason:
        "Industry-wide input cost spike of 35% during measurement period. All competitors experienced same impact regardless of actions taken.",
    });
    expect(attrResult.valid).toBe(true);
    expect(attrResult.blocksLearning).toBe(true);
    expect(attributionAllowsLearning(attrResult)).toBe(false);
  });
});

// ─── SCENARIO 13: Unverified evidence — AI not a verifier ────────────────────

describe("Full-Loop Scenario 13: AI cannot be evidence verifier", () => {
  it("AI_IS_NOT_A_VERIFIER constant is enforced", () => {
    expect(AI_IS_NOT_A_VERIFIER).toBe(true);
  });

  it("AI_VERIFIER_TYPES is empty — AI cannot verify", () => {
    expect(AI_VERIFIER_TYPES).toHaveLength(0);
  });

  it("owner_statement source requires corroboration", () => {
    expect(ownerStatementRequiresCorroboration("owner_statement")).toBe(true);
    expect(ownerStatementRequiresCorroboration("supplier_invoice")).toBe(false);
    expect(ownerStatementRequiresCorroboration("third_party_report")).toBe(false);
  });
});

// ─── SCENARIO 14: Repeat customer decline ────────────────────────────────────

describe("Full-Loop Scenario 14: New customers rising, repeat rate falling", () => {
  it("detects new_customers_up_repeat_down warning", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "customer_count", value: 340, periodLabel: "2025-Q3" },
        { metricName: "repeat_customer_rate", value: 28.4, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "customer_count", value: 280, periodLabel: "2025-Q2" },
        { metricName: "repeat_customer_rate", value: 41.2, periodLabel: "2025-Q2" },
      ],
    });
    const alertTypes = trend.trendAlerts.map((a) => a.alertType);
    expect(alertTypes).toContain("new_customers_up_repeat_down");
  });

  it("complaints rising triggers early churn warning", () => {
    const trend = analyzeBusinessTrend({
      workspaceId: WS,
      businessId: BIZ,
      currentPeriod: [
        { metricName: "complaints", value: 48, periodLabel: "2025-Q3" },
      ],
      previousPeriod: [
        { metricName: "complaints", value: 21, periodLabel: "2025-Q2" },
      ],
    });
    const alertTypes = trend.trendAlerts.map((a) => a.alertType);
    expect(alertTypes).toContain("complaints_up_before_churn");
  });
});

// ─── SCENARIO 15: DASHBOARD-RULE-3: internal fields must not leak ────────────

describe("Full-Loop Scenario 15: Dashboard — no internal field names in owner text", () => {
  it("rejects adjudication_verdict in recommendation summary", () => {
    const view = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "complete",
      diagnosis: "complete",
      recommendation: "complete",
      ownerDecision: "complete",
      action: "complete",
      evidence: "complete",
      outcomeStatus: "complete",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "complete",
      activeRecommendationSummary: "Check adjudication_verdict field for outcome classification.",
      reassessmentRequired: false,
      ownerDecisionPending: false,
      harmFlagged: false,
    });
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("rejects learning_confidence in attention items", () => {
    const view = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "complete",
      diagnosis: "complete",
      recommendation: "complete",
      ownerDecision: "complete",
      action: "complete",
      evidence: "complete",
      outcomeStatus: "complete",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "complete",
      ownerDecisionPending: true,
      ownerAttentionItems: ["learning_confidence score is 0.85 — ready for admission."],
      reassessmentRequired: false,
      harmFlagged: false,
    });
    expect(view.valid).toBe(false);
    expect(view.violations.some((v) => v.includes("DASHBOARD-RULE-3"))).toBe(true);
  });

  it("clean owner-facing text passes dashboard validation", () => {
    const view = buildOwnerLoopDashboard({
      workspaceId: WS,
      businessId: BIZ,
      periodLabel: "2025-Q3",
      inputQuality: "complete",
      diagnosis: "complete",
      recommendation: "complete",
      ownerDecision: "complete",
      action: "complete",
      evidence: "complete",
      outcomeStatus: "complete",
      adjudication: "not_applicable",
      reassessment: "not_applicable",
      learningEligibility: "complete",
      activeRecommendationSummary: "Supplier renegotiation complete — COGS reduced by 7%.",
      businessTrendWarnings: ["Revenue rising but gross profit declining — review pricing strategy."],
      ownerDecisionPending: false,
      reassessmentRequired: false,
      harmFlagged: false,
    });
    expect(view.valid).toBe(true);
    expect(view.violations).toHaveLength(0);
  });
});

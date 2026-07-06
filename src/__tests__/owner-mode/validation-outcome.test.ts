/**
 * Validation Outcome Persistence — unit tests (pure) + portfolio-consumption integration.
 *
 * Proves the recording enforces the scale gate on evidence: PASSED needs evidence (else INCONCLUSIVE), a
 * stop-loss can never PASS, missing cost/margin on a PASS blocks scaling, and the recorded status flows into
 * the live portfolio so it reaches real SCALE_CANDIDATE / KILL decisions — while an un-run NOT_STARTED still
 * cannot scale, and no fake revenue/conversion/profit appears.
 */
import { describe, it, expect } from "vitest";
import { planValidationOutcome, resultToValidationStatus, type ValidationOutcomeSubmission } from "@/domain/owner-mode/validation-outcome";
import { buildOpportunityPortfolio } from "@/domain/owner-mode/opportunity-portfolio-capital-allocation";
import type { ExternalOpportunityCandidate } from "@/domain/owner-mode/external-opportunity-intelligence";
import type { ValidationExperiment, ValidationStatus, OpportunityValidationAnalysis } from "@/domain/owner-mode/opportunity-validation-experiment-engine";

const WS = "ws-outcome-1";
const AT = "2026-07-06T00:00:00.000Z";

const base: ValidationOutcomeSubmission = { experimentKey: "exp-1", opportunityKey: "SERVICE_GAP:NEW_SERVICE", status: "COMPLETED", result: "PASSED" };

describe("planValidationOutcome — the evidence-gated recording", () => {
  it("1. PASSED with cost + margin evidence → SCALE_CANDIDATE (owner approval)", () => {
    const p = planValidationOutcome({ ...base, actualCost: 40, marginEvidence: "40% gross margin measured", conversions: 3 });
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.result).toBe("PASSED"); expect(p.row.nextRecommendedDecision).toBe("SCALE_CANDIDATE"); expect(p.row.approvalLevel).toBe("OWNER"); }
  });
  it("2. PASSED without any evidence is downgraded to INCONCLUSIVE (no fake win)", () => {
    const p = planValidationOutcome({ ...base, result: "PASSED" });
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.result).toBe("INCONCLUSIVE"); expect(p.row.nextRecommendedDecision).toBe("RETEST"); }
  });
  it("3. FAILED with evidence → KILL", () => {
    const p = planValidationOutcome({ ...base, result: "FAILED", failureMetricResult: "0 of 12 responded" });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.row.nextRecommendedDecision).toBe("KILL");
  });
  it("4. a stop-loss trigger can never be a PASS → KILL", () => {
    const p = planValidationOutcome({ ...base, result: "PASSED", conversions: 5, actualCost: 10, marginEvidence: "ok", stopLossTriggered: true });
    expect(p.ok).toBe(true);
    if (p.ok) { expect(p.row.result).toBe("FAILED"); expect(p.row.nextRecommendedDecision).toBe("KILL"); }
  });
  it("5. INCONCLUSIVE cannot scale (next decision is RETEST)", () => {
    const p = planValidationOutcome({ ...base, result: "INCONCLUSIVE" });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.row.nextRecommendedDecision).toBe("RETEST");
  });
  it("6. PASSED with evidence but missing cost/margin cannot scale → NEEDS_DATA", () => {
    const p = planValidationOutcome({ ...base, result: "PASSED", conversions: 4 }); // no actualCost / marginEvidence
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.row.nextRecommendedDecision).toBe("NEEDS_DATA");
  });
  it("7. fails closed on missing keys / bad enum / forbidden language", () => {
    expect(planValidationOutcome({ ...base, experimentKey: "" }).ok).toBe(false);
    expect(planValidationOutcome({ ...base, result: "WIN" as ValidationOutcomeSubmission["result"] }).ok).toBe(false);
    expect(planValidationOutcome({ ...base, result: "FAILED", customerFeedback: "the staff committed fraud" }).ok).toBe(false);
  });
  it("8. no fabricated money/percent leaks into the derived summary", () => {
    const p = planValidationOutcome({ ...base, actualCost: 40, marginEvidence: "measured" });
    expect(p.ok).toBe(true);
    if (p.ok) {
      const json = JSON.stringify(p.row).toLowerCase();
      expect(json).not.toMatch(/guaranteed|profit guarantee|win probability/);
      expect(json).not.toMatch(/[$£€]\s?\d/);
    }
  });
});

describe("resultToValidationStatus — portfolio mapping", () => {
  it("9. maps results/statuses onto the portfolio's ValidationStatus", () => {
    expect(resultToValidationStatus("COMPLETED", "PASSED")).toBe("PASSED");
    expect(resultToValidationStatus("COMPLETED", "FAILED")).toBe("FAILED");
    expect(resultToValidationStatus("COMPLETED", "INCONCLUSIVE")).toBe("INCONCLUSIVE");
    expect(resultToValidationStatus("RUNNING", "NOT_EVALUATED")).toBe("RUNNING");
    expect(resultToValidationStatus("CANCELLED", "NOT_EVALUATED")).toBe("ABORTED");
  });
});

describe("portfolio consumes persisted outcomes", () => {
  const candidate = (over: Partial<ExternalOpportunityCandidate> = {}): ExternalOpportunityCandidate => ({
    workspaceId: WS, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP", sourceEvidenceSummary: "e", sourceRefs: ["r"],
    customerPainPoint: "p", targetCustomerSegment: "seg", expectedValueHypothesis: "h", confidence: "MEDIUM", missingData: [],
    cashRisk: "LOW", ownerWorkloadRisk: "LOW", operationalFit: "STRONG", capabilityFit: "MODERATE", localFeasibility: "STRONG",
    legalOrComplianceRisk: "LOW", validationCostEstimate: null, validationRequired: true, recommendedNextStep: "VALIDATE_CHEAPLY",
    approvalLevel: "MANAGER", relatedCashProfitSignal: null, relatedCapabilityGap: null, systemCapabilityRecommendation: null,
    relatedConstraint: null, relatedSLO: null, riskIfIgnored: "r", evaluatedAt: AT, ...over,
  });
  const experiment = (status: ValidationStatus): ValidationExperiment => ({
    experimentId: "exp", workspaceId: WS, opportunityType: "NEW_SERVICE", signalSourceType: "SERVICE_GAP",
    experimentType: "CUSTOMER_INTEREST_TEST", hypothesis: "h", riskiestAssumption: "a", method: "m", successMetric: "s",
    successThreshold: "st", failureMetric: "f", failureThreshold: "ft", stopLossRule: "abort", costCap: null, ownerTimeCapMinutes: 90,
    durationDays: 5, sampleSizeTarget: 10, dataToCollect: [], requiresOwnerApproval: false, approvalLevel: "MANAGER",
    validationStatus: status, cheaperAlternativeConsidered: "c", doNotScaleNote: "n", confidence: "MEDIUM",
  });
  const analysis = (status: ValidationStatus): OpportunityValidationAnalysis => ({
    workspaceId: WS, experiments: [experiment(status)], topExperiment: null, deferred: [],
    summary: { candidatesConsidered: 1, experimentsDesigned: 1, deferred: 0, dataCollectionOnly: 0, ownerApprovalRequired: 0 }, evaluatedAt: AT,
  });
  const CTX = { cashProfitRiskActive: false, capabilityGapPresent: false };

  it("10. a recorded PASSED result makes the live portfolio a SCALE_CANDIDATE (owner approval)", () => {
    const status = resultToValidationStatus("COMPLETED", "PASSED");
    const p = buildOpportunityPortfolio([candidate({ cashRisk: "MEDIUM", ownerWorkloadRisk: "HIGH" })], analysis(status), CTX, WS, AT);
    expect(p.topItem!.portfolioDecision).toBe("SCALE_CANDIDATE");
    expect(p.topItem!.requiresOwnerApproval).toBe(true);
  });
  it("11. a recorded FAILED result makes the live portfolio a KILL", () => {
    const p = buildOpportunityPortfolio([candidate()], analysis(resultToValidationStatus("COMPLETED", "FAILED")), CTX, WS, AT);
    expect(p.topItem!.portfolioDecision).toBe("KILL");
  });
  it("12. an INCONCLUSIVE result cannot scale (stays validate/collect)", () => {
    const p = buildOpportunityPortfolio([candidate()], analysis(resultToValidationStatus("COMPLETED", "INCONCLUSIVE")), CTX, WS, AT);
    expect(["VALIDATE_CHEAPLY", "NEEDS_DATA", "OWNER_REVIEW_REQUIRED"]).toContain(p.topItem!.portfolioDecision);
    expect(p.topItem!.scaleBlockedReason).not.toBeNull();
  });
  it("13. an un-run NOT_STARTED experiment still cannot scale", () => {
    const p = buildOpportunityPortfolio([candidate()], analysis("NOT_STARTED"), CTX, WS, AT);
    expect(["VALIDATE_CHEAPLY", "NEEDS_DATA", "OWNER_REVIEW_REQUIRED"]).toContain(p.topItem!.portfolioDecision);
    expect(p.summary.scaleCandidates).toBe(0);
  });
});

/**
 * Business-Control SLOs — deterministic PASS/WARN/FAIL/NOT_MEASURABLE grading of OpsIQ's own
 * control loop, with source refs, missing-data handling (no fake/always-green metrics), and
 * linkage to constraint/profit-leak/gaming/credibility. Pure — no DB.
 */
import { describe, it, expect } from "vitest";
import { evaluateBusinessControlSLOs, type BusinessControlInput } from "@/domain/owner-mode/business-control-slo";

const AT = "2026-07-05T00:00:00.000Z";
const inp = (over: Partial<BusinessControlInput> = {}): BusinessControlInput => ({ workspaceId: "ws-1", evaluatedAt: AT, ...over });
const get = (h: ReturnType<typeof evaluateBusinessControlSLOs>, t: string) => h.slos.find((s) => s.sloType === t)!;

const FULL_ENVELOPE = { ownerApprovalRequired: true, successMetric: true, stopLoss: true, reassessmentTrigger: true, confidence: true, cashImpact: true };

describe("business-control SLOs", () => {
  it("every SLO carries the required shape incl. source refs + missing data", () => {
    const h = evaluateBusinessControlSLOs(inp());
    for (const s of h.slos) {
      for (const k of ["workspaceId", "sloType", "sliName", "status", "target", "measurementWindow", "confidence", "sourceDataRefs", "missingData", "ownerExplanation", "recommendedAction", "evaluatedAt"]) {
        expect(s).toHaveProperty(k);
      }
    }
  });

  it("is NOT always-green: with no inputs, most SLOs are NOT_MEASURABLE (not PASS)", () => {
    const h = evaluateBusinessControlSLOs(inp());
    expect(h.notMeasurableCount).toBeGreaterThan(0);
    expect(h.slos.every((s) => s.status === "PASS")).toBe(false);
  });

  it("OWNER_WORKLOAD_BURDEN WARN/FAIL when owner load is high", () => {
    const warn = get(evaluateBusinessControlSLOs(inp({ workloadBudget: { ownerDecisionsRequired: 5, approvalsRequired: 2, reviewsRequired: 1, ownerBottleneckItems: 0 } })), "OWNER_WORKLOAD_BURDEN");
    expect(warn.status).toBe("WARN");
    const fail = get(evaluateBusinessControlSLOs(inp({ workloadBudget: { ownerDecisionsRequired: 10, approvalsRequired: 3, reviewsRequired: 5, ownerBottleneckItems: 0 } })), "OWNER_WORKLOAD_BURDEN");
    expect(fail.status).toBe("FAIL");
    expect(fail.ownerActionRequired).toBe(true);
  });

  it("OWNER_BOTTLENECK FAILs and links the OWNER constraint", () => {
    const s = get(evaluateBusinessControlSLOs(inp({ topConstraintType: "OWNER", workloadBudget: { ownerDecisionsRequired: 3, approvalsRequired: 0, reviewsRequired: 0, ownerBottleneckItems: 2 } })), "OWNER_BOTTLENECK");
    expect(s.status).toBe("FAIL");
    expect(s.relatedConstraint).toBe("OWNER");
  });

  it("ANTI_GAMING_RISK FAILs on a HIGH gaming signal and links it", () => {
    const s = get(evaluateBusinessControlSLOs(inp({ topGamingSignalType: "SELF_REVIEW_ATTEMPT", topGamingSeverity: "HIGH" })), "ANTI_GAMING_RISK");
    expect(s.status).toBe("FAIL");
    expect(s.relatedGamingSignal).toBe("SELF_REVIEW_ATTEMPT");
  });

  it("EVIDENCE_CREDIBILITY_RISK WARN on a MEDIUM concern and links it", () => {
    const s = get(evaluateBusinessControlSLOs(inp({ topCredibilitySignalType: "REPEATED_OWNER_REVIEW_BURDEN", topCredibilitySeverity: "MEDIUM" })), "EVIDENCE_CREDIBILITY_RISK");
    expect(s.status).toBe("WARN");
    expect(s.relatedCredibilityConcern).toBe("REPEATED_OWNER_REVIEW_BURDEN");
  });

  it("top profit leak / constraint drive freshness SLOs (WARN when severe)", () => {
    const h = evaluateBusinessControlSLOs(inp({ topProfitLeakType: "DISCOUNT_LEAK", topProfitLeakSeverity: "HIGH", topConstraintType: "QUALITY", topConstraintSeverity: "HIGH" }));
    expect(get(h, "PROFIT_LEAK_FRESHNESS").status).toBe("WARN");
    expect(get(h, "PROFIT_LEAK_FRESHNESS").relatedProfitLeak).toBe("DISCOUNT_LEAK");
    expect(get(h, "CONSTRAINT_FRESHNESS").status).toBe("WARN");
    expect(get(h, "CONSTRAINT_FRESHNESS").relatedConstraint).toBe("QUALITY");
  });

  it("OPPORTUNITY_DECISION_COMPLETENESS PASS with all fields, FAIL when one is missing", () => {
    expect(get(evaluateBusinessControlSLOs(inp({ opportunityEnvelopeFields: FULL_ENVELOPE })), "OPPORTUNITY_DECISION_COMPLETENESS").status).toBe("PASS");
    const fail = get(evaluateBusinessControlSLOs(inp({ opportunityEnvelopeFields: { ...FULL_ENVELOPE, stopLoss: false } })), "OPPORTUNITY_DECISION_COMPLETENESS");
    expect(fail.status).toBe("FAIL");
    expect(fail.missingData).toContain("stopLoss");
  });

  it("NOW_VIEW_SIGNAL_COMPLETENESS detects a missing key signal", () => {
    const s = get(evaluateBusinessControlSLOs(inp({ nowViewSignalsPresent: { workload: true, constraint: true, profitLeak: true, gaming: false, credibility: true } })), "NOW_VIEW_SIGNAL_COMPLETENESS");
    expect(s.status).toBe("WARN");
    expect(s.missingData).toContain("gaming");
  });

  it("WEAK_PROOF_REVIEW_RATE FAIL at a high rate; NOT_MEASURABLE with no proofs", () => {
    expect(get(evaluateBusinessControlSLOs(inp({ totalProofCount: 10, weakProofCount: 5 })), "WEAK_PROOF_REVIEW_RATE").status).toBe("FAIL");
    expect(get(evaluateBusinessControlSLOs(inp({ totalProofCount: 0, weakProofCount: 0 })), "WEAK_PROOF_REVIEW_RATE").status).toBe("NOT_MEASURABLE");
  });

  it("AUDIT_DURABILITY / REASSESSMENT_LATENCY are NOT_MEASURABLE with the exact missing source", () => {
    const h = evaluateBusinessControlSLOs(inp());
    const audit = get(h, "AUDIT_DURABILITY");
    expect(audit.status).toBe("NOT_MEASURABLE");
    expect(audit.missingData.join(" ")).toMatch(/correlation/i);
    const reeval = get(h, "REASSESSMENT_LATENCY");
    expect(reeval.status).toBe("NOT_MEASURABLE");
    expect(reeval.missingData.join(" ")).toMatch(/reassessment/i);
  });

  const latStat = (over: Record<string, unknown> = {}) => ({
    measurable: true, linkedCount: 1, openCount: 0, failedCount: 0,
    medianLatencyMs: 60_000, maxLatencyMs: 60_000, targetMs: 15 * 60_000, windowLabel: "w", ...over,
  });

  it("AUDIT_DURABILITY PASS at 100% coverage, FAIL below (measured, partial shock class)", () => {
    const pass = get(evaluateBusinessControlSLOs(inp({ auditDurability: { measurable: true, mutationClass: "shock_event", totalMutations: 3, auditedMutations: 3, unauditedMutationIds: [], coveragePct: 100 } })), "AUDIT_DURABILITY");
    expect(pass.status).toBe("PASS");
    expect(pass.actualValue).toMatch(/100%/);
    const fail = get(evaluateBusinessControlSLOs(inp({ auditDurability: { measurable: true, mutationClass: "shock_event", totalMutations: 3, auditedMutations: 2, unauditedMutationIds: ["x"], coveragePct: 67 } })), "AUDIT_DURABILITY");
    expect(fail.status).toBe("FAIL");
    expect(fail.ownerActionRequired).toBe(true);
  });

  it("REASSESSMENT_LATENCY grades PASS within target, WARN over, FAIL when overdue", () => {
    expect(get(evaluateBusinessControlSLOs(inp({ reassessmentLatency: latStat({ medianLatencyMs: 2 * 24 * 3600_000, targetMs: 7 * 24 * 3600_000 }) })), "REASSESSMENT_LATENCY").status).toBe("PASS");
    expect(get(evaluateBusinessControlSLOs(inp({ reassessmentLatency: latStat({ medianLatencyMs: 8 * 24 * 3600_000, targetMs: 7 * 24 * 3600_000 }) })), "REASSESSMENT_LATENCY").status).toBe("WARN");
    const fail = get(evaluateBusinessControlSLOs(inp({ reassessmentLatency: latStat({ failedCount: 2, medianLatencyMs: null, targetMs: 7 * 24 * 3600_000 }) })), "REASSESSMENT_LATENCY");
    expect(fail.status).toBe("FAIL");
    expect(fail.ownerActionRequired).toBe(true);
  });

  it("SHOCK_HANDLING_LATENCY PASS when re-eval is prompt, FAIL when a shock is unhandled", () => {
    expect(get(evaluateBusinessControlSLOs(inp({ shockHandlingLatency: latStat() })), "SHOCK_HANDLING_LATENCY").status).toBe("PASS");
    expect(get(evaluateBusinessControlSLOs(inp({ shockHandlingLatency: latStat({ failedCount: 1, linkedCount: 0, medianLatencyMs: null }) })), "SHOCK_HANDLING_LATENCY").status).toBe("FAIL");
  });

  const poStat = (over: Record<string, unknown> = {}) => ({
    measurable: true, acceptedProofCount: 10, contradictedCount: 0, reworkCount: 0, contradictionRate: 0, medianContradictionLatencyMs: null, ...over,
  });

  it("PROOF_OUTCOME_INTEGRITY PASS when no accepted proof reversed, WARN on some, FAIL on high rate", () => {
    expect(get(evaluateBusinessControlSLOs(inp({ proofOutcome: poStat() })), "PROOF_OUTCOME_INTEGRITY").status).toBe("PASS");
    expect(get(evaluateBusinessControlSLOs(inp({ proofOutcome: poStat({ contradictedCount: 1, contradictionRate: 0.1 }) })), "PROOF_OUTCOME_INTEGRITY").status).toBe("WARN");
    const fail = get(evaluateBusinessControlSLOs(inp({ proofOutcome: poStat({ contradictedCount: 4, contradictionRate: 0.4 }) })), "PROOF_OUTCOME_INTEGRITY");
    expect(fail.status).toBe("FAIL");
    expect(fail.actualValue).toMatch(/40% reversed/);
    expect(fail.ownerActionRequired).toBe(true);
  });

  it("PROOF_OUTCOME_INTEGRITY NOT_MEASURABLE when there is no accepted proof to assess", () => {
    expect(get(evaluateBusinessControlSLOs(inp()), "PROOF_OUTCOME_INTEGRITY").status).toBe("NOT_MEASURABLE");
    expect(get(evaluateBusinessControlSLOs(inp({ proofOutcome: poStat({ measurable: false, acceptedProofCount: 0, contradictionRate: null }) })), "PROOF_OUTCOME_INTEGRITY").status).toBe("NOT_MEASURABLE");
  });

  it("OPERATIONAL_EVENT_RESOLUTION PASS/WARN/FAIL by open+overdue, NOT_MEASURABLE with no events", () => {
    const pass = get(evaluateBusinessControlSLOs(inp({ operationalEventHealth: { activeCount: 2, overdueCount: 0, overdueSevereCount: 0, totalCount: 3, escalationTriggered: false } })), "OPERATIONAL_EVENT_RESOLUTION");
    expect(pass.status).toBe("PASS");
    const warn = get(evaluateBusinessControlSLOs(inp({ operationalEventHealth: { activeCount: 2, overdueCount: 1, overdueSevereCount: 0, totalCount: 3, escalationTriggered: false } })), "OPERATIONAL_EVENT_RESOLUTION");
    expect(warn.status).toBe("WARN");
    const fail = get(evaluateBusinessControlSLOs(inp({ operationalEventHealth: { activeCount: 2, overdueCount: 1, overdueSevereCount: 1, totalCount: 3, escalationTriggered: true } })), "OPERATIONAL_EVENT_RESOLUTION");
    expect(fail.status).toBe("FAIL");
    expect(fail.ownerActionRequired).toBe(true);
    expect(get(evaluateBusinessControlSLOs(inp()), "OPERATIONAL_EVENT_RESOLUTION").status).toBe("NOT_MEASURABLE");
  });

  it("overall FAIL and a deterministic, explainable top control risk", () => {
    const a = evaluateBusinessControlSLOs(inp({ topGamingSignalType: "SELF_REVIEW_ATTEMPT", topGamingSeverity: "HIGH", workloadBudget: { ownerDecisionsRequired: 20, approvalsRequired: 0, reviewsRequired: 0, ownerBottleneckItems: 0 } }));
    const b = evaluateBusinessControlSLOs(inp({ topGamingSignalType: "SELF_REVIEW_ATTEMPT", topGamingSeverity: "HIGH", workloadBudget: { ownerDecisionsRequired: 20, approvalsRequired: 0, reviewsRequired: 0, ownerBottleneckItems: 0 } }));
    expect(a.overallStatus).toBe("FAIL");
    expect(a.topControlRisk!.status).toBe("FAIL");
    expect(a.topControlRisk!.sloType).toBe(b.topControlRisk!.sloType);
  });

  it("workspaceId echoed on every SLO (no cross-workspace bleed in a pure fn)", () => {
    const h = evaluateBusinessControlSLOs(inp({ workspaceId: "ws-XYZ" }));
    expect(h.slos.every((s) => s.workspaceId === "ws-XYZ")).toBe(true);
  });
});

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

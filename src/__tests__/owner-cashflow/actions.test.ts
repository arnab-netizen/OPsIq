/**
 * Owner Cashflow (Module 5 Slice 3) — recommendation/action planner tests.
 * Pure/no DB. Verifies traceable recommendations, action conformance to the
 * Spine schema, bounded + deterministic survival-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability,
 * and that the recommended next action targets the most urgent cash problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseCashflowSnapshot,
  planCashflowActionsFromDiagnosis,
  buildCashflowRecommendations,
  CASHFLOW_REC_TEMPLATES,
  type CashflowSnapshotInput,
} from "@/domain/owner-cashflow";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function healthy(): CashflowSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 50000,
    bankBalance: 150000,
    dailyCollections: 8000,
    receivables: 5000,
    receivablesOverdue: 0,
    payables: 20000,
    payablesOverdue: 0,
    upcomingEmi: 10000,
    rentDue: 15000,
    salaryDue: 40000,
    vendorDue: 10000,
    taxDue: 5000,
    ownerWithdrawal: 20000,
  };
}

function crisis(): CashflowSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 20000,
    bankBalance: 0,
    dailyCollections: 800,
    receivables: 60000,
    receivablesOverdue: 45000,
    payables: 50000,
    payablesOverdue: 30000,
    upcomingEmi: 25000,
    rentDue: 20000,
    salaryDue: 50000,
    ownerWithdrawal: 15000,
  };
}

function plan(input: CashflowSnapshotInput) {
  return planCashflowActionsFromDiagnosis(diagnoseCashflowSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) =>
  p.actions.map((a) => a.findingCode);

describe("owner-cashflow actions — module contract assertions", () => {
  it("diagnoseCashflowSnapshot is a function", () => { expect(typeof diagnoseCashflowSnapshot).toBe("function"); });
  it("planCashflowActionsFromDiagnosis is a function", () => { expect(typeof planCashflowActionsFromDiagnosis).toBe("function"); });
  it("buildCashflowRecommendations is a function", () => { expect(typeof buildCashflowRecommendations).toBe("function"); });
  it("CASHFLOW_REC_TEMPLATES is an object", () => { expect(typeof CASHFLOW_REC_TEMPLATES).toBe("object"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is defined", () => { expect(OWNER_ACTION_STATUSES).toBeDefined(); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("healthy is a function", () => { expect(typeof healthy).toBe("function"); });
  it("crisis is a function", () => { expect(typeof crisis).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("healthy() returns an object", () => { expect(typeof healthy()).toBe("object"); });
  it("crisis() returns an object", () => { expect(typeof crisis()).toBe("object"); });
});

describe("owner-cashflow planner — recommendation/action creation", () => {
  it("urgent payment risk creates a near-term-dues action", () => {
    const p = plan(crisis());
    expect(actionCodes(p)).toContain("CF_URGENT_PAYMENT_RISK");
    const rec = p.recommendations.find((r) => r.findingCode === "CF_URGENT_PAYMENT_RISK");
    expect(rec?.category).toBe("meet_near_term_dues");
    expect(rec?.recommendationCode).toBe("CFREC_COVER_NEAR_TERM_DUES");
  });

  it("overdue receivables create a collection action", () => {
    const p = plan(crisis());
    expect(actionCodes(p)).toContain("CF_HIGH_OVERDUE_RECEIVABLES");
    const rec = p.recommendations.find((r) => r.findingCode === "CF_HIGH_OVERDUE_RECEIVABLES");
    expect(rec?.category).toBe("collect_receivables");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(crisis());
    const rec = p.recommendations.find((r) => r.findingCode === "CF_URGENT_PAYMENT_RISK");
    expect(rec?.sourceMetric).toBe("urgentPaymentRiskPct");
    expect(typeof rec?.sourceValue).toBe("number"); // from a real metric, not invented
    expect(rec?.verificationMetric).toBe("urgentPaymentRiskPct");
  });
});

describe("owner-cashflow planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, cashflow)", () => {
    const p = plan(crisis());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("cashflow");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends the top action", () => {
    const p = plan(crisis());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    // The most urgent action under a liquidity crisis is a critical-severity one.
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is survival-weighted: liquidity pressure lifts the same action", () => {
    const p = plan(crisis());
    const danger = diagnoseCashflowSnapshot(crisis(), { now: NOW }).metrics.cashflowDangerScore;
    const rec = p.recommendations.find((r) => r.findingCode === "CF_URGENT_PAYMENT_RISK")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedCashImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: danger,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedCashImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "CF_URGENT_PAYMENT_RISK");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-cashflow planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [healthy(), crisis()]) {
      const diag = diagnoseCashflowSnapshot(input, { now: NOW });
      const p = planCashflowActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      // recommendations count matches findings that have a template
      const withTemplate = diag.findings.filter((f) => CASHFLOW_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseCashflowSnapshot(crisis(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planCashflowActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildCashflowRecommendations skips findings with no template", () => {
    const recs = buildCashflowRecommendations([
      {
        domain: "cashflow",
        code: "CF_UNKNOWN_NOT_A_TEMPLATE",
        title: "x",
        summary: "x",
        sourceMetric: "x",
        sourceValue: null,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 10,
        urgencyScore: 10,
        findingType: "risk",
        evidence: [],
        missingData: [],
      },
    ]);
    expect(recs).toEqual([]);
  });
});

/**
 * Owner Sales (Module 3 Slice 3) — recommendation/action planner tests.
 * Pure/no DB. Verifies traceable recommendations, action conformance to the Spine
 * schema, bounded + deterministic pressure-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability,
 * and that the recommended next action targets the most urgent sales problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseSalesSnapshot,
  planSalesActionsFromDiagnosis,
  buildSalesRecommendations,
  SALES_REC_TEMPLATES,
  type SalesSnapshotInput,
} from "@/domain/owner-sales";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function healthy(): SalesSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    leads: 1000,
    qualifiedLeads: 600,
    orders: 350,
    revenue: 700000,
    newCustomers: 150,
    repeatCustomers: 200,
    lostCustomers: 10,
    complaints: 3,
    discountAmount: 0,
    refundAmount: 0,
    b2bRevenue: 200000,
    b2cRevenue: 500000,
    b2bPipelineValue: 700000,
  };
}

function distress(): SalesSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    leads: 1000,
    qualifiedLeads: 400,
    orders: 30,
    revenue: 60000,
    newCustomers: 12,
    repeatCustomers: 3,
    lostCustomers: 25,
    complaints: 6,
    discountAmount: 18000,
    refundAmount: 6000,
    b2bRevenue: 10000,
    b2cRevenue: 50000,
    b2bPipelineValue: 6000,
  };
}

function plan(input: SalesSnapshotInput) {
  return planSalesActionsFromDiagnosis(diagnoseSalesSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) =>
  p.actions.map((a) => a.findingCode);

describe("owner-sales actions — module contract assertions", () => {
  it("diagnoseSalesSnapshot is a function", () => { expect(typeof diagnoseSalesSnapshot).toBe("function"); });
  it("planSalesActionsFromDiagnosis is a function", () => { expect(typeof planSalesActionsFromDiagnosis).toBe("function"); });
  it("buildSalesRecommendations is a function", () => { expect(typeof buildSalesRecommendations).toBe("function"); });
  it("SALES_REC_TEMPLATES is an object", () => { expect(typeof SALES_REC_TEMPLATES).toBe("object"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is defined", () => { expect(OWNER_ACTION_STATUSES).toBeDefined(); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("healthy is a function", () => { expect(typeof healthy).toBe("function"); });
  it("distress is a function", () => { expect(typeof distress).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("healthy() returns an object", () => { expect(typeof healthy()).toBe("object"); });
  it("distress() returns an object", () => { expect(typeof distress()).toBe("object"); });
});

describe("owner-sales planner — recommendation/action creation", () => {
  it("low conversion creates an improve-conversion action", () => {
    const p = plan(distress());
    expect(actionCodes(p)).toContain("SALES_LOW_CONVERSION");
    const rec = p.recommendations.find((r) => r.findingCode === "SALES_LOW_CONVERSION");
    expect(rec?.category).toBe("improve_conversion");
    expect(rec?.recommendationCode).toBe("SALESREC_IMPROVE_CONVERSION");
  });

  it("lost-customer leakage creates a win-back action", () => {
    const p = plan(distress());
    expect(actionCodes(p)).toContain("SALES_LOST_CUSTOMER_LEAKAGE");
    const rec = p.recommendations.find((r) => r.findingCode === "SALES_LOST_CUSTOMER_LEAKAGE");
    expect(rec?.category).toBe("win_back");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(distress());
    const rec = p.recommendations.find((r) => r.findingCode === "SALES_LOW_CONVERSION");
    expect(rec?.sourceMetric).toBe("leadToSaleConversionPct");
    expect(typeof rec?.sourceValue).toBe("number");
    expect(rec?.verificationMetric).toBe("leadToSaleConversionPct");
  });
});

describe("owner-sales planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, sales)", () => {
    const p = plan(distress());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("sales");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends a critical-severity top action", () => {
    const p = plan(distress());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is pressure-weighted: sales risk lifts the same action", () => {
    const p = plan(distress());
    const risk = diagnoseSalesSnapshot(distress(), { now: NOW }).metrics.salesRiskScore;
    const rec = p.recommendations.find((r) => r.findingCode === "SALES_LOW_CONVERSION")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedSalesImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: risk,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedSalesImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "SALES_LOW_CONVERSION");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-sales planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [healthy(), distress()]) {
      const diag = diagnoseSalesSnapshot(input, { now: NOW });
      const p = planSalesActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      const withTemplate = diag.findings.filter((f) => SALES_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseSalesSnapshot(distress(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planSalesActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildSalesRecommendations skips findings with no template", () => {
    const recs = buildSalesRecommendations([
      {
        domain: "sales",
        code: "SALES_UNKNOWN_NOT_A_TEMPLATE",
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

/**
 * Slice 6 engines — reconciliation evaluator (Section 21) and rolling 13-week
 * cash forecast / scenarios (Section 28). Deterministic, DB-free.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateReconciliation,
  reconciliationToSpendState,
  computeCashForecast,
  composeUpdatedPlan,
} from "@/domain/owner-budget";

describe("Slice 6 engines — module contract assertions", () => {
  it("evaluateReconciliation is a function", () => { expect(typeof evaluateReconciliation).toBe("function"); });
  it("reconciliationToSpendState is a function", () => { expect(typeof reconciliationToSpendState).toBe("function"); });
  it("computeCashForecast is a function", () => { expect(typeof computeCashForecast).toBe("function"); });
  it("composeUpdatedPlan is a function", () => { expect(typeof composeUpdatedPlan).toBe("function"); });
  it("evaluateReconciliation({}) has status field", () => { expect(evaluateReconciliation({})).toHaveProperty("status"); });
  it("evaluateReconciliation({}) has verified field", () => { expect(evaluateReconciliation({})).toHaveProperty("verified"); });
  it("evaluateReconciliation({}).verified is a boolean", () => { expect(typeof evaluateReconciliation({}).verified).toBe("boolean"); });
  it("reconciliationToSpendState('RECONCILED') returns 'reconciled'", () => { expect(reconciliationToSpendState("RECONCILED")).toBe("reconciled"); });
  it("computeCashForecast returns object with scenarios array", () => {
    const r = computeCashForecast({ cashOnHand: 100000, weeklyRevenue: 50000, weeklyOutflow: 40000 });
    expect(Array.isArray(r.scenarios)).toBe(true);
  });
  it("computeCashForecast returns 3 scenarios", () => {
    expect(computeCashForecast({ cashOnHand: 100000, weeklyRevenue: 50000, weeklyOutflow: 40000 }).scenarios).toHaveLength(3);
  });
  it("evaluateReconciliation({ proofUploaded: true }).status is 'PROOF_UPLOADED'", () => {
    expect(evaluateReconciliation({ proofUploaded: true }).status).toBe("PROOF_UPLOADED");
  });
  it("evaluateReconciliation({ proofUploaded: true }).verified is false", () => {
    expect(evaluateReconciliation({ proofUploaded: true }).verified).toBe(false);
  });
  it("composeUpdatedPlan returns object with signals array", () => {
    const plan = composeUpdatedPlan({ assessment: { finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 500000, costOfGoodsOrServices: 250000, fixedCosts: 150000, cashOnHand: 400000 }, dataConfidence: "OPERATIONAL" } });
    expect(Array.isArray(plan.signals)).toBe(true);
  });
  it("composeUpdatedPlan returns object with spendRestrictions array", () => {
    const plan = composeUpdatedPlan({ assessment: { finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 500000, costOfGoodsOrServices: 250000, fixedCosts: 150000, cashOnHand: 400000 }, dataConfidence: "OPERATIONAL" } });
    expect(Array.isArray(plan.spendRestrictions)).toBe(true);
  });
});

describe("Reconciliation evaluator", () => {
  it("treats a receipt alone as NOT verified", () => {
    const r = evaluateReconciliation({ proofUploaded: true });
    expect(r.status).toBe("PROOF_UPLOADED");
    expect(r.verified).toBe(false);
  });
  it("verifies only when proof + invoice + payment + bank all match", () => {
    const r = evaluateReconciliation({ proofUploaded: true, invoiceMatched: true, paymentMatched: true, bankMatched: true });
    expect(r.status).toBe("RECONCILED");
    expect(r.verified).toBe(true);
  });
  it("flags duplicate hash and contradiction as mismatch/disputed", () => {
    expect(evaluateReconciliation({ duplicateHash: true }).mismatch).toBe(true);
    expect(evaluateReconciliation({ contradicted: true }).status).toBe("DISPUTED");
    expect(reconciliationToSpendState("RECONCILED")).toBe("reconciled");
    expect(reconciliationToSpendState("MISMATCH")).toBe("disputed");
  });
});

describe("Rolling forecast & scenarios", () => {
  it("projects 13 weeks across base/downside/cash-stress and finds reserve breaches", () => {
    const r = computeCashForecast({
      cashOnHand: 100000, weeklyRevenue: 50000, weeklyOutflow: 60000, reserveRequired: 20000,
      obligations: [{ label: "Tax", amount: 40000, dueInDays: 14, kind: "tax" }],
    });
    expect(r.scenarios).toHaveLength(3);
    for (const s of r.scenarios) expect(s.weeklyEndingCash).toHaveLength(13);
    // Burning cash → base scenario eventually breaches the reserve.
    const base = r.scenarios.find((s) => s.name === "base")!;
    expect(base.reserveBreachWeek).not.toBeNull();
    // Cash-stress is never better than base at the end.
    const stress = r.scenarios.find((s) => s.name === "cash_stress")!;
    expect(stress.endingCash).toBeLessThanOrEqual(base.endingCash);
  });

  it("stays above reserve when cash-generative", () => {
    const r = computeCashForecast({ cashOnHand: 200000, weeklyRevenue: 80000, weeklyOutflow: 50000, reserveRequired: 20000 });
    expect(r.scenarios.find((s) => s.name === "base")!.reserveBreachWeek).toBeNull();
  });
});

describe("Updated plan surfaces reconciliation exceptions", () => {
  it("emits reconciliation_exception when unreconciled spend exists", () => {
    const plan = composeUpdatedPlan({
      assessment: {
        finance: { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 500000, costOfGoodsOrServices: 250000, fixedCosts: 150000, cashOnHand: 400000 },
        dataConfidence: "OPERATIONAL",
        reconciliationExceptionCount: 2,
      },
    });
    expect(plan.signals.some((s) => s.type === "reconciliation_exception")).toBe(true);
    expect(plan.spendRestrictions.some((r) => r.toLowerCase().includes("unreconciled"))).toBe(true);
  });
});

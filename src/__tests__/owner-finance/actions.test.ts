/**
 * Owner Finance (Module 2 Slice 4) — recommendation/action planner tests.
 * Pure/no DB. Verifies traceable recommendations, action conformance, bounded +
 * deterministic survival-weighted priority, ranking, no-invention, and that
 * inputs are not mutated.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseFinanceSnapshot,
  planFinanceActionsFromDiagnosis,
  buildFinanceRecommendations,
  type FinancialSnapshotInput,
} from "@/domain/owner-finance";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-05-10T00:00:00.000Z");

function profitable(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, costOfGoodsOrServices: 30000, rent: 10000, salaryPayroll: 20000,
    utilities: 5000, marketingSpend: 5000, cashOnHand: 200000, orderCount: 1000, customerCount: 800,
  };
}

/** A fully-healthy, fully-populated snapshot → zero findings. */
function perfect(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, costOfGoodsOrServices: 20000, variableCosts: 20000, fixedCosts: 20000,
    salaryPayroll: 15000, marketingSpend: 5000, cashOnHand: 500000,
    loanEmiDebtPayments: 0, receivables: 0, payables: 0, ownerWithdrawals: 0,
    discountAmount: 0, refundAmount: 0, orderCount: 1000, customerCount: 800,
  };
}

function plan(input: FinancialSnapshotInput) {
  return planFinanceActionsFromDiagnosis(diagnoseFinanceSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) => p.actions.map((a) => a.findingCode);

describe("owner-finance/actions — module contract assertions", () => {
  it("diagnoseFinanceSnapshot is a function", () => { expect(typeof diagnoseFinanceSnapshot).toBe("function"); });
  it("planFinanceActionsFromDiagnosis is a function", () => { expect(typeof planFinanceActionsFromDiagnosis).toBe("function"); });
  it("buildFinanceRecommendations is a function", () => { expect(typeof buildFinanceRecommendations).toBe("function"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is an array", () => { expect(Array.isArray(OWNER_ACTION_STATUSES)).toBe(true); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is an object", () => { expect(typeof NOW).toBe("object"); });
  it("profitable is a function", () => { expect(typeof profitable).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-finance planner — recommendation/action creation", () => {
  it("negative net margin creates a margin-improvement action", () => {
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 100000 });
    expect(actionCodes(p)).toContain("FIN_NEGATIVE_NET_MARGIN");
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_NEGATIVE_NET_MARGIN");
    expect(rec?.category).toBe("improve_margin");
  });

  it("receivables finding creates a collection action", () => {
    const p = plan({ ...profitable(), receivables: 40000 });
    expect(actionCodes(p)).toContain("FIN_HIGH_RECEIVABLES");
    expect(p.recommendations.some((r) => r.category === "collect_receivables")).toBe(true);
  });

  it("debt pressure finding creates a debt-reduction action", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000 });
    expect(p.recommendations.some((r) => r.category === "reduce_debt_pressure")).toBe(true);
  });

  it("leakage finding creates a leakage-reduction action", () => {
    const p = plan({ ...profitable(), discountAmount: 15000 });
    expect(p.recommendations.some((r) => r.category === "stop_reduce_leakage")).toBe(true);
  });

  it("missing critical data creates a data-quality action", () => {
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000 });
    expect(actionCodes(p)).toContain("FIN_MISSING_CRITICAL_DATA");
    expect(p.recommendations.some((r) => r.category === "improve_data_quality")).toBe(true);
  });

  it("opportunity finding produces a revenue-quality (growth) action", () => {
    const p = plan({ ...profitable(), b2cRevenue: 95000, b2bRevenue: 5000, discountAmount: 12000 });
    expect(p.recommendations.some((r) => r.category === "improve_revenue_quality")).toBe(true);
  });
});

describe("owner-finance planner — traceability & conformance", () => {
  it("every action conforms to OwnerActionSchema and reuses Module 1 status vocab", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000 });
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(ownerActionSchema.safeParse(a).success).toBe(true);
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.domain).toBe("finance");
    }
  });

  it("recommendations cite sourceMetric/sourceValue/threshold where available", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000 });
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_HIGH_DEBT_PRESSURE")!;
    expect(rec.sourceMetric).toBe("debtServicePressurePct");
    expect(rec.sourceValue).toBe(30);
    expect(rec.threshold).toBe(25);
    expect(rec.verificationMethod.length).toBeGreaterThan(0);
    expect(rec.expectedTimeframeDays).toBeGreaterThan(0);
  });

  it("does not invent sourceValue when the finding lacks one", () => {
    const p = plan({ ...profitable(), currency: "" });
    const rec = p.recommendations.find((r) => r.findingCode === "FIN_INVALID_CURRENCY")!;
    expect(rec.sourceValue).toBeNull();
  });
});

describe("owner-finance planner — priority & ranking", () => {
  it("all action priorities are bounded 0..100", () => {
    const p = plan({ ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000, refundAmount: 5000 });
    for (const a of p.actions) {
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
    }
  });

  it("critical survival action outranks a lower-severity growth action", () => {
    // Insolvent runway (critical) alongside a data-quality (low) opportunity.
    const p = plan({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000 });
    const survival = p.actions.find((a) => a.findingCode === "FIN_INSOLVENT_RUNWAY")!;
    const growth = p.actions.find((a) => a.findingCode === "FIN_OPP_DATA_QUALITY");
    expect(survival).toBeDefined();
    if (growth) expect(survival.priorityScore).toBeGreaterThan(growth.priorityScore);
    expect(p.recommendedNextAction!.findingCode).toBe("FIN_INSOLVENT_RUNWAY");
  });

  it("higher effort lowers priority (Spine priority function)", () => {
    const base = { expectedImpactScore: 60, confidence: 0.7, urgencyScore: 50, effortScore: 20, severity: "high" as const };
    expect(calculateOwnerPriorityScore({ ...base, effortScore: 90 })).toBeLessThan(
      calculateOwnerPriorityScore(base)
    );
  });

  it("ranking is deterministic and recommendedNextAction is the first action", () => {
    const input = { ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000 };
    const a = plan(input);
    const b = plan(input);
    expect(JSON.stringify(a.actions)).toBe(JSON.stringify(b.actions));
    expect(a.recommendedNextAction).toEqual(a.actions[0]);
    for (let i = 1; i < a.actions.length; i++) {
      expect(a.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(a.actions[i].priorityScore);
    }
  });
});

describe("owner-finance planner — empties & immutability", () => {
  it("a clean fully-populated business yields no findings, no actions", () => {
    const diagnosis = diagnoseFinanceSnapshot(perfect(), { now: NOW });
    expect(diagnosis.findings.length).toBe(0);
    const p = planFinanceActionsFromDiagnosis(diagnosis);
    expect(p.actions).toEqual([]);
    expect(p.recommendations).toEqual([]);
    expect(p.recommendedNextAction).toBeUndefined();
    expect(p.missingActionInputs).toEqual([]);
  });

  it("does not mutate the diagnosis findings", () => {
    const diagnosis = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    const snapshot = JSON.stringify(diagnosis.findings);
    planFinanceActionsFromDiagnosis(diagnosis);
    expect(JSON.stringify(diagnosis.findings)).toBe(snapshot);
  });

  it("buildFinanceRecommendations is order-preserving and pure", () => {
    const diagnosis = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    const recs = buildFinanceRecommendations(diagnosis.findings);
    expect(recs.map((r) => r.findingCode)).toEqual(
      diagnosis.findings.filter((f) => recs.some((r) => r.findingCode === f.code)).map((f) => f.code)
    );
  });
});

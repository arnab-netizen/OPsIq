/**
 * Owner Finance (Module 2 Slice 2) — deterministic metrics engine tests.
 * Pure/no DB. Covers margins, break-even, runway, leakage, scores, survival-state
 * escalation, data-confidence, business-model/industry adaptability, currency
 * validation, null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeFinancialMetrics,
  isValidCurrency,
  num,
  resolveFinanceThresholds,
  grossMarginPct,
  netProfit,
  breakEvenRevenue,
  type FinancialSnapshotInput,
  SURVIVAL_STATES,
} from "@/domain/owner-finance";

/** Profitable service business in INR (April 2026). */
function profitable(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    currency: "INR",
    businessModel: "service",
    revenue: 100000,
    costOfGoodsOrServices: 30000,
    rent: 10000,
    salaryPayroll: 20000,
    utilities: 5000,
    marketingSpend: 5000,
    cashOnHand: 200000,
    orderCount: 1000,
    customerCount: 800,
  };
}

const stateRank = (s: string) => SURVIVAL_STATES.indexOf(s as never);

describe("owner-finance — safe numeric + currency", () => {
  it("num() fails closed on missing/NaN/Infinity", () => {
    expect(num(5)).toBe(5);
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("validates currency (alpha 3–8), rejects empty/numeric", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("12")).toBe(false);
    expect(isValidCurrency("TOOLONGCODE")).toBe(false);
    expect(computeFinancialMetrics({ ...profitable(), currency: "" }).currencyValid).toBe(false);
    expect(computeFinancialMetrics(profitable()).currencyValid).toBe(true);
  });
});

describe("owner-finance — normal profitable business", () => {
  it("computes correct margins, break-even, and a SAFE state", () => {
    const m = computeFinancialMetrics(profitable());
    expect(m.grossMarginPct).toBe(70); // (100k-30k)/100k
    expect(m.netProfit).toBe(30000); // 100k - (35k fixed + 30k var + 5k mktg)
    expect(m.netMarginPct).toBe(30);
    expect(m.contributionMarginPct).toBe(70); // (100k - 30k variable)/100k
    expect(m.breakEvenRevenue).toBe(50000); // 35k / 0.70
    expect(m.cashRunwayDays).toBeNull(); // profitable → not burning
    expect(m.profitPerOrder).toBe(30); // 30000 / 1000
    expect(m.survivalState).toBe("SAFE");
    expect(m.survivalTier).toBe("optimization");
  });
});

describe("owner-finance — risk scenarios escalate survival state", () => {
  it("zero revenue → margins null, no crash", () => {
    const m = computeFinancialMetrics({ ...profitable(), revenue: 0 });
    expect(m.grossMarginPct).toBeNull();
    expect(m.netMarginPct).toBeNull();
    expect(SURVIVAL_STATES).toContain(m.survivalState);
  });

  it("negative profit → negative net margin, not SAFE", () => {
    const m = computeFinancialMetrics({
      ...profitable(), revenue: 50000, fixedCosts: 40000, variableCosts: 40000,
      rent: undefined, salaryPayroll: undefined, utilities: undefined,
      costOfGoodsOrServices: undefined, marketingSpend: 0,
    });
    expect(m.netMarginPct!).toBeLessThan(0);
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
  });

  it("missing costs → netProfit null, 'costs' listed missing", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, cashOnHand: 50000,
    });
    expect(m.netProfit).toBeNull();
    expect(m.missingRequiredInputs).toContain("costs");
  });

  it("high fixed cost burden → not SAFE", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, fixedCosts: 60000, variableCosts: 10000, cashOnHand: 100000,
    });
    expect(m.fixedCostBurdenPct).toBe(60);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("high debt/EMI pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), loanEmiDebtPayments: 30000 });
    expect(m.debtServicePressurePct).toBe(30);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("low cash runway → CRITICAL or worse", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 20000,
    });
    expect(m.cashRunwayDays).toBe(20); // 20000 / (30000 loss / 30 days)
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("CRITICAL"));
  });

  it("insolvent runway → INSOLVENT_RISK", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000,
    });
    expect(m.cashRunwayDays!).toBeLessThan(7);
    expect(m.survivalState).toBe("INSOLVENT_RISK");
  });

  it("overdue receivables pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), receivables: 40000, receivablesOverdue: 30000 });
    expect(m.receivablesPressurePct).toBe(40);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("payables pressure → not SAFE", () => {
    const m = computeFinancialMetrics({ ...profitable(), payables: 50000 });
    expect(m.payablesPressurePct).toBe(50);
    expect(m.survivalState).not.toBe("SAFE");
  });

  it("break-even not reached → below break-even and not SAFE", () => {
    const m = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 30000, fixedCosts: 40000, variableCosts: 6000, cashOnHand: 100000,
    });
    expect(m.breakEvenRevenue).toBe(50000); // 40000 / 0.8
    expect(stateRank(m.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
  });

  it("survival state escalates monotonically across worsening inputs", () => {
    const safe = computeFinancialMetrics(profitable());
    const watch = computeFinancialMetrics({ ...profitable(), payables: 50000 });
    const atRisk = computeFinancialMetrics({ ...profitable(), loanEmiDebtPayments: 30000 });
    const critical = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 20000,
    });
    expect(stateRank(safe.survivalState)).toBe(stateRank("SAFE"));
    expect(stateRank(watch.survivalState)).toBeGreaterThanOrEqual(stateRank("WATCH"));
    expect(stateRank(atRisk.survivalState)).toBeGreaterThanOrEqual(stateRank("AT_RISK"));
    expect(stateRank(critical.survivalState)).toBeGreaterThanOrEqual(stateRank("CRITICAL"));
    expect(stateRank(atRisk.survivalState)).toBeGreaterThan(stateRank(safe.survivalState));
  });
});

describe("owner-finance — business model & industry adaptability", () => {
  it("industry template changes the fixed-cost-burden bar (service vs inventory)", () => {
    const input = {
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
      revenue: 100000, fixedCosts: 52000, variableCosts: 10000, cashOnHand: 100000,
    };
    const generic = computeFinancialMetrics({ ...input, businessModel: "inventory" });
    const laundry = computeFinancialMetrics({
      ...input, businessModel: "service", industryTemplate: "laundry_local_service",
    });
    // 52% > generic bar (50) → flagged; < laundry bar (55) → not flagged.
    expect(generic.survivalState).not.toBe("SAFE");
    expect(resolveFinanceThresholds("laundry_local_service").highFixedCostBurdenPct).toBe(55);
    expect(stateRank(laundry.survivalState)).toBeLessThan(stateRank(generic.survivalState));
  });

  it("B2C-heavy concentration lowers revenue quality vs balanced B2B/B2C", () => {
    const concentrated = computeFinancialMetrics({ ...profitable(), b2cRevenue: 95000, b2bRevenue: 5000 });
    const balanced = computeFinancialMetrics({ ...profitable(), b2cRevenue: 50000, b2bRevenue: 50000 });
    expect(balanced.revenueQualityScore!).toBeGreaterThan(concentrated.revenueQualityScore!);
  });
});

describe("owner-finance — data confidence", () => {
  it("drops as inputs go missing", () => {
    const full = computeFinancialMetrics({
      ...profitable(), fixedCosts: 35000, loanEmiDebtPayments: 0, receivables: 0,
      payables: 0, ownerWithdrawals: 0, discountAmount: 0, refundAmount: 0,
    });
    const sparse = computeFinancialMetrics({
      periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000,
    });
    expect(full.dataConfidenceScore).toBeGreaterThan(sparse.dataConfidenceScore);
    expect(sparse.missingRequiredInputs.length).toBeGreaterThan(0);
  });
});

describe("owner-finance — invariants", () => {
  const samples: FinancialSnapshotInput[] = [
    profitable(),
    { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" }, // empty
    { ...profitable(), revenue: 0 },
    { ...profitable(), revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 1000 },
  ];

  it("all composite scores stay within 0..100", () => {
    for (const s of samples) {
      const m = computeFinancialMetrics(s);
      for (const v of [m.financialHealthScore, m.financialRiskScore, m.financialOpportunityScore, m.dataConfidenceScore]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("non-computable metrics return null on an empty snapshot", () => {
    const m = computeFinancialMetrics({ periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR" });
    for (const v of [
      m.grossMarginPct, m.netMarginPct, m.contributionMarginPct, m.fixedCostBurdenPct,
      m.breakEvenRevenue, m.cashRunwayDays, m.debtServicePressurePct, m.receivablesPressurePct,
      m.profitPerOrder, m.profitPerCustomer, m.revenueQualityScore, m.netProfit,
    ]) {
      expect(v).toBeNull();
    }
  });

  it("does not mutate the input object", () => {
    const input = profitable();
    const snapshot = JSON.parse(JSON.stringify(input));
    computeFinancialMetrics(input);
    expect(input).toEqual(snapshot);
  });

  it("direct metric helpers agree with the orchestrator", () => {
    const input = profitable();
    expect(grossMarginPct(input)).toBe(70);
    expect(netProfit(input)).toBe(30000);
    expect(breakEvenRevenue(input)).toBe(50000);
  });
});

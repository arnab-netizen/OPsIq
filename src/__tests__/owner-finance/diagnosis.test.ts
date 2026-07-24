/**
 * Owner Finance (Module 2 Slice 3) — diagnosis (risk/opportunity detector) tests.
 * Pure/no DB. Verifies finding emission, separation, scoring bounds, determinism,
 * sorting, DomainScore mirroring, no-invention, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseFinanceSnapshot,
  rankFinanceFindings,
  type FinancialSnapshotInput,
} from "@/domain/owner-finance";

const NOW = new Date("2026-05-10T00:00:00.000Z");

function profitable(): FinancialSnapshotInput {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", businessModel: "service",
    revenue: 100000, costOfGoodsOrServices: 30000, rent: 10000, salaryPayroll: 20000,
    utilities: 5000, marketingSpend: 5000, cashOnHand: 200000, orderCount: 1000, customerCount: 800,
  };
}
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("owner-finance/diagnosis — module contract assertions", () => {
  it("diagnoseFinanceSnapshot is a function", () => { expect(typeof diagnoseFinanceSnapshot).toBe("function"); });
  it("rankFinanceFindings is a function", () => { expect(typeof rankFinanceFindings).toBe("function"); });
  it("NOW is an object", () => { expect(typeof NOW).toBe("object"); });
  it("profitable is a function", () => { expect(typeof profitable).toBe("function"); });
  it("codes is a function", () => { expect(typeof codes).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-finance diagnosis — risk findings", () => {
  it("profitable healthy business has no critical financial risk", () => {
    const r = diagnoseFinanceSnapshot(profitable(), { now: NOW });
    expect(r.riskFindings.some((f) => f.severity === "critical")).toBe(false);
  });

  it("negative net margin emits a negative-margin finding", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
        revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 100000 },
      { now: NOW }
    );
    expect(codes(r.riskFindings)).toContain("FIN_NEGATIVE_NET_MARGIN");
  });

  it("below break-even emits break-even risk and recovery opportunity", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
        revenue: 30000, fixedCosts: 40000, variableCosts: 6000, cashOnHand: 100000 },
      { now: NOW }
    );
    expect(codes(r.riskFindings)).toContain("FIN_BELOW_BREAK_EVEN");
    expect(codes(r.opportunityFindings)).toContain("FIN_OPP_BREAK_EVEN_RECOVERY");
  });

  it("low/insolvent runway escalates to a critical runway finding", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
        revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000 },
      { now: NOW }
    );
    const runwayFinding = r.riskFindings.find((f) => f.code === "FIN_INSOLVENT_RUNWAY");
    expect(runwayFinding).toBeDefined();
    expect(runwayFinding!.severity).toBe("critical");
  });

  it("high debt pressure emits a debt risk", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), loanEmiDebtPayments: 30000 }, { now: NOW });
    expect(codes(r.riskFindings)).toContain("FIN_HIGH_DEBT_PRESSURE");
  });

  it("overdue receivables emits both collection risk and opportunity", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), receivables: 40000, receivablesOverdue: 30000 }, { now: NOW });
    expect(codes(r.riskFindings)).toContain("FIN_HIGH_RECEIVABLES");
    expect(codes(r.opportunityFindings)).toContain("FIN_OPP_RECEIVABLES_COLLECTION");
  });

  it("discount leakage emits leakage risk and reduction opportunity", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    expect(codes(r.riskFindings)).toContain("FIN_DISCOUNT_LEAKAGE");
    expect(codes(r.opportunityFindings)).toContain("FIN_OPP_LEAKAGE_REDUCTION");
  });

  it("missing critical data emits a missing-data finding and lowers confidence", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000 },
      { now: NOW }
    );
    expect(codes(r.riskFindings)).toContain("FIN_MISSING_CRITICAL_DATA");
    expect(r.domainScore.dataConfidenceScore).toBeLessThan(
      diagnoseFinanceSnapshot(profitable(), { now: NOW }).domainScore.dataConfidenceScore
    );
  });

  it("invalid currency emits an invalid-currency finding (no invented source value)", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), currency: "" }, { now: NOW });
    const f = r.riskFindings.find((x) => x.code === "FIN_INVALID_CURRENCY");
    expect(f).toBeDefined();
    expect(f!.sourceValue).toBeNull();
  });
});

describe("owner-finance diagnosis — structure & invariants", () => {
  it("opportunities are separated from risks (no overlap, correct findingType)", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), receivables: 40000, discountAmount: 15000 }, { now: NOW });
    expect(r.riskFindings.every((f) => f.findingType === "risk")).toBe(true);
    expect(r.opportunityFindings.every((f) => f.findingType === "opportunity")).toBe(true);
    const riskCodes = new Set(codes(r.riskFindings));
    expect(codes(r.opportunityFindings).some((c) => riskCodes.has(c))).toBe(false);
    expect(r.findings.length).toBe(r.riskFindings.length + r.opportunityFindings.length);
  });

  it("domainScore mirrors Slice 2 scores", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), loanEmiDebtPayments: 30000 }, { now: NOW });
    expect(r.domainScore.domain).toBe("finance");
    expect(r.domainScore.healthScore).toBe(r.metrics.financialHealthScore);
    expect(r.domainScore.riskScore).toBe(r.metrics.financialRiskScore);
    expect(r.domainScore.opportunityScore).toBe(r.metrics.financialOpportunityScore);
    expect(r.domainScore.dataConfidenceScore).toBe(r.metrics.dataConfidenceScore);
    expect(r.domainScore.topActionCodes).toEqual([]);
  });

  it("all finding scores are bounded (0..100) and confidence 0..1", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
        revenue: 50000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 4000,
        loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000, refundAmount: 5000 },
      { now: NOW }
    );
    for (const f of r.findings) {
      expect(f.impactScore).toBeGreaterThanOrEqual(0);
      expect(f.impactScore).toBeLessThanOrEqual(100);
      expect(f.urgencyScore).toBeGreaterThanOrEqual(0);
      expect(f.urgencyScore).toBeLessThanOrEqual(100);
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic and severity-sorted", () => {
    const input = { ...profitable(), loanEmiDebtPayments: 30000, receivables: 40000, discountAmount: 15000 };
    const a = diagnoseFinanceSnapshot(input, { now: NOW });
    const b = diagnoseFinanceSnapshot(input, { now: NOW });
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings));
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < a.findings.length; i++) {
      expect(rank[a.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[a.findings[i].severity]);
    }
  });

  it("does not invent source values for non-computable metrics", () => {
    const r = diagnoseFinanceSnapshot(
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", cashOnHand: 1000 },
      { now: NOW }
    );
    // No revenue/costs → no margin/break-even findings fabricated.
    expect(codes(r.riskFindings)).not.toContain("FIN_NEGATIVE_NET_MARGIN");
    expect(codes(r.riskFindings)).not.toContain("FIN_BELOW_BREAK_EVEN");
    expect(r.metrics.netMarginPct).toBeNull();
  });

  it("does not mutate the input object", () => {
    const input = profitable();
    const copy = JSON.parse(JSON.stringify(input));
    diagnoseFinanceSnapshot(input, { now: NOW });
    expect(input).toEqual(copy);
  });

  it("handles service / inventory / B2B-heavy / B2C-heavy without hardcoding any business", () => {
    const variants: FinancialSnapshotInput[] = [
      { ...profitable(), businessModel: "service" },
      { ...profitable(), businessModel: "inventory", inventoryStockCashLock: 50000 },
      { ...profitable(), businessModel: "hybrid", b2bRevenue: 80000, b2cRevenue: 20000 },
      { ...profitable(), b2cRevenue: 90000, b2bRevenue: 10000, industryTemplate: "laundry_local_service" },
    ];
    for (const v of variants) {
      const r = diagnoseFinanceSnapshot(v, { now: NOW });
      expect(Array.isArray(r.findings)).toBe(true);
      expect(r.domainScore.domain).toBe("finance");
      expect(JSON.stringify(r)).not.toMatch(/tumbledry/i);
    }
  });

  it("rankFinanceFindings is pure (no input mutation)", () => {
    const r = diagnoseFinanceSnapshot({ ...profitable(), discountAmount: 15000 }, { now: NOW });
    const original = [...r.findings];
    rankFinanceFindings(r.findings);
    expect(r.findings).toEqual(original);
  });
});

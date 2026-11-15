import { describe, it, expect } from "vitest";
import { closedMonths, isClosedMonth, monthOf, freshnessOf, isIsoDate } from "@/domain/quickbooks/qbo-report-model";
import { deriveMonthlyFigures, figuresDiffer, type QboObservationView } from "@/domain/quickbooks/qbo-derivation";

const obs = (reportType: QboObservationView["reportType"], values: Record<string, number | null>, over: Partial<QboObservationView> = {}): QboObservationView => ({
  id: `${reportType}-id`, reportType, periodStart: "2026-09-01", periodEnd: "2026-09-30", basis: "ACCRUAL", currency: "USD", noReportData: false, values, version: 1, ...over,
});
const ctx = { businessCurrency: "usd", expectedBasis: "ACCRUAL" as const };

describe("period policy", () => {
  it("closed months exclude the in-progress month and cross year boundaries", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const m = closedMonths(now, 3);
    expect(m.map((x) => x.start)).toEqual(["2025-12-01", "2025-11-01", "2025-10-01"]);
    expect(m[0].end).toBe("2025-12-31");
    expect(isClosedMonth(monthOf(2026, 0), now)).toBe(false);
    expect(isClosedMonth(monthOf(2025, 11), now)).toBe(true);
  });
  it("leap-year February ends on the 29th", () => { expect(monthOf(2028, 1).end).toBe("2028-02-29"); });
  it("freshness", () => {
    const now = new Date("2026-10-24T00:00:00Z");
    expect(freshnessOf(null, now)).toBe("NEVER");
    expect(freshnessOf(new Date("2026-10-23T06:00:00Z"), now)).toBe("FRESH");
    expect(freshnessOf(new Date("2026-10-22T00:00:00Z"), now)).toBe("STALE");
  });
  it("iso date validation", () => { expect(isIsoDate("2026-02-30")).toBe(false); expect(isIsoDate("2026-02-28")).toBe(true); });
});

describe("derivation", () => {
  const pl = obs("PROFIT_AND_LOSS", { income: 100, cogs: 40, expenses: 10, netIncome: 50 });
  const bs = obs("BALANCE_SHEET", { bankAccounts: 500, accountsReceivable: 70, accountsPayable: 25, totalAssets: 900 }, { periodStart: "2026-09-30" });
  const ar = obs("AGED_RECEIVABLES", { total: 70, current: 50 }, { periodStart: "2026-09-30" });
  const ap = obs("AGED_PAYABLES", { total: 25, current: 25 }, { periodStart: "2026-09-30" });

  it("derives only genuinely stated figures", () => {
    const r = deriveMonthlyFigures({ pl, bs, ar, ap }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.figures.finance).toEqual({ revenue: 100, costOfGoods: 40, receivables: 70, overdueReceivables: 20, payables: 25, overduePayables: 0 });
    expect(r.figures.cashflow.bankBalance).toBe(500);
    expect(Object.keys(r.figures.finance)).not.toContain("cashOnHand");
    expect(Object.keys(r.figures.finance)).not.toContain("payroll");
  });
  it("missing report → missing figure, not zero", () => {
    const r = deriveMonthlyFigures({ pl }, ctx);
    expect(r.ok && r.figures.finance.receivables).toBeNull();
    expect(r.ok && r.figures.cashflow.bankBalance).toBeNull();
  });
  it("overdue needs both total and current", () => {
    const r = deriveMonthlyFigures({ ar: obs("AGED_RECEIVABLES", { total: 70, current: null }) }, ctx);
    expect(r.ok && r.figures.finance.overdueReceivables).toBeNull();
    expect(r.ok && r.figures.finance.receivables).toBe(70);
  });
  it("negatives are omitted with a bounded reason, never clamped", () => {
    const r = deriveMonthlyFigures({ pl: obs("PROFIT_AND_LOSS", { income: -5, cogs: 3 }), bs: obs("BALANCE_SHEET", { bankAccounts: -10 }) }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.figures.finance.revenue).toBeNull();
    expect(r.figures.cashflow.bankBalance).toBeNull();
    expect(r.figures.omitted).toEqual({ revenue: "NEGATIVE_VALUE", bankBalance: "NEGATIVE_VALUE" });
  });
  it("currency: unknown and mismatch refuse; no conversion", () => {
    expect(deriveMonthlyFigures({ pl: obs("PROFIT_AND_LOSS", { income: 1 }, { currency: null }) }, ctx)).toEqual({ ok: false, refusal: "CURRENCY_UNKNOWN" });
    expect(deriveMonthlyFigures({ pl: obs("PROFIT_AND_LOSS", { income: 1 }, { currency: "EUR" }) }, ctx)).toEqual({ ok: false, refusal: "CURRENCY_MISMATCH" });
  });
  it("basis mismatch (one cash observation among accrual) refuses the whole month", () => {
    expect(deriveMonthlyFigures({ pl, ar: obs("AGED_RECEIVABLES", { total: 1, current: 1 }, { basis: "CASH" }) }, ctx)).toEqual({ ok: false, refusal: "BASIS_MISMATCH" });
  });
  it("nothing derivable", () => {
    expect(deriveMonthlyFigures({}, ctx)).toEqual({ ok: false, refusal: "NO_DERIVABLE_FIGURES" });
    expect(deriveMonthlyFigures({ pl: obs("PROFIT_AND_LOSS", { income: null, cogs: null }) }, ctx)).toEqual({ ok: false, refusal: "NO_DERIVABLE_FIGURES" });
    expect(deriveMonthlyFigures({ pl: obs("PROFIT_AND_LOSS", { income: 5 }, { noReportData: true }) }, ctx)).toEqual({ ok: false, refusal: "NO_DERIVABLE_FIGURES" });
  });
  it("figuresDiffer: cent precision; incoming null never counts", () => {
    expect(figuresDiffer(10, 10.004)).toBe(false);
    expect(figuresDiffer(10, 10.01)).toBe(true);
    expect(figuresDiffer(null, 0)).toBe(true);
    expect(figuresDiffer(5, null)).toBe(false);
  });
});

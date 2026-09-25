import { describe, expect, it } from "vitest";
import { deriveSnapshotInputsFromReports } from "@/domain/quickbooks/qbo-derivation";
import { parseQboReport } from "@/domain/quickbooks/qbo-report-parser";
import profitAndLoss from "@/__tests__/fixtures/quickbooks/profit-and-loss.json";
import balanceSheet from "@/__tests__/fixtures/quickbooks/balance-sheet.json";
import agedReceivables from "@/__tests__/fixtures/quickbooks/aged-receivables.json";
import agedPayables from "@/__tests__/fixtures/quickbooks/aged-payables.json";
import emptyReport from "@/__tests__/fixtures/quickbooks/empty-report.json";
import profitAndLossVariableHeavy from "@/__tests__/fixtures/quickbooks/profit-and-loss-variable-heavy.json";

const baseParams = {
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  currency: "USD",
};

describe("deriveSnapshotInputsFromReports — full inputs", () => {
  const result = deriveSnapshotInputsFromReports({
    ...baseParams,
    profitAndLoss,
    balanceSheet,
    agedReceivables,
    agedPayables,
  });

  it("derives financial snapshot fields with exact FinancialSnapshotCreateInput field names", () => {
    expect(result.financial).toEqual({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      currency: "USD",
      revenue: 12000,
      costOfGoodsOrServices: 3000,
      cashOnHand: 22500,
      receivables: 7200,
      receivablesOverdue: 6000,
      payables: 3100,
      payablesOverdue: 2500,
    });
  });

  it("never derives fixedCosts from P&L — Expenses mixes fixed and variable costs", () => {
    expect(result.financial.fixedCosts).toBeUndefined();
    expect(result.issues.some((i) => i.includes("'Expenses' mixes fixed and variable costs"))).toBe(true);
  });

  it("derives cashflow snapshot fields with exact CashflowSnapshotCreateInput field names", () => {
    expect(result.cashflow).toEqual({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      currency: "USD",
      bankBalance: 22500,
      receivables: 7200,
      receivablesOverdue: 6000,
      payables: 3100,
      payablesOverdue: 2500,
    });
  });

  it("has no OTHER issues when every report is present and complete (only the expected fixedCosts-not-derived issue)", () => {
    expect(result.issues).toEqual(["ProfitAndLoss 'Expenses' mixes fixed and variable costs — not classified; OpsIQ does not guess"]);
  });

  it("lists every consulted report in sourceReports", () => {
    expect(result.sourceReports).toEqual(["ProfitAndLoss", "BalanceSheet", "AgedReceivables", "AgedPayables"]);
  });

  it("accepts already-parsed reports as well as raw JSON", () => {
    const parsed = deriveSnapshotInputsFromReports({
      ...baseParams,
      profitAndLoss: parseQboReport(profitAndLoss),
      balanceSheet: parseQboReport(balanceSheet),
      agedReceivables: parseQboReport(agedReceivables),
      agedPayables: parseQboReport(agedPayables),
    });
    expect(parsed.financial.revenue).toBe(12000);
  });
});

describe("deriveSnapshotInputsFromReports — missing reports", () => {
  it("omits fields (never defaults to 0) and records an issue when a report is entirely missing", () => {
    const result = deriveSnapshotInputsFromReports(baseParams);
    expect(result.financial.revenue).toBeUndefined();
    expect(result.financial.cashOnHand).toBeUndefined();
    expect(result.financial.receivables).toBeUndefined();
    expect(result.financial.payables).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.includes("ProfitAndLoss report not supplied"))).toBe(true);
    expect(result.issues.some((i) => i.includes("BalanceSheet report not supplied"))).toBe(true);
    expect(result.issues.some((i) => i.includes("AgedReceivables report not supplied"))).toBe(true);
    expect(result.issues.some((i) => i.includes("AgedPayables report not supplied"))).toBe(true);
    expect(result.sourceReports).toEqual([]);
  });

  it("omits a field and records an issue when a supplied report has no matching group", () => {
    const result = deriveSnapshotInputsFromReports({ ...baseParams, profitAndLoss: emptyReport });
    expect(result.financial.revenue).toBeUndefined();
    expect(result.financial.costOfGoodsOrServices).toBeUndefined();
    expect(result.financial.fixedCosts).toBeUndefined();
    expect(result.issues.some((i) => i.includes("no 'Income' group found"))).toBe(true);
    expect(result.sourceReports).toEqual(["ProfitAndLoss"]);
  });

  it("never defaults a missing overdue amount to 0 when Current is absent", () => {
    const arNoCurrent = {
      ...agedReceivables,
      Rows: {
        Row: [
          {
            type: "Section",
            Summary: {
              ColData: [
                { value: "TOTAL" },
                { value: "" },
                { value: "3000.00" },
                { value: "" },
                { value: "" },
                { value: "" },
                { value: "3000.00" },
              ],
            },
          },
        ],
      },
    };
    const result = deriveSnapshotInputsFromReports({ ...baseParams, agedReceivables: arNoCurrent });
    expect(result.financial.receivables).toBe(3000);
    expect(result.financial.receivablesOverdue).toBeUndefined();
    expect(result.issues.some((i) => i.includes("receivablesOverdue not derived"))).toBe(true);
  });
});

describe("deriveSnapshotInputsFromReports — fixedCosts is never guessed from a variable-heavy Expenses group", () => {
  it("omits fixedCosts even when Expenses is overwhelmingly variable spend (commissions, shipping)", () => {
    // Total Expenses = 15000 (8000 commissions + 6000 shipping + 1000 rent) — almost
    // entirely variable cost. If this were fed into fixedCosts, fixedCostBurdenPct /
    // breakEvenRevenue / survivalState in owner-finance/metrics.ts would be computed
    // against a fabricated, wildly-wrong "fixed cost" figure.
    const result = deriveSnapshotInputsFromReports({ ...baseParams, profitAndLoss: profitAndLossVariableHeavy });
    expect(result.financial.fixedCosts).toBeUndefined();
    expect(result.financial.revenue).toBe(20000);
    expect(result.financial.costOfGoodsOrServices).toBe(5000);
    expect(result.issues.some((i) => i.includes("'Expenses' mixes fixed and variable costs"))).toBe(true);
    expect(Object.keys(result.financial)).not.toContain("fixedCosts");
  });
});

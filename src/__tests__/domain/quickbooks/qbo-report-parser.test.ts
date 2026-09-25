import { describe, expect, it } from "vitest";
import { getAgingBuckets, getReportGroupTotal, parseQboReport } from "@/domain/quickbooks/qbo-report-parser";
import profitAndLoss from "@/__tests__/fixtures/quickbooks/profit-and-loss.json";
import balanceSheet from "@/__tests__/fixtures/quickbooks/balance-sheet.json";
import agedReceivables from "@/__tests__/fixtures/quickbooks/aged-receivables.json";
import agedPayables from "@/__tests__/fixtures/quickbooks/aged-payables.json";
import emptyReport from "@/__tests__/fixtures/quickbooks/empty-report.json";

describe("parseQboReport — Profit & Loss", () => {
  const report = parseQboReport(profitAndLoss);

  it("parses the report header", () => {
    expect(report.name).toBe("ProfitAndLoss");
    expect(report.startPeriod).toBe("2026-01-01");
    expect(report.endPeriod).toBe("2026-01-31");
    expect(report.currency).toBe("USD");
  });

  it("parses columns", () => {
    expect(report.columns.map((c) => c.title)).toEqual(["", "Total"]);
  });

  it("flattens nested Data rows with account ids", () => {
    const sales = report.rows.find((r) => r.label === "Sales");
    expect(sales?.accountId).toBe("79");
    expect(sales?.values).toEqual([10000]);
    expect(sales?.depth).toBe(1);
  });

  it("resolves group totals via getReportGroupTotal", () => {
    expect(getReportGroupTotal(report, "Income")).toBe(12000);
    expect(getReportGroupTotal(report, "COGS")).toBe(3000);
    expect(getReportGroupTotal(report, "GrossProfit")).toBe(9000);
    expect(getReportGroupTotal(report, "Expenses")).toBe(4000);
    expect(getReportGroupTotal(report, "NetOperatingIncome")).toBe(5000);
    expect(getReportGroupTotal(report, "NetIncome")).toBe(5000);
  });

  it("returns null for a group that is not present", () => {
    expect(getReportGroupTotal(report, "DoesNotExist")).toBeNull();
  });
});

describe("parseQboReport — Balance Sheet", () => {
  const report = parseQboReport(balanceSheet);

  it("resolves nested group totals", () => {
    expect(getReportGroupTotal(report, "BankAccounts")).toBe(22500);
    expect(getReportGroupTotal(report, "AR")).toBe(7200);
    expect(getReportGroupTotal(report, "TotalAssets")).toBe(29700);
    expect(getReportGroupTotal(report, "AP")).toBe(3100);
    expect(getReportGroupTotal(report, "TotalLiabilities")).toBe(3100);
    expect(getReportGroupTotal(report, "Equity")).toBe(26600);
  });

  it("preserves depth for nested sections", () => {
    const bankSummary = report.rows.find((r) => r.group === "BankAccounts" && r.type === "Summary");
    expect(bankSummary?.depth).toBeGreaterThan(0);
  });
});

describe("parseQboReport — Aged Receivables / Payables", () => {
  it("parses aging columns", () => {
    const report = parseQboReport(agedReceivables);
    expect(report.columns.map((c) => c.title)).toEqual(["", "Current", "1 - 30", "31 - 60", "61 - 90", "91 and over", "Total"]);
  });

  it("extracts aging buckets from the TOTAL row for Aged Receivables", () => {
    const report = parseQboReport(agedReceivables);
    const buckets = getAgingBuckets(report);
    expect(buckets).toEqual({ current: 1200, d1_30: 3000, d31_60: 0, d61_90: 0, d91plus: 3000, total: 7200 });
  });

  it("extracts aging buckets from the TOTAL row for Aged Payables", () => {
    const report = parseQboReport(agedPayables);
    const buckets = getAgingBuckets(report);
    expect(buckets).toEqual({ current: 600, d1_30: 0, d31_60: 2500, d61_90: 0, d91plus: 0, total: 3100 });
  });

  it("treats blank cell values ('') as null, not 0", () => {
    const report = parseQboReport(agedReceivables);
    const acme = report.rows.find((r) => r.label === "Acme Corp");
    // Current, then 1-30..91+ blank, then Total: [1200, null, null, null, null, 1200]
    expect(acme?.values).toEqual([1200, null, null, null, null, 1200]);
  });

  it.each(["91 and over", "91 & over", "> 90", "90+", "91+", "Over 90", "OVER 90"])(
    "recognizes %j as the 91+ aging column, case-insensitively",
    (title) => {
      const report = parseQboReport({
        Header: {},
        Columns: {
          Column: [{ ColTitle: "" }, { ColTitle: "Current" }, { ColTitle: title }, { ColTitle: "Total" }],
        },
        Rows: {
          Row: [
            {
              type: "Section",
              Summary: { ColData: [{ value: "TOTAL" }, { value: "100.00" }, { value: "50.00" }, { value: "150.00" }] },
            },
          ],
        },
      });
      const buckets = getAgingBuckets(report);
      expect(buckets.d91plus).toBe(50);
      expect(buckets.current).toBe(100);
      expect(buckets.total).toBe(150);
    },
  );
});

describe("parseQboReport — robustness", () => {
  it("handles an empty report with no rows", () => {
    const report = parseQboReport(emptyReport);
    expect(report.rows).toEqual([]);
    expect(getReportGroupTotal(report, "Income")).toBeNull();
    expect(getAgingBuckets(report)).toEqual({ current: null, d1_30: null, d31_60: null, d61_90: null, d91plus: null, total: null });
  });

  it("handles a completely missing Rows/Columns/Header gracefully", () => {
    const report = parseQboReport({});
    expect(report.name).toBeNull();
    expect(report.columns).toEqual([]);
    expect(report.rows).toEqual([]);
  });

  it("handles null/undefined/non-object input", () => {
    expect(parseQboReport(null).rows).toEqual([]);
    expect(parseQboReport(undefined).rows).toEqual([]);
    expect(parseQboReport("garbage").rows).toEqual([]);
  });

  it("parses parenthesized negative amounts", () => {
    const report = parseQboReport({
      Header: {},
      Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Total" }] },
      Rows: { Row: [{ type: "Data", ColData: [{ value: "Loss" }, { value: "(500.00)" }] }] },
    });
    expect(report.rows[0].values).toEqual([-500]);
  });
});

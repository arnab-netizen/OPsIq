/**
 * Sanitised QuickBooks Online report bodies (no real company, no customer names, no secrets).
 *
 * HISTORICAL_* follow the long-standing documented shape (Header / Columns / Rows with `group` sections).
 * MODERN_* deliberately differ the way a regrouped / reordered report-service response may: the amount column is not
 * last, an extra money column is present, sections are in a different order, and one section carries no `group` (label only).
 * They are structural stress fixtures — NOT captured Intuit Sandbox responses (Sandbox was unreachable when written).
 */

const money = (title: string, key: string) => ({ ColTitle: title, ColType: "Money", MetaData: [{ Name: "ColKey", Value: key }] });
const acct = { ColTitle: "", ColType: "Account", MetaData: [{ Name: "ColKey", Value: "account" }] };
const cd = (...v: string[]) => v.map((value) => ({ value }));

export const HISTORICAL_PL = (start = "2026-09-01", end = "2026-09-30", basis = "Accrual", currency = "USD") => ({
  Header: { Time: "2026-10-02T10:00:00-07:00", ReportName: "ProfitAndLoss", ReportBasis: basis, StartPeriod: start, EndPeriod: end, Currency: currency, Option: [{ Name: "NoReportData", Value: "false" }] },
  Columns: { Column: [acct, money("Total", "total")] },
  Rows: {
    Row: [
      { type: "Section", group: "Income", Header: { ColData: cd("Income", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Sales", "9000.00") }, { type: "Data", ColData: cd("Services", "3000.50") }] }, Summary: { ColData: cd("Total Income", "12000.50") } },
      { type: "Section", group: "COGS", Header: { ColData: cd("Cost of Goods Sold", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Supplies", "4000.00") }] }, Summary: { ColData: cd("Total Cost of Goods Sold", "4000.00") } },
      { type: "Section", group: "GrossProfit", Summary: { ColData: cd("Gross Profit", "8000.50") } },
      { type: "Section", group: "Expenses", Header: { ColData: cd("Expenses", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Rent", "1500.00") }] }, Summary: { ColData: cd("Total Expenses", "1500.00") } },
      { type: "Section", group: "NetOperatingIncome", Summary: { ColData: cd("Net Operating Income", "6500.50") } },
      { type: "Section", group: "NetIncome", Summary: { ColData: cd("Net Income", "6500.50") } },
    ],
  },
});

export const HISTORICAL_BS = (asOf = "2026-09-30", basis = "Accrual", currency = "USD") => ({
  Header: { ReportName: "BalanceSheet", ReportBasis: basis, StartPeriod: "2026-01-01", EndPeriod: asOf, Currency: currency, Option: [{ Name: "NoReportData", Value: "false" }] },
  Columns: { Column: [acct, money("Total", "total")] },
  Rows: {
    Row: [
      {
        type: "Section", group: "Assets", Header: { ColData: cd("ASSETS", "") },
        Rows: { Row: [
          { type: "Section", group: "CurrentAssets", Header: { ColData: cd("Current Assets", "") }, Rows: { Row: [
            { type: "Section", group: "BankAccounts", Header: { ColData: cd("Bank Accounts", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Checking", "15000.25") }, { type: "Data", ColData: cd("Savings", "5000.00") }] }, Summary: { ColData: cd("Total Bank Accounts", "20000.25") } },
            { type: "Section", group: "AR", Header: { ColData: cd("Accounts Receivable", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Accounts Receivable (A/R)", "7000.00") }] }, Summary: { ColData: cd("Total Accounts Receivable", "7000.00") } },
          ] }, Summary: { ColData: cd("Total Current Assets", "27000.25") } },
        ] },
        Summary: { ColData: cd("TOTAL ASSETS", "27000.25") },
      },
      { type: "Section", group: "Liabilities", Header: { ColData: cd("LIABILITIES", "") }, Rows: { Row: [
        { type: "Section", group: "AP", Header: { ColData: cd("Accounts Payable", "") }, Rows: { Row: [{ type: "Data", ColData: cd("Accounts Payable (A/P)", "2500.00") }] }, Summary: { ColData: cd("Total Accounts Payable", "2500.00") } },
      ] }, Summary: { ColData: cd("Total Liabilities", "2500.00") } },
    ],
  },
});

const agedCols = [acct, money("Current", "current"), money("1 - 30", "b1"), money("31 - 60", "b2"), money("61 - 90", "b3"), money("91 and over", "b4"), money("Total", "total")];

export const HISTORICAL_AGED = (name: "AgedReceivables" | "AgedPayables", asOf = "2026-09-30", basis = "Accrual", currency = "USD", grand = ["TOTAL", "5000.00", "1000.00", "500.00", "0.00", "500.00", "7000.00"]) => ({
  Header: { ReportName: name, ReportBasis: basis, EndPeriod: asOf, Currency: currency, Option: [{ Name: "NoReportData", Value: "false" }] },
  Columns: { Column: agedCols },
  Rows: {
    Row: [
      { type: "Data", ColData: cd("Customer A", "2000.00", "0.00", "0.00", "0.00", "0.00", "2000.00") },
      { type: "Data", ColData: cd("Customer B", "3000.00", "1000.00", "500.00", "0.00", "500.00", "5000.00") },
      { type: "Section", group: "GrandTotal", Summary: { ColData: cd(...grand) } },
    ],
  },
});

export const NO_DATA_REPORT = (name: string, cols = [acct, money("Total", "total")]) => ({
  Header: { ReportName: name, ReportBasis: "Accrual", Currency: "USD", Option: [{ Name: "NoReportData", Value: "true" }] },
  Columns: { Column: cols },
  Rows: {},
});

/** Modern-style P&L: extra leading money column, amount column NOT last, sections reordered, Income located by label only. */
export const MODERN_PL = (start = "2026-09-01", end = "2026-09-30") => ({
  Header: { ReportName: "ProfitAndLoss", ReportBasis: "Accrual", StartPeriod: start, EndPeriod: end, Currency: "USD", Option: [] },
  Columns: { Column: [acct, money("Total", "total"), money("% of Income", "pct")] },
  Rows: {
    Row: [
      { type: "Section", group: "NetIncome", Summary: { ColData: cd("Net Income", "6500.50", "54.1") } },
      { type: "Section", group: "Expenses", Summary: { ColData: cd("Total Expenses", "1500.00", "12.5") } },
      { type: "Section", Header: { ColData: cd("Revenue", "") }, Rows: { Row: [] }, Summary: { ColData: cd("Total Income", "12000.50", "100") } },
      { type: "Section", group: "COGS", Summary: { ColData: cd("Total Cost of Goods Sold", "4000.00", "33.3") } },
    ],
  },
});

/** Modern-style aged report: Total column first, Current not adjacent, grand total located by label only. */
export const MODERN_AGED = (name: "AgedReceivables" | "AgedPayables", asOf = "2026-09-30") => ({
  Header: { ReportName: name, ReportBasis: "Accrual", EndPeriod: asOf, Currency: "USD", Option: [{ Name: "NoReportData", Value: "false" }] },
  Columns: { Column: [acct, money("Total", "total"), money("91 and over", "b4"), money("Current", "current"), money("1 - 30", "b1")] },
  Rows: { Row: [{ type: "Data", ColData: cd("Customer A", "100.00", "0.00", "100.00", "0.00") }, { type: "Section", Summary: { ColData: cd("TOTAL", "7000.00", "500.00", "5000.00", "1000.00") } }] },
});

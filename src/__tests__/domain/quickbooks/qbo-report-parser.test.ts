import { describe, it, expect } from "vitest";
import {
  parseProfitAndLoss, parseBalanceSheet, parseAgedReceivables, parseAgedPayables, parseQboReport, parseAmount,
  canonicalObservationJson, QboReportParseError,
} from "@/domain/quickbooks/qbo-report-parser";
import { HISTORICAL_PL, HISTORICAL_BS, HISTORICAL_AGED, MODERN_PL, MODERN_AGED, NO_DATA_REPORT } from "@/__tests__/fixtures/qbo/qbo-report-fixtures";

const SEP = { start: "2026-09-01", end: "2026-09-30" };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as QboReportParseError).code; } return "NO_THROW"; };

describe("QBO report parser — historical shape", () => {
  it("P&L: income / COGS / expenses / net income, basis + currency preserved", () => {
    const r = parseProfitAndLoss(HISTORICAL_PL(), SEP);
    expect(r.values).toEqual({ income: 12000.5, cogs: 4000, expenses: 1500, netIncome: 6500.5 });
    expect(r.basis).toBe("ACCRUAL");
    expect(r.currency).toBe("USD");
    expect(r.periodStart).toBe("2026-09-01");
    expect(r.periodEnd).toBe("2026-09-30");
  });
  it("Balance sheet: bank accounts found through nested sections", () => {
    const r = parseBalanceSheet(HISTORICAL_BS(), "2026-09-30");
    expect(r.values.bankAccounts).toBe(20000.25);
    expect(r.values.accountsReceivable).toBe(7000);
    expect(r.values.accountsPayable).toBe(2500);
    expect(r.values.totalAssets).toBe(27000.25);
    expect(r.periodStart).toBe(r.periodEnd);
  });
  it("Aged receivables / payables: grand total, current and every bucket; customer rows never read", () => {
    const ar = parseAgedReceivables(HISTORICAL_AGED("AgedReceivables"), "2026-09-30");
    expect(ar.values).toEqual({ total: 7000, current: 5000 });
    expect(ar.buckets.map((b) => b.title)).toEqual(["Current", "1 - 30", "31 - 60", "61 - 90", "91 and over"]);
    expect(JSON.stringify(ar)).not.toContain("Customer");
    const ap = parseAgedPayables(HISTORICAL_AGED("AgedPayables"), "2026-09-30");
    expect(ap.values.total).toBe(7000);
  });
  it("cash basis is read from the header", () => {
    expect(parseProfitAndLoss(HISTORICAL_PL("2026-09-01", "2026-09-30", "Cash"), SEP).basis).toBe("CASH");
  });
});

describe("QBO report parser — modern / reordered shape (semantic, not positional)", () => {
  it("P&L: amount column resolved by key even with a trailing % column; Income found by label when group is absent", () => {
    const r = parseProfitAndLoss(MODERN_PL(), SEP);
    expect(r.values).toEqual({ income: 12000.5, cogs: 4000, expenses: 1500, netIncome: 6500.5 });
  });
  it("Aged: Total/Current resolved by column identity, grand total by label, regardless of column order", () => {
    const r = parseAgedReceivables(MODERN_AGED("AgedReceivables"), "2026-09-30");
    expect(r.values).toEqual({ total: 7000, current: 5000 });
  });
});

describe("zero vs missing", () => {
  it("a stated 0.00 is 0; an absent section is null (never 0)", () => {
    const body = HISTORICAL_PL();
    body.Rows.Row = body.Rows.Row.filter((r) => r.group !== "COGS");
    (body.Rows.Row[0].Summary as { ColData: Array<{ value: string }> }).ColData[1].value = "0.00";
    const r = parseProfitAndLoss(body, SEP);
    expect(r.values.income).toBe(0);
    expect(r.values.cogs).toBeNull();
  });
  it("an empty cell is null", () => {
    expect(parseAmount("", "x")).toBeNull();
    expect(parseAmount(undefined, "x")).toBeNull();
  });
  it("P&L / balance sheet with NoReportData states nothing (all null); aged states a known zero", () => {
    const pl = parseProfitAndLoss(NO_DATA_REPORT("ProfitAndLoss"), SEP);
    expect(pl.noReportData).toBe(true);
    expect(Object.values(pl.values).every((v) => v === null)).toBe(true);
    const ar = parseAgedReceivables(NO_DATA_REPORT("AgedReceivables"), "2026-09-30");
    expect(ar.values).toEqual({ total: 0, current: 0 });
  });
  it("aged report with rows but no grand total yields null total, not 0", () => {
    const b = HISTORICAL_AGED("AgedReceivables");
    b.Rows.Row = b.Rows.Row.filter((r) => r.type === "Data");
    expect(parseAgedReceivables(b, "2026-09-30").values.total).toBeNull();
  });
});

describe("fail closed", () => {
  it("not a report", () => {
    expect(code(() => parseProfitAndLoss(null, SEP))).toBe("NOT_A_REPORT");
    expect(code(() => parseProfitAndLoss({ Rows: {} }, SEP))).toBe("NOT_A_REPORT");
    expect(code(() => parseQboReport("BALANCE_SHEET", "x", SEP))).toBe("NOT_A_REPORT");
  });
  it("wrong report / wrong period", () => {
    expect(code(() => parseBalanceSheet(HISTORICAL_PL(), "2026-09-30"))).toBe("REPORT_NAME_MISMATCH");
    expect(code(() => parseProfitAndLoss(HISTORICAL_PL("2026-08-01", "2026-08-31"), SEP))).toBe("PERIOD_MISMATCH");
    expect(code(() => parseBalanceSheet(HISTORICAL_BS("2026-08-31"), "2026-09-30"))).toBe("PERIOD_MISMATCH");
  });
  it("non-numeric and out-of-range amounts", () => {
    const b = HISTORICAL_PL();
    (b.Rows.Row[0].Summary as { ColData: Array<{ value: string }> }).ColData[1].value = "12,000.50";
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("VALUE_NOT_NUMERIC");
    (b.Rows.Row[0].Summary as { ColData: Array<{ value: string }> }).ColData[1].value = "1e15";
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("VALUE_NOT_NUMERIC");
    (b.Rows.Row[0].Summary as { ColData: Array<{ value: string }> }).ColData[1].value = "99999999999999";
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("VALUE_OUT_OF_RANGE");
  });
  it("ambiguous total column / duplicate group", () => {
    const b = HISTORICAL_PL();
    b.Columns.Column.push({ ColTitle: "Total", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "total2" }] });
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("COLUMNS_UNRESOLVED");
    const d = HISTORICAL_PL();
    d.Rows.Row.push({ ...d.Rows.Row[0] });
    expect(code(() => parseProfitAndLoss(d, SEP))).toBe("SECTION_AMBIGUOUS");
  });
  it("many money columns with none identifiable as Total", () => {
    const b = HISTORICAL_PL();
    b.Columns.Column = [b.Columns.Column[0], { ColTitle: "Jan", ColType: "Money", MetaData: [] }, { ColTitle: "Feb", ColType: "Money", MetaData: [] }];
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("COLUMNS_UNRESOLVED");
  });
  it("invalid currency / basis", () => {
    const b = HISTORICAL_PL();
    b.Header.Currency = "US";
    expect(code(() => parseProfitAndLoss(b, SEP))).toBe("CURRENCY_INVALID");
    expect(code(() => parseProfitAndLoss(HISTORICAL_PL("2026-09-01", "2026-09-30", "Hybrid"), SEP))).toBe("BASIS_INVALID");
  });
  it("errors never carry the provider body", () => {
    const b = HISTORICAL_PL();
    (b.Rows.Row[0].Summary as { ColData: Array<{ value: string }> }).ColData[1].value = "SECRET-BODY-12";
    try { parseProfitAndLoss(b, SEP); } catch (e) { expect(String((e as Error).message) + JSON.stringify(e)).not.toContain("SECRET-BODY"); }
  });
  it("header silent about basis/currency → null (caller decides), never defaulted here", () => {
    const b = HISTORICAL_PL();
    delete (b.Header as Partial<typeof b.Header>).ReportBasis;
    delete (b.Header as Partial<typeof b.Header>).Currency;
    const r = parseProfitAndLoss(b, SEP);
    expect(r.basis).toBeNull();
    expect(r.currency).toBeNull();
  });
});

describe("canonical observation json", () => {
  it("is key-order independent and changes when a value changes", () => {
    const a = parseProfitAndLoss(HISTORICAL_PL(), SEP);
    const same = { ...a, values: { netIncome: a.values.netIncome, expenses: a.values.expenses, cogs: a.values.cogs, income: a.values.income } };
    expect(canonicalObservationJson(a, 1)).toBe(canonicalObservationJson(same, 1));
    expect(canonicalObservationJson(a, 1)).not.toBe(canonicalObservationJson({ ...a, values: { ...a.values, income: 1 } }, 1));
    expect(canonicalObservationJson(a, 1)).not.toBe(canonicalObservationJson(a, 2));
  });
});

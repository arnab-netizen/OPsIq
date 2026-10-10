import { describe, it, expect } from "vitest";
import {
  normalizeCustomer, normalizeInvoice, normalizeBill, normalizeCompanyInfo, normalizeQueryRecord, dedupeRecords, toDecimalString, contentHash, canonicalJson,
  parseProfitAndLoss, parseBalanceSheet, parseAgedReport, type NormalizedRecord,
} from "@/domain/quickbooks/qbo-normalize";
import { customer, invoice, bill, profitAndLossBody, balanceSheetBody, agedBody } from "@/__tests__/test-helpers/qbo-fake-intuit";

const P = (o: Record<string, string>) => new URLSearchParams(o);

describe("decimal handling", () => {
  it("keeps exact decimal strings (max 4 places) and rejects non-finite input", () => {
    expect(toDecimalString(100)).toBe("100");
    expect(toDecimalString(250.5)).toBe("250.5");
    expect(toDecimalString("1234.50")).toBe("1234.5");
    expect(toDecimalString(0.1 + 0.2)).toBe("0.3");
    expect(toDecimalString(-0)).toBe("0");
    expect(toDecimalString("-12.3456789")).toBe("-12.3457"); // rounded to 4 places, never truncated silently into another unit
    expect(toDecimalString("1.123456789")).toBeNull(); // more precision than any currency uses is refused
    // Large-denomination currencies (VND, IDR) keep every digit; there is no float multiplication in the path.
    expect(toDecimalString("123456789012345.1234")).toBe("123456789012345.1234");
    expect(toDecimalString("45000000000000")).toBe("45000000000000");
    expect(toDecimalString(5_000_000_000_000.25)).toBe("5000000000000.25");
    expect(toDecimalString("-0.00004")).toBe("0"); // rounds to zero without a "-0"
    expect(toDecimalString("-0.00005")).toBe("-0.0001"); // half away from zero
    expect(toDecimalString(1e15)).toBeNull();
    for (const bad of [NaN, Infinity, "abc", "1,000.00", null, undefined, {}, 1e16]) expect(toDecimalString(bad as never)).toBeNull();
  });
  it("hash is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe("record normalization", () => {
  it("Customer keeps identity and money only — no e-mail, phone or address (PII minimization)", () => {
    const r = normalizeCustomer(customer("7", "2026-10-01T00:00:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.providerEntityId).toBe("7");
    expect(r.record.recordState).toBe("ACTIVE");
    expect(JSON.stringify(r.record.normalized)).not.toMatch(/pii-|555-0100|@example/);
    expect(r.record.normalized.currency).toBe("USD");
    expect(r.record.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("inactive customers are INACTIVE, not dropped", () => {
    const r = normalizeCustomer(customer("8", "2026-10-01T00:00:00Z", { Active: false }));
    expect(r.ok && r.record.recordState).toBe("INACTIVE");
  });
  it("Invoice/Bill keep totals, balance, dates, currency and counterparty id; missing optionals become null", () => {
    const i = normalizeInvoice(invoice("11", "2026-10-02T00:00:00Z"));
    expect(i.ok && i.record.normalized).toEqual({ docNumber: "INV-11", txnDate: "2026-09-01", dueDate: "2026-09-30", totalAmt: "100", balance: "40", currency: "USD", exchangeRate: null, homeTotalAmt: null, homeBalance: null, isVoided: false, counterpartyId: "1" });
    const b = normalizeBill(bill("12", "2026-10-02T00:00:00Z", { DueDate: undefined, CurrencyRef: undefined }));
    expect(b.ok && b.record.normalized).toMatchObject({ totalAmt: "250.5", dueDate: null, currency: null, counterpartyId: "9" });
  });
  it("keeps foreign-currency home amounts and rate, and flags (without keeping the note) a voided invoice", () => {
    const fx = normalizeInvoice(invoice("21", "2026-10-02T00:00:00Z", { CurrencyRef: { value: "EUR" }, ExchangeRate: 1.0825, HomeTotalAmt: 108.25, HomeBalance: 43.3 }));
    expect(fx.ok && fx.record.normalized).toMatchObject({ currency: "EUR", exchangeRate: "1.0825", homeTotalAmt: "108.25", homeBalance: "43.3" });
    const voided = normalizeInvoice(invoice("22", "2026-10-02T00:00:00Z", { TotalAmt: 0, Balance: 0, PrivateNote: "Voided - customer cancelled order 77" }));
    expect(voided.ok && voided.record.normalized.isVoided).toBe(true);
    expect(JSON.stringify(voided)).not.toContain("customer cancelled");
    const zero = normalizeInvoice(invoice("23", "2026-10-02T00:00:00Z", { TotalAmt: 0, Balance: 0 }));
    expect(zero.ok && zero.record.normalized.isVoided).toBe(false);
  });
  it("lone / split surrogates can never reach jsonb (Postgres would reject the whole page)", () => {
    const emoji = "😀";
    const name = "x".repeat(199) + emoji; // truncation at 200 UTF-16 units splits the pair
    const r = normalizeCustomer(customer("30", "2026-10-02T00:00:00Z", { DisplayName: name }));
    const text = (r.ok ? r.record.normalized.displayName : "") as string;
    expect(text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    const lone = normalizeCustomer(customer("31", "2026-10-02T00:00:00Z", { DisplayName: "a\ud800b" }));
    expect(lone.ok && lone.record.normalized.displayName).toBe("a\ufffdb");
  });
  it("rejects malformed provider data without throwing", () => {
    for (const bad of [null, "x", [], 5, {}, { Id: 5 }, { Id: "1/2" }, { Id: ".." }, { Id: "1", MetaData: {} }]) {
      expect(normalizeInvoice(bad).ok).toBe(false); // an invoice without a numeric total is never usable
    }
    for (const bad of [null, "x", [], 5, {}, { Id: 5 }, { Id: "1/2" }, { Id: ".." }]) {
      expect(normalizeCustomer(bad).ok).toBe(false);
    }
    expect(normalizeInvoice(invoice("1", "2026-10-02T00:00:00Z", { TotalAmt: "n/a" })).ok).toBe(false);
    expect(normalizeInvoice({ Id: "9/9", TotalAmt: 1 })).toEqual({ ok: false, reason: "UNSAFE_ID" });
  });
  it("tolerates a bad MetaData timestamp (record kept, timestamp null)", () => {
    const r = normalizeInvoice(invoice("3", "2026-10-02T00:00:00Z", { MetaData: { LastUpdatedTime: "garbage" } }));
    expect(r.ok && r.record.providerUpdatedAt).toBeNull();
  });
  it("CompanyInfo is bound to the connection's realm, not the payload id", () => {
    const r = normalizeCompanyInfo({ Id: "999", CompanyName: "Evil", Country: "US" }, "123456");
    expect(r.ok && r.record.providerEntityId).toBe("123456");
    expect(r.ok && r.record.normalized.reportedRealmId).toBe("999");
  });
  it("dispatches by entity and collapses provider duplicates keeping the newest", () => {
    const a = normalizeQueryRecord("Invoice", invoice("1", "2026-10-01T00:00:00Z", { Balance: 10 }));
    const b = normalizeQueryRecord("Invoice", invoice("1", "2026-10-03T00:00:00Z", { Balance: 5 }));
    const c = normalizeQueryRecord("Invoice", invoice("2", "2026-10-02T00:00:00Z"));
    if (!a.ok || !b.ok || !c.ok) throw new Error("setup");
    const out = dedupeRecords([a.record, c.record, b.record] as NormalizedRecord[]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.providerEntityId === "1")?.normalized.balance).toBe("5");
  });
});

describe("report parsing", () => {
  it("ProfitAndLoss yields the named groups as decimal strings", () => {
    const r = parseProfitAndLoss(profitAndLossBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.metrics).toEqual({ Income: "10000", COGS: "4000", GrossProfit: "6000", Expenses: "2500", NetIncome: "3500" });
    expect(r.report.currency).toBe("USD");
    expect(r.report.endPeriod).toBe("2026-09-30");
    expect(r.report.inconsistencies).toEqual([]);
  });
  it("a group the provider did not return is ABSENT, never zero", () => {
    const r = parseProfitAndLoss(profitAndLossBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD", { cogs: null, gross: null }));
    expect(r.ok && "COGS" in r.report.metrics).toBe(false);
    expect(r.ok && r.report.metrics.Income).toBe("10000");
  });
  it("flags (does not fix) an internally inconsistent P&L", () => {
    const r = parseProfitAndLoss(profitAndLossBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD", { gross: "9999.00" }));
    expect(r.ok && r.report.inconsistencies).toEqual(["GROSS_PROFIT_MISMATCH"]);
  });
  it("BalanceSheet extracts bank, receivables, payables and totals from nested sections", () => {
    const r = parseBalanceSheet(balanceSheetBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD"));
    expect(r.ok && r.report.metrics).toEqual({ BankAccounts: "8200.5", AR: "1500", CurrentAssets: "9700.5", TotalAssets: "9700.5", AP: "640", CurrentLiabilities: "640", Liabilities: "640", Equity: "9060.5" });
  });
  it("aged reports: overdue is every non-Current bucket, empty cells are zero, and the sum is verified", () => {
    const r = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables"));
    expect(r.ok && r.report.metrics).toEqual({ current: "300", total: "475", overdue: "175" });
    expect(r.ok && r.report.inconsistencies).toEqual([]);
    const bad = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedPayables", { total: "999.00" }));
    expect(bad.ok && bad.report.inconsistencies).toEqual(["AGING_BUCKETS_DO_NOT_SUM_TO_TOTAL"]);
  });
  it("an aged body with no Rows key at all is malformed, not a zero", () => {
    const body = agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables", { empty: true }) as { Rows?: unknown };
    delete body.Rows;
    expect(parseAgedReport(body).ok).toBe(false);
  });
  it("credits that net an aging bucket negative are flagged, and an unbalanced balance sheet is flagged", () => {
    const neg = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables", { current: "300.00", buckets: ["-100.00", "0.00", "0.00", "0.00"], total: "200.00" }));
    expect(neg.ok && neg.report.inconsistencies).toContain("NEGATIVE_OVERDUE_FROM_CREDITS");
    const bs = balanceSheetBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD") as { Rows: { Row: Array<{ group: string; Summary: { ColData: Array<{ value: string }> } }> } };
    bs.Rows.Row[2].Summary.ColData[1].value = "1.00"; // Equity no longer balances the sheet
    const r = parseBalanceSheet(bs);
    expect(r.ok && r.report.inconsistencies).toEqual(["BALANCE_SHEET_DOES_NOT_BALANCE"]);
  });
  it("an aged body with customer rows but NO grand-total section (truncated) is malformed - never a fabricated zero", () => {
    const body = agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables") as { Rows: { Row: unknown[] } };
    body.Rows.Row = body.Rows.Row.filter((r) => (r as { type: string }).type === "Data");
    expect(body.Rows.Row.length).toBeGreaterThan(0);
    expect(parseAgedReport(body).ok).toBe(false);
  });
  it("an empty grand-TOTAL cell is absent (malformed), while an empty bucket cell is zero", () => {
    const body = agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables") as { Rows: { Row: Array<{ group?: string; Summary?: { ColData: Array<{ value: string }> } }> } };
    const gt = body.Rows.Row.find((r) => r.group === "GrandTotal") as { Summary: { ColData: Array<{ value: string }> } };
    gt.Summary.ColData[gt.Summary.ColData.length - 1].value = "";
    expect(parseAgedReport(body).ok).toBe(false);
  });
  it("aging sums are exact fixed-point (no float noise), including very large amounts", () => {
    const r = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables", { current: "0.1", buckets: ["0.1", "0.1", "", "0.0001"], total: "0.3001" }));
    expect(r.ok && r.report.metrics.overdue).toBe("0.2001");
    expect(r.ok && r.report.inconsistencies).toEqual([]);
    const big = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables", { current: "123456789012.3456", buckets: ["100000000000.0001", "0.0001", "", "0.0001"], total: "223456789012.3459" }));
    expect(big.ok && big.report.metrics.overdue).toBe("100000000000.0003");
    expect(big.ok && big.report.inconsistencies).toEqual([]);
  });
  it("an aged report with no rows at all is a truthful zero", () => {
    const r = parseAgedReport(agedBody(P({ report_date: "2026-10-10" }), "USD", "AgedReceivables", { empty: true }));
    expect(r.ok && r.report.metrics).toEqual({ current: "0", total: "0", overdue: "0" });
  });
  it("malformed bodies are rejected, not guessed", () => {
    for (const bad of [null, "x", {}, { Header: {} , Rows: "no" }, { Header: { Currency: "USD" }, Rows: { Row: "no" } }]) {
      expect(parseProfitAndLoss(bad).ok).toBe(false);
    }
    expect(parseAgedReport({ Header: { Currency: "USD" }, Columns: { Column: [{ ColTitle: "Name" }] }, Rows: {} }).ok).toBe(false);
    expect(parseProfitAndLoss({ Header: { Currency: "usd" }, Rows: { Row: [{ type: "Section", group: "Income", Summary: { ColData: [{ value: "x" }, { value: "oops" }] } }] } }).ok).toBe(false);
  });
  it("a missing currency header is kept as null (unknown), never defaulted", () => {
    const body = profitAndLossBody(P({ start_date: "2026-09-01", end_date: "2026-09-30" }), "USD") as { Header: Record<string, unknown> };
    delete body.Header.Currency;
    const r = parseProfitAndLoss(body);
    expect(r.ok && r.report.currency).toBeNull();
  });
});

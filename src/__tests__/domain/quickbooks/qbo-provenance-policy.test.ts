import { describe, it, expect } from "vitest";
import { resolveFinancialFieldPrecedence, PROVIDER_SYNCED_CONFIDENCE, QBO_OBSERVATION_MAX_AGE_MS, QBO_FIELD_SOURCES, type PrecedenceInput } from "@/domain/quickbooks/qbo-provenance-policy";

const now = new Date("2026-10-10T00:00:00Z");
const TARGET = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };
const obs = (o: Partial<NonNullable<PrecedenceInput["qbo"]>> = {}): NonNullable<PrecedenceInput["qbo"]> => ({
  value: "10000", currency: "USD", periodStart: "2026-09-01", periodEnd: "2026-09-30", basis: "Accrual",
  fetchedAt: new Date("2026-10-09T00:00:00Z"), inconsistencies: [], observationId: "obs-1", connectionId: "conn-1", ...o,
});
const base = (o: Partial<PrecedenceInput> = {}): PrecedenceInput => ({
  field: "revenue", manualValue: null, businessCurrency: "USD", businessIsActive: true, target: TARGET, now, qbo: obs(), ...o,
});

describe("QuickBooks provenance / precedence", () => {
  it("a manual value is NEVER overwritten; a material difference is surfaced as a conflict with a suggestion", () => {
    const r = resolveFinancialFieldPrecedence(base({ manualValue: 8000 }));
    expect(r).toMatchObject({ source: "MANUAL", value: 8000, reason: "MANUAL_VALUE_PRESENT", conflict: true, suggestion: 10000 });
  });
  it("a manual value within rounding tolerance is not a conflict", () => {
    expect(resolveFinancialFieldPrecedence(base({ manualValue: 10000.3 }))).toMatchObject({ source: "MANUAL", conflict: false, suggestion: null });
  });
  it("a manual ZERO is a value (owner said zero) and still wins", () => {
    expect(resolveFinancialFieldPrecedence(base({ manualValue: 0 }))).toMatchObject({ source: "MANUAL", value: 0, conflict: true });
  });
  it("with no manual value QuickBooks fills the gap, tagged with provenance and a confidence cap", () => {
    const r = resolveFinancialFieldPrecedence(base());
    expect(r).toMatchObject({ source: "QBO", value: 10000, reason: "PROVIDER_FILLS_GAP", confidenceCap: PROVIDER_SYNCED_CONFIDENCE });
    expect(r.provenance).toEqual({ observationId: "obs-1", connectionId: "conn-1", fetchedAt: new Date("2026-10-09T00:00:00Z") });
  });
  it("currency mismatch or unknown currency is never adopted (and never converted)", () => {
    expect(resolveFinancialFieldPrecedence(base({ businessCurrency: "INR" }))).toMatchObject({ source: "NONE", value: null, reason: "CURRENCY_MISMATCH" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: obs({ currency: null }) }))).toMatchObject({ source: "NONE", reason: "CURRENCY_UNKNOWN" });
    // ...and a manual value in the business currency is untouched, with no suggestion from a foreign-currency figure.
    expect(resolveFinancialFieldPrecedence(base({ businessCurrency: "INR", manualValue: 5 }))).toMatchObject({ source: "MANUAL", value: 5, conflict: false, suggestion: null });
  });
  it("inconsistent, stale or absent observations are not evidence", () => {
    expect(resolveFinancialFieldPrecedence(base({ qbo: obs({ inconsistencies: ["GROSS_PROFIT_MISMATCH"] }) }))).toMatchObject({ source: "NONE", reason: "OBSERVATION_INCONSISTENT" });
    const staleEnd = new Date(now.getTime() - QBO_OBSERVATION_MAX_AGE_MS - 86_400_000).toISOString().slice(0, 10);
    expect(resolveFinancialFieldPrecedence(base({ target: { periodStart: staleEnd, periodEnd: staleEnd }, field: "cashOnHand", qbo: obs({ periodStart: staleEnd, periodEnd: staleEnd }) }))).toMatchObject({ source: "NONE", reason: "STALE" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: obs({ value: null }) }))).toMatchObject({ source: "NONE", reason: "NO_PROVIDER_VALUE" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: null }))).toMatchObject({ source: "NONE", reason: "NO_PROVIDER_VALUE" });
  });
  it("a flow metric is adopted only from exactly the target period (a month is not a quarter, another month is not this month)", () => {
    expect(resolveFinancialFieldPrecedence(base({ qbo: obs({ periodStart: "2026-08-01", periodEnd: "2026-08-31" }) }))).toMatchObject({ source: "NONE", reason: "PERIOD_MISMATCH" });
    expect(resolveFinancialFieldPrecedence(base({ target: { periodStart: "2026-07-01", periodEnd: "2026-09-30" } }))).toMatchObject({ source: "NONE", reason: "PERIOD_MISMATCH" });
    // ...and a manual figure for a different period shape still wins untouched.
    expect(resolveFinancialFieldPrecedence(base({ target: { periodStart: "2026-07-01", periodEnd: "2026-09-30" }, manualValue: 5 }))).toMatchObject({ source: "MANUAL", conflict: false, suggestion: null });
  });
  it("a point-in-time metric needs the balance sheet at the target period end; an aged (as-of-read) metric tolerates a week", () => {
    expect(QBO_FIELD_SOURCES.cashOnHand.kind).toBe("POINT_IN_TIME");
    expect(resolveFinancialFieldPrecedence(base({ field: "cashOnHand", qbo: obs({ periodStart: "2026-09-30", periodEnd: "2026-09-30" }) }))).toMatchObject({ source: "QBO", value: 10000 });
    expect(resolveFinancialFieldPrecedence(base({ field: "cashOnHand", qbo: obs({ periodStart: "2026-08-31", periodEnd: "2026-08-31" }) }))).toMatchObject({ source: "NONE", reason: "PERIOD_MISMATCH" });
    const aged = (d: string) => base({ field: "overdueReceivables", qbo: obs({ periodStart: d, periodEnd: d }) });
    expect(resolveFinancialFieldPrecedence(aged("2026-10-05"))).toMatchObject({ source: "QBO" });
    expect(resolveFinancialFieldPrecedence(aged("2026-10-10"))).toMatchObject({ source: "NONE", reason: "PERIOD_MISMATCH" });
  });
  it("only Accrual-basis observations are adopted", () => {
    expect(resolveFinancialFieldPrecedence(base({ qbo: obs({ basis: "Cash" }) }))).toMatchObject({ source: "NONE", reason: "BASIS_NOT_SUPPORTED" });
  });
  it("archived businesses never adopt, even over a missing manual value; a non-finite manual value is not a value", () => {
    expect(resolveFinancialFieldPrecedence(base({ businessIsActive: false }))).toMatchObject({ source: "NONE", reason: "BUSINESS_ARCHIVED" });
    expect(resolveFinancialFieldPrecedence(base({ businessIsActive: false, manualValue: 3 }))).toMatchObject({ source: "NONE", reason: "BUSINESS_ARCHIVED" });
    expect(resolveFinancialFieldPrecedence(base({ manualValue: Number.NaN }))).toMatchObject({ source: "QBO" });
  });
  it("is deterministic", () => {
    expect(resolveFinancialFieldPrecedence(base({ manualValue: 1 }))).toEqual(resolveFinancialFieldPrecedence(base({ manualValue: 1 })));
  });
});

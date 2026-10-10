import { describe, it, expect } from "vitest";
import { resolveFinancialFieldPrecedence, PROVIDER_SYNCED_CONFIDENCE, QBO_OBSERVATION_MAX_AGE_MS, type PrecedenceInput } from "@/domain/quickbooks/qbo-provenance-policy";

const now = new Date("2026-10-10T00:00:00Z");
const base = (o: Partial<PrecedenceInput> = {}): PrecedenceInput => ({
  field: "revenue", manualValue: null, businessCurrency: "USD", businessIsActive: true, now,
  qbo: { value: "10000", currency: "USD", fetchedAt: new Date("2026-10-09T00:00:00Z"), inconsistencies: [], observationId: "obs-1", connectionId: "conn-1" },
  ...o,
});

describe("QuickBooks provenance / precedence", () => {
  it("a manual value is NEVER overwritten; a material difference is surfaced as a conflict with a suggestion", () => {
    const r = resolveFinancialFieldPrecedence(base({ manualValue: 8000 }));
    expect(r).toMatchObject({ source: "MANUAL", value: 8000, reason: "MANUAL_VALUE_PRESENT", conflict: true, suggestion: 10000 });
  });
  it("a manual value within rounding tolerance is not a conflict", () => {
    const r = resolveFinancialFieldPrecedence(base({ manualValue: 10000.3 }));
    expect(r).toMatchObject({ source: "MANUAL", conflict: false, suggestion: null });
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
    const q = base().qbo!;
    expect(resolveFinancialFieldPrecedence(base({ businessCurrency: "INR" }))).toMatchObject({ source: "NONE", value: null, reason: "CURRENCY_MISMATCH" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: { ...q, currency: null } }))).toMatchObject({ source: "NONE", reason: "CURRENCY_UNKNOWN" });
    // ...and a manual value in the business currency is untouched, with no suggestion from a foreign-currency figure.
    expect(resolveFinancialFieldPrecedence(base({ businessCurrency: "INR", manualValue: 5 }))).toMatchObject({ source: "MANUAL", value: 5, conflict: false, suggestion: null });
  });
  it("inconsistent, stale or absent observations are not evidence", () => {
    const q = base().qbo!;
    expect(resolveFinancialFieldPrecedence(base({ qbo: { ...q, inconsistencies: ["GROSS_PROFIT_MISMATCH"] } }))).toMatchObject({ source: "NONE", reason: "OBSERVATION_INCONSISTENT" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: { ...q, fetchedAt: new Date(now.getTime() - QBO_OBSERVATION_MAX_AGE_MS - 1) } }))).toMatchObject({ source: "NONE", reason: "STALE" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: { ...q, value: null } }))).toMatchObject({ source: "NONE", reason: "NO_PROVIDER_VALUE" });
    expect(resolveFinancialFieldPrecedence(base({ qbo: null }))).toMatchObject({ source: "NONE", reason: "NO_PROVIDER_VALUE" });
  });
  it("archived businesses never adopt, even over a missing manual value", () => {
    expect(resolveFinancialFieldPrecedence(base({ businessIsActive: false }))).toMatchObject({ source: "NONE", reason: "BUSINESS_ARCHIVED" });
    expect(resolveFinancialFieldPrecedence(base({ businessIsActive: false, manualValue: 3 }))).toMatchObject({ source: "NONE", reason: "BUSINESS_ARCHIVED" });
  });
  it("is deterministic", () => {
    expect(resolveFinancialFieldPrecedence(base({ manualValue: 1 }))).toEqual(resolveFinancialFieldPrecedence(base({ manualValue: 1 })));
  });
});

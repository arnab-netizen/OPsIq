import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  LEGACY_UNKNOWN,
  isAuthoritativeEvidence,
  provenanceOf,
  resolveAmendedEvidenceQuality,
} from "@/domain/owner-finance/evidence-quality";
import { CASH_IN_HAND_COPY, parseQuickAmount } from "@/domain/owner-finance/quick-entry";
import {
  FIRST_READ_SCOPE_COPY,
  FirstReadScopeError,
  basisLine,
  buildFirstMoneyRead,
  findOverclaims,
  firstMoneyReadStrings,
  maxScopeForDomains,
  periodLabel,
  type FirstMoneyReadInput,
} from "@/domain/owner-first-run/first-money-read";
import { formatMetricValue, scopeSentence } from "@/domain/owner-first-run/first-money-read";
import { trustedClientAddress } from "@/lib/client-address";
import { FIRST_RUN_NO_ACCESS, FIRST_RUN_TRY_AGAIN, firstRunErrorText } from "@/lib/first-run-errors";
import { HttpResponseError } from "@/lib/operator-safe-errors";
import { FIRST_RUN_UPDATE_HREF, isFirstRunReturn, withFirstRunReturn } from "@/domain/owner-first-run/first-run-return";
import { CORRECTION_SAVED_READ_PENDING_MESSAGE, READ_STALE_MESSAGE, isReadStaleMessage } from "@/domain/owner-first-run/read-staleness";

const PERIOD = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z", state: "completed" as const };
const finding = { title: "Fixed costs take too much of revenue", summary: "Rent and wages are 58% of revenue.", sourceMetric: "fixed_cost_ratio", sourceValue: 0.58, evidence: ["fixed_cost_ratio=0.58"], missingData: [] };
const action = { title: "Review fixed costs", description: "Find the two biggest.", ownerRole: "owner", expectedTimeframeDays: 14, verificationMetric: "fixed_cost_ratio" };
const input = (over: Partial<FirstMoneyReadInput> = {}): FirstMoneyReadInput => ({
  period: PERIOD, finding, action, dataRequest: null, confidenceScore: 70, evidenceQuality: "ACTUAL", missingEvidence: [], ...over,
});

describe("A1 NULL evidence quality is legacy-unknown, never authoritative", () => {
  it("provenance maps every stored value, with NULL/garbage as LEGACY_UNKNOWN", () => {
    expect(provenanceOf(null)).toBe(LEGACY_UNKNOWN);
    expect(provenanceOf(undefined)).toBe(LEGACY_UNKNOWN);
    expect(provenanceOf("ACTUAL ")).toBe(LEGACY_UNKNOWN);
    expect(provenanceOf("MADE_UP")).toBe(LEGACY_UNKNOWN);
    expect(provenanceOf("GOOD_ESTIMATE")).toBe("GOOD_ESTIMATE");
  });
  it("only ACTUAL is authoritative", () => {
    expect(isAuthoritativeEvidence("ACTUAL")).toBe(true);
    for (const q of [null, undefined, "", "GOOD_ESTIMATE", "ROUGH_ESTIMATE", "actual"]) expect(isAuthoritativeEvidence(q)).toBe(false);
  });
  it("an amendment never promotes legacy to ACTUAL", () => {
    expect(resolveAmendedEvidenceQuality(null, undefined, true)).toBeNull();
    expect(resolveAmendedEvidenceQuality(null, undefined, false)).toBeNull();
    expect(resolveAmendedEvidenceQuality("ACTUAL", undefined, true)).toBe("GOOD_ESTIMATE");
  });
  it("a read on unspecified evidence says so, is not 'estimated', and carries a caution", () => {
    const r = buildFirstMoneyRead(input({ evidenceQuality: null }));
    expect(r.evidenceProvenance).toBe("LEGACY_UNKNOWN");
    expect(r.isEstimated).toBe(false);
    expect(r.evidenceQualityLabel).toBe("Not stated");
    expect(r.cautions.join(" ")).toMatch(/doesn't know how reliable/);
    expect(r.basis).toContain("reliability not stated");
    expect(r.evidenceQualityNote).toMatch(/does not treat them as confirmed/);
  });
});

describe("A4 ambiguous amounts are refused, unambiguous ones accepted", () => {
  const ok = (raw: string, value: number) => expect(parseQuickAmount(raw)).toEqual({ kind: "value", value });
  const bad = (raw: string) => expect(parseQuickAmount(raw).kind).toBe("invalid");
  it("accepts clearly unambiguous forms", () => {
    ok("1500", 1500);
    ok("1500.00", 1500);
    ok("1500.5", 1500.5);
    ok("1,500,000", 1500000);
    ok("1,500.00", 1500);
    ok("1,80,000", 180000); // Indian grouping
    ok("1 500 000", 1500000);
    ok("£1,500", 1500);
    ok("$ 2 500", 2500);
    ok("0.500", 0.5); // a leading zero cannot be a thousands group
    ok("1234.567", 1234.567);
    ok("0", 0);
    ok("1.50", 1.5);
  });
  it("refuses dot-thousands vs decimal ambiguity ('1.500' means 1.5 or 1,500)", () => {
    bad("1.500");
    bad("12.345");
    bad("123.456");
    bad("£1.500");
  });
  it("refuses European-style and malformed forms rather than guessing a locale", () => {
    bad("1.500,00");
    bad("1,5");
    bad("15,00");
    bad("1 5");
    bad("1,50,0");
    bad("1,,500");
    bad("1.2.3");
    bad("abc");
    bad("1e5");
    bad("Infinity");
    bad("NaN");
    bad("0x10");
  });
  it("refuses negatives (no field in this path can be negative) and absurd magnitudes", () => {
    bad("-1");
    bad("-0.5");
    bad("-1,500");
    bad("1000000000001");
    ok("1000000000000", 1e12);
  });
  it("blank is unknown, whitespace is blank, zero is a known zero", () => {
    expect(parseQuickAmount("")).toEqual({ kind: "blank" });
    expect(parseQuickAmount("   ")).toEqual({ kind: "blank" });
    expect(parseQuickAmount(null)).toEqual({ kind: "blank" });
    expect(parseQuickAmount("0")).toEqual({ kind: "value", value: 0 });
  });
});

describe("C1 the claim scope is a runtime contract, not a string that happens to be in the payload", () => {
  it("finance-only evidence yields FINANCIAL_FIRST_READ with money-only wording", () => {
    const r = buildFirstMoneyRead(input());
    expect(r.scopeKind).toBe("FINANCIAL_FIRST_READ");
    expect(r.heading).toBe(FIRST_READ_SCOPE_COPY.FINANCIAL_FIRST_READ.heading);
    expect(r.scope).toBe(FIRST_READ_SCOPE_COPY.FINANCIAL_FIRST_READ.scope);
    expect(r.scope).toMatch(/money figures only/);
    expect(findOverclaims(firstMoneyReadStrings(r))).toEqual([]);
  });
  it("INTENTIONALLY wrong scope: requesting WHOLE_BUSINESS from finance-only evidence throws instead of rendering whole-business copy", () => {
    expect(() => buildFirstMoneyRead(input({ scope: "WHOLE_BUSINESS" }))).toThrow(FirstReadScopeError);
    expect(() => buildFirstMoneyRead(input({ scope: "WHOLE_BUSINESS", evidenceDomains: ["finance"] }))).toThrow(FirstReadScopeError);
    expect(() => buildFirstMoneyRead(input({ scope: "WHOLE_BUSINESS", evidenceDomains: ["finance", "sales"] }))).toThrow(FirstReadScopeError);
    expect(() => buildFirstMoneyRead(input({ scope: "WHOLE_BUSINESS", evidenceDomains: ["finance", "finance", "finance"] }))).toThrow(FirstReadScopeError);
  });
  it("whole-business wording is reachable only from enough distinct evidence domains", () => {
    expect(maxScopeForDomains(["finance"])).toBe("FINANCIAL_FIRST_READ");
    expect(maxScopeForDomains(["finance", "sales"])).toBe("FINANCIAL_FIRST_READ");
    expect(maxScopeForDomains(["finance", "sales", "operations"])).toBe("WHOLE_BUSINESS");
    const r = buildFirstMoneyRead(input({ evidenceDomains: ["finance", "sales", "operations"] }));
    expect(r.scopeKind).toBe("WHOLE_BUSINESS");
    expect(r.heading).toBe(FIRST_READ_SCOPE_COPY.WHOLE_BUSINESS.heading);
  });
  it("every status of a finance read stays money-scoped and overclaim-free", () => {
    const reads = [
      buildFirstMoneyRead(input()),
      buildFirstMoneyRead(input({ finding: null, action: null, dataRequest: action })),
      buildFirstMoneyRead(input({ finding: null, action: null, dataRequest: null })),
    ];
    for (const r of reads) {
      expect(r.scopeKind).toBe("FINANCIAL_FIRST_READ");
      expect(findOverclaims(firstMoneyReadStrings(r))).toEqual([]);
    }
  });
});

describe("C2 period + provisional status", () => {
  it("labels a whole calendar month by name, anything else as an explicit range, never inventing precision", () => {
    expect(periodLabel({ start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z" })).toBe("September 2026");
    expect(periodLabel({ start: "2024-02-01T00:00:00.000Z", end: "2024-02-29T00:00:00.000Z" })).toBe("February 2024");
    expect(periodLabel({ start: "2026-09-05T00:00:00.000Z", end: "2026-10-04T00:00:00.000Z" })).toBe("5 Sep 2026 to 4 Oct 2026");
    expect(periodLabel({ start: "2026-09-01T00:00:00.000Z", end: "2026-09-29T00:00:00.000Z" })).toBe("1 Sep 2026 to 29 Sep 2026");
    expect(periodLabel({ start: "nonsense", end: "2026-09-30" })).toBe("the period you entered");
  });
  it("shows period, completed/provisional and the evidence quality in one line", () => {
    expect(basisLine(PERIOD, "A good estimate")).toBe("Based on your September 2026 figures · completed period · A good estimate");
    expect(basisLine({ ...PERIOD, state: "provisional" }, "A rough guess")).toBe(
      "Based on your September 2026 figures so far · still in progress (provisional) · A rough guess",
    );
  });
  it("a provisional read says so in its cautions; a completed one does not", () => {
    const provisional = buildFirstMoneyRead(input({ period: { ...PERIOD, state: "provisional" } }));
    expect(provisional.period.state).toBe("provisional");
    expect(provisional.cautions.join(" ")).toMatch(/still in progress/);
    expect(buildFirstMoneyRead(input()).cautions.join(" ")).not.toMatch(/still in progress/);
  });
});

describe("B stale-read + partial-failure vocabulary", () => {
  it("the stale message is the owner-facing contract and is recognisable", () => {
    expect(READ_STALE_MESSAGE).toBe("Your numbers changed since this read was created. Update the read before using this recommendation.");
    expect(isReadStaleMessage(READ_STALE_MESSAGE)).toBe(true);
    expect(isReadStaleMessage("Something else")).toBe(false);
    expect(isReadStaleMessage(null)).toBe(false);
  });
  it("the partial-failure message says the corrected numbers WERE saved and never implies the old read applies", () => {
    expect(CORRECTION_SAVED_READ_PENDING_MESSAGE).toMatch(/corrected numbers are saved/i);
    expect(CORRECTION_SAVED_READ_PENDING_MESSAGE).toMatch(/Retry the read before using the previous recommendation/);
    expect(CORRECTION_SAVED_READ_PENDING_MESSAGE).not.toMatch(/unchanged|not saved|wasn't saved/i);
  });
});

describe("D2 the return path reuses the existing input surfaces", () => {
  it("adds the marker before any fragment and keeps existing queries", () => {
    expect(withFirstRunReturn("/owner/finance")).toBe("/owner/finance?returnTo=first-run");
    expect(withFirstRunReturn("/owner/manual-entry#cash_cost")).toBe("/owner/manual-entry?returnTo=first-run#cash_cost");
    expect(withFirstRunReturn("/owner/intake?tab=docs")).toBe("/owner/intake?tab=docs&returnTo=first-run");
    expect(isFirstRunReturn("first-run")).toBe(true);
    expect(isFirstRunReturn("elsewhere")).toBe(false);
    expect(isFirstRunReturn(null)).toBe(false);
    expect(FIRST_RUN_UPDATE_HREF).toBe("/owner/first-run?update=1");
  });
});

describe("D3 cash copy keeps one meaning: physical cash, bank separate", () => {
  it("says physical, excludes the bank, and explains that 0 is not 'no money'", () => {
    expect(CASH_IN_HAND_COPY.hint).toMatch(/Physical cash/);
    expect(CASH_IN_HAND_COPY.hint).toMatch(/Don't include money in the bank/);
    expect(CASH_IN_HAND_COPY.hint).toMatch(/enter 0/);
    expect(CASH_IN_HAND_COPY.hint).toMatch(/won't read that as having no money/);
  });
  it("the manual-entry cash field is labelled as not-in-the-bank", () => {
    const src = readFileSync("src/domain/owner-mode/owner-manual-entry-form.ts", "utf8");
    expect(src).toContain("Cash in hand, not in the bank");
  });
});

describe("C3 owner-facing vocabulary on the critical journey", () => {
  const visible = (file: string): string[] =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*|import )/.test(l))
      // only text a person can read: JSX text and string literals that are not identifiers/props/ids
      .filter((l) => /(>[^<>{}]*[A-Za-z]{3,}[^<>{}]*<|"[^"]*\s[^"]*")/.test(l))
      .filter((l) => /\bworkspace\b/i.test(l));
  it.each([
    "src/components/owner/MinimumOwnerCockpit.tsx",
    "src/components/owner/first-run/FirstRunFlow.tsx",
    "src/components/owner/first-run/FirstMoneyReadCard.tsx",
    "src/components/owner/first-run/FirstResultImprovement.tsx",
    "src/components/owner/first-run/FirstResultCorrection.tsx",
    "src/components/owner/first-run/FirstRunBusinessStep.tsx",
    "src/components/owner/first-run/AcceptedNextMoveCard.tsx",
    "src/components/owner/first-run/FirstRunReturnBar.tsx",
    "src/app/signup/page.tsx",
    "src/app/verify-email/page.tsx",
    "src/domain/owner-mode/owner-public-signals.ts",
    "src/domain/owner-first-run/first-money-read.ts",
    "src/domain/owner-first-run/read-staleness.ts",
  ])("%s shows no 'workspace' wording to an owner", (file) => {
    // signup.page keeps the `workspaceName` API field (an identifier) — only readable strings are inspected.
    const hits = visible(file).filter((l) => !/workspaceName|setWorkspaceName/.test(l));
    expect(hits).toEqual([]);
  });
});

describe("review fixes — domain", () => {
  it("'0,500' is refused (a thousands group never starts with zero); '1.500' stays refused; unambiguous forms still read", () => {
    for (const raw of ["0,500", "00,500", "0,5", "£0,500"]) expect(parseQuickAmount(raw).kind, raw).toBe("invalid");
    expect(parseQuickAmount("1,500")).toEqual({ kind: "value", value: 1500 });
    expect(parseQuickAmount("0.500")).toEqual({ kind: "value", value: 0.5 });
  });
  it("legacy-unknown evidence can never read as MORE trustworthy than a stated estimate (capped below HIGH)", () => {
    const high = 95;
    expect(buildFirstMoneyRead(input({ confidenceScore: high, evidenceQuality: "ACTUAL" })).confidenceTier).toBe("HIGH");
    expect(buildFirstMoneyRead(input({ confidenceScore: high, evidenceQuality: null })).confidenceTier).toBe("MEDIUM");
    expect(buildFirstMoneyRead(input({ confidenceScore: 50, evidenceQuality: null })).confidenceTier).toBe(buildFirstMoneyRead(input({ confidenceScore: 50, evidenceQuality: "ACTUAL" })).confidenceTier);
  });
  it("a read that found nothing specific never says 'deserves attention first'", () => {
    const ready = buildFirstMoneyRead(input());
    const needs = buildFirstMoneyRead(input({ finding: null, action: null, dataRequest: action }));
    const none = buildFirstMoneyRead(input({ finding: null, action: null, dataRequest: null }));
    expect(ready.scope).toMatch(/deserves attention first/);
    for (const r of [needs, none]) {
      expect(r.scope).not.toMatch(/deserves attention first/);
      expect(r.scope).toMatch(/money figures only/);
      expect(scopeSentence(r.scopeKind, r.status)).toBe(r.scope);
    }
  });
  it("the supporting value carries the unit its metric implies and never invents one", () => {
    expect(formatMetricValue("fixedCostBurdenPct", 58.3)).toBe("58.3%");
    expect(formatMetricValue("cashRunwayDays", 12.4)).toBe("12.4 days");
    expect(formatMetricValue("cashDaysOfCosts", 30)).toBe("30 days");
    expect(formatMetricValue("totalLiquidFunds", 12000, "GBP")).toBe("GBP 12,000");
    expect(formatMetricValue("revenue", 5, null)).toBe("5");
    expect(formatMetricValue("dataConfidenceScore", 70, "GBP")).toBe("70");
    expect(formatMetricValue("unknownThing", 3, "GBP")).toBe("3");
    expect(formatMetricValue("revenue", null, "GBP")).toBeNull();
    const r = buildFirstMoneyRead(input({ finding: { ...finding, sourceMetric: "fixedCostBurdenPct", sourceValue: 58.3 }, currency: "GBP" }));
    expect(r.actualValueText).toBe("58.3%");
  });
  it("a known data request links to where it is supplied; an unknown one does not invent a link", () => {
    const withLink = buildFirstMoneyRead(input({ dataRequest: action, dataRequestCode: "FIN_LIQUIDITY_UNCONFIRMED" }));
    expect(withLink.sharpenBy?.href).toBe("/owner/cashflow");
    expect(buildFirstMoneyRead(input({ dataRequest: action, dataRequestCode: "FIN_MISSING_CRITICAL_DATA" })).sharpenBy?.href).toBeNull();
  });
  it("first-run error text promises nothing it does not do and never mentions a workspace", () => {
    expect(firstRunErrorText(new Error("ECONNRESET"))).toBe(FIRST_RUN_TRY_AGAIN);
    expect(firstRunErrorText(new HttpResponseError("x", 503, true))).toBe(FIRST_RUN_TRY_AGAIN);
    expect(firstRunErrorText(new HttpResponseError("Forbidden for workspace", 403, true))).toBe(FIRST_RUN_NO_ACCESS);
    expect(firstRunErrorText(new HttpResponseError("This read has already been corrected.", 409, true))).toBe("This read has already been corrected.");
    expect(firstRunErrorText(new HttpResponseError("hidden", 422, false))).toBe(FIRST_RUN_TRY_AGAIN);
    for (const t of [FIRST_RUN_TRY_AGAIN, FIRST_RUN_NO_ACCESS]) expect(t).not.toMatch(/automatic|workspace/i);
  });
  it("the client address bound trusts the platform header, never the caller's forwarding list in production", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    expect(trustedClientAddress(h({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), "production")).toBe("203.0.113.5");
    expect(trustedClientAddress(h({ "x-vercel-forwarded-for": "198.51.100.7, 10.0.0.1" }), "production")).toBe("198.51.100.7");
    expect(trustedClientAddress(h({ "x-forwarded-for": "9.9.9.9" }), "production")).toBeNull(); // spoofable: not used
    expect(trustedClientAddress(h({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }), "test")).toBe("9.9.9.9"); // local/test only
    expect(trustedClientAddress(h({}), "test")).toBeNull();
  });
});

import { lastFullCalendarMonth } from "@/lib/owner-quick-start";
describe("the last full month is built from local calendar parts (never shifted by UTC conversion)", () => {
  it("returns the first and last day of the previous month, including year/leap boundaries", () => {
    expect(lastFullCalendarMonth(new Date(2026, 9, 10))).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(lastFullCalendarMonth(new Date(2026, 0, 5))).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(lastFullCalendarMonth(new Date(2024, 2, 1))).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(lastFullCalendarMonth(new Date(2026, 2, 31))).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

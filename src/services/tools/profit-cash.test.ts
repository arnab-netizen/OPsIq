import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EMPTY_INPUTS,
  MAX_AMOUNT,
  SAMPLE_INPUTS,
  calculateProfitCash,
  formatCoverRatio,
  formatMoney,
  formatPercent,
  formatPrice,
  formatUsd,
  normalizeCurrency,
  parseAmount,
  priceForTargetMargin,
} from "./profit-cash";

describe("calculateProfitCash", () => {
  it("reproduces the article example: $4,500 profit, $5,000 shortfall", () => {
    const r = calculateProfitCash(SAMPLE_INPUTS);
    expect(r.operatingProfit).toBe(4500);
    expect(r.liquidity).toBe(-5000);
    expect(r.quadrant).toBe("profitable-squeezed");
    expect(r.marginPercent).toBeCloseTo(16.07, 1);
  });

  it("classifies a healthy profitable business", () => {
    const r = calculateProfitCash({
      revenue: 50000, directCosts: 15000, operatingExpenses: 20000,
      cash: 30000, receivables: 10000, overdueReceivables: 1000, expectedCollections: 9000, billsDue: 20000,
    });
    expect(r.quadrant).toBe("profitable-healthy");
    expect(r.liquidity).toBe(19000);
  });

  it("classifies unprofitable with cash, and unprofitable and squeezed", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10000, directCosts: 6000, operatingExpenses: 7000, cash: 50000, billsDue: 5000 }).quadrant).toBe("unprofitable-healthy");
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10000, directCosts: 6000, operatingExpenses: 7000, cash: 1000, billsDue: 9000 }).quadrant).toBe("unprofitable-squeezed");
  });

  it("caps overdue at total owed and notes it", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, receivables: 100, overdueReceivables: 900 });
    expect(r.overdueSharePercent).toBe(100);
    expect(r.notes.join(" ")).toMatch(/capped/);
  });

  it("returns a blank result for empty input and null cover with no bills", () => {
    const r = calculateProfitCash(EMPTY_INPUTS);
    expect(r.isBlank).toBe(true);
    expect(r.coverRatio).toBeNull();
  });
});

describe("parseAmount", () => {
  it("handles blank, valid, negative and junk", () => {
    expect(parseAmount("")).toEqual({ value: 0, invalid: false });
    expect(parseAmount("1250.5")).toEqual({ value: 1250.5, invalid: false });
    expect(parseAmount("-5")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("abc")).toEqual({ value: 0, invalid: true });
  });
});

describe("margin and markup", () => {
  it("computes gross margin and markup from price and cost ($100 price, $60 cost)", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100, directCosts: 60 });
    expect(r.grossProfit).toBe(40);
    expect(r.grossMarginPercent).toBeCloseTo(40, 5);
    expect(r.markupPercent).toBeCloseTo(66.667, 2);
  });
  it("sample gross margin is about 67.9% and markup about 211%", () => {
    const r = calculateProfitCash(SAMPLE_INPUTS);
    expect(r.grossMarginPercent).toBeCloseTo(67.857, 2);
    expect(r.markupPercent).toBeCloseTo(211.11, 1);
  });
  it("markup is null with no direct costs", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100 }).markupPercent).toBeNull();
  });
});

describe("priceForTargetMargin", () => {
  it("$60 cost at 40% margin needs a $100 price", () => {
    expect(priceForTargetMargin(60, 40)).toBeCloseTo(100, 5);
  });
  it("rejects 100% margin and invalid input", () => {
    expect(priceForTargetMargin(60, 100)).toBeNull();
    expect(priceForTargetMargin(60, 99.95)).toBeNull();
    expect(priceForTargetMargin(60, 99.9)).toBeCloseTo(60000, 3);
    expect(priceForTargetMargin(MAX_AMOUNT + 1, 40)).toBeNull();
    expect(priceForTargetMargin(60, Number.NaN)).toBeNull();
    expect(priceForTargetMargin(Number.POSITIVE_INFINITY, 40)).toBeNull();
    expect(priceForTargetMargin(-1, 40)).toBeNull();
    expect(priceForTargetMargin(60, -5)).toBeNull();
  });
});

describe("zero-revenue and undefined ratios are null, never a misleading 0%", () => {
  it("revenue 0 with costs gives null margins and a real negative profit", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, directCosts: 5000, operatingExpenses: 2000, cash: 1000, billsDue: 500 });
    expect(r.grossMarginPercent).toBeNull();
    expect(r.marginPercent).toBeNull();
    expect(r.grossProfit).toBe(-5000);
    expect(r.operatingProfit).toBe(-7000);
    expect(r.quadrant).toBe("unprofitable-healthy");
  });
  it("nothing owed gives a null overdue share, even if an overdue amount was typed", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100, overdueReceivables: 500 });
    expect(r.overdueSharePercent).toBeNull();
    expect(r.notes.join(" ")).toMatch(/capped/);
  });
  it("owed with no overdue is a real 0%", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100, receivables: 500 }).overdueSharePercent).toBe(0);
  });
});

describe("exact cents arithmetic", () => {
  it("0.7 + 0.1 covers a bill of 0.8 exactly (no floating point false shortfall)", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10, cash: 0.7, expectedCollections: 0.1, billsDue: 0.8 });
    expect(r.liquidity).toBe(0);
    expect(r.quadrant).toBe("profitable-healthy");
  });
  it("one cent short is a shortfall of exactly one cent", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10, cash: 0.79, billsDue: 0.8 });
    expect(r.liquidity).toBe(-0.01);
    expect(r.quadrant).toBe("profitable-squeezed");
  });
  it("0.1 + 0.2 of cash against a 0.3 bill is healthy", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 1, cash: 0.1, expectedCollections: 0.2, billsDue: 0.3 });
    expect(r.liquidity).toBe(0);
  });
  it("break-even is not profitable and not 'cost exceeds revenue'", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10000, directCosts: 4000, operatingExpenses: 6000, cash: 5000, billsDue: 1000 });
    expect(r.operatingProfit).toBe(0);
    expect(r.quadrant).toBe("unprofitable-healthy");
  });
});

describe("parseAmount limits", () => {
  it("flags over-limit, infinity, and hex or whitespace oddities safely", () => {
    expect(parseAmount(String(MAX_AMOUNT))).toEqual({ value: MAX_AMOUNT, invalid: false });
    expect(parseAmount(String(MAX_AMOUNT + 1))).toEqual({ value: 0, invalid: true });
    expect(parseAmount("1e308")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("1e400")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("Infinity")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("NaN")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("   ")).toEqual({ value: 0, invalid: false });
    expect(parseAmount("1,000").invalid).toBe(true);
    expect(parseAmount("$5").invalid).toBe(true);
  });
  it("never returns negative zero", () => {
    expect(Object.is(parseAmount("-0").value, 0)).toBe(true);
  });
  it("flags over-limit input in the result notes", () => {
    expect(calculateProfitCash(EMPTY_INPUTS, true).notes.join(" ")).toMatch(/over-limit/);
  });
});

describe("expected-cash advisory", () => {
  it("warns when expected cash exceeds what is owed, and does not when it does not", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, receivables: 500, expectedCollections: 9999 }).notes.join(" ")).toMatch(/new sales/);
    expect(calculateProfitCash({ ...EMPTY_INPUTS, receivables: 500, expectedCollections: 500 }).notes).toEqual([]);
    expect(calculateProfitCash({ ...EMPTY_INPUTS, receivables: 500, expectedCollections: 0 }).notes).toEqual([]);
  });
});

describe("formatters", () => {
  it("formatUsd: whole dollars, commas, cents only under $1, never -$0", () => {
    expect(formatUsd(19000)).toBe("$19,000");
    expect(formatUsd(-5000)).toBe("-$5,000");
    expect(formatUsd(8023.78)).toBe("$8,024");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(-0)).toBe("$0");
    expect(formatUsd(-0.4)).toBe("-$0.40");
    expect(formatUsd(0.01)).toBe("$0.01");
    expect(formatUsd(-0.001)).toBe("$0");
    expect(formatUsd(1e12)).toBe("$1,000,000,000,000");
  });
  it("formatPercent: null is n/a, no -0.0%, bounded magnitudes, one decimal", () => {
    expect(formatPercent(null)).toBe("n/a");
    expect(formatPercent(67.857)).toBe("67.9%");
    expect(formatPercent(-0.04)).toBe("0.0%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(100, 0)).toBe("100%");
    expect(formatPercent(-899999900)).toBe("< -1,000,000%");
    expect(formatPercent(1.1e306)).toBe("> 1,000,000%");
    expect(formatPercent(1234.5)).toBe("1,234.5%");
  });
  it("formatCoverRatio: sample unchanged, never 1.00x below 1, never 0.00x above 0", () => {
    expect(formatCoverRatio(null)).toBe("n/a");
    expect(formatCoverRatio(2000 / 7000)).toBe("0.29x");
    expect(formatCoverRatio(0.9998)).toBe("0.99x");
    expect(formatCoverRatio(0.995)).toBe("0.99x");
    expect(formatCoverRatio(1)).toBe("1.00x");
    expect(formatCoverRatio(0)).toBe("0.00x");
    expect(formatCoverRatio(0.001)).toBe("< 0.01x");
    expect(formatCoverRatio(3.1666)).toBe("3.17x");
    expect(formatCoverRatio(5000)).toBe("> 1,000x");
  });
  it("formatPrice: thousands separators", () => {
    expect(formatPrice(100)).toBe("$100.00");
    expect(formatPrice(600000)).toBe("$600,000.00");
    expect(formatPrice(0.02)).toBe("$0.02");
  });
});

describe("currency selection", () => {
  it("defaults to USD and formatUsd matches formatMoney", () => {
    expect(DEFAULT_CURRENCY).toBe("USD");
    expect(formatUsd(-5000)).toBe(formatMoney(-5000, "USD"));
  });
  it("uses the right symbol and grouping per currency, with unambiguous dollars", () => {
    expect(formatMoney(19000, "USD")).toBe("$19,000");
    expect(formatMoney(19000, "EUR")).toBe("\u20ac19,000");
    expect(formatMoney(19000, "GBP")).toBe("\u00a319,000");
    expect(formatMoney(1234567, "INR")).toBe("\u20b912,34,567");
    expect(formatMoney(19000, "AUD")).toBe("A$19,000");
    expect(formatMoney(19000, "CAD")).toBe("CA$19,000");
    expect(formatMoney(19000, "NZD")).toBe("NZ$19,000");
    expect(formatMoney(19000, "SGD")).toBe("SGD 19,000");
    expect(formatMoney(19000, "JPY")).toBe("\u00a519,000");
    expect(formatMoney(-5000, "INR")).toBe("-\u20b95,000");
  });
  it("never leaves a non-breaking space and never prints -0 in any listed currency", () => {
    for (const { code } of CURRENCIES) {
      for (const n of [0, -0, -0.001, 0.004, 0.4, -0.4, 5, -5000, 1e12, -1e12]) {
        const t = formatMoney(n, code);
        expect(t).not.toMatch(/\u00a0/);
        expect(t).not.toMatch(/-\D*0(?![.,\d]*[1-9])(?!\d)/);
        expect(t).not.toMatch(/NaN|Infinity/);
        expect(t.startsWith("-")).toBe(n < -0.004);
      }
      expect(formatPrice(60000, code)).toMatch(/60,000|60,000\.00/);
    }
  });
  it("sub-unit gaps keep two decimals so a shortfall is never shown as zero", () => {
    expect(formatMoney(-0.4, "EUR")).toBe("-\u20ac0.40");
    expect(formatMoney(0.01, "GBP")).toBe("\u00a30.01");
  });
  it("price: two decimals, none for yen, still comma-grouped", () => {
    expect(formatPrice(100, "USD")).toBe("$100.00");
    expect(formatPrice(600000, "EUR")).toBe("\u20ac600,000.00");
    expect(formatPrice(1234567.5, "INR")).toBe("\u20b912,34,567.50");
    expect(formatPrice(5000, "JPY")).toBe("\u00a55,000");
  });
  it("normalizeCurrency rejects unknown, lowercase, empty and hostile values", () => {
    expect(normalizeCurrency("INR")).toBe("INR");
    for (const bad of ["", "usd", "XXX", "KWD", "<script>", "USD ", "constructor", "__proto__"]) expect(normalizeCurrency(bad)).toBe("USD");
  });
});

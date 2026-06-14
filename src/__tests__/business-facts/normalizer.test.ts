/**
 * B07 — Normalizer: pure-function tests.
 *
 * Proves normalization of units, currencies, tax basis, and dates:
 *   - lakh/crore/absolute number parsing
 *   - INR/USD currency distinction preserved
 *   - GST-inclusive vs GST-exclusive marked unknown if not provable
 *   - monthly vs daily data normalized without losing source period
 *
 * Non-DB: pure normalization over B01 facts. Runs under `npm test`.
 */
import { describe, it, expect } from "vitest";
import type { BusinessFact } from "@/domain/business-facts/contract";
import {
  parseUnitMultiplier,
  normalizeNumericValue,
  validateCurrency,
  detectTaxBasis,
  classifyGrossNet,
  parseISODate,
  normalizePeriod,
  normalizeFact,
  applyNormalization,
} from "@/domain/business-facts/normalizer";

function createFact(overrides: Partial<BusinessFact> = {}): BusinessFact {
  return {
    fact_id: "test_fact",
    metric: "revenue",
    value: 100000,
    unit: "INR",
    currency: "INR",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    source_document_id: "src_1",
    source_location: "test",
    extraction_method: "manual_entry",
    confidence_score: 0.8,
    validation_status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("B07 normalizer — unit parsing", () => {
  it("parses lakh as 100,000", () => {
    const multiplier = parseUnitMultiplier("lakh");
    expect(multiplier).toBe(100_000);
  });

  it("parses crore as 10,000,000", () => {
    const multiplier = parseUnitMultiplier("crore");
    expect(multiplier).toBe(10_000_000);
  });

  it("parses various unit representations", () => {
    expect(parseUnitMultiplier("thousand")).toBe(1_000);
    expect(parseUnitMultiplier("k")).toBe(1_000);
    expect(parseUnitMultiplier("million")).toBe(1_000_000);
    expect(parseUnitMultiplier("m")).toBe(1_000_000);
  });

  it("normalizes numeric value with unit conversion", () => {
    const result = normalizeNumericValue(50, "lakh");
    expect(result.normalized).toBe(5_000_000);
    expect(result.applied).toBe(true);
  });

  it("handles absolute numbers without conversion", () => {
    const result = normalizeNumericValue(100000, "absolute");
    expect(result.normalized).toBe(100000);
    expect(result.applied).toBe(false);
  });
});

describe("B07 normalizer — currency validation", () => {
  it("validates INR currency code", () => {
    const currency = validateCurrency("INR");
    expect(currency).toBe("INR");
  });

  it("validates USD currency code", () => {
    const currency = validateCurrency("USD");
    expect(currency).toBe("USD");
  });

  it("normalizes lowercase to uppercase", () => {
    const currency = validateCurrency("inr");
    expect(currency).toBe("INR");
  });

  it("rejects invalid currency codes", () => {
    expect(validateCurrency("INVALID")).toBeNull();
    expect(validateCurrency("IN")).toBeNull();
    expect(validateCurrency(null)).toBeNull();
  });

  it("preserves INR/USD distinction", () => {
    expect(validateCurrency("INR")).toBe("INR");
    expect(validateCurrency("USD")).toBe("USD");
    expect(validateCurrency("INR")).not.toBe("USD");
  });
});

describe("B07 normalizer — tax basis detection", () => {
  it("detects inclusive tax from field name", () => {
    const taxBasis = detectTaxBasis("revenue_including_gst", null);
    expect(taxBasis).toBe("inclusive");
  });

  it("detects exclusive tax from field name", () => {
    const taxBasis = detectTaxBasis("revenue_excluding_gst", null);
    expect(taxBasis).toBe("exclusive");
  });

  it("marks tax basis unknown if not provable", () => {
    const taxBasis = detectTaxBasis("revenue", null);
    expect(taxBasis).toBe("unknown");
  });

  it("classifies non-financial fields as not_applicable", () => {
    const taxBasis = detectTaxBasis("employee_count", null);
    expect(taxBasis).toBe("not_applicable");
  });
});

describe("B07 normalizer — gross vs net classification", () => {
  it("classifies revenue as gross", () => {
    const classify = classifyGrossNet("revenue", null);
    expect(classify).toBe("gross");
  });

  it("classifies profit as net", () => {
    const classify = classifyGrossNet("profit", null);
    expect(classify).toBe("net");
  });

  it("classifies cost as net", () => {
    const classify = classifyGrossNet("operating_cost", null);
    expect(classify).toBe("net");
  });

  it("marks gross_net unknown if unclear", () => {
    const classify = classifyGrossNet("amount", null);
    expect(classify).toBe("unknown");
  });
});

describe("B07 normalizer — period normalization", () => {
  it("accepts valid ISO date range", () => {
    const result = normalizePeriod("2026-05-01", "2026-05-31");
    expect(result.valid).toBe(true);
    expect(result.start).toBe("2026-05-01");
    expect(result.end).toBe("2026-05-31");
  });

  it("detects reversed dates", () => {
    const result = normalizePeriod("2026-05-31", "2026-05-01");
    expect(result.valid).toBe(false);
    expect(result.notes.some((n) => n.includes("reversed"))).toBe(true);
  });

  it("classifies monthly period", () => {
    const result = normalizePeriod("2026-05-01", "2026-05-31");
    expect(result.valid).toBe(true);
    expect(result.notes.some((n) => n.includes("monthly"))).toBe(true);
  });

  it("classifies quarterly period", () => {
    const result = normalizePeriod("2026-04-01", "2026-06-30");
    expect(result.valid).toBe(true);
    expect(result.notes.some((n) => n.includes("quarterly"))).toBe(true);
  });

  it("classifies annual period", () => {
    const result = normalizePeriod("2026-01-01", "2026-12-31");
    expect(result.valid).toBe(true);
    expect(result.notes.some((n) => n.includes("annual"))).toBe(true);
  });

  it("normalizes without losing source period", () => {
    const result = normalizePeriod("2026-05-01", "2026-05-31");
    expect(result.start).toBe("2026-05-01");
    expect(result.end).toBe("2026-05-31");
    // Source period is preserved exactly
  });
});

describe("B07 normalizer — acceptance gates", () => {
  it("gate 1: parses lakh/crore/absolute numbers", () => {
    const lakhResult = normalizeNumericValue(50, "lakh");
    expect(lakhResult.normalized).toBe(5_000_000);

    const croreResult = normalizeNumericValue(1, "crore");
    expect(croreResult.normalized).toBe(10_000_000);

    const absoluteResult = normalizeNumericValue(100000, "absolute");
    expect(absoluteResult.normalized).toBe(100000);
  });

  it("gate 2: preserves INR/USD distinction", () => {
    const fact = createFact({ currency: "INR" });
    const normalization = normalizeFact(fact);
    expect(normalization.currency).toBe("INR");

    const usdFact = createFact({ currency: "USD" });
    const usdNormalization = normalizeFact(usdFact);
    expect(usdNormalization.currency).toBe("USD");

    // Distinction preserved
    expect(normalization.currency).not.toBe(usdNormalization.currency);
  });

  it("gate 3: marks GST as unknown if not provable", () => {
    const fact = createFact({ metric: "revenue", currency: "INR" });
    const normalization = normalizeFact(fact);
    // Without explicit inclusive/exclusive markers, marked unknown
    expect(normalization.tax_basis).toBe("unknown");
  });

  it("gate 4: normalizes monthly/daily data without losing source period", () => {
    const fact = createFact({
      period_start: "2026-05-01",
      period_end: "2026-05-31",
    });
    const normalization = normalizeFact(fact);
    expect(normalization.notes.some((n) => n.includes("monthly"))).toBe(true);

    const applied = applyNormalization(fact, normalization);
    expect(applied.period_start).toBe("2026-05-01");
    expect(applied.period_end).toBe("2026-05-31");
  });
});

describe("B07 normalizer — full normalization workflow", () => {
  it("applies all normalizations without mutating input", () => {
    const fact = createFact({
      value: 50,
      unit: "lakh",
      metric: "revenue_including_gst",
      currency: "inr",
    });

    const normalization = normalizeFact(fact);
    expect(normalization.normalized_value).toBe(5_000_000);
    expect(normalization.currency).toBe("INR");
    expect(normalization.tax_basis).toBe("inclusive");
    expect(normalization.gross_or_net).toBe("gross");

    // Original fact unchanged
    expect(fact.value).toBe(50);
    expect(fact.currency).toBe("inr");
  });

  it("returns result with normalization_applied list", () => {
    const fact = createFact({ value: 50, unit: "lakh", currency: "inr" });
    const normalization = normalizeFact(fact);
    expect(normalization.normalization_applied.length).toBeGreaterThan(0);
  });

  it("applies normalization result back to fact", () => {
    const fact = createFact({ value: 50, unit: "lakh", currency: "inr" });
    const normalization = normalizeFact(fact);
    const normalized = applyNormalization(fact, normalization);

    expect(normalized.value).toBe(5_000_000);
    expect(normalized.currency).toBe("INR");
  });
});

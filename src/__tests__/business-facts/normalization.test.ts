/**
 * B07: Unit/Currency/Date/Tax Normalization — Pure Function Tests
 *
 * Verifies:
 * - Currency normalization (INR/USD/EUR/GBP/AUD)
 * - Indian quantity parsing (lakh/crore/thousand)
 * - Period normalization with granularity detection
 * - Tax basis detection
 * - Gross vs net classification
 * - Unit normalization
 * - Full fact normalization
 * - No data loss (source period preserved)
 */

import { describe, it, expect } from "vitest";
import {
  normalizeCurrency,
  parseIndianQuantity,
  normalizePeriod,
  detectTaxBasis,
  classifyGrossNet,
  normalizeUnit,
  normalizeToUTC,
  normalizeFact,
  type Currency,
  type TaxBasis,
  type GrossNet,
} from "../../domain/business-facts/normalization";
import type { BusinessFact } from "../../domain/business-facts/contract";

// --- Test Fixtures ---

const createMockFact = (overrides?: Partial<BusinessFact>): BusinessFact => ({
  fact_id: "fact_test_001",
  metric: "monthly_revenue",
  value: 500000,
  unit: "₹",
  currency: "INR",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  source_document_id: "src_001",
  source_location: "balance_sheet",
  extraction_method: "manual_entry",
  confidence_score: 0.85,
  validation_status: "owner_confirmed",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("B07: Unit/Currency/Date/Tax Normalization", () => {
  describe("normalizeCurrency", () => {
    it("should normalize INR variants", () => {
      expect(normalizeCurrency("INR")).toBe("INR");
      expect(normalizeCurrency("inr")).toBe("INR");
      expect(normalizeCurrency("rupee")).toBe("INR");
      expect(normalizeCurrency("₹")).toBe("INR");
      expect(normalizeCurrency("rs")).toBe("INR");
    });

    it("should normalize USD variants", () => {
      expect(normalizeCurrency("USD")).toBe("USD");
      expect(normalizeCurrency("$")).toBe("USD");
      expect(normalizeCurrency("dollar")).toBe("USD");
      expect(normalizeCurrency("us$")).toBe("USD");
    });

    it("should normalize EUR, GBP, AUD", () => {
      expect(normalizeCurrency("EUR")).toBe("EUR");
      expect(normalizeCurrency("€")).toBe("EUR");
      expect(normalizeCurrency("GBP")).toBe("GBP");
      expect(normalizeCurrency("£")).toBe("GBP");
      expect(normalizeCurrency("AUD")).toBe("AUD");
    });

    it("should return OTHER for unknown currencies", () => {
      expect(normalizeCurrency("XYZ")).toBe("OTHER");
      expect(normalizeCurrency("")).toBe("OTHER");
      expect(normalizeCurrency(undefined)).toBe("OTHER");
    });
  });

  describe("parseIndianQuantity", () => {
    it("should parse crore notation", () => {
      const result = parseIndianQuantity("5 crore");
      expect(result.parsed_absolute_value).toBe(50_000_000);
      expect(result.source_unit).toBe("crore");
      expect(result.normalization_applied).toBe(true);
    });

    it("should parse lakh notation", () => {
      const result = parseIndianQuantity("10 lakh");
      expect(result.parsed_absolute_value).toBe(1_000_000);
      expect(result.source_unit).toBe("lakh");
      expect(result.normalization_applied).toBe(true);
    });

    it("should parse alternative lakh forms", () => {
      expect(parseIndianQuantity("10L").parsed_absolute_value).toBe(1_000_000);
      expect(parseIndianQuantity("₹10L").parsed_absolute_value).toBe(1_000_000);
      expect(parseIndianQuantity("10 lakhs").parsed_absolute_value).toBe(1_000_000);
    });

    it("should parse thousand notation", () => {
      const result = parseIndianQuantity("50 thousand");
      expect(result.parsed_absolute_value).toBe(50_000);
      expect(result.source_unit).toBe("thousand");
    });

    it("should parse million notation", () => {
      const result = parseIndianQuantity("2.5 million");
      expect(result.parsed_absolute_value).toBe(2_500_000);
      expect(result.source_unit).toBe("million");
    });

    it("should handle absolute numbers", () => {
      const result = parseIndianQuantity(500000);
      expect(result.parsed_absolute_value).toBe(500000);
      expect(result.source_unit).toBe("absolute");
      expect(result.normalization_applied).toBe(false);
    });

    it("should handle absolute number strings", () => {
      const result = parseIndianQuantity("500000");
      expect(result.parsed_absolute_value).toBe(500000);
      expect(result.source_unit).toBe("absolute");
    });
  });

  describe("normalizePeriod", () => {
    it("should detect daily granularity", () => {
      const period = normalizePeriod("2026-05-01", "2026-05-02");
      expect(period.granularity).toBe("daily");
    });

    it("should detect monthly granularity", () => {
      const period = normalizePeriod("2026-05-01", "2026-05-31");
      expect(period.granularity).toBe("monthly");
    });

    it("should detect quarterly granularity", () => {
      const period = normalizePeriod("2026-01-01", "2026-03-31");
      expect(period.granularity).toBe("quarterly");
    });

    it("should detect yearly granularity", () => {
      const period = normalizePeriod("2026-01-01", "2026-12-31");
      expect(period.granularity).toBe("yearly");
    });

    it("should handle Date objects", () => {
      const start = new Date("2026-05-01");
      const end = new Date("2026-05-31");
      const period = normalizePeriod(start, end);
      expect(period.granularity).toBe("monthly");
    });

    it("should preserve source period information", () => {
      const period = normalizePeriod("2026-05-01", "2026-05-31");
      expect(period.start.toISOString().split("T")[0]).toBe("2026-05-01");
      expect(period.end.toISOString().split("T")[0]).toBe("2026-05-31");
    });
  });

  describe("detectTaxBasis", () => {
    it("should detect inclusive tax basis", () => {
      expect(detectTaxBasis("Revenue (GST incl)", "IN")).toBe("inclusive");
      expect(detectTaxBasis("after tax income", "IN")).toBe("inclusive");
    });

    it("should detect exclusive tax basis", () => {
      expect(detectTaxBasis("Revenue (GST excl)", "IN")).toBe("exclusive");
      expect(detectTaxBasis("before tax income", "IN")).toBe("exclusive");
    });

    it("should return unknown for ambiguous descriptions", () => {
      expect(detectTaxBasis("Revenue", "IN")).toBe("unknown");
      expect(detectTaxBasis("", "IN")).toBe("unknown");
      expect(detectTaxBasis(undefined, "IN")).toBe("unknown");
    });
  });

  describe("classifyGrossNet", () => {
    it("should classify as gross", () => {
      expect(classifyGrossNet("gross_revenue", undefined)).toBe("gross");
      expect(classifyGrossNet("revenue", undefined)).toBe("gross");
      expect(classifyGrossNet("top_line", undefined)).toBe("gross");
    });

    it("should classify as net", () => {
      expect(classifyGrossNet("net_profit", undefined)).toBe("net");
      expect(classifyGrossNet("net_earnings", undefined)).toBe("net");
      expect(classifyGrossNet("bottom_line", undefined)).toBe("net");
    });

    it("should return unknown for ambiguous names", () => {
      expect(classifyGrossNet("income", undefined)).toBe("unknown");
      expect(classifyGrossNet("", undefined)).toBe("unknown");
      expect(classifyGrossNet(undefined, undefined)).toBe("unknown");
    });
  });

  describe("normalizeUnit", () => {
    it("should normalize currency symbols", () => {
      expect(normalizeUnit("₹")).toBe("INR");
      expect(normalizeUnit("$")).toBe("USD");
      expect(normalizeUnit("€")).toBe("EUR");
      expect(normalizeUnit("£")).toBe("GBP");
    });

    it("should normalize currency text", () => {
      expect(normalizeUnit("rupee")).toBe("INR");
      expect(normalizeUnit("usd")).toBe("USD");
    });

    it("should preserve non-financial units", () => {
      expect(normalizeUnit("units")).toBe("units");
      expect(normalizeUnit("hours")).toBe("hours");
      expect(normalizeUnit("customers")).toBe("customers");
      expect(normalizeUnit("%")).toBe("%");
    });

    it("should handle empty/missing units", () => {
      expect(normalizeUnit(undefined)).toBe("units");
      expect(normalizeUnit("")).toBe("units");
    });
  });

  describe("normalizeToUTC", () => {
    it("should normalize date to UTC ISO 8601", () => {
      const result = normalizeToUTC("2026-05-15");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should handle Date objects", () => {
      const date = new Date("2026-05-15");
      const result = normalizeToUTC(date);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("normalizeFact", () => {
    it("should normalize a complete fact", () => {
      const fact = createMockFact();
      const normalized = normalizeFact(fact);

      expect(normalized.currency).toBe("INR");
      expect(normalized.unit).toBe("INR");
      expect(normalized.normalization_applied).toBe(true);
      expect(normalized.normalization_notes.length).toBeGreaterThan(0);
    });

    it("should detect tax basis when missing", () => {
      const fact = createMockFact({
        tax_basis: undefined,
        source_location: "after tax income",
      });
      const normalized = normalizeFact(fact);

      expect(normalized.tax_basis).toBe("inclusive");
      expect(normalized.normalization_notes.some((n) => n.includes("Tax basis"))).toBe(true);
    });

    it("should classify gross vs net when missing", () => {
      const fact = createMockFact({
        gross_or_net: undefined,
        metric: "gross_revenue",
      });
      const normalized = normalizeFact(fact);

      expect(normalized.gross_or_net).toBe("gross");
    });

    it("should preserve original fact (immutable)", () => {
      const fact = createMockFact();
      const normalized = normalizeFact(fact);

      expect(fact.currency).toBe("INR");
      expect(fact.normalization_applied).toBeUndefined();
      expect(normalized.normalization_applied).toBe(true);
    });

    it("should record all normalizations in notes", () => {
      const fact = createMockFact({
        unit: "₹",
        currency: "rupee",
      });
      const normalized = normalizeFact(fact);

      expect(normalized.normalization_notes.length).toBeGreaterThan(0);
      expect(JSON.stringify(normalized.normalization_notes)).toMatch(/Currency|Unit/);
    });
  });

  describe("Acceptance gates", () => {
    it("should handle lakh/crore parsing for Indian context", () => {
      const quantity = parseIndianQuantity("2.5 crore");
      expect(quantity.parsed_absolute_value).toBe(25_000_000);
      expect(quantity.normalization_applied).toBe(true);
    });

    it("should preserve INR/USD distinction", () => {
      const inr = normalizeCurrency("₹");
      const usd = normalizeCurrency("$");
      expect(inr).not.toBe(usd);
      expect(inr).toBe("INR");
      expect(usd).toBe("USD");
    });

    it("should mark GST as unknown if not provable", () => {
      const taxBasis = detectTaxBasis("Revenue", "IN");
      expect(taxBasis).toBe("unknown");
    });

    it("should normalize monthly without losing source period", () => {
      const period = normalizePeriod("2026-05-01", "2026-05-31");
      expect(period.granularity).toBe("monthly");
      expect(period.start.toISOString()).toContain("2026-05-01");
      expect(period.end.toISOString()).toContain("2026-05-31");
    });
  });
});

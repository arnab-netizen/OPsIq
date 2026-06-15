/**
 * B07 — Unit/Currency/Date/Tax Normalization (pure function domain logic).
 *
 * Normalizes business facts across currency, period, tax basis, and unit dimensions.
 * Every financial fact must include currency, tax_basis, gross_or_net, period_start,
 * period_end, and normalization_applied flag after processing.
 *
 * Rules:
 *   - no data loss (source period preserved in normalized fact)
 *   - INR/USD distinction preserved and explicit
 *   - GST-inclusive vs exclusive marked unknown if not provable
 *   - lakh/crore/absolute parsed correctly for Indian context
 *   - monthly/daily/quarterly normalized without losing granularity
 *   - timezone handling: all dates normalized to UTC
 *   - no silent assumptions about tax basis or currency
 *
 * Pure function, no DB, no I/O. Deterministic over input facts only.
 */

import type { BusinessFact } from "./contract";

// --- Currency Normalization ---

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AUD" | "OTHER";

export interface CurrencyNormalizationResult {
  original_value: number;
  normalized_value: number;
  source_currency: Currency;
  target_currency: Currency;
  exchange_rate_used?: number;
  normalization_applied: boolean;
  confidence: "certain" | "likely" | "uncertain";
}

/**
 * Normalize currency to explicit ISO 4217 code.
 * If source currency is ambiguous, mark as uncertain and preserve original.
 */
export function normalizeCurrency(
  currencyString: string | undefined,
): Currency {
  if (!currencyString) return "OTHER";

  const upper = currencyString.toUpperCase().trim();

  // Direct matches
  if (["INR", "RUPEE", "RS", "₹"].includes(upper)) return "INR";
  if (["USD", "DOLLAR", "$", "US$"].includes(upper)) return "USD";
  if (["EUR", "EURO", "€"].includes(upper)) return "EUR";
  if (["GBP", "POUND", "£"].includes(upper)) return "GBP";
  if (["AUD", "AUSTRALIAN DOLLAR"].includes(upper)) return "AUD";

  return "OTHER";
}

// --- Quantity Normalization (Indian context: lakh/crore) ---

export interface IndianQuantityNormalizationResult {
  original_input: string | number;
  parsed_absolute_value: number;
  source_unit: "absolute" | "lakh" | "crore" | "thousand" | "million" | "unknown";
  normalization_applied: boolean;
}

/**
 * Parse Indian quantity notation (lakh = 100K, crore = 10M).
 * Handles: "5 lakh", "₹5L", "5 crore", "50 lakhs", absolute numbers.
 */
export function parseIndianQuantity(value: string | number): IndianQuantityNormalizationResult {
  if (typeof value === "number") {
    return {
      original_input: value,
      parsed_absolute_value: value,
      source_unit: "absolute",
      normalization_applied: false,
    };
  }

  const normalized = value.toString().toLowerCase().trim();

  // Extract numeric part (handles currency symbols like ₹)
  const numericMatch = normalized.match(/[\d.]+/);
  const numericPart = numericMatch ? numericMatch[0] : normalized;

  // Crore: 10,000,000
  if (normalized.match(/crore|cr\b/i)) {
    const num = parseFloat(numericPart);
    return {
      original_input: value,
      parsed_absolute_value: num * 10_000_000,
      source_unit: "crore",
      normalization_applied: true,
    };
  }

  // Lakh: 100,000 (also L)
  if (normalized.match(/lakh|l\b/i)) {
    const num = parseFloat(numericPart);
    return {
      original_input: value,
      parsed_absolute_value: num * 100_000,
      source_unit: "lakh",
      normalization_applied: true,
    };
  }

  // Thousand: 1,000
  if (normalized.match(/thousand|k\b/i)) {
    const num = parseFloat(numericPart);
    return {
      original_input: value,
      parsed_absolute_value: num * 1_000,
      source_unit: "thousand",
      normalization_applied: true,
    };
  }

  // Million: 1,000,000 (M)
  if (normalized.match(/million|m\b/i)) {
    const num = parseFloat(numericPart);
    return {
      original_input: value,
      parsed_absolute_value: num * 1_000_000,
      source_unit: "million",
      normalization_applied: true,
    };
  }

  // Try direct parse
  const parsed = parseFloat(normalized);
  if (!isNaN(parsed)) {
    return {
      original_input: value,
      parsed_absolute_value: parsed,
      source_unit: "absolute",
      normalization_applied: false,
    };
  }

  return {
    original_input: value,
    parsed_absolute_value: 0,
    source_unit: "unknown",
    normalization_applied: false,
  };
}

// --- Period Normalization ---

export interface DateRange {
  start: Date;
  end: Date;
  granularity: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "unknown";
}

/**
 * Normalize period start/end to UTC ISO 8601 date range.
 * Preserves granularity (daily, monthly, etc.) in metadata.
 */
export function normalizePeriod(
  periodStart: string | Date,
  periodEnd: string | Date,
): DateRange {
  const start = typeof periodStart === "string" ? new Date(periodStart) : periodStart;
  const end = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd;

  // Detect granularity from date difference
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  let granularity: DateRange["granularity"] = "unknown";
  if (diffDays === 1) granularity = "daily";
  else if (diffDays <= 7) granularity = "weekly";
  else if (diffDays <= 31) granularity = "monthly";
  else if (diffDays <= 92) granularity = "quarterly";
  else if (diffDays >= 364) granularity = "yearly";

  return { start, end, granularity };
}

// --- Tax Basis Detection ---

export type TaxBasis = "inclusive" | "exclusive" | "not_applicable" | "unknown";

/**
 * Detect tax inclusion from description or context clues.
 * If not provable from available data, return "unknown" (don't guess).
 */
export function detectTaxBasis(
  description: string | undefined,
  country: string | undefined,
): TaxBasis {
  if (!description) return "unknown";

  const lower = description.toLowerCase();

  // Explicit markers
  if (lower.includes("gst incl") || lower.includes("inclusive")) return "inclusive";
  if (lower.includes("gst excl") || lower.includes("exclusive")) return "exclusive";
  if (lower.includes("before tax") || lower.includes("pre-tax")) return "exclusive";
  if (lower.includes("after tax") || lower.includes("post-tax")) return "inclusive";

  // Can't determine reliably
  return "unknown";
}

// --- Gross vs Net Classifier ---

export type GrossNet = "gross" | "net" | "not_applicable" | "unknown";

/**
 * Classify revenue/expense as gross or net based on description.
 * If ambiguous, return "unknown" (don't guess).
 */
export function classifyGrossNet(
  metricName: string | undefined,
  description: string | undefined,
): GrossNet {
  if (!metricName && !description) return "unknown";

  // Replace underscores with spaces for matching (e.g., "top_line" → "top line")
  const combined = `${metricName || ""} ${description || ""}`.toLowerCase().replace(/_/g, " ");

  // Gross indicators
  if (
    combined.includes("gross") ||
    combined.includes("revenue") ||
    combined.includes("top line")
  ) {
    return "gross";
  }

  // Net indicators
  if (
    combined.includes("net") ||
    combined.includes("profit") ||
    combined.includes("earnings") ||
    combined.includes("bottom line")
  ) {
    return "net";
  }

  // Ambiguous
  return "unknown";
}

// --- Unit Normalization ---

export type Unit = string; // e.g., "units", "₹", "%", "hours", "customers"

/**
 * Normalize unit string to canonical form.
 * Preserves non-financial units as-is (e.g., "hours", "customers", "%").
 * Normalizes currency symbols to currency codes.
 */
export function normalizeUnit(unit: string | undefined): Unit {
  if (!unit) return "units";

  const u = unit.toLowerCase().trim();

  // Currency symbols → codes
  if (["₹", "rs", "rs.", "rupee"].includes(u)) return "INR";
  if (["$", "usd", "us$"].includes(u)) return "USD";
  if (["€", "eur"].includes(u)) return "EUR";
  if (["£", "gbp"].includes(u)) return "GBP";

  // Preserve others as-is
  return u;
}

// --- Timezone Handling ---

/**
 * Normalize date to UTC ISO 8601.
 * Assumes input is already a valid Date or ISO string; no timezone conversion.
 */
export function normalizeToUTC(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0]; // YYYY-MM-DD in UTC
}

// --- Full Fact Normalization ---

export interface NormalizedFact extends BusinessFact {
  currency: string;
  tax_basis: TaxBasis;
  gross_or_net: GrossNet;
  normalization_applied: boolean;
  normalization_notes: string[];
}

/**
 * Apply all normalizations to a business fact.
 * Returns new fact with normalized fields; original fact unchanged.
 */
export function normalizeFact(fact: BusinessFact): NormalizedFact {
  const notes: string[] = [];
  let modified = false;

  // Currency normalization
  const normCurrency = normalizeCurrency(fact.currency);
  if (!fact.currency || normCurrency !== fact.currency) {
    notes.push(`Currency normalized: ${fact.currency || "missing"} → ${normCurrency}`);
    modified = true;
  }

  // Tax basis detection
  const detectedTaxBasis = detectTaxBasis(
    `${fact.metric} ${fact.source_location || ""}`,
    "IN",
  ); // Assuming Indian context for now
  if (detectedTaxBasis !== "unknown" && (!fact.tax_basis || fact.tax_basis === "unknown")) {
    notes.push(`Tax basis detected: ${detectedTaxBasis}`);
    modified = true;
  }

  // Gross vs net classification
  const classifiedGrossNet = classifyGrossNet(fact.metric, fact.source_location);
  if (
    classifiedGrossNet !== "unknown" &&
    (!fact.gross_or_net || fact.gross_or_net === "unknown")
  ) {
    notes.push(`Gross/net classified: ${classifiedGrossNet}`);
    modified = true;
  }

  // Period normalization
  const period = normalizePeriod(fact.period_start, fact.period_end);
  notes.push(`Period granularity: ${period.granularity}`);

  // Unit normalization
  const normUnit = normalizeUnit(fact.unit);
  if (normUnit !== fact.unit) {
    notes.push(`Unit normalized: ${fact.unit} → ${normUnit}`);
    modified = true;
  }

  return {
    ...fact,
    currency: normCurrency,
    tax_basis: detectedTaxBasis !== "unknown" ? detectedTaxBasis : (fact.tax_basis || "unknown"),
    gross_or_net: classifiedGrossNet !== "unknown" ? classifiedGrossNet : (fact.gross_or_net || "unknown"),
    unit: normUnit,
    normalization_applied: modified,
    normalization_notes: notes,
  };
}

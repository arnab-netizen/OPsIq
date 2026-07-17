/**
 * B07 — Unit/Currency/Date/Tax Normalization.
 *
 * Pure, deterministic normalization of financial facts. Ensures every financial
 * fact includes currency, tax_basis, gross_or_net, period dates, and normalization
 * status. Handles unit conversion (lakh/crore), currency validation, and tax basis
 * detection from context clues.
 *
 * Rules:
 *   - lakh = 100,000; crore = 10,000,000
 *   - INR/USD (ISO 4217 codes) preserved exactly
 *   - GST-inclusive vs GST-exclusive marked "unknown" if not provable
 *   - monthly/daily data normalized without losing source period
 *   - timezone-aware date handling (stored as ISO 8601 in contract)
 *
 * Acceptance gates:
 *   - lakh/crore/absolute number parsing
 *   - INR/USD distinction preserved
 *   - GST-inclusive vs GST-exclusive marked unknown if not provable
 *   - monthly vs daily data normalized without losing source period
 *
 * Pure function, no DB, no I/O. Deterministic over fact + context.
 */
import type { BusinessFact, TaxBasis, GrossNet } from "./contract";

// --- Unit conversion table --------------------------------------------------

const UNIT_MULTIPLIERS: Record<string, number> = {
  lakh: 100_000,
  lac: 100_000, // alternate spelling
  crore: 10_000_000,
  "crore rupees": 10_000_000,
  "lakh rupees": 100_000,
  thousand: 1_000,
  k: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

// --- Normalization result ---------------------------------------------------

export interface NormalizationResult {
  original_value: unknown;
  normalized_value: number | null;
  unit_normalized: boolean;
  currency: string | null;
  tax_basis: TaxBasis;
  gross_or_net: GrossNet;
  normalization_applied: string[];
  notes: string[];
}

// --- Unit normalization -----------------------------------------------------

/**
 * Parse a unit string and return multiplier (e.g., "lakh" → 100,000).
 */
export function parseUnitMultiplier(unit: string): number | null {
  const normalized = unit.toLowerCase().trim();
  return UNIT_MULTIPLIERS[normalized] ?? null;
}

/**
 * Normalize a numeric value by applying unit conversion.
 * E.g., "50 lakh" → 5,000,000.
 */
export function normalizeNumericValue(value: unknown, unit: string): { normalized: number | null; applied: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { normalized: null, applied: false };
  }

  const multiplier = parseUnitMultiplier(unit);
  if (multiplier === null || multiplier === 1) {
    return { normalized: value, applied: false };
  }

  return {
    normalized: value * multiplier,
    applied: true,
  };
}

// --- Currency validation ----------------------------------------------------

/**
 * Validate a currency code (ISO 4217, 3 uppercase letters).
 * Returns the code if valid, null otherwise.
 */
export function validateCurrency(code: string | null): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) return null;
  return trimmed;
}

// --- Tax basis detection ----------------------------------------------------

/**
 * Detect tax basis from metadata hints (field names, notes, etc.).
 * Returns "inclusive", "exclusive", "not_applicable", or "unknown".
 */
export function detectTaxBasis(
  fieldName: string,
  notes: string | null,
): TaxBasis {
  const fieldLower = fieldName.toLowerCase();
  const notesLower = (notes || "").toLowerCase();
  const combined = `${fieldLower} ${notesLower}`;

  // Inclusive markers
  if (combined.includes("inclusive") || combined.includes("incl") || combined.includes("including gst")) {
    return "inclusive";
  }

  // Exclusive markers
  if (combined.includes("exclusive") || combined.includes("excl") || combined.includes("excluding gst") ||
      combined.includes("ex gst") || combined.includes("before gst")) {
    return "exclusive";
  }

  // Not applicable (non-financial or service-based, no tax)
  if (combined.includes("count") || combined.includes("quantity") || combined.includes("units") ||
      combined.includes("headcount") || combined.includes("employees")) {
    return "not_applicable";
  }

  return "unknown";
}

// --- Gross vs Net classification --------------------------------------------

/**
 * Classify a fact as gross or net based on field name and context.
 */
export function classifyGrossNet(fieldName: string, notes: string | null): GrossNet {
  const fieldLower = fieldName.toLowerCase();
  const notesLower = (notes || "").toLowerCase();
  const combined = `${fieldLower} ${notesLower}`;

  if (combined.includes("gross")) return "gross";
  if (combined.includes("net")) return "net";
  if (combined.includes("revenue") || combined.includes("sales") || combined.includes("income")) {
    // Revenue/sales typically reported as gross unless stated otherwise
    return "gross";
  }
  if (combined.includes("profit") || combined.includes("cost") || combined.includes("expense")) {
    // Profits/costs typically reported as net
    return "net";
  }

  return "unknown";
}

// --- Period normalization ---------------------------------------------------

/**
 * Parse an ISO date string (YYYY-MM-DD).
 */
export function parseISODate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize a period start/end. Validates ISO dates and checks for logical order.
 */
export function normalizePeriod(
  periodStart: string | null,
  periodEnd: string | null,
): { start: string | null; end: string | null; valid: boolean; notes: string[] } {
  const notes: string[] = [];
  const start = parseISODate(periodStart);
  const end = parseISODate(periodEnd);

  if (!start || !end) {
    return {
      start: periodStart,
      end: periodEnd,
      valid: false,
      notes: ["Invalid period dates"],
    };
  }

  if (start > end) {
    notes.push("Period start is after end (reversed dates)");
    return {
      start: periodStart,
      end: periodEnd,
      valid: false,
      notes,
    };
  }

  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (days < 1) {
    notes.push("Period is less than 1 day");
  } else if (days <= 31) {
    notes.push("Period is monthly or shorter");
  } else if (days <= 92) {
    notes.push("Period is quarterly");
  } else if (days <= 366) {
    notes.push("Period is annual or shorter");
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    valid: true,
    notes,
  };
}

// --- Full normalization workflow -------------------------------------------

/**
 * Normalize a business fact: validate/convert units, currencies, tax basis, dates.
 * Returns a result with the normalized value, applied transformations, and notes.
 */
export function normalizeFact(fact: BusinessFact): NormalizationResult {
  const applied: string[] = [];
  const notes: string[] = [];

  // Normalize numeric value and unit
  const { normalized: normalizedValue, applied: unitApplied } = normalizeNumericValue(fact.value, fact.unit);
  if (unitApplied) {
    applied.push(`unit_conversion (${fact.unit})`);
  }

  // Validate currency
  const currency = validateCurrency(fact.currency ?? null);
  if (currency && currency !== (fact.currency ?? "")) {
    applied.push("currency_normalized");
  }

  // Detect tax basis from context
  const taxBasis = detectTaxBasis(fact.metric, null);
  if (taxBasis !== "unknown" && fact.tax_basis !== taxBasis) {
    applied.push("tax_basis_detected");
  }

  // Classify gross vs net
  const grossOrNet = classifyGrossNet(fact.metric, null);
  if (grossOrNet !== "unknown" && fact.gross_or_net !== grossOrNet) {
    applied.push("gross_or_net_classified");
  }

  // Validate period
  const periodResult = normalizePeriod(fact.period_start, fact.period_end);
  if (!periodResult.valid) {
    notes.push(...periodResult.notes);
  } else {
    notes.push(...periodResult.notes);
  }

  return {
    original_value: fact.value,
    normalized_value: normalizedValue,
    unit_normalized: unitApplied,
    currency,
    tax_basis: taxBasis,
    gross_or_net: grossOrNet,
    normalization_applied: applied,
    notes,
  };
}

/**
 * Apply normalization result back to a fact, returning a new fact with
 * normalized fields. Does not mutate the input.
 */
export function applyNormalization(
  fact: BusinessFact,
  normalization: NormalizationResult,
): BusinessFact {
  return {
    ...fact,
    value: normalization.normalized_value ?? fact.value,
    currency: normalization.currency || fact.currency,
    tax_basis: normalization.tax_basis,
    gross_or_net: normalization.gross_or_net,
  };
}

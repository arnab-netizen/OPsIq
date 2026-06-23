/**
 * Owner Connectors & Data Intake (Module 10) — shared types for the deterministic
 * data-intake engine.
 *
 * Pure types only: no DB, no I/O, no LLM. The intake engine turns a raw upload
 * (CSV / manual / sheet export) into a NORMALIZED, VALIDATED candidate plus an
 * explicit error report. Per execution.md §17, every intake carries source,
 * timestamp, validation status, normalization status, error report, and owner
 * confirmation — and connector data NEVER changes a diagnosis without owner
 * confirmation (the engine produces a candidate; confirmation is a later step).
 */

/** Where the data came from (initial connector targets). */
export const INTAKE_SOURCES = [
  "csv_upload",
  "manual_form",
  "google_sheets",
  "email_import",
  "accounting_export",
  "pos_order_upload",
  "bank_statement",
  "lead_import",
] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

/** Field value types the engine knows how to normalize + validate. */
export const INTAKE_FIELD_TYPES = ["number", "currency", "date", "string"] as const;
export type IntakeFieldType = (typeof INTAKE_FIELD_TYPES)[number];

/** One expected column in the target's field spec. */
export interface IntakeFieldSpec {
  name: string; // canonical field name (e.g. "periodStart", "revenue")
  type: IntakeFieldType;
  required?: boolean;
  nonNegative?: boolean; // for number/currency: reject negatives
  label?: string; // human label (informational)
}

/** Aggregate validation outcome across all rows. */
export const INTAKE_VALIDATION_STATUSES = ["valid", "partial", "invalid"] as const;
export type IntakeValidationStatus = (typeof INTAKE_VALIDATION_STATUSES)[number];

/** Whether the engine produced a normalized candidate. */
export const INTAKE_NORMALIZATION_STATUSES = ["normalized", "not_normalized"] as const;
export type IntakeNormalizationStatus = (typeof INTAKE_NORMALIZATION_STATUSES)[number];

/** A single field-level intake error (deterministic, owner-readable). */
export interface IntakeFieldError {
  row: number; // 1-based data row index
  field: string;
  code: "missing_required" | "invalid_number" | "negative_value" | "invalid_date" | "unmapped_column" | "inconsistent_data" | "gst_basis_unknown" | "soft_limit_warning";
  message: string;
}

/** A normalized data row keyed by canonical field name. */
export type NormalizedRecord = Record<string, number | string | null>;

/** Evidence quality tier derived from intake source. */
export type IntakeQualityTier = "Strong" | "Moderate" | "Weak" | "Assumed";

const QUALITY_TIER_MAP: Record<IntakeSource, IntakeQualityTier> = {
  accounting_export: "Strong",
  bank_statement: "Strong",
  pos_order_upload: "Strong",
  csv_upload: "Moderate",
  google_sheets: "Moderate",
  manual_form: "Weak",
  email_import: "Weak",
  lead_import: "Assumed",
};

/** Deterministic evidence quality tier for an intake source. */
export function sourceQualityTier(source: IntakeSource): IntakeQualityTier {
  return QUALITY_TIER_MAP[source] ?? "Assumed";
}

/** The full deterministic intake result (a candidate awaiting owner confirmation). */
export interface IntakeResult {
  source: IntakeSource;
  generatedAt: Date;
  rowCount: number;
  mappedFields: string[]; // canonical fields matched to a column
  unmappedColumns: string[]; // upload columns not in the spec
  records: NormalizedRecord[];
  validationStatus: IntakeValidationStatus;
  normalizationStatus: IntakeNormalizationStatus;
  errorReport: IntakeFieldError[];
  ownerConfirmed: false; // intake never auto-confirms; owner must confirm later
}

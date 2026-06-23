/**
 * Owner Mode Decision OS — Canonical Source Classification (Decision-OS §1.10).
 *
 * Pure, deterministic. No DB, no I/O, no LLM. Every important input used for
 * Owner Mode decisioning must be classifiable into ONE canonical class so that
 * confidence weighting can treat owner-reported / inferred / assumed inputs
 * lower than verified records or calculated metrics.
 *
 * This module does NOT introduce a new persisted enum and does NOT rename any
 * existing status. It is a non-breaking MAPPING layer over the vocabularies
 * that already exist in the business-facts contract
 * (`ExtractionMethod`, `SourceDocumentKind`, `FactValidationStatus`). Downstream
 * phases (data quality / evidence bundle / decision confidence) consume it to
 * weight evidence strength; they remain the single source of persisted state.
 */
import type {
  ExtractionMethod,
  SourceDocumentKind,
  FactValidationStatus,
} from "../business-facts/contract";

/**
 * Canonical Owner Mode source classes (Decision-OS §1.10). Ordered loosely from
 * most to least trustworthy; numeric trust lives in {@link SOURCE_CLASS_WEIGHT}.
 */
export const SOURCE_CLASSIFICATIONS = [
  "VERIFIED_RECORD",
  "CALCULATED",
  "IMPORTED_FILE",
  "OPERATOR_REPORTED",
  "OWNER_REPORTED",
  "SYSTEM_INFERENCE",
  "ASSUMPTION",
  "UNKNOWN",
] as const;

export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

/**
 * Trust weight 0..1 per source class. Hard rule (Decision-OS §1.10): OWNER_REPORTED,
 * SYSTEM_INFERENCE and ASSUMPTION must rank strictly below VERIFIED_RECORD and
 * CALCULATED. Tests assert this ordering so it cannot silently regress.
 */
export const SOURCE_CLASS_WEIGHT: Readonly<Record<SourceClassification, number>> = {
  VERIFIED_RECORD: 1.0,
  CALCULATED: 0.9,
  IMPORTED_FILE: 0.7,
  OPERATOR_REPORTED: 0.55,
  OWNER_REPORTED: 0.5,
  SYSTEM_INFERENCE: 0.4,
  ASSUMPTION: 0.3,
  UNKNOWN: 0.0,
};

/** Returns the 0..1 trust weight for a canonical source class. */
export function sourceClassWeight(cls: SourceClassification): number {
  return SOURCE_CLASS_WEIGHT[cls];
}

/**
 * Base classification implied by how a fact was captured. A later validation
 * status can only DOWNGRADE or CORROBORATE this (see {@link classifyFactSource}).
 */
const EXTRACTION_BASE_CLASS: Readonly<Record<ExtractionMethod, SourceClassification>> = {
  // Authoritative system records.
  bank_statement: "VERIFIED_RECORD",
  accounting_export: "VERIFIED_RECORD",
  pos_export: "VERIFIED_RECORD",
  api_sync: "VERIFIED_RECORD",
  // Derived numbers.
  calculation: "CALCULATED",
  // File imports — trustworthy structure, unverified contents.
  csv_import: "IMPORTED_FILE",
  xlsx_import: "IMPORTED_FILE",
  google_sheets_import: "IMPORTED_FILE",
  ocr: "IMPORTED_FILE",
  // Human-entered.
  manual_entry: "OWNER_REPORTED",
  // Explicitly a guess.
  owner_estimate: "ASSUMPTION",
};

/** Source-document lineage → base class, used when no extraction method is known. */
const SOURCE_KIND_BASE_CLASS: Readonly<Record<SourceDocumentKind, SourceClassification>> = {
  bank_api: "VERIFIED_RECORD",
  accounting_system_export: "VERIFIED_RECORD",
  pos_export: "VERIFIED_RECORD",
  crm_export: "IMPORTED_FILE",
  csv: "IMPORTED_FILE",
  xlsx: "IMPORTED_FILE",
  google_sheet: "IMPORTED_FILE",
  pdf_statement: "IMPORTED_FILE",
  screenshot_ocr: "IMPORTED_FILE",
  manual_owner_entry: "OWNER_REPORTED",
  other: "UNKNOWN",
};

export interface FactSourceSignals {
  extractionMethod?: ExtractionMethod | null;
  sourceKind?: SourceDocumentKind | null;
  validationStatus?: FactValidationStatus | null;
}

/**
 * Classify a single decisioning input into the canonical Owner Mode source class.
 *
 * Deterministic precedence:
 * 1. A `rejected` validation status always yields UNKNOWN (the value was disowned).
 * 2. Otherwise the base class comes from the extraction method, else the source
 *    document kind, else UNKNOWN.
 * 3. Validation status then adjusts: `system_validated` corroborates a file/owner
 *    input up to VERIFIED_RECORD; an unconfirmed (`draft`/`unknown`) authoritative
 *    record is softened to IMPORTED_FILE because it is not yet owner/system-confirmed.
 *
 * Never throws; unknown/missing signals collapse to UNKNOWN (no optimistic default).
 */
export function classifyFactSource(signals: FactSourceSignals): SourceClassification {
  const { extractionMethod, sourceKind, validationStatus } = signals;

  if (validationStatus === "rejected") return "UNKNOWN";

  let base: SourceClassification =
    (extractionMethod && EXTRACTION_BASE_CLASS[extractionMethod]) ||
    (sourceKind && SOURCE_KIND_BASE_CLASS[sourceKind]) ||
    "UNKNOWN";

  if (base === "UNKNOWN") return "UNKNOWN";

  // Validation overlay (cannot manufacture trust the capture didn't have).
  if (validationStatus === "system_validated") {
    // A validated import/owner number is corroborated up to a verified record.
    if (base === "IMPORTED_FILE" || base === "OWNER_REPORTED") base = "VERIFIED_RECORD";
  } else if (validationStatus === "draft" || validationStatus === "unknown") {
    // Unconfirmed authoritative records are not yet trustworthy as verified.
    if (base === "VERIFIED_RECORD") base = "IMPORTED_FILE";
  }
  // `owner_confirmed` leaves the base class intact (owner attests but does not verify).

  return base;
}

/** Convenience: trust weight for a raw set of source signals. */
export function factSourceWeight(signals: FactSourceSignals): number {
  return sourceClassWeight(classifyFactSource(signals));
}

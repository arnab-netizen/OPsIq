/**
 * B04 — Evidence Hierarchy.
 *
 * Formalizes the evidence-level ranking from execution_post_owner_mode.md §13:
 *   L5: bank/API/accounting ledger/exported system record
 *   L4: structured CSV/XLSX system export
 *   L3: PDF statement/invoice
 *   L2: screenshot/OCR
 *   L1: manual owner entry
 *
 * Rules:
 *   - higher evidence overrides lower evidence on conflict unless owner resolves
 *   - manual owner entry cannot override bank/API evidence silently
 *   - every recommendation must cite the highest available relevant evidence
 *
 * Deterministic (no DB, no I/O, no guessing). Maps all SOURCE_DOCUMENT_KIND and
 * EXTRACTION_METHOD vocabulary from B01 to evidence levels. Pure functions for
 * conflict detection and evidence comparison.
 */
import { type SourceDocumentKind, type ExtractionMethod } from "./contract";

// --- Evidence level definition -----------------------------------------------

export const EVIDENCE_LEVELS = [1, 2, 3, 4, 5] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_DESCRIPTIONS: Record<EvidenceLevel, string> = {
  1: "Manual owner entry",
  2: "Screenshot / OCR",
  3: "PDF statement / invoice",
  4: "Structured CSV / XLSX system export",
  5: "Bank API / accounting ledger / exported system record",
};

// --- Source document kind → evidence level mapping ----------------------------

/**
 * Map source document kinds to evidence levels.
 * All SOURCE_DOCUMENT_KINDS from B01 contract are explicitly classified.
 */
export const SOURCE_KIND_EVIDENCE: Record<SourceDocumentKind, EvidenceLevel> = {
  manual_owner_entry: 1,
  screenshot_ocr: 2,
  pdf_statement: 3,
  csv: 4,
  xlsx: 4,
  google_sheet: 4,
  accounting_system_export: 5,
  pos_export: 5,
  bank_api: 5,
  crm_export: 5,
  other: 2, // unclassified documents treated as OCR/low-confidence
};

// --- Extraction method → evidence level mapping -------------------------------

/**
 * Map extraction methods to evidence levels.
 * All EXTRACTION_METHODS from B01 contract are explicitly classified.
 * Note: method trust overlaps with but is distinct from source evidence.
 * This mapping reflects the method's inherent reliability independent of source.
 */
export const METHOD_EVIDENCE: Record<ExtractionMethod, EvidenceLevel> = {
  manual_entry: 1,
  ocr: 2,
  owner_estimate: 1,
  csv_import: 4,
  xlsx_import: 4,
  google_sheets_import: 4,
  calculation: 3, // derived from other facts; evidence depends on inputs
  bank_statement: 5,
  api_sync: 5,
  accounting_export: 5,
  pos_export: 5,
};

// --- Evidence comparison and conflict detection --------------------------------

/**
 * Get evidence level for a given source document kind.
 */
export function sourceEvidenceLevel(kind: SourceDocumentKind): EvidenceLevel {
  return SOURCE_KIND_EVIDENCE[kind];
}

/**
 * Get evidence level for a given extraction method.
 */
export function methodEvidenceLevel(method: ExtractionMethod): EvidenceLevel {
  return METHOD_EVIDENCE[method];
}

/**
 * Compare two evidence levels. Returns:
 *   > 0 if a > b
 *   = 0 if a === b
 *   < 0 if a < b
 */
export function compareEvidenceLevels(a: EvidenceLevel, b: EvidenceLevel): number {
  return a - b;
}

/**
 * Determine if a lower-evidence fact should be allowed to override
 * a higher-evidence fact. Returns true if override is allowed (owner resolution
 * required); false if override is strictly blocked.
 *
 * Rule: manual owner entry (L1) cannot silently override bank/API (L5).
 * All other mismatches require explicit owner resolution, but nothing is
 * permanently blocked at this layer.
 */
export function canOverrideWithoutOwnerResolution(
  newEvidenceLevel: EvidenceLevel,
  existingEvidenceLevel: EvidenceLevel,
): boolean {
  // Lower evidence can never silently override higher evidence
  if (newEvidenceLevel < existingEvidenceLevel) return false;
  // Higher evidence can override lower evidence by default (but audit will log)
  if (newEvidenceLevel > existingEvidenceLevel) return true;
  // Same level: allowed (replacement)
  return true;
}

/**
 * Given a set of evidence levels, return the highest one.
 * Used to determine the strongest available evidence for a fact type.
 */
export function highestEvidenceLevel(levels: EvidenceLevel[]): EvidenceLevel | null {
  if (levels.length === 0) return null;
  return Math.max(...levels) as EvidenceLevel;
}

/**
 * Determine if an unresolved conflict between two evidence levels
 * is material enough to block high-confidence recommendations.
 * Material = gap of 2+ evidence levels (e.g., L1 vs L3, L1 vs L4, L2 vs L4, etc.).
 */
export function isMaterialEvidenceConflict(levelA: EvidenceLevel, levelB: EvidenceLevel): boolean {
  return Math.abs(levelA - levelB) >= 2;
}

/**
 * Summary descriptor for an evidence level (used in audit trails, notes, etc.).
 */
export function evidenceDescription(level: EvidenceLevel): string {
  return EVIDENCE_DESCRIPTIONS[level];
}

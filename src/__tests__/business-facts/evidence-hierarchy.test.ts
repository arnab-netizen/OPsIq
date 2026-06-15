/**
 * B04 — Evidence Hierarchy: pure-function tests.
 *
 * Proves the evidence-level ranking, override rules, and conflict detection:
 *   - all source kinds and extraction methods are mapped to evidence levels
 *   - higher evidence overrides lower evidence unless blocked
 *   - manual entry (L1) cannot silently override bank/API (L5)
 *   - evidence levels can be compared and ranked
 *   - L1 vs L5 conflicts are detected and marked material
 *
 * Non-DB: pure ranking over B01 vocabulary. Runs under `npm test`.
 */
import { describe, it, expect } from "vitest";
import {
  EVIDENCE_LEVELS,
  EVIDENCE_DESCRIPTIONS,
  SOURCE_KIND_EVIDENCE,
  METHOD_EVIDENCE,
  sourceEvidenceLevel,
  methodEvidenceLevel,
  compareEvidenceLevels,
  canOverrideWithoutOwnerResolution,
  highestEvidenceLevel,
  isMaterialEvidenceConflict,
  evidenceDescription,
} from "@/domain/business-facts/evidence-hierarchy";
import { SOURCE_DOCUMENT_KINDS, EXTRACTION_METHODS } from "@/domain/business-facts/contract";

describe("B04 evidence hierarchy — completeness & mapping", () => {
  it("defines five evidence levels (L1–L5)", () => {
    expect(EVIDENCE_LEVELS).toEqual([1, 2, 3, 4, 5]);
  });

  it("has descriptions for all five levels", () => {
    for (const level of EVIDENCE_LEVELS) {
      expect(EVIDENCE_DESCRIPTIONS[level]).toBeTruthy();
      expect(typeof EVIDENCE_DESCRIPTIONS[level]).toBe("string");
    }
  });

  it("maps all SOURCE_DOCUMENT_KINDS to evidence levels", () => {
    for (const kind of SOURCE_DOCUMENT_KINDS) {
      expect(SOURCE_KIND_EVIDENCE[kind]).toBeDefined();
      expect(EVIDENCE_LEVELS.includes(SOURCE_KIND_EVIDENCE[kind])).toBe(true);
    }
  });

  it("maps all EXTRACTION_METHODS to evidence levels", () => {
    for (const method of EXTRACTION_METHODS) {
      expect(METHOD_EVIDENCE[method]).toBeDefined();
      expect(EVIDENCE_LEVELS.includes(METHOD_EVIDENCE[method])).toBe(true);
    }
  });
});

describe("B04 evidence hierarchy — evidence classification", () => {
  it("classifies L5 correctly: bank/API/accounting ledger exports", () => {
    expect(sourceEvidenceLevel("bank_api")).toBe(5);
    expect(sourceEvidenceLevel("accounting_system_export")).toBe(5);
    expect(sourceEvidenceLevel("pos_export")).toBe(5);
    expect(sourceEvidenceLevel("crm_export")).toBe(5);
    expect(methodEvidenceLevel("bank_statement")).toBe(5);
    expect(methodEvidenceLevel("api_sync")).toBe(5);
    expect(methodEvidenceLevel("accounting_export")).toBe(5);
    expect(methodEvidenceLevel("pos_export")).toBe(5);
  });

  it("classifies L4 correctly: CSV/XLSX system exports", () => {
    expect(sourceEvidenceLevel("csv")).toBe(4);
    expect(sourceEvidenceLevel("xlsx")).toBe(4);
    expect(sourceEvidenceLevel("google_sheet")).toBe(4);
    expect(methodEvidenceLevel("csv_import")).toBe(4);
    expect(methodEvidenceLevel("xlsx_import")).toBe(4);
    expect(methodEvidenceLevel("google_sheets_import")).toBe(4);
  });

  it("classifies L3 correctly: PDF statements/invoices and calculations", () => {
    expect(sourceEvidenceLevel("pdf_statement")).toBe(3);
    expect(methodEvidenceLevel("calculation")).toBe(3);
  });

  it("classifies L2 correctly: screenshots/OCR", () => {
    expect(sourceEvidenceLevel("screenshot_ocr")).toBe(2);
    expect(methodEvidenceLevel("ocr")).toBe(2);
    expect(sourceEvidenceLevel("other")).toBe(2);
  });

  it("classifies L1 correctly: manual owner entry", () => {
    expect(sourceEvidenceLevel("manual_owner_entry")).toBe(1);
    expect(methodEvidenceLevel("manual_entry")).toBe(1);
    expect(methodEvidenceLevel("owner_estimate")).toBe(1);
  });
});

describe("B04 evidence hierarchy — override rules", () => {
  it("allows L5 to override L1 without owner resolution", () => {
    expect(canOverrideWithoutOwnerResolution(5, 1)).toBe(true);
    expect(canOverrideWithoutOwnerResolution(4, 1)).toBe(true);
    expect(canOverrideWithoutOwnerResolution(3, 1)).toBe(true);
  });

  it("BLOCKS L1 from silently overriding L5 (manual cannot override bank/API)", () => {
    expect(canOverrideWithoutOwnerResolution(1, 5)).toBe(false);
    expect(canOverrideWithoutOwnerResolution(2, 5)).toBe(false);
    expect(canOverrideWithoutOwnerResolution(1, 4)).toBe(false);
  });

  it("allows same-level replacement", () => {
    expect(canOverrideWithoutOwnerResolution(5, 5)).toBe(true);
    expect(canOverrideWithoutOwnerResolution(1, 1)).toBe(true);
  });

  it("allows higher evidence to override lower (with audit)", () => {
    expect(canOverrideWithoutOwnerResolution(4, 2)).toBe(true);
    expect(canOverrideWithoutOwnerResolution(3, 2)).toBe(true);
    expect(canOverrideWithoutOwnerResolution(5, 3)).toBe(true);
  });
});

describe("B04 evidence hierarchy — comparison and conflict detection", () => {
  it("compares evidence levels correctly", () => {
    expect(compareEvidenceLevels(5, 1)).toBeGreaterThan(0);
    expect(compareEvidenceLevels(1, 5)).toBeLessThan(0);
    expect(compareEvidenceLevels(3, 3)).toBe(0);
  });

  it("detects L1 vs L5 conflict as material", () => {
    expect(isMaterialEvidenceConflict(1, 5)).toBe(true);
    expect(isMaterialEvidenceConflict(5, 1)).toBe(true);
  });

  it("marks L1 vs L3 (gap 2) as material", () => {
    expect(isMaterialEvidenceConflict(1, 3)).toBe(true);
    expect(isMaterialEvidenceConflict(1, 4)).toBe(true);
  });

  it("marks L1 vs L2 (gap 1) as NOT material", () => {
    expect(isMaterialEvidenceConflict(1, 2)).toBe(false);
    expect(isMaterialEvidenceConflict(2, 3)).toBe(false);
  });

  it("finds highest evidence from a mixed set", () => {
    expect(highestEvidenceLevel([1, 2, 3])).toBe(3);
    expect(highestEvidenceLevel([5, 1, 3])).toBe(5);
    expect(highestEvidenceLevel([4])).toBe(4);
    expect(highestEvidenceLevel([])).toBe(null);
  });
});

describe("B04 evidence hierarchy — descriptors", () => {
  it("provides readable evidence descriptions", () => {
    expect(evidenceDescription(5)).toContain("Bank");
    expect(evidenceDescription(4)).toContain("CSV");
    expect(evidenceDescription(3)).toContain("PDF");
    expect(evidenceDescription(2)).toContain("OCR");
    expect(evidenceDescription(1)).toContain("Manual");
  });
});

describe("B04 evidence hierarchy — acceptance gates", () => {
  it("gate 1: detects L1 vs L5 conflict", () => {
    const l1EvidenceLevel = sourceEvidenceLevel("manual_owner_entry");
    const l5EvidenceLevel = sourceEvidenceLevel("bank_api");
    expect(l1EvidenceLevel).toBe(1);
    expect(l5EvidenceLevel).toBe(5);
    expect(isMaterialEvidenceConflict(l1EvidenceLevel, l5EvidenceLevel)).toBe(true);
  });

  it("gate 2: makes highest evidence available for recommendation citation", () => {
    // When recommending, upstream will call highestEvidenceLevel(relevantSources)
    // to cite the strongest evidence supporting the recommendation.
    const mixedSources = [
      sourceEvidenceLevel("manual_owner_entry"),
      sourceEvidenceLevel("pdf_statement"),
      sourceEvidenceLevel("bank_api"),
    ];
    const highest = highestEvidenceLevel(mixedSources);
    expect(highest).toBe(5);
    expect(evidenceDescription(highest)).toContain("Bank");
  });

  it("gate 3: unresolved material conflict lowers confidence (hierarchy available for B06)", () => {
    // B06 will use isMaterialEvidenceConflict() to detect that an unresolved
    // L1 vs L5 conflict should cap confidence. This test proves the detection works.
    const manual = sourceEvidenceLevel("manual_owner_entry");
    const bankApi = sourceEvidenceLevel("bank_api");
    const isMaterial = isMaterialEvidenceConflict(manual, bankApi);
    expect(isMaterial).toBe(true);
    // B06 will then apply the confidence cap; this proves B04's detection is available.
  });
});

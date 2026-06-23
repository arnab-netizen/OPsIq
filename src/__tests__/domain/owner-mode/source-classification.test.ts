import { describe, it, expect } from "vitest";
import {
  SOURCE_CLASSIFICATIONS,
  SOURCE_CLASS_WEIGHT,
  sourceClassWeight,
  classifyFactSource,
  factSourceWeight,
  type SourceClassification,
} from "@/domain/owner-mode/source-classification";

describe("source-classification canon (Decision-OS §1.10)", () => {
  it("defines exactly the eight canonical classes", () => {
    expect([...SOURCE_CLASSIFICATIONS].sort()).toEqual(
      [
        "ASSUMPTION",
        "CALCULATED",
        "IMPORTED_FILE",
        "OPERATOR_REPORTED",
        "OWNER_REPORTED",
        "SYSTEM_INFERENCE",
        "UNKNOWN",
        "VERIFIED_RECORD",
      ].sort()
    );
  });

  it("weights every class in 0..1 with UNKNOWN at the floor and VERIFIED_RECORD at the ceiling", () => {
    for (const cls of SOURCE_CLASSIFICATIONS) {
      const w = sourceClassWeight(cls);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    expect(SOURCE_CLASS_WEIGHT.UNKNOWN).toBe(0);
    expect(SOURCE_CLASS_WEIGHT.VERIFIED_RECORD).toBe(1);
  });

  it("ranks OWNER_REPORTED, SYSTEM_INFERENCE, ASSUMPTION strictly below VERIFIED_RECORD and CALCULATED", () => {
    const floor = Math.min(
      SOURCE_CLASS_WEIGHT.VERIFIED_RECORD,
      SOURCE_CLASS_WEIGHT.CALCULATED
    );
    for (const weak of ["OWNER_REPORTED", "SYSTEM_INFERENCE", "ASSUMPTION"] as const) {
      expect(SOURCE_CLASS_WEIGHT[weak]).toBeLessThan(floor);
    }
  });

  describe("classifyFactSource", () => {
    it("maps authoritative confirmed records to VERIFIED_RECORD", () => {
      expect(
        classifyFactSource({ extractionMethod: "bank_statement", validationStatus: "owner_confirmed" })
      ).toBe("VERIFIED_RECORD");
      expect(
        classifyFactSource({ extractionMethod: "accounting_export" })
      ).toBe("VERIFIED_RECORD");
    });

    it("maps calculation to CALCULATED and file imports to IMPORTED_FILE", () => {
      expect(classifyFactSource({ extractionMethod: "calculation" })).toBe("CALCULATED");
      expect(classifyFactSource({ extractionMethod: "csv_import" })).toBe("IMPORTED_FILE");
      expect(classifyFactSource({ extractionMethod: "ocr" })).toBe("IMPORTED_FILE");
    });

    it("maps manual entry to OWNER_REPORTED and owner estimate to ASSUMPTION", () => {
      expect(classifyFactSource({ extractionMethod: "manual_entry" })).toBe("OWNER_REPORTED");
      expect(classifyFactSource({ extractionMethod: "owner_estimate" })).toBe("ASSUMPTION");
    });

    it("never optimistically defaults: missing or unrecognised signals collapse to UNKNOWN", () => {
      expect(classifyFactSource({})).toBe("UNKNOWN");
      expect(classifyFactSource({ sourceKind: "other" })).toBe("UNKNOWN");
    });

    it("a rejected validation status always yields UNKNOWN, overriding the capture method", () => {
      expect(
        classifyFactSource({ extractionMethod: "bank_statement", validationStatus: "rejected" })
      ).toBe("UNKNOWN");
    });

    it("system_validated corroborates an import/owner number up to VERIFIED_RECORD", () => {
      expect(
        classifyFactSource({ extractionMethod: "csv_import", validationStatus: "system_validated" })
      ).toBe("VERIFIED_RECORD");
      expect(
        classifyFactSource({ extractionMethod: "manual_entry", validationStatus: "system_validated" })
      ).toBe("VERIFIED_RECORD");
    });

    it("an unconfirmed authoritative record is softened to IMPORTED_FILE (not yet verified)", () => {
      expect(
        classifyFactSource({ extractionMethod: "bank_statement", validationStatus: "draft" })
      ).toBe("IMPORTED_FILE");
    });

    it("falls back to source-document lineage when extraction method is absent", () => {
      expect(classifyFactSource({ sourceKind: "bank_api" })).toBe("VERIFIED_RECORD");
      expect(classifyFactSource({ sourceKind: "manual_owner_entry" })).toBe("OWNER_REPORTED");
    });
  });

  it("factSourceWeight composes classification and weighting", () => {
    const w = factSourceWeight({ extractionMethod: "owner_estimate" });
    expect(w).toBe(SOURCE_CLASS_WEIGHT.ASSUMPTION);
    expect(factSourceWeight({})).toBe(0);
  });

  it("every classification produced is a known canonical class", () => {
    const produced: SourceClassification[] = [
      classifyFactSource({ extractionMethod: "bank_statement" }),
      classifyFactSource({ extractionMethod: "manual_entry" }),
      classifyFactSource({}),
    ];
    for (const cls of produced) {
      expect(SOURCE_CLASSIFICATIONS).toContain(cls);
    }
  });
});

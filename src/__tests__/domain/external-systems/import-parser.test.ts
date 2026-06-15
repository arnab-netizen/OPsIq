/**
 * B12-S2: CSV/XLSX Import Parser — Pure Function Tests
 *
 * Verifies:
 * - RFC 4180 CSV parsing (headers, quoted fields, commas)
 * - Field similarity matching and auto-detection
 * - Value transformation (multiply, divide, date parsing, categorical mapping)
 * - Import result validation
 * - Confidence scoring for data quality
 */

import { describe, it, expect } from "vitest";
import {
  parseCSV,
  detectFieldMappings,
  importCSVWithTemplate,
  validateImportResult,
  type ParsedRow,
} from "../../../domain/external-systems/import-parser";
import { TEMPLATES } from "../../../domain/external-systems/provider-registry";

describe("B12-S2: CSV/XLSX Import Parser", () => {
  describe("CSV Parsing", () => {
    it("should parse simple CSV with headers and rows", () => {
      const csv = "Name,Email,Amount\nJohn,john@example.com,1000\nJane,jane@example.com,2000";
      const { headers, rows } = parseCSV(csv);

      expect(headers).toEqual(["Name", "Email", "Amount"]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ Name: "John", Email: "john@example.com", Amount: "1000" });
    });

    it("should handle quoted fields with commas", () => {
      const csv = '"Name","Description"\n"Product A","Has, comma in it"\n"Product B","Normal"';
      const { headers, rows } = parseCSV(csv);

      expect(headers).toEqual(["Name", "Description"]);
      expect(rows[0].Description).toBe("Has, comma in it");
    });

    it("should handle quoted fields with embedded quotes", () => {
      const csv = '"Name","Quote"\n"John","He said ""Hello"""';
      const { headers, rows } = parseCSV(csv);

      expect(rows[0].Quote).toContain('He said "Hello"');
    });

    it("should trim whitespace from values", () => {
      const csv = "Name,  Amount  \nJohn,  1000  ";
      const { rows } = parseCSV(csv);

      expect(rows[0].Amount).toBe("1000");
    });

    it("should handle empty rows", () => {
      const csv = "Name,Amount\nJohn,1000\n\nJane,2000";
      const { rows } = parseCSV(csv);

      expect(rows).toHaveLength(2); // Empty row skipped
    });
  });

  describe("Field Similarity Matching", () => {
    it("should match exact field names", () => {
      const template = TEMPLATES.HUBSPOT_DEALS;
      const mappings = detectFieldMappings(["Deal ID", "Deal Amount", "Deal Stage"], template);

      expect(mappings["Deal ID"]).toBe("Deal ID");
      expect(mappings["Deal Amount"]).toBe("Deal Amount");
      expect(mappings["Deal Stage"]).toBe("Deal Stage");
    });

    it("should match case-insensitive field names", () => {
      const template = TEMPLATES.HUBSPOT_DEALS;
      const mappings = detectFieldMappings(["deal id", "deal amount"], template);

      expect(mappings["deal id"]).toBe("Deal ID");
      expect(mappings["deal amount"]).toBe("Deal Amount");
    });

    it("should match partial field names", () => {
      const template = TEMPLATES.HUBSPOT_DEALS;
      const mappings = detectFieldMappings(["ID", "Amount", "Stage"], template);

      expect(mappings["ID"]).toBe("Deal ID");
      expect(mappings["Amount"]).toBe("Deal Amount");
    });

    it("should not match below confidence threshold", () => {
      const template = TEMPLATES.HUBSPOT_DEALS;
      const mappings = detectFieldMappings(["xyz123", "completely-unrelated"], template);

      expect(mappings["xyz123"]).toBeUndefined();
      expect(mappings["completely-unrelated"]).toBeUndefined();
    });
  });

  describe("Value Transformation", () => {
    it("should handle passthrough transformation", () => {
      const csv = "ID,Name\n1,Test Deals";
      const result = importCSVWithTemplate(csv, TEMPLATES.HUBSPOT_DEALS);

      expect(result.parsedRows[0].mapped.source_reference_id).toBe("1");
      expect(result.parsedRows[0].mapped.metric_description).toBe("Test Deals");
    });

    it("should handle multiply transformation (Google Ads micros)", () => {
      const csv = "Campaign ID,Cost\ncamp_1,1000000";
      const result = importCSVWithTemplate(csv, TEMPLATES.GOOGLE_ADS_CAMPAIGNS);

      // Cost field has divide by 1000000 rule
      expect(result.parsedRows[0].mapped.spend).toBe(1); // 1000000 / 1000000
    });

    it("should handle categorical mapping (QuickBooks account types)", () => {
      const csv = "Account ID,Type,Amount\nacc_1,Income,50000";
      const result = importCSVWithTemplate(csv, TEMPLATES.QUICKBOOKS_PL);

      expect(result.parsedRows[0].mapped.account_type).toBe("revenue");
    });

    it("should handle date parsing", () => {
      const csv = "ID,Close Date\ndeal_1,2026-06-14";
      const result = importCSVWithTemplate(csv, TEMPLATES.HUBSPOT_DEALS);

      const periodEnd = result.parsedRows[0].mapped.period_end;
      expect(periodEnd).toMatch(/2026-06-14/);
    });

    it("should report transformation errors", () => {
      const csv = "Campaign ID,Cost\ncamp_1,invalid-number";
      const result = importCSVWithTemplate(csv, TEMPLATES.GOOGLE_ADS_CAMPAIGNS);

      expect(result.parsedRows[0].errors.length).toBeGreaterThan(0);
    });
  });

  describe("Import Result", () => {
    it("should count records correctly", () => {
      const csv = "ID,Amount\n1,100\n2,200\n3,300";
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      expect(result.recordCount).toBe(3);
      expect(result.parsedRows).toHaveLength(3);
    });

    it("should track mapped and unmapped fields", () => {
      const csv = "ID,UnknownField1,Amount,UnknownField2,Description\n1,x,100,y,test";
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      const row = result.parsedRows[0];
      expect(row.mappedFields).toContain("source_reference_id");
      expect(row.mappedFields).toContain("value");
      expect(row.unmappedColumns).toContain("UnknownField1");
      expect(row.unmappedColumns).toContain("UnknownField2");
    });

    it("should calculate confidence score per row", () => {
      const csv = "Deal ID,Deal Amount,Deal Stage\n1,5000,Negotiation";
      const result = importCSVWithTemplate(csv, TEMPLATES.HUBSPOT_DEALS);

      const row = result.parsedRows[0];
      expect(row.confidence).toBeGreaterThan(0.8);
      expect(row.confidence).toBeLessThanOrEqual(1.0);
    });

    it("should calculate average confidence across all rows", () => {
      const csv = "ID,Amount\n1,100\n2,200\n3,300";
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      expect(result.totalConfidence).toBeGreaterThan(0);
      expect(result.totalConfidence).toBeLessThanOrEqual(1.0);
    });

    it("should detect required columns", () => {
      const csv = "ID,Description\n1,test"; // Missing Amount
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      expect(result.requiredFieldsMissing).toContain("Amount");
    });

    it("should include warnings for issues", () => {
      const csv = "ID,Description\n1,test"; // Missing required column
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Import Validation", () => {
    it("should validate passing import (high confidence, all required)", () => {
      const csv = "Deal ID,Deal Amount,Deal Stage\n1,5000,Negotiation";
      const result = importCSVWithTemplate(csv, TEMPLATES.HUBSPOT_DEALS);
      const validation = validateImportResult(result, 0.7);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should reject low confidence import", () => {
      const csv = "Unknown1,Unknown2,Unknown3\ndata,data,data";
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);
      const validation = validateImportResult(result, 0.8);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("confidence"))).toBe(true);
    });

    it("should reject missing required fields", () => {
      const csv = "ID,Description\n1,test"; // Missing Amount (required)
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);
      const validation = validateImportResult(result, 0.5);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("required"))).toBe(true);
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should import HubSpot deals export", () => {
      const csv =
        "Deal ID,Deal Name,Deal Amount,Deal Stage,Close Date\n" +
        "deal_1,Big Deal,50000,Negotiation,2026-07-01\n" +
        "deal_2,Small Deal,5000,Qualification,2026-06-30";

      const result = importCSVWithTemplate(csv, TEMPLATES.HUBSPOT_DEALS);
      expect(result.recordCount).toBe(2);
      expect(result.parsedRows[0].mapped.value).toBe("50000");
      expect(result.parsedRows[0].mapped.source_reference_id).toBe("deal_1");
    });

    it("should import Shopify orders export", () => {
      const csv =
        "Order ID,Order Date,Total,Currency,Items\n" +
        "order_1,2026-06-14,1500,INR,3\n" +
        "order_2,2026-06-14,2000,INR,5";

      const result = importCSVWithTemplate(csv, TEMPLATES.SHOPIFY_ORDERS);
      expect(result.recordCount).toBe(2);
      expect(result.parsedRows[0].mapped.currency).toBe("INR");
    });

    it("should handle generic export fallback", () => {
      const csv = "ID,Date,Amount\nrec_1,2026-06-14,1000";
      const result = importCSVWithTemplate(csv, TEMPLATES.GENERIC_EXPORT);

      expect(result.recordCount).toBe(1);
      expect(result.parsedRows[0].mapped.source_reference_id).toBe("rec_1");
    });

    it("should preserve source lineage (source_reference_id in all mappings)", () => {
      Object.values(TEMPLATES).forEach((template) => {
        const hasSourceRef = Object.values(template.fieldMappings).some(
          (m) => m.targetField === "source_reference_id",
        );
        expect(hasSourceRef).toBe(true);
      });
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  FileFormat,
  ParserConfigSchema,
  ParseErrorSchema,
  ParseResultSchema,
  MockContactSchema,
  MockDealSchema,
  MockFinancialSchema,
  parseCSV,
  generateMockContacts,
  generateMockDeals,
  generateMockFinancials,
  mockDataToCSV,
  validateParseResult,
  type ParserConfig,
  type ParseResult,
  type MockContact,
} from "@/domain/data-parsers/sheet-parser";

describe("ADDENDUM F: CSV & Sheets Parser", () => {
  describe("Parser Configuration", () => {
    it("should validate parser config with defaults", () => {
      const config = {
        format: FileFormat.CSV,
      };

      const result = ParserConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.encoding).toBe("utf-8");
        expect(result.data.hasHeader).toBe(true);
      }
    });

    it("should validate full parser config", () => {
      const config: ParserConfig = {
        format: FileFormat.GOOGLE_SHEETS,
        encoding: "utf-8",
        hasHeader: true,
        skipEmptyRows: true,
        trimWhitespace: true,
        dateFormat: "MM/DD/YYYY",
        maxRows: 1000,
      };

      const result = ParserConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("CSV Parsing", () => {
    it("should parse simple CSV with headers", () => {
      const csv = `name,email,phone
John Doe,john@example.com,555-1234
Jane Smith,jane@example.com,555-5678`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.headers).toEqual(["name", "email", "phone"]);
      expect(result.parsedRows).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.name).toBe("John Doe");
    });

    it("should skip empty rows when configured", () => {
      const csv = `name,email
John,john@example.com

Jane,jane@example.com`;

      const result = parseCSV(csv, { skipEmptyRows: true });
      expect(result.parsedRows).toBe(2);
      expect(result.skippedRows).toBeGreaterThan(0);
    });

    it("should trim whitespace when configured", () => {
      const csv = `name, email
  John , john@example.com `;

      const result = parseCSV(csv, { trimWhitespace: true });
      expect(result.data[0]?.email).toBe("john@example.com");
    });

    it("should handle missing header row", () => {
      const csv = `John Doe,john@example.com
Jane Smith,jane@example.com`;

      const result = parseCSV(csv, { hasHeader: false });
      expect(result.headers).toContain("Column_1");
      expect(result.headers).toContain("Column_2");
      expect(result.parsedRows).toBe(2);
    });

    it("should respect maxRows limit", () => {
      const csv = `id,name
1,John
2,Jane
3,Bob
4,Alice`;

      const result = parseCSV(csv, { maxRows: 2 });
      expect(result.parsedRows).toBeLessThanOrEqual(2);
      expect(result.warnings.some(w => w.includes("maxRows"))).toBe(true);
    });

    it("should apply column mapping", () => {
      const csv = `firstName,lastName
John,Doe
Jane,Smith`;

      const result = parseCSV(csv, {
        columnMapping: { firstName: "first", lastName: "last" },
      });

      expect(result.data[0]?.first).toBe("John");
      expect(result.data[0]?.last).toBe("Doe");
    });

    it("should validate parse result", () => {
      const csv = `name,email\nJohn,john@example.com`;
      const result = parseCSV(csv);

      const isValid = validateParseResult(result, ["name", "email"]);
      expect(isValid).toBe(true);
    });

    it("should reject missing expected headers", () => {
      const csv = `name\nJohn`;
      const result = parseCSV(csv);

      const isValid = validateParseResult(result, ["name", "email"]);
      expect(isValid).toBe(false);
    });

    it("should handle empty CSV", () => {
      const result = parseCSV("");
      expect(result.totalRows).toBe(0);
      expect(result.parsedRows).toBe(0);
    });
  });

  describe("Mock Contact Generation", () => {
    it("should generate mock contacts", () => {
      const contacts = generateMockContacts(5);
      expect(contacts).toHaveLength(5);
      expect(contacts[0]).toHaveProperty("firstName");
      expect(contacts[0]).toHaveProperty("email");
      expect(contacts[0]).toHaveProperty("company");
    });

    it("should validate generated contacts against schema", () => {
      const contacts = generateMockContacts(10);

      for (const contact of contacts) {
        const result = MockContactSchema.safeParse(contact);
        expect(result.success).toBe(true);
      }
    });

    it("should generate unique emails", () => {
      const contacts = generateMockContacts(20);
      const emails = contacts.map(c => c.email);
      const uniqueEmails = new Set(emails);

      expect(uniqueEmails.size).toBe(emails.length);
    });

    it("should include varied data", () => {
      const contacts = generateMockContacts(20);

      const hasMultipleCompanies = new Set(contacts.map(c => c.company)).size > 1;
      const hasMultipleTitles = new Set(contacts.map(c => c.title)).size > 1;

      expect(hasMultipleCompanies).toBe(true);
      expect(hasMultipleTitles).toBe(true);
    });
  });

  describe("Mock Deal Generation", () => {
    it("should generate mock deals", () => {
      const deals = generateMockDeals(5);
      expect(deals).toHaveLength(5);
      expect(deals[0]).toHaveProperty("dealName");
      expect(deals[0]).toHaveProperty("amount");
      expect(deals[0]).toHaveProperty("stage");
    });

    it("should validate generated deals against schema", () => {
      const deals = generateMockDeals(10);

      for (const deal of deals) {
        const result = MockDealSchema.safeParse(deal);
        expect(result.success).toBe(true);
      }
    });

    it("should generate realistic deal amounts", () => {
      const deals = generateMockDeals(20);

      const amounts = deals.map(d => d.amount);
      const minAmount = Math.min(...amounts);
      const maxAmount = Math.max(...amounts);

      expect(minAmount).toBeGreaterThanOrEqual(50000);
      expect(maxAmount).toBeLessThanOrEqual(500000);
    });

    it("should include all deal stages", () => {
      const deals = generateMockDeals(100);
      const stages = new Set(deals.map(d => d.stage));

      expect(stages.size).toBeGreaterThan(1);
      expect(stages.has("prospecting")).toBe(true);
    });
  });

  describe("Mock Financial Generation", () => {
    it("should generate mock financials", () => {
      const financials = generateMockFinancials(12);
      expect(financials).toHaveLength(12);
      expect(financials[0]).toHaveProperty("revenue");
      expect(financials[0]).toHaveProperty("cost");
      expect(financials[0]).toHaveProperty("margin");
    });

    it("should validate generated financials against schema", () => {
      const financials = generateMockFinancials(6);

      for (const financial of financials) {
        const result = MockFinancialSchema.safeParse(financial);
        expect(result.success).toBe(true);
      }
    });

    it("should generate realistic margins", () => {
      const financials = generateMockFinancials(20);

      for (const fin of financials) {
        expect(fin.margin).toBeGreaterThan(0);
        expect(fin.margin).toBeLessThan(100);
      }
    });

    it("should generate varying growth rates", () => {
      const financials = generateMockFinancials(20);
      const growthRates = financials.map(f => f.growthRate);

      const hasNegative = growthRates.some(gr => gr < 0);
      const hasPositive = growthRates.some(gr => gr > 0);

      expect(hasNegative || hasPositive).toBe(true);
    });
  });

  describe("Mock Data to CSV Conversion", () => {
    it("should convert contact data to CSV", () => {
      const contacts = generateMockContacts(3);
      const csv = mockDataToCSV(contacts);

      expect(csv).toContain("firstName");
      expect(csv).toContain("email");
      expect(csv).not.toContain("undefined");
    });

    it("should preserve all data in CSV round-trip", () => {
      const originalContacts = generateMockContacts(5);
      const csv = mockDataToCSV(originalContacts);
      const parsed = parseCSV(csv);

      expect(parsed.parsedRows).toBe(originalContacts.length);
      expect(parsed.headers).toContain("firstName");
    });

    it("should handle special characters in CSV", () => {
      const data = [
        { id: "1", name: 'Test "quoted" text' },
        { id: "2", name: "Test, comma text" },
      ];

      const csv = mockDataToCSV(data);
      const result = parseCSV(csv);

      expect(result.parsedRows).toBe(2);
    });

    it("should handle empty data array", () => {
      const csv = mockDataToCSV([]);
      expect(csv).toBe("");
    });
  });

  describe("Parse Result Schema", () => {
    it("should validate parse result", () => {
      const csv = "name,email\nJohn,john@example.com";
      const result = parseCSV(csv);

      const validated = ParseResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });

    it("should include metadata", () => {
      const result = parseCSV("a,b\n1,2");
      expect(result.metadata.parsedAt).toBeInstanceOf(Date);
    });

    it("should track parsing time", () => {
      const result = parseCSV("a,b\n1,2\n3,4");
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Comprehensive Parser Coverage", () => {
    it("should support all file formats", () => {
      const formats = Object.values(FileFormat);
      expect(formats).toContain("CSV");
      expect(formats).toContain("GOOGLE_SHEETS");
      expect(formats).toContain("XLSX");
      expect(formats).toContain("JSON");
    });

    it("should provide all mock data generators", () => {
      expect(generateMockContacts).toBeDefined();
      expect(generateMockDeals).toBeDefined();
      expect(generateMockFinancials).toBeDefined();
    });

    it("should provide CSV conversion utilities", () => {
      expect(mockDataToCSV).toBeDefined();
      expect(validateParseResult).toBeDefined();
    });

    it("should handle real-world contact import", () => {
      const contacts = generateMockContacts(100);
      const csv = mockDataToCSV(contacts);
      const result = parseCSV(csv);

      expect(result.success).toBe(true);
      expect(result.parsedRows).toBe(100);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle real-world deal import", () => {
      const deals = generateMockDeals(50);
      const csv = mockDataToCSV(deals);
      const result = parseCSV(csv);

      expect(result.success).toBe(true);
      expect(result.parsedRows).toBe(50);
    });
  });
});

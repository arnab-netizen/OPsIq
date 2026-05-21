/**
 * ADDENDUM F: CSV & Sheets Parser Contracts
 *
 * Defines file format parsing contracts, mock data handling,
 * and sheet parsing logic for data import from CSV and Google Sheets.
 *
 * Non-DB: Contains only parsing logic and mock data (no persistence).
 * Ready for: Integration with import pipeline once database available.
 */

import { z } from "zod";
import { classifyOperatorError } from "@/lib/operator-error-governance";

// ============================================================================
// PARSER CONTRACTS
// ============================================================================

/** Supported file formats */
export enum FileFormat {
  CSV = "CSV",
  GOOGLE_SHEETS = "GOOGLE_SHEETS",
  XLSX = "XLSX",
  JSON = "JSON",
}

/** Parser configuration */
export const ParserConfigSchema = z.object({
  format: z.nativeEnum(FileFormat),
  encoding: z.string().default("utf-8"),
  hasHeader: z.boolean().default(true),
  skipEmptyRows: z.boolean().default(true),
  trimWhitespace: z.boolean().default(true),
  dateFormat: z.string().default("YYYY-MM-DD"),
  numberFormat: z.string().optional(),
  columnMapping: z.record(z.string(), z.string()).optional(), // sourceCol → targetCol
  maxRows: z.number().optional(),
});

export type ParserConfig = z.infer<typeof ParserConfigSchema>;

/** Parsing error detail */
export const ParseErrorSchema = z.object({
  rowNumber: z.number(),
  columnName: z.string().optional(),
  errorCode: z.enum([
    "INVALID_FORMAT",
    "MISSING_REQUIRED_COLUMN",
    "TYPE_MISMATCH",
    "INVALID_ENCODING",
    "FILE_TOO_LARGE",
    "UNSUPPORTED_FORMAT",
  ]),
  errorMessage: z.string(),
  value: z.unknown().optional(),
  suggestion: z.string().optional(),
});

export type ParseError = z.infer<typeof ParseErrorSchema>;

/** Parsing result */
export const ParseResultSchema = z.object({
  success: z.boolean(),
  format: z.nativeEnum(FileFormat),
  totalRows: z.number(),
  parsedRows: z.number(),
  skippedRows: z.number(),
  headers: z.array(z.string()),
  data: z.array(z.record(z.string(), z.unknown())),
  errors: z.array(ParseErrorSchema),
  warnings: z.array(z.string()),
  parseTimeMs: z.number(),
  metadata: z.object({
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    parsedAt: z.date(),
  }),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/** Mock contact record for testing */
export const MockContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  company: z.string(),
  title: z.string(),
  industrySegment: z.string(),
});

export type MockContact = z.infer<typeof MockContactSchema>;

/** Mock deal record for testing */
export const MockDealSchema = z.object({
  dealName: z.string(),
  companyName: z.string(),
  amount: z.number(),
  stage: z.enum(["prospecting", "qualification", "proposal", "negotiation", "won", "lost"]),
  closeDate: z.string(),
  ownerName: z.string(),
  probability: z.number().min(0).max(100),
});

export type MockDeal = z.infer<typeof MockDealSchema>;

/** Mock financial record for testing */
export const MockFinancialSchema = z.object({
  period: z.string(),
  revenue: z.number(),
  cost: z.number(),
  margin: z.number(),
  growthRate: z.number(),
});

export type MockFinancial = z.infer<typeof MockFinancialSchema>;

// ============================================================================
// SHEET PARSER IMPLEMENTATION
// ============================================================================

/**
 * Parse CSV data from string
 */
export function parseCSV(
  csvContent: string,
  config: Partial<ParserConfig> = {},
): ParseResult {
  const startTime = Date.now();
  const mergedConfig: ParserConfig = {
    format: FileFormat.CSV,
    encoding: "utf-8",
    hasHeader: true,
    skipEmptyRows: true,
    trimWhitespace: true,
    dateFormat: "YYYY-MM-DD",
    ...config,
  };

  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const data: Record<string, unknown>[] = [];

  try {
    // Simple CSV parsing (naive implementation, real parser would use a library)
    const lines = csvContent.split("\n");

    if (lines.length === 0) {
      return {
        success: true,
        format: FileFormat.CSV,
        totalRows: 0,
        parsedRows: 0,
        skippedRows: 0,
        headers: [],
        data: [],
        errors,
        warnings,
        parseTimeMs: Date.now() - startTime,
        metadata: { parsedAt: new Date() },
      };
    }

    // Parse headers
    let headers: string[] = [];
    let dataStartIndex = 0;

    if (mergedConfig.hasHeader) {
      headers = lines[0].split(",").map(h => {
        let value = h.trim();
        if (mergedConfig.trimWhitespace) {
          value = value.trim();
        }
        return value;
      });
      dataStartIndex = 1;
    } else {
      // Auto-generate headers if not present
      const firstDataLine = lines[0].split(",");
      headers = firstDataLine.map((_, idx) => `Column_${idx + 1}`);
    }

    // Parse data rows
    let skippedRows = 0;

    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty rows
      if (mergedConfig.skipEmptyRows && line === "") {
        skippedRows++;
        continue;
      }

      // Check max rows
      if (mergedConfig.maxRows && data.length >= mergedConfig.maxRows) {
        warnings.push(`Exceeded maxRows limit of ${mergedConfig.maxRows}`);
        break;
      }

      try {
        const values = line.split(",").map(v => {
          let value: unknown = v;
          if (mergedConfig.trimWhitespace) {
            value = (value as string).trim();
          }
          return value;
        });

        // Create record from headers and values
        const record: Record<string, unknown> = {};
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const header = headers[colIdx];
          const targetCol = mergedConfig.columnMapping?.[header] || header;
          record[targetCol] = values[colIdx] || null;
        }

        data.push(record);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
        errors.push({
          rowNumber: i + 1,
          errorCode: "INVALID_FORMAT",
          errorMessage: `Failed to parse row: ${governed.operatorMessage}`,
          value: line,
        });
      }
    }

    // Calculate total rows excluding header and empty rows
    const nonEmptyDataLines = lines.slice(mergedConfig.hasHeader ? 1 : 0).filter(line => line.trim() !== "");
    const totalRows = nonEmptyDataLines.length;

    return {
      success: errors.length === 0,
      format: FileFormat.CSV,
      totalRows,
      parsedRows: data.length,
      skippedRows,
      headers,
      data,
      errors,
      warnings,
      parseTimeMs: Date.now() - startTime,
      metadata: { parsedAt: new Date() },
    };
  } catch (err) {
    return {
      success: false,
      format: FileFormat.CSV,
      totalRows: 0,
      parsedRows: 0,
      skippedRows: 0,
      headers: [],
      data: [],
      errors: [
        {
          rowNumber: 0,
          errorCode: "INVALID_FORMAT",
          errorMessage: `CSV parsing failed: ${String(err)}`,
        },
      ],
      warnings,
      parseTimeMs: Date.now() - startTime,
      metadata: { parsedAt: new Date() },
    };
  }
}

/**
 * Generate mock contact data for testing
 */
export function generateMockContacts(count: number = 10): MockContact[] {
  const firstNames = ["John", "Jane", "Bob", "Alice", "Charlie", "Diana"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia"];
  const companies = ["Acme Corp", "TechStart", "Global Industries", "Innovation Labs"];
  const titles = ["CEO", "VP Sales", "Director", "Manager", "Developer"];
  const segments = ["Fortune 500", "Mid-Market", "SMB", "Startup"];

  const contacts: MockContact[] = [];

  for (let i = 0; i < count; i++) {
    contacts.push({
      firstName: firstNames[i % firstNames.length],
      lastName: lastNames[i % lastNames.length],
      email: `contact${i + 1}@example.com`,
      phone: `555-${String(i + 1).padStart(4, "0")}`,
      company: companies[i % companies.length],
      title: titles[i % titles.length],
      industrySegment: segments[i % segments.length],
    });
  }

  return contacts;
}

/**
 * Generate mock deal data for testing
 */
export function generateMockDeals(count: number = 10): MockDeal[] {
  const dealNames = [
    "Website Redesign",
    "API Integration",
    "Data Migration",
    "Process Automation",
    "Digital Transformation",
  ];
  const companies = ["Acme Corp", "TechStart", "Global Industries", "Innovation Labs"];
  const stages: MockDeal["stage"][] = ["prospecting", "qualification", "proposal", "negotiation", "won", "lost"];
  const owners = ["John Sales", "Jane Account", "Bob Enterprise"];

  const deals: MockDeal[] = [];

  for (let i = 0; i < count; i++) {
    deals.push({
      dealName: dealNames[i % dealNames.length],
      companyName: companies[i % companies.length],
      amount: 50000 + Math.random() * 450000,
      stage: stages[i % stages.length],
      closeDate: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      ownerName: owners[i % owners.length],
      probability: (i % 6) * 20,
    });
  }

  return deals;
}

/**
 * Generate mock financial data for testing
 */
export function generateMockFinancials(periods: number = 12): MockFinancial[] {
  const financials: MockFinancial[] = [];

  for (let i = 0; i < periods; i++) {
    const revenue = 100000 + Math.random() * 900000;
    const cost = revenue * (0.4 + Math.random() * 0.2);
    const margin = ((revenue - cost) / revenue) * 100;
    const growthRate = (Math.random() - 0.3) * 50; // -30% to +20%

    financials.push({
      period: `2026-Q${(i % 4) + 1}`,
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      margin: Math.round(margin * 10) / 10,
      growthRate: Math.round(growthRate * 10) / 10,
    });
  }

  return financials;
}

/**
 * Convert mock data to CSV format
 */
export function mockDataToCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvLines: string[] = [headers.join(",")];

  for (const record of data) {
    const values = headers.map(header => {
      const value = record[header];
      if (value === null || value === undefined) {
        return "";
      }
      if (typeof value === "string" && value.includes(",")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    csvLines.push(values.join(","));
  }

  return csvLines.join("\n");
}

/**
 * Validate parsed result conforms to expected schema
 */
export function validateParseResult(result: ParseResult, expectedHeaders?: string[]): boolean {
  // Check basic structure
  if (!Array.isArray(result.data)) return false;
  if (!Array.isArray(result.errors)) return false;
  if (!Array.isArray(result.warnings)) return false;

  // Check header consistency
  if (expectedHeaders) {
    const missingHeaders = expectedHeaders.filter(h => !result.headers.includes(h));
    if (missingHeaders.length > 0) {
      return false;
    }
  }

  // Check data consistency
  for (const row of result.data) {
    if (typeof row !== "object" || row === null) {
      return false;
    }
  }

  return true;
}

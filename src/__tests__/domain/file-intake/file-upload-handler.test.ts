/**
 * B02-S1 File Upload Handler Tests
 *
 * Tests the complete file upload pipeline:
 * - File validation (type, size, MIME)
 * - CSV parsing with RFC 4180 compliance
 * - Formula injection detection and safe storage
 * - Malformed file handling (fail-closed)
 * - Source document metadata creation
 */

import { describe, it, expect } from "vitest";
import {
  processFileUpload,
  validateFileOnly,
  validateFileUpload,
  parseCSV,
  detectFileFormat,
} from "@/domain/file-intake";
import { FileFormat } from "@/domain/file-intake/types";

// ============================================================================
// File Validation Tests
// ============================================================================

describe("File Validation", () => {
  it("accepts valid CSV files", () => {
    const result = validateFileUpload("data.csv", 1024, "text/csv");
    expect(result.ok).toBe(true);
    expect(result.format).toBe(FileFormat.CSV);
  });

  it("accepts XLSX files", () => {
    const result = validateFileUpload("data.xlsx", 2048, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.ok).toBe(true);
    expect(result.format).toBe(FileFormat.XLSX);
  });

  it("rejects unsupported extensions", () => {
    const result = validateFileUpload("data.txt", 1024, "text/plain");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "UNSUPPORTED_EXTENSION",
      })
    );
  });

  it("rejects files that exceed size limit", () => {
    const result = validateFileUpload("data.csv", 100 * 1024 * 1024, "text/csv");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "FILE_TOO_LARGE",
      })
    );
  });

  it("rejects empty files", () => {
    const result = validateFileUpload("data.csv", 0, "text/csv");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "FILE_EMPTY",
      })
    );
  });

  it("detects file format from extension", () => {
    expect(detectFileFormat("data.csv")).toBe(FileFormat.CSV);
    expect(detectFileFormat("data.xlsx")).toBe(FileFormat.XLSX);
    expect(detectFileFormat("data.xls")).toBe(FileFormat.XLSX);
  });

  it("detects file format from MIME type", () => {
    expect(detectFileFormat("unknown", "text/csv")).toBe(FileFormat.CSV);
    expect(detectFileFormat("unknown", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(FileFormat.XLSX);
  });
});

// ============================================================================
// CSV Parsing Tests
// ============================================================================

describe("CSV Parsing", () => {
  it("parses simple CSV with headers and data", () => {
    const csv = "name,age,city\nAlice,30,NYC\nBob,25,LA";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.headers).toEqual(["name", "age", "city"]);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([
      { name: "Alice", age: "30", city: "NYC" },
      { name: "Bob", age: "25", city: "LA" },
    ]);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'name,address\nAlice,"123 Main St, Apt 5"';
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rows?.[0]?.address).toBe("123 Main St, Apt 5");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = 'name,quote\nAlice,"She said ""hello"""';
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rows?.[0]?.quote).toBe('She said "hello"');
  });

  it("handles CRLF line endings", () => {
    const csv = "name,age\r\nAlice,30\r\nBob,25";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(2);
  });

  it("trims whitespace from fields", () => {
    const csv = "name , age\n Alice , 30";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows?.[0]?.name).toBe("Alice");
  });

  it("rejects empty CSV", () => {
    const result = parseCSV("");
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "EMPTY_FILE",
      })
    );
  });

  it("fails closed on unclosed quotes (malformed CSV)", () => {
    const csv = 'name,address\nAlice,"123 Main St';
    const result = parseCSV(csv);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "ROW_PARSE_ERROR",
      })
    );
  });

  it("fails closed on column count mismatch", () => {
    const csv = "name,age,city\nAlice,30"; // Missing city
    const result = parseCSV(csv);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "HEADER_MISMATCH",
      })
    );
  });

  it("respects maxRows limit", () => {
    let csv = "name,age\n";
    for (let i = 0; i < 100001; i++) {
      csv += `Person${i},${i}\n`;
    }

    const result = parseCSV(csv, { maxRows: 100000 } as any);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "INVALID_CSV_FORMAT",
      })
    );
  });
});

// ============================================================================
// Formula Injection Detection Tests
// ============================================================================

describe("Formula Injection Detection", () => {
  it("detects Excel formula cells (=)", () => {
    const csv = "name,formula\nAlice,=1+1";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.formulaInjectionDetected).toBeDefined();
    expect(result.formulaInjectionDetected?.[0]).toMatchObject({
      rowNumber: 2,
      columnName: "formula",
      value: "=1+1",
    });
  });

  it("detects macro cells (@)", () => {
    const csv = "name,macro\nAlice,@SUM(A1:A10)";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.formulaInjectionDetected).toBeDefined();
  });

  it("stores formula cells safely (escaped for display)", () => {
    const csv = "name,formula\nAlice,=2+2";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    const alert = result.formulaInjectionDetected?.[0];
    expect(alert?.safe_display_value).toContain("=");
    // Should not be executed (escaping is for display, real safety is no-execution)
  });

  it("ignores formulas in quoted fields (safe)", () => {
    const csv = 'name,note\nAlice,"Use formula =SUM() to add"';
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    // Formula in quoted field is safe (not a formula, just text)
    expect(result.formulaInjectionDetected?.length || 0).toBe(0);
  });

  it("allows normal values starting with numbers", () => {
    const csv = "name,value\nAlice,+123\nBob,-456";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    // +/- only flagged if followed by parenthesis (formula-like)
    expect(result.formulaInjectionDetected?.length || 0).toBe(0);
  });

  it("detects command injection patterns (pipe, semicolon)", () => {
    const csv = "name,cmd\nAlice,|cat /etc/passwd";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.formulaInjectionDetected).toBeDefined();
  });
});

// ============================================================================
// Full File Upload Processing Tests
// ============================================================================

describe("File Upload Processing", () => {
  it("processes valid CSV file end-to-end", () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = processFileUpload("data.csv", csv, "text/csv");

    expect(result.ok).toBe(true);
    expect(result.source_document).toBeDefined();
    expect(result.source_document?.filename).toBe("data.csv");
    expect(result.source_document?.file_format).toBe(FileFormat.CSV);
    expect(result.parsed_data?.rows).toHaveLength(2);
  });

  it("generates unique source_document_id", () => {
    const csv = "name\nAlice";
    const result1 = processFileUpload("a.csv", csv, "text/csv");
    const result2 = processFileUpload("a.csv", csv, "text/csv");

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result1.source_document?.source_document_id).not.toBe(
      result2.source_document?.source_document_id
    );
  });

  it("records source document metadata", () => {
    const csv = "name\nAlice";
    const result = processFileUpload("data.csv", csv, "text/csv");

    expect(result.ok).toBe(true);
    expect(result.source_document).toMatchObject({
      filename: "data.csv",
      file_format: FileFormat.CSV,
      has_headers: true,
      encoding: "utf-8",
    });
    expect(result.source_document?.uploaded_at).toBeDefined();
  });

  it("warns about formula injection but includes data", () => {
    const csv = "name,formula\nAlice,=1+1";
    const result = processFileUpload("data.csv", csv, "text/csv");

    expect(result.ok).toBe(true);
    expect(result.parsed_data?.rows).toHaveLength(1);
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.[0]?.code).toBe("FORMULA_INJECTION_DETECTED");
  });

  it("fails closed on validation error", () => {
    const result = processFileUpload("data.txt", "content", "text/plain");
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("fails closed on CSV parsing error", () => {
    const badCsv = 'name,address\nAlice,"unclosed quote';
    const result = processFileUpload("data.csv", badCsv, "text/csv");

    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("handles large files within limit", () => {
    let csv = "name,value\n";
    for (let i = 0; i < 1000; i++) {
      csv += `Name${i},${i}\n`;
    }

    const result = processFileUpload("large.csv", csv, "text/csv");
    expect(result.ok).toBe(true);
    expect(result.parsed_data?.row_count).toBe(1000);
  });

  it("rejects files exceeding max rows", () => {
    let csv = "name\n";
    for (let i = 0; i < 100001; i++) {
      csv += `Name${i}\n`;
    }

    const result = processFileUpload("huge.csv", csv, "text/csv");
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// Edge Cases & Security Tests
// ============================================================================

describe("Edge Cases & Security", () => {
  it("handles Unicode characters safely", () => {
    const csv = "name,note\nAlice,こんにちは🌍";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rows?.[0]?.note).toContain("こんにちは");
  });

  it("handles empty cells", () => {
    const csv = "name,age,city\nAlice,30,\nBob,,LA";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rows?.[0]?.city).toBe("");
    expect(result.rows?.[1]?.age).toBe("");
  });

  it("handles cells with only whitespace", () => {
    const csv = "name,age\nAlice,   \nBob,25";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    expect(result.rows?.[0]?.age).toBe("");
  });

  it("does not allow XLSX without proper library", () => {
    const result = processFileUpload("data.xlsx", Buffer.from("fake xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("FORMAT_NOT_YET_SUPPORTED");
  });

  it("handles null and undefined gracefully", () => {
    const result1 = parseCSV("");
    expect(result1.ok).toBe(false);

    const result2 = validateFileOnly("", 0);
    expect(result2.ok).toBe(false);
  });

  it("blocks formula-like unary operators in formula context", () => {
    const csv = "name,formula\nAlice,+(1+1)";
    const result = parseCSV(csv);

    expect(result.ok).toBe(true);
    // Should detect +(1+1) as formula-like
    expect(result.formulaInjectionDetected?.length || 0).toBeGreaterThan(0);
  });
});

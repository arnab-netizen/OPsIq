/**
 * B02 CSV Parser — Safe CSV parsing with formula injection detection.
 *
 * Implements RFC 4180 CSV parsing (quoted fields, escaped quotes).
 * Detects formula injection patterns (§37.15).
 * Stores detected formulas safely (escaped for display).
 *
 * No I/O, no DB, no side effects.
 */

import { CSVParseResult, FileUploadConfig } from "./types";

const DEFAULT_CONFIG: FileUploadConfig = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxRows: 100000,
  allowedMimeTypes: ["text/csv", "text/plain"],
  allowedExtensions: [".csv"],
  detectFormulaInjection: true,
};

// ============================================================================
// Formula Injection Detection
// ============================================================================

/** Patterns that indicate formula injection attempts */
const FORMULA_INJECTION_PATTERNS = [
  /^=/,      // Excel formula
  /^@/,      // Excel macro
  /^\+/,     // Unary plus (can be formula in some contexts)
  /^-/,      // Unary minus (can be formula in some contexts)
  /^\|/,     // Pipe (command separator in some apps)
  /^;/,      // Semicolon (command separator in some apps)
];

/**
 * Detect if a cell value looks like a formula injection attempt.
 * Returns code indicating the injection type, or undefined if safe.
 */
function detectFormulaInjection(
  value: string | null | undefined
): "FORMULA_PREFIX" | "COMMAND_PREFIX" | "SHELL_ESCAPE" | undefined {
  if (!value || typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const trimmed = value.trim();

  // Excel formula injection (= @ + -)
  if (/^[=@+-]/.test(trimmed)) {
    if (/^=/.test(trimmed)) return "FORMULA_PREFIX";
    if (/^@/.test(trimmed)) return "FORMULA_PREFIX";
    if (/^[+-]/.test(trimmed)) {
      // Only consider +/- as injection if followed by formula-like pattern
      if (/^[+-]\s*\(/.test(trimmed)) return "FORMULA_PREFIX";
    }
  }

  // Shell command injection (| ; `)
  if (/^[|;`]/.test(trimmed)) {
    return "COMMAND_PREFIX";
  }

  return undefined;
}

/**
 * Escape a cell value for safe display (HTML-safe, but not a security fix).
 * Formula cells should not be executed regardless; this is for display only.
 */
function escapeForDisplay(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================
// RFC 4180 CSV Parsing
// ============================================================================

/**
 * Parse CSV text into rows of records.
 * Handles quoted fields, escaped quotes, CRLF/LF line endings.
 * Fails closed on malformed CSV (invalid quote nesting, unmatched quotes).
 *
 * Returns ok: true with parsed rows, or ok: false with errors.
 */
export function parseCSV(
  csvText: string,
  config: FileUploadConfig = DEFAULT_CONFIG
): CSVParseResult {
  const errors: Array<{ code: "EMPTY_FILE" | "INVALID_CSV_FORMAT" | "MISSING_HEADERS" | "HEADER_MISMATCH" | "ROW_PARSE_ERROR" | "MALFORMED_QUOTES" | "ENCODING_ERROR"; message: string; rowNumber?: number }> = [];

  if (!csvText || csvText.trim().length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: "EMPTY_FILE",
          message: "CSV file is empty",
        },
      ],
    };
  }

  // Normalize line endings
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.length > 0); // Skip empty lines

  if (lines.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: "EMPTY_FILE",
          message: "CSV file contains no data",
        },
      ],
    };
  }

  // Parse header row
  const headerRow = parseCSVLine(lines[0]);
  if (!headerRow) {
    return {
      ok: false,
      errors: [
        {
          code: "MISSING_HEADERS",
          message: "Could not parse header row",
        },
      ],
    };
  }

  const headers = headerRow;
  const rows: Record<string, string>[] = [];
  const formulaInjectionDetected: Array<{
    rowNumber: number;
    columnName: string;
    value: string;
    safe_display_value: string;
  }> = [];

  // Parse data rows
  for (let i = 1; i < lines.length && rows.length < config.maxRows; i++) {
    const parsedLine = parseCSVLine(lines[i]);

    if (!parsedLine) {
      errors.push({
        code: "ROW_PARSE_ERROR",
        message: `Row ${i + 1} could not be parsed (malformed CSV)`,
        rowNumber: i + 1,
      });
      // Fail closed: stop parsing on first malformed row
      return {
        ok: false,
        errors,
      };
    }

    // Handle column mismatch
    if (parsedLine.length !== headers.length) {
      errors.push({
        code: "HEADER_MISMATCH",
        message: `Row ${i + 1} has ${parsedLine.length} columns, expected ${headers.length}`,
        rowNumber: i + 1,
      });
      // Fail closed: stop parsing on column mismatch
      return {
        ok: false,
        errors,
      };
    }

    // Build record and detect formula injection
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const value = parsedLine[j];
      record[headers[j]] = value;

      // Detect formula injection
      if (config.detectFormulaInjection) {
        const injectionType = detectFormulaInjection(value);
        if (injectionType) {
          formulaInjectionDetected.push({
            rowNumber: i + 1,
            columnName: headers[j],
            value,
            safe_display_value: escapeForDisplay(value),
          });
        }
      }
    }

    rows.push(record);
  }

  // Check if file exceeded max rows
  if (lines.length - 1 > config.maxRows) {
    errors.push({
      code: "INVALID_CSV_FORMAT",
      message: `CSV exceeds maximum row limit (${config.maxRows})`,
    });
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    rows,
    headers,
    rowCount: rows.length,
    formulaInjectionDetected: formulaInjectionDetected.length > 0 ? formulaInjectionDetected : undefined,
  };
}

/**
 * Parse a single CSV line (RFC 4180).
 * Handles quoted fields, escaped quotes, and whitespace.
 *
 * Returns array of fields, or undefined if parsing fails.
 */
function parseCSVLine(line: string): string[] | undefined {
  if (!line || line.trim().length === 0) {
    return [];
  }

  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      fields.push(current.trim());
      current = "";
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Check for unclosed quotes (malformed CSV)
  if (inQuotes) {
    return undefined; // Fail closed on malformed CSV
  }

  // Add final field
  fields.push(current.trim());

  return fields;
}

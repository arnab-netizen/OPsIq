/**
 * B02 File Upload Handler — Orchestrates file validation and parsing.
 *
 * Pure function that:
 * 1. Validates file (type, size, MIME)
 * 2. Parses CSV/XLSX safely
 * 3. Detects formula injection
 * 4. Returns parsed data + source document metadata
 * 5. Fails closed on any validation error
 *
 * No I/O, no DB, no side effects.
 */

import { v4 as uuidv4 } from "uuid";
import { validateFileUpload } from "./file-validator";
import { parseCSV } from "./csv-parser";
import { FileFormat, FileUploadConfig, FileUploadResult } from "./types";

const DEFAULT_CONFIG: FileUploadConfig = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxRows: 100000,
  allowedMimeTypes: [
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  allowedExtensions: [".csv", ".xlsx", ".xls"],
  detectFormulaInjection: true,
};

/**
 * Process a file upload: validate → parse → return structured result.
 *
 * @param filename - Original filename (e.g., "data.csv")
 * @param fileContent - File content as string (for CSV) or binary (for XLSX)
 * @param mimeType - MIME type if available
 * @param config - Upload configuration
 * @returns FileUploadResult with ok: true (parsed) or ok: false (errors)
 */
export function processFileUpload(
  filename: string,
  fileContent: string | Buffer,
  mimeType?: string,
  config: FileUploadConfig = DEFAULT_CONFIG
): FileUploadResult {
  // Validate file first
  const contentString = typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8");
  const fileSizeBytes = Buffer.byteLength(contentString, "utf-8");

  const validationResult = validateFileUpload(filename, fileSizeBytes, mimeType, config);
  if (!validationResult.ok) {
    return {
      ok: false,
      errors: validationResult.errors,
    };
  }

  const format = validationResult.format;

  // Determine format if not detected
  if (!format) {
    return {
      ok: false,
      errors: [
        {
          code: "UNSUPPORTED_FILE_TYPE",
          message: "Could not determine file format from extension or MIME type",
        },
      ],
    };
  }

  // Parse based on format
  let parseResult: any;

  if (format === FileFormat.CSV) {
    parseResult = parseCSV(contentString, config);
  } else if (format === FileFormat.XLSX) {
    // XLSX requires external library; for now, return unsupported
    return {
      ok: false,
      errors: [
        {
          code: "FORMAT_NOT_YET_SUPPORTED",
          message: "XLSX parsing requires external dependency (xlsx). Use CSV for now.",
        },
      ],
    };
  } else {
    return {
      ok: false,
      errors: [
        {
          code: "UNKNOWN_FORMAT",
          message: `Unknown file format: ${format}`,
        },
      ],
    };
  }

  // If parsing failed, return errors
  if (!parseResult.ok) {
    return {
      ok: false,
      errors: parseResult.errors,
    };
  }

  // Create source document metadata
  const sourceDocumentId = uuidv4();
  const uploadedAt = new Date();

  return {
    ok: true,
    source_document: {
      source_document_id: sourceDocumentId,
      filename,
      file_format: format,
      file_size_bytes: fileSizeBytes,
      uploaded_at: uploadedAt.toISOString(),
      mime_type: mimeType || "application/octet-stream",
      row_count: parseResult.rowCount || 0,
      has_headers: true,
      encoding: "utf-8",
    },
    parsed_data: {
      headers: parseResult.headers || [],
      rows: parseResult.rows || [],
      row_count: parseResult.rowCount || 0,
    },
    formula_injection_alerts:
      parseResult.formulaInjectionDetected && parseResult.formulaInjectionDetected.length > 0
        ? parseResult.formulaInjectionDetected.map((alert: any) => ({
            rowNumber: alert.rowNumber,
            columnName: alert.columnName,
            value: alert.value,
            safe_display_value: alert.safe_display_value,
            reason: "FORMULA_PREFIX" as const,
          }))
        : undefined,
    warnings:
      parseResult.formulaInjectionDetected && parseResult.formulaInjectionDetected.length > 0
        ? [
            {
              code: "FORMULA_INJECTION_DETECTED",
              message: `${parseResult.formulaInjectionDetected.length} cells contain formula-like content. These will be stored safely and not executed.`,
            },
          ]
        : undefined,
  };
}

/**
 * Validate file upload without parsing (for preview/pre-check).
 * Used before full processing to fail fast on invalid files.
 */
export function validateFileOnly(
  filename: string,
  fileSizeBytes: number,
  mimeType?: string,
  config: FileUploadConfig = DEFAULT_CONFIG
): FileUploadResult {
  const validationResult = validateFileUpload(filename, fileSizeBytes, mimeType, config);

  if (!validationResult.ok) {
    return {
      ok: false,
      errors: validationResult.errors,
    };
  }

  return {
    ok: true,
    source_document: {
      source_document_id: "", // Not assigned until file is processed
      filename,
      file_format: validationResult.format || FileFormat.CSV,
      file_size_bytes: fileSizeBytes,
      uploaded_at: new Date().toISOString(),
      mime_type: mimeType || "application/octet-stream",
      row_count: 0,
      has_headers: true,
      encoding: "utf-8",
    },
  };
}

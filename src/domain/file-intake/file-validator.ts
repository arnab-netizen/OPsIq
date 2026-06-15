/**
 * B02 File Validator — Pure functions for file type validation.
 *
 * Validates:
 * - File extension against allowed list
 * - MIME type against allowed list
 * - File size against configured limit
 *
 * No I/O, no DB, no side effects.
 */

import { FileFormat, FileValidationResult, FileUploadConfig } from "./types";

const DEFAULT_CONFIG: FileUploadConfig = {
  maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
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
 * Detect file format from extension or MIME type.
 * Returns undefined if format cannot be determined.
 */
export function detectFileFormat(filename: string, mimeType?: string): FileFormat | undefined {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

  if (ext === ".csv") return FileFormat.CSV;
  if (ext === ".xlsx" || ext === ".xls") return FileFormat.XLSX;

  // Fallback to MIME type
  if (mimeType?.includes("csv")) return FileFormat.CSV;
  if (mimeType?.includes("spreadsheet") || mimeType?.includes("sheet")) return FileFormat.XLSX;

  return undefined;
}

/**
 * Validate file type, extension, size.
 *
 * Returns ok: true if all checks pass.
 * Returns ok: false with errors if any validation fails.
 * Fails closed: multiple violations reported at once.
 */
export function validateFileUpload(
  filename: string,
  fileSizeBytes: number,
  mimeType?: string,
  config: FileUploadConfig = DEFAULT_CONFIG
): FileValidationResult {
  const errors: Array<{ code: "UNSUPPORTED_EXTENSION" | "UNSUPPORTED_MIME_TYPE" | "FILE_TOO_LARGE" | "FILE_EMPTY" | "INVALID_MIME_TYPE"; message: string }> = [];

  // Validate extension
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  if (!config.allowedExtensions.some((allowed) => allowed.toLowerCase() === ext)) {
    errors.push({
      code: "UNSUPPORTED_EXTENSION",
      message: `File extension "${ext}" is not supported. Allowed: ${config.allowedExtensions.join(", ")}`,
    });
  }

  // Validate MIME type
  if (mimeType && !config.allowedMimeTypes.some((allowed) => mimeType.includes(allowed.split("/")[0]))) {
    errors.push({
      code: "INVALID_MIME_TYPE",
      message: `MIME type "${mimeType}" is not supported. Allowed: ${config.allowedMimeTypes.join(", ")}`,
    });
  } else if (!mimeType) {
    errors.push({
      code: "UNSUPPORTED_MIME_TYPE",
      message: "File MIME type not provided",
    });
  }

  // Validate file size
  if (fileSizeBytes === 0) {
    errors.push({
      code: "FILE_EMPTY",
      message: "File is empty",
    });
  } else if (fileSizeBytes > config.maxFileSizeBytes) {
    errors.push({
      code: "FILE_TOO_LARGE",
      message: `File size (${fileSizeBytes} bytes) exceeds maximum (${config.maxFileSizeBytes} bytes)`,
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    format: detectFileFormat(filename, mimeType),
  };
}

/**
 * Check if a file likely needs xlsx library (vs. csv library).
 * Returns true for .xlsx and .xls files.
 */
export function requiresXlsxLibrary(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  return ext === ".xlsx" || ext === ".xls";
}

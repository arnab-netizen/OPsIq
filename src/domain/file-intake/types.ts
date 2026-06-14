/**
 * B02 File Intake types — shared structures for file upload validation and parsing.
 *
 * Pure data structures (no I/O, no DB, no side effects).
 */

import { z } from "zod";

// ============================================================================
// File Validation Types
// ============================================================================

/** Supported file formats */
export enum FileFormat {
  CSV = "csv",
  XLSX = "xlsx",
}

/** File validation result */
export const FileValidationResultSchema = z.object({
  ok: z.boolean(),
  format: z.nativeEnum(FileFormat).optional(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
      })
    )
    .optional(),
});

export type FileValidationResult = z.infer<typeof FileValidationResultSchema>;

// ============================================================================
// CSV Parsing Types
// ============================================================================

/** CSV parse result with formula injection detection */
export const CSVParseResultSchema = z.object({
  ok: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).optional(),
  headers: z.array(z.string()).optional(),
  rowCount: z.number().optional(),
  formulaInjectionDetected: z.array(
    z.object({
      rowNumber: z.number(),
      columnName: z.string(),
      value: z.string(),
      safe_display_value: z.string(),
    })
  ).optional(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        rowNumber: z.number().optional(),
      })
    )
    .optional(),
});

export type CSVParseResult = z.infer<typeof CSVParseResultSchema>;

// ============================================================================
// File Upload Result Types
// ============================================================================

/** Source document metadata for file uploads */
export const SourceDocumentMetadataSchema = z.object({
  source_document_id: z.string().uuid(),
  filename: z.string().min(1),
  file_format: z.nativeEnum(FileFormat),
  file_size_bytes: z.number().nonnegative(),
  uploaded_at: z.string().datetime(),
  mime_type: z.string(),
  row_count: z.number().nonnegative(),
  has_headers: z.boolean().default(true),
  encoding: z.string().default("utf-8"),
});

export type SourceDocumentMetadata = z.infer<typeof SourceDocumentMetadataSchema>;

/** Complete file upload result (validation + parsing) */
export const FileUploadResultSchema = z.object({
  ok: z.boolean(),
  source_document: SourceDocumentMetadataSchema.optional(),
  parsed_data: z
    .object({
      headers: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.string())),
      row_count: z.number(),
    })
    .optional(),
  formula_injection_alerts: z
    .array(
      z.object({
        rowNumber: z.number(),
        columnName: z.string(),
        value: z.string(),
        safe_display_value: z.string(),
        reason: z.string(),
      })
    )
    .optional(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        rowNumber: z.number().optional(),
      })
    )
    .optional(),
  warnings: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
      })
    )
    .optional(),
});

export type FileUploadResult = z.infer<typeof FileUploadResultSchema>;

// ============================================================================
// File Upload Configuration
// ============================================================================

export const FileUploadConfigSchema = z.object({
  maxFileSizeBytes: z.number().positive().default(50 * 1024 * 1024), // 50 MB
  maxRows: z.number().positive().default(100000),
  allowedMimeTypes: z.array(z.string()).default([
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
  allowedExtensions: z.array(z.string()).default([
    ".csv",
    ".xlsx",
    ".xls",
  ]),
  detectFormulaInjection: z.boolean().default(true),
});

export type FileUploadConfig = z.infer<typeof FileUploadConfigSchema>;

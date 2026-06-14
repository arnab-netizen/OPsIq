/**
 * B02 File Intake module — Public API
 *
 * Exports:
 * - File validation functions
 * - CSV parsing
 * - File upload orchestration
 * - Types and configuration
 */

export {
  detectFileFormat,
  validateFileUpload,
  requiresXlsxLibrary,
} from "./file-validator";

export { parseCSV } from "./csv-parser";

export {
  processFileUpload,
  validateFileOnly,
} from "./file-upload-handler";

export type {
  FileValidationResult,
  CSVParseResult,
  SourceDocumentMetadata,
  FileUploadResult,
  FileUploadConfig,
} from "./types";

export {
  FileFormat,
  FileValidationResultSchema,
  CSVParseResultSchema,
  SourceDocumentMetadataSchema,
  FileUploadResultSchema,
  FileUploadConfigSchema,
} from "./types";

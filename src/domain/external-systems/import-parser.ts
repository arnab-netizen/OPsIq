/**
 * B12-S2: CSV/XLSX Import Parser with Field Mapping
 *
 * Parses CSV/XLSX exports and maps columns to business fact fields.
 * Handles field discovery, similarity matching, and data transformation.
 *
 * Pure functions: no DB, no I/O (except file content passed as string/buffer).
 */

import type { ImportTemplate, FieldMapping } from "./provider-registry";

export interface ParsedRow {
  original: Record<string, any>; // Original field values from CSV
  mapped: Record<string, any>; // Mapped to business fact fields
  confidence: number; // Overall confidence (0.0-1.0)
  mappedFields: string[]; // Which fields were successfully mapped
  unmappedColumns: string[]; // CSV columns that couldn't be mapped
  errors: string[];
}

export interface ImportResult {
  recordCount: number;
  parsedRows: ParsedRow[];
  headerRow: string[];
  totalConfidence: number; // Average confidence across all rows
  requiredFieldsMissing: string[];
  warnings: string[];
}

/**
 * Parse RFC 4180 CSV format
 */
export function parseCSV(csvContent: string): { headers: string[]; rows: Record<string, any>[] } {
  const lines = csvContent.split("\n");
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows = lines.slice(1).map((line) => {
    if (!line.trim()) return null;
    const values = parseCSVLine(line);
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    return row;
  });

  return {
    headers,
    rows: rows.filter((r) => r !== null) as Record<string, any>[],
  };
}

/**
 * Parse a single CSV line, handling quoted fields and commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Similarity score between two strings (0.0-1.0)
 * Uses Levenshtein distance concept but simplified for performance
 */
function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1.0;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.85;

  // Check for partial word matches
  const aWords = aLower.split(/[_\s-]/);
  const bWords = bLower.split(/[_\s-]/);
  const commonWords = aWords.filter((w) => bWords.includes(w)).length;
  const totalWords = Math.max(aWords.length, bWords.length);

  return commonWords / (totalWords || 1);
}

/**
 * Auto-detect field mappings from CSV headers based on template
 */
export function detectFieldMappings(
  csvHeaders: string[],
  template: ImportTemplate,
): Record<string, string> {
  const mappings: Record<string, string> = {};

  csvHeaders.forEach((csvHeader) => {
    let bestMatch: [string, number] = ["", 0];

    // Check against all template field sources
    Object.values(template.fieldMappings).forEach((mapping) => {
      const similarity = calculateSimilarity(csvHeader, mapping.sourceField);
      if (similarity > bestMatch[1]) {
        bestMatch = [mapping.sourceField, similarity];
      }
    });

    // Use mapping if similarity score is high enough (threshold: 0.6)
    if (bestMatch[1] >= 0.6) {
      mappings[csvHeader] = bestMatch[0];
    }
  });

  return mappings;
}

/**
 * Apply transformation rule to a value
 */
function applyTransformation(
  value: any,
  rule: FieldMapping["transformationRule"],
): { transformed: any; error?: string } {
  if (!rule) return { transformed: value };

  try {
    switch (rule.type) {
      case "passthrough":
        return { transformed: value };

      case "multiply":
        if (rule.factor === undefined) return { transformed: value };
        const numMult = parseFloat(value);
        if (isNaN(numMult)) {
          return { transformed: null, error: `Cannot multiply non-number: ${value}` };
        }
        return { transformed: numMult * rule.factor };

      case "divide":
        if (rule.factor === undefined) return { transformed: value };
        const numDiv = parseFloat(value);
        if (isNaN(numDiv)) {
          return { transformed: null, error: `Cannot divide non-number: ${value}` };
        }
        return { transformed: numDiv / rule.factor };

      case "map":
        if (!rule.mapping || typeof value !== "string") {
          return { transformed: value };
        }
        const mapped = rule.mapping[value];
        return mapped
          ? { transformed: mapped }
          : { transformed: value, error: `Unmapped value: ${value}` };

      case "parse_date":
        if (!rule.format) return { transformed: value };
        // Simple date parsing - assumes YYYY-MM-DD or similar
        const dateStr = String(value).trim();
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return { transformed: null, error: `Invalid date: ${value}` };
        }
        return { transformed: date.toISOString().split("T")[0] };

      default:
        return { transformed: value };
    }
  } catch (err) {
    return { transformed: null, error: `Transformation error: ${err}` };
  }
}

/**
 * Map a CSV row using template mappings
 */
function mapRow(
  csvRow: Record<string, any>,
  template: ImportTemplate,
  autoMappings: Record<string, string>,
): ParsedRow {
  const mapped: Record<string, any> = {};
  const mappedFields: string[] = [];
  const unmappedColumns: string[] = [];
  const errors: string[] = [];
  let totalConfidence = 0;
  let mappedCount = 0;

  Object.entries(csvRow).forEach(([csvColumn, csvValue]) => {
    // Find the template source field that corresponds to this CSV column
    const templateSourceField = autoMappings[csvColumn];

    if (!templateSourceField) {
      unmappedColumns.push(csvColumn);
      return;
    }

    // Find the mapping definition
    const mappingDef = Object.values(template.fieldMappings).find(
      (m) => m.sourceField === templateSourceField,
    );

    if (!mappingDef) {
      unmappedColumns.push(csvColumn);
      return;
    }

    // Apply transformation
    const { transformed, error } = applyTransformation(csvValue, mappingDef.transformationRule);

    if (error) {
      errors.push(error);
    }

    if (transformed !== null && transformed !== undefined) {
      mapped[mappingDef.targetField] = transformed;
      mappedFields.push(mappingDef.targetField);
      totalConfidence += mappingDef.confidence;
      mappedCount++;
    }
  });

  const confidence = mappedCount > 0 ? totalConfidence / mappedCount : 0;

  return {
    original: csvRow,
    mapped,
    confidence,
    mappedFields,
    unmappedColumns,
    errors,
  };
}

/**
 * Import CSV using provider template
 */
export function importCSVWithTemplate(
  csvContent: string,
  template: ImportTemplate,
): ImportResult {
  const { headers: csvHeaders, rows: csvRows } = parseCSV(csvContent);

  // Check for required columns
  const requiredFieldsMissing = template.requiredColumns.filter(
    (req) => !csvHeaders.some((h) => calculateSimilarity(h, req) >= 0.6),
  );

  // Auto-detect field mappings
  const autoMappings = detectFieldMappings(csvHeaders, template);

  // Map all rows
  const parsedRows = csvRows.map((row) => mapRow(row, template, autoMappings));

  // Calculate total confidence
  const totalConfidence =
    parsedRows.length > 0 ? parsedRows.reduce((sum, r) => sum + r.confidence, 0) / parsedRows.length : 0;

  const warnings: string[] = [];
  if (requiredFieldsMissing.length > 0) {
    warnings.push(`Missing required columns: ${requiredFieldsMissing.join(", ")}`);
  }

  return {
    recordCount: csvRows.length,
    parsedRows,
    headerRow: csvHeaders,
    totalConfidence,
    requiredFieldsMissing,
    warnings,
  };
}

/**
 * Validate import result
 */
export function validateImportResult(
  result: ImportResult,
  minConfidence: number = 0.7,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (result.requiredFieldsMissing.length > 0) {
    errors.push(`Missing required fields: ${result.requiredFieldsMissing.join(", ")}`);
  }

  if (result.totalConfidence < minConfidence) {
    errors.push(
      `Low overall confidence: ${(result.totalConfidence * 100).toFixed(1)}% < ${(minConfidence * 100).toFixed(1)}%`,
    );
  }

  const rowsWithErrors = result.parsedRows.filter((r) => r.errors.length > 0);
  if (rowsWithErrors.length > result.parsedRows.length * 0.1) {
    // More than 10% of rows have errors
    errors.push(`Too many row errors: ${rowsWithErrors.length}/${result.parsedRows.length} rows`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

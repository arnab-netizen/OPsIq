import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

/**
 * CSV Ingestion & Validation
 *
 * Strict CSV parsing with deterministic validation.
 * Rejects NaN, no silent conversions, explicit error handling.
 */

export interface CSVRecord {
  revenue: number;
  cost: number;
}

/**
 * Parse CSV text into rows.
 * Splits by newlines and then by commas.
 * Does NOT validate - just splits.
 */
export function parseCSV(text: string): string[][] {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Split by newlines, then by commas
  // Filter empty lines
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((row) => row.split(",").map((cell) => cell.trim()));
}

/**
 * Validate rows: require minimum 2 columns.
 * Returns only valid rows.
 * Does NOT convert or transform data.
 */
export function validateRows(rows: string[][]): string[][] {
  if (!Array.isArray(rows)) {
    return [];
  }

  // Filter: keep only rows with at least 2 columns
  return rows.filter((r) => Array.isArray(r) && r.length >= 2);
}

/**
 * Map rows to records with numeric fields.
 * Rejects NaN (no silent conversion).
 * Throws on invalid numbers (fail-closed).
 */
export function mapToRecords(rows: string[][]): CSVRecord[] {
  if (!Array.isArray(rows)) {
    throw new Error("Input must be array of rows");
  }

  const records: CSVRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!Array.isArray(row) || row.length < 2) {
      throw new Error(`Row ${i} invalid: must have at least 2 columns`);
    }

    const revenueStr = row[0];
    const costStr = row[1];

    // Parse revenue
    const revenue = parseFloat(revenueStr);
    if (isNaN(revenue)) {
      throw new Error(
        `Row ${i} invalid: revenue "${revenueStr}" is not a valid number`
      );
    }

    // Parse cost
    const cost = parseFloat(costStr);
    if (isNaN(cost)) {
      throw new Error(
        `Row ${i} invalid: cost "${costStr}" is not a valid number`
      );
    }

    records.push({ revenue, cost });
  }

  return records;
}

/**
 * Complete ingestion pipeline:
 * 1. Parse CSV text
 * 2. Validate rows
 * 3. Map to records
 *
 * Throws on invalid data (fail-closed).
 */
export function ingestCSV(text: string): CSVRecord[] {
  const rows = parseCSV(text);
  const validRows = validateRows(rows);
  return mapToRecords(validRows);
}

/**
 * Validate a single record for required fields.
 * Ensures both revenue and cost are valid numbers.
 */
export function validateRecord(record: any): record is CSVRecord {
  return (
    typeof record === "object" &&
    record !== null &&
    typeof record.revenue === "number" &&
    !isNaN(record.revenue) &&
    typeof record.cost === "number" &&
    !isNaN(record.cost)
  );
}

/**
 * Safe ingestion: returns records and errors separately.
 * Does NOT throw - suitable for user-facing operations.
 */
export function ingestCSVSafe(
  text: string
): { records: CSVRecord[]; errors: string[] } {
  const errors: string[] = [];
  const records: CSVRecord[] = [];

  // Validate input
  if (!text || typeof text !== "string") {
    errors.push("Input must be a non-empty string");
    return { records, errors };
  }

  try {
    const rows = parseCSV(text);
    const validRows = validateRows(rows);

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];

      try {
        const revenueStr = row[0];
        const costStr = row[1];

        const revenue = parseFloat(revenueStr);
        if (isNaN(revenue)) {
          errors.push(
            `Row ${i + 1}: revenue "${revenueStr}" is not a valid number`
          );
          continue;
        }

        const cost = parseFloat(costStr);
        if (isNaN(cost)) {
          errors.push(
            `Row ${i + 1}: cost "${costStr}" is not a valid number`
          );
          continue;
        }

        records.push({ revenue, cost });
      } catch (err) {
        const message = getSafeErrorMessage(err);
        errors.push(`Row ${i + 1}: ${message}`);
      }
    }
  } catch (err) {
    const message = getSafeErrorMessage(err);
    errors.push(`Parse error: ${message}`);
  }

  return { records, errors };
}

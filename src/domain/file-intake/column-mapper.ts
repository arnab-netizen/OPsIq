/**
 * B02-S2 Column Mapper — Maps CSV columns to business facts contract fields.
 *
 * Pure function that:
 * 1. Takes parsed CSV headers + rows from B02-S1 file upload
 * 2. Maps columns to business facts contract fields (financial, sales, operations, etc.)
 * 3. Returns mapping metadata + validated rows ready for business facts creation
 * 4. Validates required fields are present
 * 5. Handles optional/unmapped columns
 *
 * No I/O, no DB, no side effects.
 */

import { z } from "zod";

// ============================================================================
// Column Mapping Types
// ============================================================================

/** Result of column mapping analysis */
export const ColumnMappingAnalysisSchema = z.object({
  ok: z.boolean(),
  headers: z.array(z.string()),
  row_count: z.number(),
  detected_domain: z.enum(["finance", "sales", "operations", "marketing", "unknown"]).optional(),
  column_mappings: z.record(
    z.string(), // CSV column name
    z.object({
      target_field: z.string(),
      field_type: z.enum(["number", "currency", "date", "string", "unmapped"]),
      confidence: z.number().min(0).max(1),
      required: z.boolean(),
    })
  ),
  unmapped_columns: z.array(z.string()),
  missing_required_fields: z.array(z.string()),
  mapping_confidence: z.number().min(0).max(1),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
  })).optional(),
});

export type ColumnMappingAnalysis = z.infer<typeof ColumnMappingAnalysisSchema>;

// ============================================================================
// Domain Field Specifications
// ============================================================================

type FieldType = "number" | "currency" | "date" | "string";

interface FieldSpec {
  name: string;
  type: FieldType;
  required: boolean;
  aliases: string[];
  category: string;
}

const FINANCE_FIELD_SPECS: FieldSpec[] = [
  // Financial metrics
  { name: "revenue", type: "currency", required: true, aliases: ["sales", "total_revenue", "gross_revenue"], category: "income" },
  { name: "costOfGoodsOrServices", type: "currency", required: false, aliases: ["cogs", "cost_of_goods", "cost"], category: "expenses" },
  { name: "grossProfit", type: "currency", required: false, aliases: ["gross_profit"], category: "profit" },
  { name: "operatingExpenses", type: "currency", required: false, aliases: ["opex", "operating_expense"], category: "expenses" },
  { name: "netIncome", type: "currency", required: false, aliases: ["net_profit", "net_income", "bottom_line"], category: "profit" },

  // Period fields
  { name: "periodStart", type: "date", required: true, aliases: ["start_date", "from", "period_from"], category: "period" },
  { name: "periodEnd", type: "date", required: true, aliases: ["end_date", "to", "period_to"], category: "period" },

  // Currency
  { name: "currency", type: "string", required: true, aliases: ["currency_code", "base_currency"], category: "metadata" },
];

const SALES_FIELD_SPECS: FieldSpec[] = [
  { name: "new_customers", type: "number", required: false, aliases: ["new_accounts", "new_customer_count"], category: "customer_acquisition" },
  { name: "repeat_customers", type: "number", required: false, aliases: ["returning_customers", "repeat_rate"], category: "retention" },
  { name: "total_transactions", type: "number", required: false, aliases: ["transaction_count", "order_count"], category: "volume" },
  { name: "average_order_value", type: "currency", required: false, aliases: ["aov", "avg_order_value"], category: "metrics" },
  { name: "churn_rate", type: "number", required: false, aliases: ["attrition", "churn"], category: "retention" },
  { name: "periodStart", type: "date", required: true, aliases: ["start_date", "from"], category: "period" },
  { name: "periodEnd", type: "date", required: true, aliases: ["end_date", "to"], category: "period" },
];

const OPERATIONS_FIELD_SPECS: FieldSpec[] = [
  { name: "active_users", type: "number", required: false, aliases: ["mau", "monthly_active"], category: "engagement" },
  { name: "uptime_percentage", type: "number", required: false, aliases: ["availability", "sla"], category: "reliability" },
  { name: "response_time_ms", type: "number", required: false, aliases: ["latency", "avg_response_time"], category: "performance" },
  { name: "error_rate", type: "number", required: false, aliases: ["failure_rate", "error_percentage"], category: "reliability" },
  { name: "periodStart", type: "date", required: true, aliases: ["start_date", "from"], category: "period" },
  { name: "periodEnd", type: "date", required: true, aliases: ["end_date", "to"], category: "period" },
];

// ============================================================================
// Column Detection & Mapping
// ============================================================================

/** Normalize a CSV column header to canonical form */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Detect if a column matches a field spec via aliases */
function matchFieldSpec(csvHeader: string, spec: FieldSpec): boolean {
  const normalized = normalizeHeader(csvHeader);
  const specNormalized = normalizeHeader(spec.name);

  // Direct match
  if (normalized === specNormalized) return true;

  // Alias match
  for (const alias of spec.aliases) {
    if (normalized === normalizeHeader(alias)) return true;
  }

  return false;
}

/** Detect the data domain (finance, sales, operations, etc.) from CSV headers */
function detectDomain(headers: string[]): "finance" | "sales" | "operations" | "marketing" | "unknown" {
  let financeScore = 0;
  let salesScore = 0;
  let operationsScore = 0;

  for (const header of headers) {
    for (const spec of FINANCE_FIELD_SPECS) {
      if (matchFieldSpec(header, spec)) financeScore++;
    }
    for (const spec of SALES_FIELD_SPECS) {
      if (matchFieldSpec(header, spec)) salesScore++;
    }
    for (const spec of OPERATIONS_FIELD_SPECS) {
      if (matchFieldSpec(header, spec)) operationsScore++;
    }
  }

  if (financeScore >= salesScore && financeScore >= operationsScore && financeScore > 0) return "finance";
  if (salesScore >= operationsScore && salesScore > 0) return "sales";
  if (operationsScore > 0) return "operations";
  return "unknown";
}

/**
 * Analyze CSV column headers and map to business facts contract fields.
 *
 * Returns mapping analysis with confidence scores and any errors.
 */
export function analyzeColumnMapping(
  headers: string[],
  targetDomain?: "finance" | "sales" | "operations" | "marketing"
): ColumnMappingAnalysis {
  if (!headers || headers.length === 0) {
    return {
      ok: false,
      headers: [],
      row_count: 0,
      column_mappings: {},
      unmapped_columns: [],
      missing_required_fields: [],
      mapping_confidence: 0,
      errors: [
        {
          code: "NO_HEADERS",
          message: "CSV has no headers",
        },
      ],
    };
  }

  // Determine domain
  const detectedDomain = targetDomain || detectDomain(headers);
  const specs =
    detectedDomain === "finance"
      ? FINANCE_FIELD_SPECS
      : detectedDomain === "sales"
        ? SALES_FIELD_SPECS
        : detectedDomain === "operations"
          ? OPERATIONS_FIELD_SPECS
          : [];

  // Map columns to fields
  const columnMappings: Record<
    string,
    {
      target_field: string;
      field_type: FieldType;
      confidence: number;
      required: boolean;
    }
  > = {};
  const mappedFields = new Set<string>();
  const unmappedColumns: string[] = [];

  for (const header of headers) {
    let found = false;

    for (const spec of specs) {
      if (matchFieldSpec(header, spec)) {
        columnMappings[header] = {
          target_field: spec.name,
          field_type: spec.type,
          confidence: 0.95, // High confidence if matched
          required: spec.required,
        };
        mappedFields.add(spec.name);
        found = true;
        break;
      }
    }

    if (!found) {
      columnMappings[header] = {
        target_field: "",
        field_type: "string",
        confidence: 0,
        required: false,
      };
      unmappedColumns.push(header);
    }
  }

  // Check for missing required fields
  const missingRequiredFields = specs
    .filter((s) => s.required && !mappedFields.has(s.name))
    .map((s) => s.name);

  // Calculate overall confidence
  const mappedCount = Object.values(columnMappings).filter((m) => m.confidence > 0).length;
  const confidence = headers.length > 0 ? mappedCount / headers.length : 0;

  return {
    ok: missingRequiredFields.length === 0,
    headers,
    row_count: 0, // Will be set by caller after rows are validated
    detected_domain: detectedDomain,
    column_mappings: columnMappings,
    unmapped_columns: unmappedColumns,
    missing_required_fields: missingRequiredFields,
    mapping_confidence: confidence,
    errors:
      missingRequiredFields.length > 0
        ? [
            {
              code: "MISSING_REQUIRED_FIELDS",
              message: `Missing required fields: ${missingRequiredFields.join(", ")}`,
            },
          ]
        : undefined,
  };
}

/**
 * Apply column mappings to parsed CSV rows.
 *
 * Returns validated rows with values mapped to target field names.
 */
export function applyColumnMappings(
  rows: Record<string, string>[],
  mapping: ColumnMappingAnalysis
): {
  ok: boolean;
  mapped_rows: Record<string, string>[];
  errors: Array<{ row_number: number; field: string; code: string; message: string }>;
} {
  const errors: Array<{ row_number: number; field: string; code: string; message: string }> = [];
  const mapped_rows: Record<string, string>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped_row: Record<string, string> = {};

    for (const [csvColumn, value] of Object.entries(row)) {
      const fieldMapping = mapping.column_mappings[csvColumn];

      if (!fieldMapping) {
        // Column not in mapping (shouldn't happen)
        continue;
      }

      if (fieldMapping.confidence === 0) {
        // Unmapped column - skip
        continue;
      }

      if (!fieldMapping.target_field) {
        continue;
      }

      mapped_row[fieldMapping.target_field] = value;
    }

    mapped_rows.push(mapped_row);
  }

  return {
    ok: errors.length === 0,
    mapped_rows,
    errors,
  };
}

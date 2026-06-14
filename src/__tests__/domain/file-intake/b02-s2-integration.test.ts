/**
 * B02-S2 Integration Test — File Upload → Column Mapping
 *
 * Tests the complete B02 file intake flow (pure functions):
 * 1. File upload handling & validation (B02-S1)
 * 2. Column mapping analysis (B02-S2)
 *
 * Pure functions with no DB persistence in this slice.
 * B01 adapter (business facts contract) will be tested separately.
 * Database persistence (OwnerDataIntake) will be in B02-S3 (Owner Confirmation Flow).
 */

import { describe, it, expect } from "vitest";
import { parseCSV } from "../../../domain/file-intake/csv-parser";
import { validateFileUpload } from "../../../domain/file-intake/file-validator";
import { analyzeColumnMapping, applyColumnMappings } from "../../../domain/file-intake/column-mapper";

describe("B02-S2 Integration — File Intake (Validation + Parsing + Mapping)", () => {
  it("should complete full flow: CSV validation → parsing → mapping", () => {
    // Step 1: Create CSV content
    const csvContent = `revenue,cost,start_date,end_date,currency_code
100000,40000,2026-01-01,2026-12-31,USD
150000,60000,2026-01-01,2026-12-31,USD`;

    // Step 2: Validate file
    const fileValidation = validateFileUpload(
      "finance_data.csv",
      csvContent.length,
      "text/csv"
    );
    expect(fileValidation.ok).toBe(true);
    expect(fileValidation.format).toBe("csv");

    // Step 3: Parse CSV
    const parseResult = parseCSV(csvContent);
    expect(parseResult.ok).toBe(true);
    expect(parseResult.rows).toHaveLength(2);
    expect(parseResult.headers).toEqual(["revenue", "cost", "start_date", "end_date", "currency_code"]);

    // Step 4: Analyze column mapping
    const mappingAnalysis = analyzeColumnMapping(parseResult.headers!, "finance");
    expect(mappingAnalysis.ok).toBe(true);
    expect(mappingAnalysis.detected_domain).toBe("finance");
    expect(mappingAnalysis.unmapped_columns).toHaveLength(0);
    expect(mappingAnalysis.mapping_confidence).toBe(1.0);

    // Step 5: Apply column mappings
    const mappedResult = applyColumnMappings(parseResult.rows!, mappingAnalysis);
    expect(mappedResult.ok).toBe(true);
    expect(mappedResult.mapped_rows).toHaveLength(2);
    expect(mappedResult.mapped_rows[0]).toMatchObject({
      revenue: "100000",
      costOfGoodsOrServices: "40000",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      currency: "USD",
    });
    expect(mappedResult.mapped_rows[1]).toMatchObject({
      revenue: "150000",
      costOfGoodsOrServices: "60000",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      currency: "USD",
    });

    // Result: mapped rows are ready for business facts conversion (B01-S2)
    expect(mappedResult.mapped_rows[0]).toBeDefined();
    expect(Object.keys(mappedResult.mapped_rows[0]).length).toBeGreaterThan(0);
  });

  it("should handle sales CSV flow end-to-end", () => {
    const csvContent = `new_accounts,repeat_rate,transaction_count,aov,start_date,end_date
250,35,8000,150,2026-01-01,2026-03-31
300,40,9500,165,2026-04-01,2026-06-30`;

    // Parse
    const parseResult = parseCSV(csvContent);
    expect(parseResult.ok).toBe(true);
    expect(parseResult.rows).toHaveLength(2);

    // Map columns
    const mappingAnalysis = analyzeColumnMapping(parseResult.headers!, "sales");
    expect(mappingAnalysis.ok).toBe(true);
    expect(mappingAnalysis.detected_domain).toBe("sales");

    const mappedResult = applyColumnMappings(parseResult.rows!, mappingAnalysis);
    expect(mappedResult.ok).toBe(true);
    expect(mappedResult.mapped_rows).toHaveLength(2);
    expect(mappedResult.mapped_rows[0]).toMatchObject({
      new_customers: "250",
      repeat_customers: "35",
      total_transactions: "8000",
      average_order_value: "150",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
    });
  });

  it("should reject file with missing required fields", () => {
    const csvContent = `revenue,cost
100000,40000
150000,60000`;

    // Parse
    const parseResult = parseCSV(csvContent);
    expect(parseResult.ok).toBe(true);

    // Map columns - should fail because periodStart, periodEnd, currency are missing
    const mappingAnalysis = analyzeColumnMapping(parseResult.headers!, "finance");
    expect(mappingAnalysis.ok).toBe(false);
    expect(mappingAnalysis.missing_required_fields).toContain("periodStart");
    expect(mappingAnalysis.missing_required_fields).toContain("periodEnd");
    expect(mappingAnalysis.missing_required_fields).toContain("currency");
  });

  it("should detect and report formula injection attempts", () => {
    const csvContent = `revenue,cost,start_date,end_date,currency_code
=100000,40000,2026-01-01,2026-12-31,USD
150000,60000,2026-01-01,2026-12-31,USD`;

    // Parse with formula injection detection
    const parseResult = parseCSV(csvContent);
    expect(parseResult.ok).toBe(true);
    expect(parseResult.formulaInjectionDetected).toBeDefined();
    expect(parseResult.formulaInjectionDetected!.length).toBeGreaterThan(0);

    // Find the formula injection in revenue column
    const detected = parseResult.formulaInjectionDetected!.find(
      (d) => d.columnName === "revenue" && d.rowNumber === 2
    );
    expect(detected).toBeDefined();
    expect(detected!.value).toBe("=100000");

    // Verify that the injection is detected and stored safely (value preserved, safe_display_value for display)
    expect(detected!.safe_display_value).toBe("=100000"); // no HTML entities needed for this value
    expect(detected!.rowNumber).toBe(2);
    expect(detected!.columnName).toBe("revenue");
  });

  it("should handle operations CSV with all metrics", () => {
    const csvContent = `mau,availability,latency,failure_rate,start_date,end_date
50000,99.9,45,0.1,2026-01-01,2026-01-31
55000,99.95,42,0.08,2026-02-01,2026-02-28`;

    // Parse
    const parseResult = parseCSV(csvContent);
    expect(parseResult.ok).toBe(true);
    expect(parseResult.rows).toHaveLength(2);

    // Map columns
    const mappingAnalysis = analyzeColumnMapping(parseResult.headers!, "operations");
    expect(mappingAnalysis.ok).toBe(true);
    expect(mappingAnalysis.detected_domain).toBe("operations");

    const mappedResult = applyColumnMappings(parseResult.rows!, mappingAnalysis);
    expect(mappedResult.ok).toBe(true);
    expect(mappedResult.mapped_rows).toHaveLength(2);
    expect(mappedResult.mapped_rows[0]).toMatchObject({
      active_users: "50000",
      uptime_percentage: "99.9",
      response_time_ms: "45",
      error_rate: "0.1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
  });
});

/**
 * B02-S2 Column Mapper Tests — Pure function tests for CSV column mapping.
 *
 * Tests:
 * 1. Domain detection from CSV headers
 * 2. Field matching via aliases
 * 3. Column mapping analysis with confidence scores
 * 4. Required field detection
 * 5. Row transformation with mapped columns
 * 6. Unmapped column handling
 * 7. Edge cases: empty headers, no matches, conflicting domains
 */

import {
  analyzeColumnMapping,
  applyColumnMappings,
  ColumnMappingAnalysis,
} from "../../../domain/file-intake/column-mapper";

describe("Column Mapper - Domain Detection", () => {
  it("should detect finance domain from revenue, COGS, and period dates", () => {
    const headers = ["Revenue", "Cost of Goods", "Start Date", "End Date", "Currency"];
    const result = analyzeColumnMapping(headers);

    expect(result.ok).toBe(true);
    expect(result.detected_domain).toBe("finance");
    expect(result.missing_required_fields).toHaveLength(0);
  });

  it("should detect sales domain from customer and transaction headers", () => {
    const headers = ["New Customers", "Repeat Customers", "Transaction Count", "Start Date", "End Date"];
    const result = analyzeColumnMapping(headers);

    expect(result.ok).toBe(true);
    expect(result.detected_domain).toBe("sales");
  });

  it("should detect operations domain from uptime and response time", () => {
    const headers = ["Active Users", "Uptime %", "Response Time (ms)", "Error Rate", "Start Date", "End Date"];
    const result = analyzeColumnMapping(headers);

    expect(result.ok).toBe(true);
    expect(result.detected_domain).toBe("operations");
  });

  it("should return unknown domain when no field specs match", () => {
    const headers = ["Random Column 1", "Random Column 2", "Random Column 3"];
    const result = analyzeColumnMapping(headers);

    expect(result.detected_domain).toBe("unknown");
  });

  it("should allow target domain override", () => {
    const headers = ["Random 1", "Random 2"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.detected_domain).toBe("finance");
  });
});

describe("Column Mapper - Field Matching", () => {
  it("should match direct field names", () => {
    const headers = ["revenue", "periodStart"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.column_mappings["revenue"].target_field).toBe("revenue");
    expect(result.column_mappings["revenue"].confidence).toBeGreaterThan(0.9);
    expect(result.column_mappings["periodStart"].target_field).toBe("periodStart");
  });

  it("should match field aliases (case-insensitive, underscore-normalized)", () => {
    const headers = ["total_revenue", "GROSS_PROFIT", "cost"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.column_mappings["total_revenue"].target_field).toBe("revenue");
    expect(result.column_mappings["GROSS_PROFIT"].target_field).toBe("grossProfit");
    expect(result.column_mappings["cost"].target_field).toBe("costOfGoodsOrServices");
  });

  it("should handle header normalization (spaces, special chars)", () => {
    const headers = ["Revenue ($)", "Cost - of - Goods", "Start / Date"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.column_mappings["Revenue ($)"].target_field).toBe("revenue");
    expect(result.column_mappings["Cost - of - Goods"].target_field).toBe("costOfGoodsOrServices");
  });

  it("should mark unmapped columns with zero confidence", () => {
    const headers = ["revenue", "random_column", "COGS"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.column_mappings["random_column"].confidence).toBe(0);
    expect(result.column_mappings["random_column"].target_field).toBe("");
    expect(result.unmapped_columns).toContain("random_column");
  });
});

describe("Column Mapper - Required Field Detection", () => {
  it("should report missing required fields for finance", () => {
    const headers = ["Revenue", "COGS"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.ok).toBe(false);
    expect(result.missing_required_fields).toContain("periodStart");
    expect(result.missing_required_fields).toContain("periodEnd");
    expect(result.missing_required_fields).toContain("currency");
  });

  it("should pass validation when all required fields present", () => {
    const headers = ["Revenue", "Start Date", "End Date", "Currency Code"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.ok).toBe(true);
    expect(result.missing_required_fields).toHaveLength(0);
  });

  it("should report missing required fields for sales", () => {
    const headers = ["New Customers"];
    const result = analyzeColumnMapping(headers, "sales");

    expect(result.ok).toBe(false);
    expect(result.missing_required_fields).toContain("periodStart");
    expect(result.missing_required_fields).toContain("periodEnd");
  });

  it("should handle error when no headers provided", () => {
    const result = analyzeColumnMapping([]);

    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].code).toBe("NO_HEADERS");
  });
});

describe("Column Mapper - Confidence Scoring", () => {
  it("should calculate mapping confidence based on mapped vs unmapped columns", () => {
    const headers = ["revenue", "COGS", "unmapped1", "unmapped2", "start_date", "end_date", "currency"];
    const result = analyzeColumnMapping(headers, "finance");

    // 5 out of 7 columns mapped = confidence 5/7 ≈ 0.71
    const expectedConfidence = 5 / 7;
    expect(result.mapping_confidence).toBeCloseTo(expectedConfidence, 2);
  });

  it("should have high confidence when all columns mapped", () => {
    const headers = ["Revenue", "Start Date", "End Date", "Currency"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.mapping_confidence).toBeCloseTo(1.0, 2);
  });

  it("should reflect individual column confidence in mapping", () => {
    const headers = ["revenue"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.column_mappings["revenue"].confidence).toBeGreaterThan(0.9);
  });
});

describe("Column Mapper - Apply Mappings", () => {
  it("should transform row columns to target field names", () => {
    const headers = ["total_revenue", "start_date", "end_date", "currency_code"];
    const mapping = analyzeColumnMapping(headers, "finance");

    const rows = [
      { total_revenue: "100000", start_date: "2026-01-01", end_date: "2026-12-31", currency_code: "USD" },
      { total_revenue: "150000", start_date: "2026-01-01", end_date: "2026-12-31", currency_code: "USD" },
    ];

    const result = applyColumnMappings(rows, mapping);

    expect(result.ok).toBe(true);
    expect(result.mapped_rows).toHaveLength(2);
    expect(result.mapped_rows[0].revenue).toBe("100000");
    expect(result.mapped_rows[0].periodStart).toBe("2026-01-01");
    expect(result.mapped_rows[1].revenue).toBe("150000");
  });

  it("should skip unmapped columns when applying mappings", () => {
    const headers = ["revenue", "random_column", "start_date"];
    const mapping = analyzeColumnMapping(headers, "finance");

    const rows = [
      { revenue: "50000", random_column: "ignored", start_date: "2026-01-01" },
    ];

    const result = applyColumnMappings(rows, mapping);

    // Mapped row should not include unmapped column
    expect(result.mapped_rows[0]).not.toHaveProperty("random_column");
    expect(result.mapped_rows[0].revenue).toBe("50000");
  });

  it("should handle empty rows", () => {
    const headers = ["revenue", "start_date"];
    const mapping = analyzeColumnMapping(headers, "finance");

    const result = applyColumnMappings([], mapping);

    expect(result.ok).toBe(true);
    expect(result.mapped_rows).toHaveLength(0);
  });

  it("should preserve unmapped columns as empty when mapping incomplete rows", () => {
    const headers = ["revenue", "optional_field"];
    const mapping = analyzeColumnMapping(headers, "finance");

    const rows = [
      { revenue: "100000" }, // Missing optional_field
    ];

    const result = applyColumnMappings(rows, mapping);

    expect(result.ok).toBe(true);
    expect(result.mapped_rows[0].revenue).toBe("100000");
  });
});

describe("Column Mapper - Edge Cases", () => {
  it("should handle headers with leading/trailing whitespace", () => {
    const headers = ["  Revenue  ", "  Start Date  ", "  End Date  ", "  Currency  "];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.ok).toBe(true);
    expect(result.missing_required_fields).toHaveLength(0);
  });

  it("should handle mixed case headers", () => {
    const headers = ["REVENUE", "ReVeNuE", "revenue"];
    const mapping = analyzeColumnMapping(headers, "finance");

    expect(mapping.column_mappings["REVENUE"].target_field).toBe("revenue");
    expect(mapping.column_mappings["ReVeNuE"].target_field).toBe("revenue");
    expect(mapping.column_mappings["revenue"].target_field).toBe("revenue");
  });

  it("should handle headers with multiple underscores and special chars", () => {
    const headers = ["gross__profit!!", "operating___expense@@"];
    const mapping = analyzeColumnMapping(headers, "finance");

    expect(mapping.column_mappings["gross__profit!!"].target_field).toBe("grossProfit");
    expect(mapping.column_mappings["operating___expense@@"].target_field).toBe("operatingExpenses");
  });

  it("should detect sales domain even with operations headers present", () => {
    const headers = ["new_customers", "repeat_rate", "active_users"];
    const result = analyzeColumnMapping(headers);

    // Sales should score 2 (new_customers, repeat_customers), operations 1 (active_users)
    expect(result.detected_domain).toBe("sales");
  });

  it("should handle mapping with required fields missing but optional fields present", () => {
    const headers = ["New Customers", "AOV"];
    const result = analyzeColumnMapping(headers, "sales");

    expect(result.ok).toBe(false);
    expect(result.missing_required_fields).toContain("periodStart");
    expect(result.column_mappings["New Customers"].target_field).toBe("new_customers");
    expect(result.column_mappings["AOV"].target_field).toBe("average_order_value");
  });

  it("should provide error details in structured format", () => {
    const headers = ["Random 1"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toHaveProperty("code");
    expect(result.errors![0]).toHaveProperty("message");
  });

  it("should calculate confidence as 0 when no columns mapped", () => {
    const headers = ["unmapped1", "unmapped2", "unmapped3"];
    const result = analyzeColumnMapping(headers, "finance");

    expect(result.mapping_confidence).toBe(0);
  });
});

describe("Column Mapper - Integration Scenarios", () => {
  it("should map a complete finance CSV flow", () => {
    const headers = ["sales", "cogs", "gross_profit", "operating_expense", "net_profit", "start_date", "end_date", "currency_code"];
    const mapping = analyzeColumnMapping(headers, "finance");

    expect(mapping.ok).toBe(true);
    expect(mapping.detected_domain).toBe("finance");
    expect(mapping.unmapped_columns).toHaveLength(0);
    expect(mapping.mapping_confidence).toBe(1.0);

    const rows = [
      {
        "sales": "500000",
        "cogs": "200000",
        "gross_profit": "300000",
        "operating_expense": "100000",
        "net_profit": "200000",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "currency_code": "USD",
      },
    ];

    const result = applyColumnMappings(rows, mapping);

    expect(result.ok).toBe(true);
    expect(result.mapped_rows[0]).toMatchObject({
      revenue: "500000",
      costOfGoodsOrServices: "200000",
      grossProfit: "300000",
      operatingExpenses: "100000",
      netIncome: "200000",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      currency: "USD",
    });
  });

  it("should map a partial sales CSV flow with unmapped columns", () => {
    const headers = ["New Accounts", "Repeat Rate", "Order Count", "AOV", "From", "To", "Comments"];
    const mapping = analyzeColumnMapping(headers, "sales");

    expect(mapping.ok).toBe(true);
    expect(mapping.unmapped_columns).toContain("Comments");
    expect(mapping.mapping_confidence).toBeCloseTo(6 / 7, 2);

    const rows = [
      {
        "New Accounts": "150",
        "Repeat Rate": "45",
        "Order Count": "5000",
        "AOV": "125.50",
        "From": "2026-01-01",
        "To": "2026-03-31",
        "Comments": "Good quarter",
      },
    ];

    const result = applyColumnMappings(rows, mapping);

    expect(result.ok).toBe(true);
    // Comments should be dropped (unmapped)
    expect(result.mapped_rows[0]).not.toHaveProperty("Comments");
    expect(result.mapped_rows[0].new_customers).toBe("150");
    expect(result.mapped_rows[0].average_order_value).toBe("125.50");
  });

  it("should handle operations CSV with all optional fields", () => {
    const headers = ["monthly_active", "availability", "latency", "failure_rate", "start_date", "end_date"];
    const mapping = analyzeColumnMapping(headers, "operations");

    expect(mapping.ok).toBe(true);
    expect(mapping.missing_required_fields).toHaveLength(0);

    const rows = [
      {
        "monthly_active": "10000",
        "availability": "99.9",
        "latency": "45",
        "failure_rate": "0.1",
        "start_date": "2026-01-01",
        "end_date": "2026-01-31",
      },
    ];

    const result = applyColumnMappings(rows, mapping);

    expect(result.ok).toBe(true);
    expect(result.mapped_rows[0]).toMatchObject({
      active_users: "10000",
      uptime_percentage: "99.9",
      response_time_ms: "45",
      error_rate: "0.1",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
  });
});

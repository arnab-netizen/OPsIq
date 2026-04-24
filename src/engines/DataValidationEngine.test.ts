import { describe, it, expect } from "vitest";
import { DataValidationEngine } from "./DataValidationEngine";
import { BusinessAssessment } from "./contracts";

describe("DataValidationEngine", () => {
  const engine = new DataValidationEngine();

  it("should detect high revenue per customer", async () => {
    const input: BusinessAssessment = {
      businessName: "TestCo",
      businessType: "B2B",
      problemStatement: "Growth challenges",
      mainIssue: "low_sales",
      monthlyRevenue: 100000,
      customerCount: 10,
    };

    const result = await engine.assess(input);

    expect(result.engine).toBe("DataValidation");
    expect(result.signals.some((s) => s.message.includes("unusually high"))).toBe(
      true
    );
  });

  it("should detect low revenue per customer", async () => {
    const input: BusinessAssessment = {
      businessName: "TestCo",
      businessType: "Retail",
      problemStatement: "Pricing issues",
      mainIssue: "low_sales",
      monthlyRevenue: 5000,
      customerCount: 1000,
    };

    const result = await engine.assess(input);

    expect(result.signals.some((s) => s.message.includes("unusually low"))).toBe(
      true
    );
  });

  it("should detect extreme cost overrun", async () => {
    const input: BusinessAssessment = {
      businessName: "Burning",
      businessType: "SaaS",
      problemStatement: "Unsustainable spending",
      mainIssue: "high_costs",
      monthlyRevenue: 20000,
      monthlyCosts: 50000,
    };

    const result = await engine.assess(input);

    expect(result.signals.some((s) => s.severity === "high")).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should report data quality score in metadata", async () => {
    const input: BusinessAssessment = {
      businessName: "TestCo",
      businessType: "Retail",
      problemStatement: "Test issue",
      mainIssue: "low_sales",
      monthlyRevenue: 50000,
      monthlyCosts: 40000,
      customerCount: 100,
    };

    const result = await engine.assess(input);

    expect(result.metadata.dataQualityScore).toBeGreaterThan(0);
    expect(result.metadata.dataQualityScore).toBeLessThanOrEqual(1);
  });

  it("should handle missing financial data gracefully", async () => {
    const input: BusinessAssessment = {
      businessName: "TestCo",
      businessType: "Services",
      problemStatement: "Unknown issue",
      mainIssue: "unclear",
    };

    const result = await engine.assess(input);

    expect(result.engine).toBe("DataValidation");
    expect(result.signals.some((s) => s.message.includes("Limited"))).toBe(true);
  });
});

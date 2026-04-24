import { describe, it, expect } from "vitest";
import { FinancialEngine } from "./FinancialEngine";
import { BusinessAssessment } from "./contracts";

describe("FinancialEngine", () => {
  const engine = new FinancialEngine();

  it("should detect critical severity when costs > 125% revenue", async () => {
    const input: BusinessAssessment = {
      businessName: "LaundryCo",
      businessType: "Laundry Services",
      problemStatement: "Losing money fast",
      mainIssue: "high_costs",
      monthlyRevenue: 50000,
      monthlyCosts: 80000,
    };

    const result = await engine.assess(input);

    const criticalSignal = result.signals.find((s) => s.severity === "critical");
    expect(criticalSignal).toBeDefined();
    expect(criticalSignal?.category).toBe("cost_control");
  });

  it("should detect high severity when costs > revenue but < 125%", async () => {
    const input: BusinessAssessment = {
      businessName: "TestBiz",
      businessType: "Retail",
      problemStatement: "Slight loss",
      mainIssue: "high_costs",
      monthlyRevenue: 100000,
      monthlyCosts: 110000,
    };

    const result = await engine.assess(input);

    const highSignal = result.signals.find((s) => s.severity === "high");
    expect(highSignal).toBeDefined();
    expect(highSignal?.message).toContain("exceed");
  });

  it("should detect low severity when costs < 80% revenue", async () => {
    const input: BusinessAssessment = {
      businessName: "HealthyCo",
      businessType: "Services",
      problemStatement: "Seeking growth",
      mainIssue: "low_sales",
      monthlyRevenue: 100000,
      monthlyCosts: 60000,
    };

    const result = await engine.assess(input);

    const lowSignal = result.signals.find((s) => s.message.includes("healthy"));
    expect(lowSignal).toBeDefined();
    expect(lowSignal?.severity).toBe("low");
  });

  it("should detect customer concentration risk", async () => {
    const input: BusinessAssessment = {
      businessName: "FewCustomers",
      businessType: "B2B",
      problemStatement: "Over-reliant on few clients",
      mainIssue: "customer_retention",
      customerCount: 3,
      monthlyRevenue: 50000,
    };

    const result = await engine.assess(input);

    const concentrationSignal = result.signals.find((s) =>
      s.message.includes("concentration")
    );
    expect(concentrationSignal).toBeDefined();
    expect(concentrationSignal?.severity).toBe("high");
  });

  it("should detect zero customer base as critical", async () => {
    const input: BusinessAssessment = {
      businessName: "NoCustomers",
      businessType: "SaaS",
      problemStatement: "No traction",
      mainIssue: "low_sales",
      customerCount: 0,
      monthlyRevenue: 0,
    };

    const result = await engine.assess(input);

    const criticalSignal = result.signals.find((s) => s.severity === "critical");
    expect(criticalSignal).toBeDefined();
    expect(criticalSignal?.category).toBe("revenue_generation");
  });

  it("should handle missing financial data", async () => {
    const input: BusinessAssessment = {
      businessName: "NoData",
      businessType: "Consulting",
      problemStatement: "Unknown challenges",
      mainIssue: "unclear",
    };

    const result = await engine.assess(input);

    expect(result.signals.some((s) => s.message.includes("Insufficient"))).toBe(
      true
    );
    expect(result.metadata.hasFinancialData).toBe(false);
  });

  it("should calculate revenue per customer metric", async () => {
    const input: BusinessAssessment = {
      businessName: "MetricTest",
      businessType: "E-commerce",
      problemStatement: "Analytics check",
      mainIssue: "low_sales",
      monthlyRevenue: 30000,
      customerCount: 300,
    };

    const result = await engine.assess(input);

    expect(result.metadata.revenuePerCustomer).toBe(100);
  });
});

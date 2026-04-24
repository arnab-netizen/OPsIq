import { describe, it, expect } from "vitest";
import { DiagnosisOrchestrator } from "./DiagnosisOrchestrator";
import { DataValidationEngine } from "./DataValidationEngine";
import { FinancialEngine } from "./FinancialEngine";
import { BusinessAssessment } from "./contracts";

describe("DiagnosisOrchestrator", () => {
  const dataValidationEngine = new DataValidationEngine();
  const financialEngine = new FinancialEngine();
  const orchestrator = new DiagnosisOrchestrator([
    dataValidationEngine,
    financialEngine,
  ]);

  it("should orchestrate critical diagnosis from financial signals", async () => {
    const input: BusinessAssessment = {
      businessName: "LaundryCo",
      businessType: "Laundry Services",
      problemStatement: "Losing money, high electricity costs",
      mainIssue: "high_costs",
      monthlyRevenue: 50000,
      monthlyCosts: 80000,
      customerCount: 10,
    };

    const diagnosis = await orchestrator.orchestrate(input);

    expect(diagnosis.severity).toBe("critical");
    expect(diagnosis.category).toBe("cost_control");
    expect(diagnosis.phase).toBe("triage");
    expect(diagnosis.signals.length).toBeGreaterThan(0);
  });

  it("should synthesize severity from multiple engines", async () => {
    const input: BusinessAssessment = {
      businessName: "TestCo",
      businessType: "Services",
      problemStatement: "Mixed issues",
      mainIssue: "unclear",
      monthlyRevenue: 40000,
      monthlyCosts: 55000,
      customerCount: 5,
    };

    const diagnosis = await orchestrator.orchestrate(input);

    expect(["low", "medium", "high", "critical"]).toContain(diagnosis.severity);
    expect(diagnosis.phase).toBeDefined();
  });

  it("should deduplicate issues from engines", async () => {
    const input: BusinessAssessment = {
      businessName: "IssueCo",
      businessType: "Retail",
      problemStatement: "Cost problems",
      mainIssue: "high_costs",
      monthlyRevenue: 30000,
      monthlyCosts: 60000,
    };

    const diagnosis = await orchestrator.orchestrate(input);

    const issueSet = new Set(diagnosis.issues);
    expect(issueSet.size).toBe(diagnosis.issues.length);
  });

  it("should calculate diagnostic confidence", async () => {
    const input: BusinessAssessment = {
      businessName: "ConfidenceTest",
      businessType: "Tech",
      problemStatement: "Data-rich scenario",
      mainIssue: "low_sales",
      monthlyRevenue: 75000,
      monthlyCosts: 50000,
      customerCount: 150,
    };

    const diagnosis = await orchestrator.orchestrate(input);

    expect(diagnosis.diagnosticConfidence).toBeGreaterThan(0);
    expect(diagnosis.diagnosticConfidence).toBeLessThanOrEqual(1);
  });

  it("should handle sparse data scenario", async () => {
    const input: BusinessAssessment = {
      businessName: "SparseData",
      businessType: "Consulting",
      problemStatement: "Unknown challenges",
      mainIssue: "unclear",
    };

    const diagnosis = await orchestrator.orchestrate(input);

    expect(diagnosis.diagnosticConfidence).toBeLessThan(0.7);
    expect(diagnosis.category).toBe("general_business_recovery");
  });

  it("should map critical severity to triage phase", async () => {
    const input: BusinessAssessment = {
      businessName: "Critical",
      businessType: "Services",
      problemStatement: "Costs exceed revenue",
      mainIssue: "high_costs",
      monthlyRevenue: 50000,
      monthlyCosts: 80000,
    };

    const diagnosis = await orchestrator.orchestrate(input);
    expect(diagnosis.severity).toBe("critical");
    expect(diagnosis.phase).toBe("triage");
  });

  it("should map high severity to stabilization phase", async () => {
    const input: BusinessAssessment = {
      businessName: "High",
      businessType: "Services",
      problemStatement: "Costs slightly exceed revenue",
      mainIssue: "high_costs",
      monthlyRevenue: 50000,
      monthlyCosts: 55000,
    };

    const diagnosis = await orchestrator.orchestrate(input);
    expect(diagnosis.severity).toBe("high");
    expect(diagnosis.phase).toBe("stabilization");
  });

  it("should map medium/low severity to recovery/growth phases", async () => {
    const input: BusinessAssessment = {
      businessName: "Healthy",
      businessType: "Services",
      problemStatement: "Seeking optimization",
      mainIssue: "operations",
      monthlyRevenue: 100000,
      monthlyCosts: 70000,
      customerCount: 100,
    };

    const diagnosis = await orchestrator.orchestrate(input);
    expect(["medium", "low"]).toContain(diagnosis.severity);
    expect(["recovery", "growth"]).toContain(diagnosis.phase);
  });

  it("should include all engine results in output", async () => {
    const input: BusinessAssessment = {
      businessName: "ResultTest",
      businessType: "Manufacturing",
      problemStatement: "Full assessment",
      mainIssue: "operations",
      monthlyRevenue: 100000,
      monthlyCosts: 80000,
      customerCount: 50,
    };

    const diagnosis = await orchestrator.orchestrate(input);

    expect(diagnosis.allEngineResults.length).toBe(2);
    expect(
      diagnosis.allEngineResults.every((r) => r.engine === "DataValidation" || r.engine === "Financial")
    ).toBe(true);
  });
});

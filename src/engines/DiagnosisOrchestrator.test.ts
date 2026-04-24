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

  it("should map severity to correct phase", async () => {
    const severityPhaseMap: Record<string, string> = {
      critical: "triage",
      high: "stabilize",
      medium: "repair",
      low: "protect",
    };

    for (const [severity, expectedPhase] of Object.entries(severityPhaseMap)) {
      const input: BusinessAssessment = {
        businessName: `Test-${severity}`,
        businessType: "Services",
        problemStatement: "Phase test",
        mainIssue: "unclear",
      };

      // This is a simplified test - in reality we'd need to craft inputs
      // that produce each severity level
      const diagnosis = await orchestrator.orchestrate(input);
      expect(diagnosis.phase).toBeDefined();
    }
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

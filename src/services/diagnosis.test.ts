import { describe, it, expect, beforeEach } from "vitest";
import { diagnoseBusiness, validateBusinessProblem, type BusinessProblemInput } from "@/services/diagnosis";
import { ValidationError } from "@/infra/errors";

describe("diagnosis service", () => {
  describe("validateBusinessProblem", () => {
    it("throws ValidationError if businessName is missing", () => {
      const input = {
        businessName: "",
        businessType: "SaaS",
        problemStatement: "Low sales",
        mainIssue: "low_sales",
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("throws ValidationError if problemStatement is missing", () => {
      const input = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "",
        mainIssue: "low_sales",
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("throws ValidationError if mainIssue is invalid", () => {
      const input = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Test",
        mainIssue: "invalid_issue",
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("throws ValidationError if monthlyRevenue is negative", () => {
      const input = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Test",
        mainIssue: "low_sales",
        monthlyRevenue: -1000,
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("throws ValidationError if monthlyCosts is negative", () => {
      const input = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Test",
        mainIssue: "low_sales",
        monthlyCosts: -500,
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("throws ValidationError if customerCount is negative", () => {
      const input = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Test",
        mainIssue: "low_sales",
        customerCount: -1,
      } as BusinessProblemInput;

      expect(() => validateBusinessProblem(input)).toThrow(ValidationError);
    });

    it("passes validation with all required fields", () => {
      const input: BusinessProblemInput = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Low sales",
        mainIssue: "low_sales",
      };

      expect(() => validateBusinessProblem(input)).not.toThrow();
    });

    it("passes validation with optional numeric fields", () => {
      const input: BusinessProblemInput = {
        businessName: "Acme",
        businessType: "SaaS",
        problemStatement: "Low sales",
        mainIssue: "low_sales",
        monthlyRevenue: 50000,
        monthlyCosts: 40000,
        customerCount: 100,
      };

      expect(() => validateBusinessProblem(input)).not.toThrow();
    });
  });

  describe("diagnosis rules - severity calculation", () => {
    it("returns critical severity when costs > 125% of revenue", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Costs exceeding revenue",
        mainIssue: "high_costs",
        monthlyRevenue: 10000,
        monthlyCosts: 12600, // 126% of revenue
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.severity).toBe("critical");
    });

    it("returns high severity when costs > revenue", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Costs exceeding revenue",
        mainIssue: "high_costs",
        monthlyRevenue: 10000,
        monthlyCosts: 11000, // 110% of revenue (> but < 125%)
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.severity).toBe("high");
    });

    it("returns high severity when low_sales with zero customers", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "No customers",
        mainIssue: "low_sales",
        customerCount: 0,
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.severity).toBe("high");
    });

    it("returns high severity when low_sales with no customerCount provided", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "Low sales, unclear customer count",
        mainIssue: "low_sales",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.severity).toBeGreaterThanOrEqual("high" as any); // severity is string but should be high
      expect(["high", "critical"]).toContain(result.severity);
    });

    it("returns medium severity as default when no critical/high conditions met", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Consulting",
        problemStatement: "General growth challenge",
        mainIssue: "unclear",
        monthlyRevenue: 50000,
        monthlyCosts: 40000,
        customerCount: 100,
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.severity).toBe("medium");
    });
  });

  describe("diagnosis rules - phase assignment", () => {
    it("assigns triage phase for critical severity", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Critical cost overrun",
        mainIssue: "high_costs",
        monthlyRevenue: 10000,
        monthlyCosts: 12600,
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.interventionPhase).toBe("triage");
    });

    it("assigns stabilization phase for high severity", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "Cash flow issues",
        mainIssue: "cash_flow",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.interventionPhase).toBe("stabilization");
    });

    it("assigns recovery phase for medium severity", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Consulting",
        problemStatement: "General business challenge",
        mainIssue: "unclear",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.interventionPhase).toBe("recovery");
    });
  });

  describe("diagnosis rules - category mapping", () => {
    it("maps low_sales to revenue_generation category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "Unable to attract customers",
        mainIssue: "low_sales",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("revenue_generation");
    });

    it("maps high_costs to cost_control category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Manufacturing",
        problemStatement: "Costs out of control",
        mainIssue: "high_costs",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("cost_control");
    });

    it("maps cash_flow to cash_flow_stability category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Struggling with cash",
        mainIssue: "cash_flow",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("cash_flow_stability");
    });

    it("maps customer_retention to customer_retention category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "Losing customers",
        mainIssue: "customer_retention",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("customer_retention");
    });

    it("maps operations to operational_efficiency category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Services",
        problemStatement: "Operations are inefficient",
        mainIssue: "operations",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("operational_efficiency");
    });

    it("maps unclear to general_business_recovery category", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Consulting",
        problemStatement: "Multiple issues",
        mainIssue: "unclear",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.primaryProblemCategory).toBe("general_business_recovery");
    });
  });

  describe("diagnosis output structure", () => {
    it("returns complete DiagnosisResult with all required fields", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "SaaS",
        problemStatement: "Low customer acquisition",
        mainIssue: "low_sales",
        monthlyRevenue: 50000,
        monthlyCosts: 40000,
        customerCount: 50,
      };

      const result = await diagnoseBusiness(input, "test-actor");

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("engagementId");
      expect(result).toHaveProperty("input");
      expect(result).toHaveProperty("diagnosisSummary");
      expect(result).toHaveProperty("primaryProblemCategory");
      expect(result).toHaveProperty("severity");
      expect(result).toHaveProperty("interventionPhase");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("recommendations");
      expect(result).toHaveProperty("actionPlan");
      expect(result).toHaveProperty("createdAt");

      expect(result.input).toEqual(input);
      expect(typeof result.diagnosisSummary).toBe("string");
      expect(typeof result.interventionPhase).toBe("string");
    });

    it("returns at least 5 action plan items", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Sales decline",
        mainIssue: "low_sales",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.actionPlan.length).toBeGreaterThanOrEqual(5);
    });

    it("returns action plan items with required fields", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Services",
        problemStatement: "Operational issues",
        mainIssue: "operations",
      };

      const result = await diagnoseBusiness(input, "test-actor");

      result.actionPlan.forEach((action) => {
        expect(action).toHaveProperty("title");
        expect(action).toHaveProperty("description");
        expect(action).toHaveProperty("priority");
        expect(action).toHaveProperty("ownerRole");
        expect(action).toHaveProperty("dueInDays");
        expect(action).toHaveProperty("successMetric");

        expect(typeof action.title).toBe("string");
        expect(typeof action.description).toBe("string");
        expect(["high", "medium", "low"]).toContain(action.priority);
        expect(typeof action.ownerRole).toBe("string");
        expect(typeof action.dueInDays).toBe("number");
        expect(action.dueInDays).toBeGreaterThan(0);
        expect(typeof action.successMetric).toBe("string");
      });
    });

    it("returns findings for all diagnosis categories", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Manufacturing",
        problemStatement: "Excessive spending",
        mainIssue: "high_costs",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.findings.length).toBeGreaterThan(0);

      result.findings.forEach((finding) => {
        expect(finding).toHaveProperty("id");
        expect(finding).toHaveProperty("title");
        expect(finding).toHaveProperty("severity");
        expect(finding).toHaveProperty("description");

        expect(["low", "medium", "high", "critical"]).toContain(finding.severity);
      });
    });

    it("returns recommendations for all diagnosis categories", async () => {
      const input: BusinessProblemInput = {
        businessName: "Test Co",
        businessType: "Retail",
        problemStatement: "Customer churn",
        mainIssue: "customer_retention",
      };

      const result = await diagnoseBusiness(input, "test-actor");
      expect(result.recommendations.length).toBeGreaterThan(0);

      result.recommendations.forEach((rec) => {
        expect(rec).toHaveProperty("id");
        expect(rec).toHaveProperty("title");
        expect(rec).toHaveProperty("priority");
        expect(rec).toHaveProperty("description");

        expect(["low", "medium", "high"]).toContain(rec.priority);
      });
    });
  });

  describe("diagnosis flow - end-to-end", () => {
    it("completes full diagnosis for critical high_costs scenario", async () => {
      const input: BusinessProblemInput = {
        businessName: "Acme Manufacturing",
        businessType: "Manufacturing",
        problemStatement:
          "Production costs have spiraled out of control, exceeding our monthly revenue.",
        mainIssue: "high_costs",
        monthlyRevenue: 100000,
        monthlyCosts: 130000, // 130% - critical
        customerCount: 50,
      };

      const result = await diagnoseBusiness(input, "test-actor");

      expect(result.severity).toBe("critical");
      expect(result.interventionPhase).toBe("triage");
      expect(result.primaryProblemCategory).toBe("cost_control");
      expect(result.actionPlan.length).toBeGreaterThanOrEqual(5);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.engagementId).toBeTruthy();
      expect(new Date(result.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("completes full diagnosis for high severity low_sales with no customers", async () => {
      const input: BusinessProblemInput = {
        businessName: "StartupXYZ",
        businessType: "SaaS",
        problemStatement: "We have built a product but cannot acquire customers.",
        mainIssue: "low_sales",
        monthlyRevenue: 0,
        monthlyCosts: 25000,
        customerCount: 0,
      };

      const result = await diagnoseBusiness(input, "test-actor");

      expect(result.severity).toBe("high");
      expect(result.interventionPhase).toBe("stabilization");
      expect(result.primaryProblemCategory).toBe("revenue_generation");
      expect(result.actionPlan.length).toBeGreaterThanOrEqual(5);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.actionPlan[0]?.priority).toBe("high");
    });
  });

  describe("engine layer - orchestrator influences final diagnosis", () => {
    it("uses orchestrator severity in final diagnosis (critical financial severity)", async () => {
      const input: BusinessProblemInput = {
        businessName: "FinancialTest",
        businessType: "Retail",
        problemStatement: "Costs out of control",
        mainIssue: "unclear", // Not indicating critical, but financial data is critical
        monthlyRevenue: 50000,
        monthlyCosts: 80000, // 160% - critical
      };

      const result = await diagnoseBusiness(input, "test-actor");

      // Engine should override mainIssue and detect critical from financial data
      expect(result.severity).toBe("critical");
      expect(result.interventionPhase).toBe("triage");
      expect(result._engineMetadata?.enginesUsed).toContain("Financial");
    });

    it("uses orchestrator category when engine evidence is strong", async () => {
      const input: BusinessProblemInput = {
        businessName: "CategoryTest",
        businessType: "SaaS",
        problemStatement: "Multiple problems",
        mainIssue: "unclear", // Ambiguous
        monthlyRevenue: 30000,
        monthlyCosts: 60000, // Cost problem is obvious from data
      };

      const result = await diagnoseBusiness(input, "test-actor");

      // Engine evidence overrides unclear mainIssue
      expect(result.primaryProblemCategory).toBe("cost_control");
      expect(result.severity).toBe("critical");
    });

    it("uses canonical intervention phases from orchestrator", async () => {
      const phases: Record<string, string> = {
        critical_case: "triage",
        high_case: "stabilization",
        medium_case: "recovery",
      };

      const criticalInput: BusinessProblemInput = {
        businessName: "Critical",
        businessType: "Services",
        problemStatement: "Critical issue",
        mainIssue: "high_costs",
        monthlyRevenue: 10000,
        monthlyCosts: 13000,
      };

      const result = await diagnoseBusiness(criticalInput, "test-actor");
      expect(result.interventionPhase).toBe("triage");
      expect(["triage", "stabilization", "recovery", "growth"]).toContain(
        result.interventionPhase
      );
    });

    it("stores engine metadata but final diagnosis uses orchestrator output", async () => {
      const input: BusinessProblemInput = {
        businessName: "MetadataTest",
        businessType: "Retail",
        problemStatement: "Cost analysis",
        mainIssue: "high_costs",
        monthlyRevenue: 40000,
        monthlyCosts: 55000,
      };

      const result = await diagnoseBusiness(input, "test-actor");

      // Verify engine metadata exists
      expect(result._engineMetadata).toBeDefined();
      expect(result._engineMetadata?.orchestratedDiagnosis).toBeDefined();
      expect(result._engineMetadata?.enginesUsed.length).toBeGreaterThan(0);

      // Verify FINAL diagnosis uses orchestrator values (not just in metadata)
      expect(result.severity).toBe(
        result._engineMetadata?.orchestratedDiagnosis.severity
      );
      expect(result.interventionPhase).toBe(
        result._engineMetadata?.orchestratedDiagnosis.phase
      );
      expect(result.primaryProblemCategory).toBe(
        result._engineMetadata?.orchestratedDiagnosis.category
      );
    });

    it("mainIssue serves as tiebreaker, not override", async () => {
      const input: BusinessProblemInput = {
        businessName: "TiebreakerTest",
        businessType: "Consulting",
        problemStatement: "Unclear situation",
        mainIssue: "operations", // User guesses operations
        monthlyRevenue: 50000,
        monthlyCosts: 50000, // Balanced - no strong signal
        customerCount: 50, // Reasonable
      };

      const result = await diagnoseBusiness(input, "test-actor");

      // When engines don't provide strong signal, mainIssue can influence
      // But engine data (balanced finances) prevents incorrect severity escalation
      expect(result.severity).not.toBe("critical");
      expect(["low", "medium"]).toContain(result.severity);
    });
  });
});

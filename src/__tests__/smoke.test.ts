import { describe, it, expect, vi } from "vitest";
import { DiagnosisOrchestrator } from "@/engines/DiagnosisOrchestrator";
import { DataValidationEngine } from "@/engines/DataValidationEngine";
import { FinancialEngine } from "@/engines/FinancialEngine";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe("Smoke Test: Critical Path", () => {
  describe("Engine Instantiation", () => {
    it("DataValidationEngine instantiates", () => {
      const engine = new DataValidationEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.assess).toBe("function");
    });

    it("FinancialEngine instantiates", () => {
      const engine = new FinancialEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.assess).toBe("function");
    });

    it("DiagnosisOrchestrator instantiates with engines", () => {
      const engines = [
        new DataValidationEngine(),
        new FinancialEngine(),
      ];
      const orchestrator = new DiagnosisOrchestrator(engines);
      expect(orchestrator).toBeDefined();
      expect(typeof orchestrator.orchestrate).toBe("function");
    });
  });

  describe("Engine Callability", () => {
    it("DataValidationEngine.assess is callable", async () => {
      const engine = new DataValidationEngine();
      const input = {
        businessName: "Test Co",
        businessType: "Tech",
        problemStatement: "Low sales",
        mainIssue: "low_sales",
      };

      const result = await engine.assess(input);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("engine");
      expect(result).toHaveProperty("signals");
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it("FinancialEngine.assess is callable", async () => {
      const engine = new FinancialEngine();
      const input = {
        businessName: "Test Co",
        businessType: "Tech",
        problemStatement: "High costs",
        mainIssue: "high_costs",
        monthlyCosts: 50000,
        monthlyRevenue: 30000,
      };

      const result = await engine.assess(input);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("engine");
      expect(result).toHaveProperty("signals");
      expect(Array.isArray(result.signals)).toBe(true);
    });
  });

  describe("Orchestrator Orchestration", () => {
    it("Orchestrator.orchestrate combines engine outputs", async () => {
      const engines = [
        new DataValidationEngine(),
        new FinancialEngine(),
      ];
      const orchestrator = new DiagnosisOrchestrator(engines);

      const input = {
        businessName: "Test Co",
        businessType: "Tech",
        problemStatement: "Multiple issues",
        mainIssue: "unclear",
        monthlyCosts: 75000,
        monthlyRevenue: 100000,
        customerCount: 25,
      };

      const result = await orchestrator.orchestrate(input);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("severity");
      expect(result).toHaveProperty("category");
      expect(result).toHaveProperty("phase");
      expect(result).toHaveProperty("allEngineResults");
      expect(Array.isArray(result.allEngineResults)).toBe(true);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  executeDecisionThroughControlLayer,
  verifyControlLayerExecution,
  detectDirectRecommendationCall,
  enforceControlLayer,
} from "@/services/control/enforcement";
import { compareScenarios } from "@/services/control/scenario-comparison";

describe("Control Layer Enforcement - Integration Tests", () => {
  const mockScenarios = compareScenarios({
    baselineRevenue: 1000000,
    baselineCost: 500000,
    revenueChange: 100000,
    costChange: 50000,
    confidence: 0.8,
  });

  describe("executeDecisionThroughControlLayer - Full Validation Pipeline", () => {
    it("should block decision when data sufficiency fails", async () => {
      // Test with insufficient patterns to trigger data sufficiency failure
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      const decisionMetrics = {
        confidence: 0.85,
        expectedImpact: 50000,
      };

      const mockPatterns: any[] = []; // Empty patterns - insufficient data
      const mockVariables: any[] = [];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(
        result.violations!.some((v) => v.layer === "data_sufficiency")
      ).toBe(true);
    });

    it("should block decision when dependency validation fails", async () => {
      const inputVariables = {
        revenueChange: 100000,
        // Missing baselineRevenue which revenueChange depends on
      };

      const decisionMetrics = {
        confidence: 0.85,
        expectedImpact: 50000,
      };

      const mockPatterns = [
        { id: "pattern-1", successRate: 0.75, confidence: 0.8 },
        { id: "pattern-2", successRate: 0.8, confidence: 0.8 },
        { id: "pattern-3", successRate: 0.7, confidence: 0.75 },
      ];

      const mockVariables = [];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.some((v) => v.layer === "dependency")).toBe(
        true
      );
    });

    it("should block decision when confidence is below decision gate threshold", async () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      const decisionMetrics = {
        confidence: 0.3, // Below 0.5 gate threshold
        expectedImpact: 50000,
      };

      const mockPatterns = [
        { id: "pattern-1", successRate: 0.75, confidence: 0.8 },
        { id: "pattern-2", successRate: 0.8, confidence: 0.8 },
        { id: "pattern-3", successRate: 0.7, confidence: 0.75 },
      ];

      const mockVariables = [
        { name: "baselineRevenue", confidence: 0.9 },
        { name: "baselineCost", confidence: 0.85 },
      ];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations!.some((v) => v.layer === "decision_gate")).toBe(
        true
      );
    });

    it("should block decision when guardrails constraint is violated", async () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      const decisionMetrics = {
        confidence: 0.85,
        expectedImpact: 500000, // Very high impact
      };

      const mockPatterns = [
        { id: "pattern-1", successRate: 0.75, confidence: 0.8 },
        { id: "pattern-2", successRate: 0.8, confidence: 0.8 },
        { id: "pattern-3", successRate: 0.7, confidence: 0.75 },
      ];

      const mockVariables = [
        { name: "baselineRevenue", confidence: 0.9 },
        { name: "baselineCost", confidence: 0.85 },
      ];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(
        result.violations!.some((v) => v.layer === "guardrails")
      ).toBe(true);
    });
  });

  describe("verifyControlLayerExecution - Bypass Detection", () => {
    it("should reject direct generateRecommendation call", () => {
      const decisionSource = "generateRecommendation(data)";

      const result = verifyControlLayerExecution(decisionSource);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.reason).toBe("CONTROL_LAYER_BYPASS");
    });

    it("should allow recommendation call through control layer", () => {
      const decisionSource = "executeDecisionThroughControlLayer(data)";

      const result = verifyControlLayerExecution(decisionSource);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should detect bypass attempt with generateMultipleRecommendations", () => {
      const decisionSource = "generateMultipleRecommendations(data)";

      const result = verifyControlLayerExecution(decisionSource);

      expect(result.valid).toBe(false);
      expect(result.error!.reason).toBe("CONTROL_LAYER_BYPASS");
    });
  });

  describe("detectDirectRecommendationCall - Function Name Analysis", () => {
    it("should detect generateRecommendation call", () => {
      expect(detectDirectRecommendationCall("generateRecommendation")).toBe(
        true
      );
    });

    it("should detect generateMultipleRecommendations call", () => {
      expect(detectDirectRecommendationCall("generateMultipleRecommendations")).toBe(
        true
      );
    });

    it("should detect runDecisionEngine call", () => {
      expect(detectDirectRecommendationCall("runDecisionEngine")).toBe(true);
    });

    it("should detect createRecommendation call", () => {
      expect(detectDirectRecommendationCall("createRecommendation")).toBe(true);
    });

    it("should allow executeDecisionThroughControlLayer", () => {
      expect(detectDirectRecommendationCall("executeDecisionThroughControlLayer")).toBe(
        false
      );
    });

    it("should allow buildMonetizationDecision", () => {
      expect(detectDirectRecommendationCall("buildMonetizationDecision")).toBe(
        false
      );
    });
  });

  describe("enforceControlLayer - Validation Enforcement", () => {
    it("should pass when all validations executed", () => {
      const decisionPath = "/api/run";
      const executedValidations = [
        "variable_registry",
        "dependency_validation",
        "data_sufficiency",
        "decision_gate",
        "guardrails",
      ];

      expect(() => {
        enforceControlLayer(decisionPath, executedValidations);
      }).not.toThrow();
    });

    it("should throw when dependency_validation missing", () => {
      const decisionPath = "/api/run";
      const executedValidations = [
        "variable_registry",
        "data_sufficiency",
        "decision_gate",
        "guardrails",
      ];

      expect(() => {
        enforceControlLayer(decisionPath, executedValidations);
      }).toThrow();

      try {
        enforceControlLayer(decisionPath, executedValidations);
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.reason).toBe("CONTROL_LAYER_BYPASS");
        expect(e.details.skippedValidations).toContain("dependency_validation");
      }
    });

    it("should throw when multiple validations missing", () => {
      const decisionPath = "/api/run";
      const executedValidations = ["variable_registry"];

      expect(() => {
        enforceControlLayer(decisionPath, executedValidations);
      }).toThrow();

      try {
        enforceControlLayer(decisionPath, executedValidations);
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.details.skippedValidations.length).toBe(4);
      }
    });

    it("should include decision path in error message", () => {
      const decisionPath = "/api/intelligent-recommendations";
      const executedValidations = [];

      try {
        enforceControlLayer(decisionPath, executedValidations);
      } catch (e: any) {
        expect(e.message).toContain(decisionPath);
      }
    });
  });

  describe("Control Layer - No Silent Failures", () => {
    it("should never allow partial validation success", async () => {
      const inputVariables = {
        revenueChange: 100000,
        // Missing baselineRevenue
      };

      const decisionMetrics = {
        confidence: 0.85,
        expectedImpact: 50000,
      };

      const mockPatterns = [
        { id: "pattern-1", successRate: 0.75, confidence: 0.8 },
        { id: "pattern-2", successRate: 0.8, confidence: 0.8 },
        { id: "pattern-3", successRate: 0.7, confidence: 0.75 },
      ];

      const mockVariables = [
        { name: "revenueChange", confidence: 0.85 },
      ];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      // Even if some layers pass, ONE failure blocks the entire decision
      expect(result.allowed).toBe(false);
      expect(result.violations!.length).toBeGreaterThan(0);
    });

    it("should include blockingReason in failed result", async () => {
      const inputVariables = {
        revenueChange: 100000,
      };

      const decisionMetrics = {
        confidence: 0.2,
        expectedImpact: 50000,
      };

      const mockPatterns = [];
      const mockVariables = [];

      const result = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result.allowed).toBe(false);
      expect(result.blockingReason).toBeDefined();
      expect(result.blockingReason).toContain("violation");
    });
  });

  describe("Control Layer - Determinism", () => {
    it("should produce consistent results across multiple executions", async () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      const decisionMetrics = {
        confidence: 0.85,
        expectedImpact: 50000,
      };

      const mockPatterns = [
        { id: "pattern-1", successRate: 0.75, confidence: 0.8 },
        { id: "pattern-2", successRate: 0.8, confidence: 0.8 },
        { id: "pattern-3", successRate: 0.7, confidence: 0.75 },
      ];

      const mockVariables = [
        { name: "baselineRevenue", confidence: 0.9 },
        { name: "baselineCost", confidence: 0.85 },
      ];

      const result1 = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      const result2 = await executeDecisionThroughControlLayer(
        inputVariables,
        decisionMetrics,
        mockPatterns,
        mockVariables
      );

      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.violations).toEqual(result2.violations);
    });
  });
});

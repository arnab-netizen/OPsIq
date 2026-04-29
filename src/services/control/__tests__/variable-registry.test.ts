import { describe, it, expect } from "vitest";
import {
  getVariableRegistry,
  getRequiredVariables,
  getVariablesByType,
  validateRegisteredVariables,
  isVariableRegistered,
  getVariable,
} from "../variable-registry";

describe("Variable Registry - Phase 4 Control 1", () => {
  describe("Registry Definition", () => {
    it("should have all required variables defined", () => {
      const registry = getVariableRegistry();

      expect(registry.baselineRevenue).toBeDefined();
      expect(registry.baselineCost).toBeDefined();
      expect(registry.revenueChange).toBeDefined();
      expect(registry.costChange).toBeDefined();
      expect(registry.confidence).toBeDefined();
    });

    it("should have correct variable types", () => {
      const registry = getVariableRegistry();

      expect(registry.baselineRevenue.type).toBe("financial");
      expect(registry.baselineCost.type).toBe("financial");
      expect(registry.revenueChange.type).toBe("financial");
      expect(registry.costChange.type).toBe("financial");
      expect(registry.confidence.type).toBe("risk");
      expect(registry.dueAt.type).toBe("temporal");
      expect(registry.problemType.type).toBe("operational");
      expect(registry.decisionType.type).toBe("operational");
    });

    it("should mark correct variables as required", () => {
      const required = getRequiredVariables();
      const requiredKeys = required.map((v) => v.key);

      expect(requiredKeys).toContain("baselineRevenue");
      expect(requiredKeys).toContain("baselineCost");
      expect(requiredKeys).toContain("revenueChange");
      expect(requiredKeys).toContain("costChange");
      expect(requiredKeys).toContain("confidence");
      expect(requiredKeys).not.toContain("dueAt");
      expect(requiredKeys).not.toContain("problemType");
      expect(requiredKeys).not.toContain("decisionType");
    });

    it("should have correct min/max constraints", () => {
      const registry = getVariableRegistry();

      expect(registry.confidence.min).toBe(0);
      expect(registry.confidence.max).toBe(1);
      expect(registry.baselineRevenue.min).toBe(0);
      expect(registry.baselineCost.min).toBe(0);
    });
  });

  describe("getRequiredVariables", () => {
    it("should return only required variables", () => {
      const required = getRequiredVariables();
      const allRequired = required.every((v) => v.required === true);

      expect(allRequired).toBe(true);
    });

    it("should be deterministically sorted", () => {
      const required1 = getRequiredVariables();
      const required2 = getRequiredVariables();

      expect(required1.map((v) => v.key)).toEqual(
        required2.map((v) => v.key)
      );
    });

    it("should contain 5 required variables", () => {
      const required = getRequiredVariables();
      expect(required).toHaveLength(5);
    });
  });

  describe("getVariablesByType", () => {
    it("should return only financial variables", () => {
      const financial = getVariablesByType("financial");
      const allFinancial = financial.every((v) => v.type === "financial");

      expect(allFinancial).toBe(true);
      expect(financial.length).toBeGreaterThan(0);
    });

    it("should return only risk variables", () => {
      const risk = getVariablesByType("risk");
      const allRisk = risk.every((v) => v.type === "risk");

      expect(allRisk).toBe(true);
      expect(risk.length).toBe(1); // confidence
    });

    it("should return only temporal variables", () => {
      const temporal = getVariablesByType("temporal");
      const allTemporal = temporal.every((v) => v.type === "temporal");

      expect(allTemporal).toBe(true);
      expect(temporal.length).toBe(1); // dueAt
    });

    it("should return only operational variables", () => {
      const operational = getVariablesByType("operational");
      const allOperational = operational.every((v) => v.type === "operational");

      expect(allOperational).toBe(true);
      expect(operational.length).toBe(2); // problemType, decisionType
    });
  });

  describe("validateRegisteredVariables - Required Detection", () => {
    it("should pass with all required variables", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail if baselineRevenue missing", () => {
      const input = {
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "baselineRevenue")).toBe(
        true
      );
    });

    it("should fail if confidence missing", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "confidence")).toBe(true);
    });

    it("should detect multiple missing required variables", () => {
      const input = {
        baselineRevenue: 1000,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("should reject null for required variable", () => {
      const input = {
        baselineRevenue: null,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "baselineRevenue")).toBe(
        true
      );
    });

    it("should reject undefined for required variable", () => {
      const input = {
        baselineRevenue: undefined,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "baselineRevenue")).toBe(
        true
      );
    });
  });

  describe("validateRegisteredVariables - Unknown Variable Rejection", () => {
    it("should reject unknown variables by default", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        unknownVariable: "should-be-rejected",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "unknownVariable")).toBe(
        true
      );
    });

    it("should allow unknown variables if allowCustom=true", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        customVariable: "should-be-allowed",
      };

      const result = validateRegisteredVariables(input, true);

      expect(result.valid).toBe(true);
      expect(
        result.errors.some((e) => e.variable === "customVariable")
      ).toBe(false);
    });

    it("should reject multiple unknown variables", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        unknown1: "rejected",
        unknown2: "rejected",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("validateRegisteredVariables - Type Validation", () => {
    it("should reject non-numeric financial variables", () => {
      const input = {
        baselineRevenue: "1000",
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "baselineRevenue")).toBe(
        true
      );
    });

    it("should reject non-numeric risk variables", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: "0.75",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "confidence")).toBe(true);
    });

    it("should validate min/max constraints", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 1.5, // > max of 1.0
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "confidence")).toBe(true);
    });

    it("should reject negative financial values", () => {
      const input = {
        baselineRevenue: -1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "baselineRevenue")).toBe(
        true
      );
    });
  });

  describe("validateRegisteredVariables - Dependency Validation", () => {
    it("should pass when dependencies are present", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(true);
    });

    it("should reject if dependency is missing", () => {
      // revenueChange depends on baselineRevenue
      const input = {
        revenueChange: 100,
        baselineCost: 500,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
    });

    it("should validate multiple dependencies", () => {
      const input = {
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.error.includes("Dependency missing"))
      ).toBe(true);
    });
  });

  describe("validateRegisteredVariables - Optional Variables", () => {
    it("should accept input without optional variables", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(true);
    });

    it("should accept input with optional temporal variable", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        dueAt: "2026-05-15T10:30:00Z",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(true);
    });

    it("should accept input with optional operational variables", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        problemType: "revenue_leak",
        decisionType: "approval",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(true);
    });

    it("should validate temporal variable format if present", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
        dueAt: "invalid-date",
      };

      const result = validateRegisteredVariables(input);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "dueAt")).toBe(true);
    });
  });

  describe("validateRegisteredVariables - Edge Cases", () => {
    it("should reject non-object input", () => {
      const result = validateRegisteredVariables(null);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject undefined input", () => {
      const result = validateRegisteredVariables(undefined);

      expect(result.valid).toBe(false);
    });

    it("should handle empty input", () => {
      const result = validateRegisteredVariables({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should be deterministic with same input", () => {
      const input = {
        baselineRevenue: 1000,
        baselineCost: 500,
        revenueChange: 100,
        costChange: 50,
        confidence: 0.75,
      };

      const result1 = validateRegisteredVariables(input);
      const result2 = validateRegisteredVariables(input);

      expect(result1.valid).toBe(result2.valid);
      expect(result1.errors).toEqual(result2.errors);
    });
  });

  describe("isVariableRegistered", () => {
    it("should return true for registered variables", () => {
      expect(isVariableRegistered("baselineRevenue")).toBe(true);
      expect(isVariableRegistered("confidence")).toBe(true);
      expect(isVariableRegistered("dueAt")).toBe(true);
    });

    it("should return false for unregistered variables", () => {
      expect(isVariableRegistered("unknownVariable")).toBe(false);
      expect(isVariableRegistered("customValue")).toBe(false);
    });
  });

  describe("getVariable", () => {
    it("should return variable definition for registered variables", () => {
      const varDef = getVariable("confidence");

      expect(varDef).not.toBeNull();
      expect(varDef?.key).toBe("confidence");
      expect(varDef?.type).toBe("risk");
      expect(varDef?.required).toBe(true);
    });

    it("should return null for unregistered variables", () => {
      const varDef = getVariable("unknownVariable");

      expect(varDef).toBeNull();
    });
  });
});

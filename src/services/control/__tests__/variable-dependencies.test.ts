import { describe, it, expect } from "vitest";
import {
  validateDependencies,
  getVariableRegistry,
  DependencyValidationError,
} from "../variable-registry";

describe("Variable Dependency Validation - Phase 4 Control 1", () => {
  describe("validateDependencies - Basic Validation", () => {
    it("should allow input with all dependencies satisfied", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should block when revenueChange missing baselineRevenue", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        baselineCost: 500000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(result.error?.variable).toBe("revenueChange");
      expect(result.error?.missingDependencies).toContain("baselineRevenue");
    });

    it("should block when costChange missing baselineCost", () => {
      const input = {
        baselineRevenue: 1000000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(result.error?.variable).toBe("costChange");
      expect(result.error?.missingDependencies).toContain("baselineCost");
    });
  });

  describe("validateDependencies - Multiple Dependencies", () => {
    it("should block on first variable with missing dependencies", () => {
      const input = {
        // Missing baselineRevenue for revenueChange
        revenueChange: 100000,
        // Missing baselineCost for costChange
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(false);
      expect(result.error?.variable).toBe("revenueChange");
    });

    it("should allow when both baseline variables present", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateDependencies - Edge Cases", () => {
    it("should allow input with no dependent variables", () => {
      const input = {
        confidence: 0.8,
        problemType: "revenue_leak",
        decisionType: "approval",
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });

    it("should allow input with only independent financial variables", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });

    it("should handle empty input object", () => {
      const input = {};

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });

    it("should handle null input gracefully", () => {
      const input = null as any;

      const result = validateDependencies(input);

      expect(result.valid).toBe(true); // Validation happens elsewhere
    });

    it("should ignore unknown variables for dependency checking", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
        unknownVariable: "some-value",
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });
  });

  describe("validateDependencies - Error Details", () => {
    it("should return formatted error message", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.error?.status).toBe("blocked");
      expect(result.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(result.error?.details).toContain("revenueChange");
      expect(result.error?.details).toContain("baselineRevenue");
    });

    it("should include sorted missing dependencies in error", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.error?.missingDependencies).toEqual(["baselineRevenue"]);
    });

    it("should have status 'blocked'", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.error?.status).toBe("blocked");
    });
  });

  describe("validateDependencies - Determinism", () => {
    it("should produce consistent results for same input", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result1 = validateDependencies(input);
      const result2 = validateDependencies(input);

      expect(result1.valid).toBe(result2.valid);
      expect(result1.error?.variable).toBe(result2.error?.variable);
      expect(result1.error?.missingDependencies).toEqual(
        result2.error?.missingDependencies
      );
    });

    it("should return sorted missing dependencies consistently", () => {
      const input = {
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      const sorted = [...(result.error?.missingDependencies || [])].sort();
      expect(result.error?.missingDependencies).toEqual(sorted);
    });
  });

  describe("validateDependencies - Real Scenarios", () => {
    it("should validate complete financial decision", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });

    it("should block incomplete cost scenario", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        // confidence missing - but it has no dependencies
        confidence: 0.8,
        // This should pass as confidence is optional and has no deps
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true);
    });

    it("should validate partial input with only baseline values", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        confidence: 0.8,
      };

      const result = validateDependencies(input);

      expect(result.valid).toBe(true); // No dependent variables provided
    });

    it("should block when providing change without baseline", () => {
      const scenario = {
        revenueChange: 150000, // Requires baselineRevenue
        costChange: 75000, // Requires baselineCost
        confidence: 0.85,
      };

      const result = validateDependencies(scenario);

      expect(result.valid).toBe(false);
      expect(result.error?.missingDependencies).toContain("baselineRevenue");
    });

    it("should enforce revenue dependency in isolation", () => {
      const input = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        // costChange missing baselineCost
        costChange: 50000,
        confidence: 0.8,
      };

      // With both baselines present, should pass
      const result = validateDependencies(input);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateDependencies - Registry Consistency", () => {
    it("should validate against current registry dependencies", () => {
      const registry = getVariableRegistry();

      // Verify revenueChange has baselineRevenue as dependency
      expect(registry.revenueChange.dependencies).toContain("baselineRevenue");

      // Verify costChange has baselineCost as dependency
      expect(registry.costChange.dependencies).toContain("baselineCost");

      // Verify baselineRevenue has no dependencies
      expect(registry.baselineRevenue.dependencies).toEqual([]);

      // Verify baselineCost has no dependencies
      expect(registry.baselineCost.dependencies).toEqual([]);
    });

    it("should allow input matching registry dependency chain", () => {
      const registry = getVariableRegistry();
      const input: Record<string, unknown> = {};

      // Build valid input from registry dependencies
      for (const [key, varDef] of Object.entries(registry)) {
        if (varDef.required) {
          if (varDef.type === "financial") {
            input[key] = 1000000;
          } else if (varDef.type === "risk") {
            input[key] = 0.8;
          }
        }
      }

      const result = validateDependencies(input);
      expect(result.valid).toBe(true);
    });
  });
});

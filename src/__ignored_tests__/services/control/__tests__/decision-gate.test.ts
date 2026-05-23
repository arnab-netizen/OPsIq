import { describe, it, expect } from "vitest";
import {
  evaluateDecisionGate,
  formatGateResult,
  gateResultToPayload,
} from "../decision-gate";
import type { DecisionGateInput, VariableState } from "../decision-gate";

describe("Decision Gate - Phase 4 Control 3", () => {
  describe("evaluateDecisionGate - Valid Input", () => {
    it("should allow decision with all required variables and high confidence", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.missingVariables).toHaveLength(0);
      expect(result.lowConfidenceVariables).toHaveLength(0);
    });

    it("should allow decision with optional variables", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
          dueAt: "2026-05-15T10:30:00Z",
          problemType: "revenue_leak",
        },
        confidence: 0.85,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(true);
    });
  });

  describe("evaluateDecisionGate - Missing Required Variables", () => {
    it("should block if required variable missing", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          // Missing costChange
          confidence: 0.75,
        },
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
      expect(result.missingVariables).toContain("costChange");
      expect(result.reason).toContain("Missing");
    });

    it("should block if multiple required variables missing", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          // Missing baselineCost, revenueChange, costChange, confidence
        },
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
      expect(result.missingVariables.length).toBeGreaterThan(1);
    });

    it("should return sorted missing variables", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
        },
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      const sorted = [...result.missingVariables].sort();
      expect(result.missingVariables).toEqual(sorted);
    });
  });

  describe("evaluateDecisionGate - Low Confidence Variables", () => {
    it("should block if variable confidence < 0.5", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.3, // Low confidence
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        variableStates: states,
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
      expect(result.lowConfidenceVariables).toContain("baselineRevenue");
    });

    it("should block if overall confidence < 0.5", () => {
      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.2,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.4,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.3,
          complete: true,
        },
      ];

      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        variableStates: states,
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
      expect(result.overallConfidence).toBeLessThan(0.5);
    });
  });

  describe("evaluateDecisionGate - User Confidence", () => {
    it("should block if user confidence < 0.5", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        confidence: 0.3, // Low user confidence
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("User confidence");
    });

    it("should block if user confidence invalid", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        confidence: 1.5, // Invalid: > 1.0
      };

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
    });

    it("should allow if user confidence exactly at threshold", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        confidence: 0.5, // Exactly at threshold
      };

      const result = evaluateDecisionGate(input);

      // Should be allowed if all other conditions met
      expect(result.allowed).toBe(true);
    });
  });

  describe("evaluateDecisionGate - Unknown Variables", () => {
    it("should warn on unknown variables but still allow if all required present and confident", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
          unknownVariable: "some-value",
        },
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      // Unknown variables are warnings but don't block if all other conditions met
      expect(result.allowed).toBe(true);
      expect(result.warnings.some((w) => w.includes("Unknown"))).toBe(true);
    });
  });

  describe("evaluateDecisionGate - Staleness Enforcement", () => {
    it("should BLOCK on stale variables (fail-closed)", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const states: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.9,
          complete: true,
          freshnessAt: thirtyOneDaysAgo,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.8,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        variableStates: states,
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      // Stale variables should cause blocking, not just warnings
      expect(result.allowed).toBe(false);
      expect(result.staleVariables.length).toBeGreaterThan(0);
      expect(result.staleVariables).toContain("baselineRevenue");
      expect(result.reason).toContain("Stale variables");
    });
  });

  describe("evaluateDecisionGate - Input Validation", () => {
    it("should reject non-object input", () => {
      const result = evaluateDecisionGate(null as unknown);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid input");
    });

    it("should reject input without variables object", () => {
      const input = {
        confidence: 0.8,
      } as unknown as DecisionGateInput;

      const result = evaluateDecisionGate(input);

      expect(result.allowed).toBe(false);
    });
  });

  describe("evaluateDecisionGate - Determinism", () => {
    it("should produce consistent results for same input", () => {
      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        confidence: 0.8,
      };

      const result1 = evaluateDecisionGate(input);
      const result2 = evaluateDecisionGate(input);

      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.overallConfidence).toBe(result2.overallConfidence);
      expect(result1.missingVariables).toEqual(result2.missingVariables);
      expect(result1.lowConfidenceVariables).toEqual(result2.lowConfidenceVariables);
    });

    it("should return sorted arrays for determinism", () => {
      const states: VariableState[] = [
        {
          key: "costChange",
          value: 50,
          source: "computed",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "baselineRevenue",
          value: 1000,
          source: "user_input",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500,
          source: "database",
          confidence: 0.95,
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100,
          source: "computed",
          confidence: 0.3,
          complete: true,
        },
        {
          key: "confidence",
          value: 0.75,
          source: "user_input",
          confidence: 0.85,
          complete: true,
        },
      ];

      const input: DecisionGateInput = {
        variables: {
          baselineRevenue: 1000,
          baselineCost: 500,
          revenueChange: 100,
          costChange: 50,
          confidence: 0.75,
        },
        variableStates: states,
        confidence: 0.8,
      };

      const result = evaluateDecisionGate(input);

      const lowConfSorted = [...result.lowConfidenceVariables].sort();
      expect(result.lowConfidenceVariables).toEqual(lowConfSorted);
    });
  });

  describe("formatGateResult", () => {
    it("should format allowed result", () => {
      const result = {
        allowed: true,
        missingVariables: [],
        lowConfidenceVariables: [],
        warnings: [],
        overallConfidence: 0.85,
      };

      const message = formatGateResult(result);

      expect(message).toContain("allowed");
      expect(message).toContain("0.85");
    });

    it("should format blocked result with reason", () => {
      const result = {
        allowed: false,
        reason: "Missing required variables: baselineCost",
        missingVariables: ["baselineCost"],
        lowConfidenceVariables: [],
        warnings: [],
        overallConfidence: 0.9,
      };

      const message = formatGateResult(result);

      expect(message).toContain("blocked");
      expect(message).toContain("Missing required variables");
    });

    it("should format blocked result with low confidence", () => {
      const result = {
        allowed: false,
        reason: undefined,
        missingVariables: [],
        lowConfidenceVariables: ["baselineRevenue", "baselineCost"],
        warnings: [],
        overallConfidence: 0.3,
      };

      const message = formatGateResult(result);

      expect(message).toContain("Low confidence");
      expect(message).toContain("baselineRevenue");
    });
  });

  describe("gateResultToPayload", () => {
    it("should convert allowed result to payload", () => {
      const result = {
        allowed: true,
        missingVariables: [],
        lowConfidenceVariables: [],
        warnings: [],
        overallConfidence: 0.85,
      };

      const payload = gateResultToPayload(result);

      expect(payload.blocked).toBe(false);
      expect(payload.overallConfidence).toBe(0.85);
      expect(payload.missingVariables).toEqual([]);
    });

    it("should convert blocked result to payload", () => {
      const result = {
        allowed: false,
        reason: "Missing required variables",
        missingVariables: ["baselineCost"],
        lowConfidenceVariables: ["baselineRevenue"],
        warnings: ["Some warning"],
        overallConfidence: 0.3,
      };

      const payload = gateResultToPayload(result);

      expect(payload.blocked).toBe(true);
      expect(payload.reason).toBe("Missing required variables");
      expect((payload.missingVariables as string[]).length).toBe(1);
    });
  });
});

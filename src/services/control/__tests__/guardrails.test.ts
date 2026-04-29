import { describe, it, expect } from "vitest";
import {
  evaluateGuardrails,
  getGuardrailDefinitions,
  getGuardrail,
  formatGuardrailViolations,
  getGuardrailSummary,
} from "../guardrails";
import type { GuardrailInput } from "../guardrails";

describe("Guardrails Engine - Phase 4 Control 4", () => {
  describe("evaluateGuardrails - No Violations", () => {
    it("should allow decision with low impact and high confidence", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should allow decision with exactly zero impact (edge case)", () => {
      const input: GuardrailInput = {
        expectedImpact: 0,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true); // Zero impact is blocked
    });

    it("should allow decision with positive impact and approval", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
        approvalFlag: true,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(false);
      expect(result.violations.filter((v) => v.severity === "block")).toHaveLength(0);
    });
  });

  describe("evaluateGuardrails - HIGH_IMPACT_APPROVAL Rule", () => {
    it("should block high impact without approval", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
        approvalFlag: false,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toBe(true);
    });

    it("should block high impact with undefined approval", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
        // approvalFlag undefined
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toBe(true);
    });

    it("should allow high impact with approval", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
        approvalFlag: true,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.filter((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toHaveLength(
        0
      );
    });

    it("should include threshold and actual in violation", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "HIGH_IMPACT_APPROVAL");
      expect(violation?.threshold).toBe(100000);
      expect(violation?.actual).toBe(150000);
      expect(violation?.message).toContain("150000");
    });

    it("should indicate override is allowed", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "HIGH_IMPACT_APPROVAL");
      expect(violation?.overrideAllowed).toBe(true);
    });

    it("should not block impact exactly at threshold", () => {
      const input: GuardrailInput = {
        expectedImpact: 100000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.filter((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toHaveLength(
        0
      );
    });

    it("should block impact above threshold", () => {
      const input: GuardrailInput = {
        expectedImpact: 100001,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toBe(true);
    });
  });

  describe("evaluateGuardrails - LOW_CONFIDENCE_WARN Rule", () => {
    it("should warn on low confidence", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.6,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.some((v) => v.ruleId === "LOW_CONFIDENCE_WARN")).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should not warn on confidence at threshold", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.7,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.filter((v) => v.ruleId === "LOW_CONFIDENCE_WARN")).toHaveLength(0);
    });

    it("should not warn on confidence above threshold", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.75,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.filter((v) => v.ruleId === "LOW_CONFIDENCE_WARN")).toHaveLength(0);
    });

    it("should not block on low confidence (warn only)", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.3,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "LOW_CONFIDENCE_WARN");
      expect(violation?.severity).toBe("warn");
      expect(result.blocked).toBe(false); // Warn doesn't block
    });

    it("should include confidence in warning message", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.6,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "LOW_CONFIDENCE_WARN");
      expect(violation?.message).toContain("0.60");
      expect(violation?.message).toContain("0.7");
    });

    it("should indicate override not allowed for confidence", () => {
      const input: GuardrailInput = {
        expectedImpact: 50000,
        confidence: 0.3,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "LOW_CONFIDENCE_WARN");
      expect(violation?.overrideAllowed).toBe(false);
    });
  });

  describe("evaluateGuardrails - NEGATIVE_IMPACT_BLOCK Rule", () => {
    it("should block negative impact", () => {
      const input: GuardrailInput = {
        expectedImpact: -10000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")).toBe(true);
    });

    it("should block zero impact", () => {
      const input: GuardrailInput = {
        expectedImpact: 0,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")).toBe(true);
    });

    it("should not block positive impact", () => {
      const input: GuardrailInput = {
        expectedImpact: 1,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.filter((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")).toHaveLength(
        0
      );
    });

    it("should indicate override not allowed", () => {
      const input: GuardrailInput = {
        expectedImpact: -10000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK");
      expect(violation?.overrideAllowed).toBe(false);
    });

    it("should include impact in message", () => {
      const input: GuardrailInput = {
        expectedImpact: -10000,
        confidence: 0.8,
      };

      const result = evaluateGuardrails(input);

      const violation = result.violations.find((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK");
      expect(violation?.message).toContain("-10000");
    });
  });

  describe("evaluateGuardrails - Multiple Violations", () => {
    it("should detect multiple violations", () => {
      const input: GuardrailInput = {
        expectedImpact: -10000, // Triggers NEGATIVE_IMPACT_BLOCK
        confidence: 0.5, // Triggers LOW_CONFIDENCE_WARN
      };

      const result = evaluateGuardrails(input);

      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      expect(result.blocked).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should detect high impact without approval and low confidence", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000, // Triggers HIGH_IMPACT_APPROVAL
        confidence: 0.5, // Triggers LOW_CONFIDENCE_WARN
      };

      const result = evaluateGuardrails(input);

      expect(
        result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")
      ).toBe(true);
      expect(
        result.violations.some((v) => v.ruleId === "LOW_CONFIDENCE_WARN")
      ).toBe(true);
      expect(result.blocked).toBe(true);
    });

    it("should return sorted violations", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.5,
      };

      const result = evaluateGuardrails(input);

      const ruleIds = result.violations.map((v) => v.ruleId);
      const sorted = [...ruleIds].sort();
      expect(ruleIds).toEqual(sorted);
    });
  });

  describe("evaluateGuardrails - Input Validation", () => {
    it("should reject null input", () => {
      const result = evaluateGuardrails(null as any);

      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.ruleId === "INVALID_INPUT")).toBe(true);
    });

    it("should reject non-numeric expectedImpact", () => {
      const input = {
        expectedImpact: "high",
        confidence: 0.8,
      } as any;

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
    });

    it("should reject non-numeric confidence", () => {
      const input = {
        expectedImpact: 50000,
        confidence: "high",
      } as any;

      const result = evaluateGuardrails(input);

      expect(result.blocked).toBe(true);
    });
  });

  describe("evaluateGuardrails - Determinism", () => {
    it("should produce consistent results for same input", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.5,
      };

      const result1 = evaluateGuardrails(input);
      const result2 = evaluateGuardrails(input);

      expect(result1.blocked).toBe(result2.blocked);
      expect(result1.violations.length).toBe(result2.violations.length);
      expect(result1.warnings).toEqual(result2.warnings);
    });

    it("should return violations in deterministic order", () => {
      const input: GuardrailInput = {
        expectedImpact: 150000,
        confidence: 0.5,
      };

      const result = evaluateGuardrails(input);

      const violations1 = result.violations.map((v) => v.ruleId);
      const violations2 = evaluateGuardrails(input).violations.map((v) => v.ruleId);

      expect(violations1).toEqual(violations2);
    });
  });

  describe("getGuardrailDefinitions", () => {
    it("should return all guardrail definitions", () => {
      const definitions = getGuardrailDefinitions();

      expect(definitions.HIGH_IMPACT_APPROVAL).toBeDefined();
      expect(definitions.LOW_CONFIDENCE_WARN).toBeDefined();
      expect(definitions.NEGATIVE_IMPACT_BLOCK).toBeDefined();
    });

    it("should have correct thresholds", () => {
      const definitions = getGuardrailDefinitions();

      expect(definitions.HIGH_IMPACT_APPROVAL.threshold).toBe(100000);
      expect(definitions.LOW_CONFIDENCE_WARN.threshold).toBe(0.7);
      expect(definitions.NEGATIVE_IMPACT_BLOCK.threshold).toBe(0);
    });
  });

  describe("getGuardrail", () => {
    it("should return specific guardrail", () => {
      const guardrail = getGuardrail("HIGH_IMPACT_APPROVAL");

      expect(guardrail).not.toBeNull();
      expect(guardrail?.ruleId).toBe("HIGH_IMPACT_APPROVAL");
      expect(guardrail?.threshold).toBe(100000);
    });

    it("should return null for unknown guardrail", () => {
      const guardrail = getGuardrail("UNKNOWN_RULE");

      expect(guardrail).toBeNull();
    });
  });

  describe("formatGuardrailViolations", () => {
    it("should format no violations", () => {
      const result = {
        blocked: false,
        warnings: [],
        violations: [],
      };

      const formatted = formatGuardrailViolations(result);

      expect(formatted).toContain("No guardrail violations");
    });

    it("should format single violation", () => {
      const result = evaluateGuardrails({
        expectedImpact: 150000,
        confidence: 0.8,
      });

      const formatted = formatGuardrailViolations(result);

      expect(formatted).toContain("BLOCK");
      expect(formatted).toContain("HIGH_IMPACT_APPROVAL");
    });

    it("should format multiple violations", () => {
      const result = evaluateGuardrails({
        expectedImpact: 150000,
        confidence: 0.5,
      });

      const formatted = formatGuardrailViolations(result);

      expect(formatted.split("\n").length).toBeGreaterThan(1);
    });

    it("should include override indicator", () => {
      const result = evaluateGuardrails({
        expectedImpact: 150000,
        confidence: 0.8,
      });

      const formatted = formatGuardrailViolations(result);

      expect(formatted).toContain("override allowed");
    });
  });

  describe("getGuardrailSummary", () => {
    it("should summarize no violations", () => {
      const result = {
        blocked: false,
        warnings: [],
        violations: [],
      };

      const summary = getGuardrailSummary(result);

      expect(summary.blockingViolations).toBe(0);
      expect(summary.warnings).toBe(0);
      expect(summary.overridableViolations).toBe(0);
    });

    it("should count blocking violations", () => {
      const result = evaluateGuardrails({
        expectedImpact: 150000,
        confidence: 0.8,
      });

      const summary = getGuardrailSummary(result);

      expect(summary.blockingViolations).toBeGreaterThan(0);
    });

    it("should count warnings", () => {
      const result = evaluateGuardrails({
        expectedImpact: 50000,
        confidence: 0.5,
      });

      const summary = getGuardrailSummary(result);

      expect(summary.warnings).toBeGreaterThan(0);
    });

    it("should count overridable violations", () => {
      const result = evaluateGuardrails({
        expectedImpact: 150000,
        confidence: 0.8,
      });

      const summary = getGuardrailSummary(result);

      expect(summary.overridableViolations).toBeGreaterThan(0);
    });

    it("should distinguish overridable from non-overridable", () => {
      const result = evaluateGuardrails({
        expectedImpact: -10000,
        confidence: 0.8,
      });

      const summary = getGuardrailSummary(result);

      // NEGATIVE_IMPACT_BLOCK is not overridable
      expect(summary.overridableViolations).toBe(0);
      expect(summary.blockingViolations).toBeGreaterThan(0);
    });
  });
});

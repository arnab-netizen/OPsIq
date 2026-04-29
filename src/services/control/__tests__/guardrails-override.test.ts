/**
 * GUARDRAILS OVERRIDE TEST: NEGATIVE_IMPACT_BLOCK Enforcement
 *
 * Tests guardrails override mechanism:
 * - Rule: NEGATIVE_IMPACT_BLOCK (blocks expectedImpact <= 0)
 * - Status: NOT overridable (overrideAllowed: false)
 *
 * Scenarios:
 * 1. Negative impact, override=false → BLOCK (rule not overridable)
 * 2. Negative impact, override=true → BLOCK (rule STILL not overridable)
 * 3. Positive impact, override=false → ALLOW (no violation)
 * 4. Positive impact, override=true → ALLOW (no violation to override)
 *
 * If system:
 * - Silently allows negative impact → FAIL SYSTEM
 * - Skips rule checking → FAIL SYSTEM
 * - Allows override when overrideAllowed=false → FAIL SYSTEM
 */

import { describe, it, expect } from "vitest";
import {
  evaluateGuardrails,
  formatGuardrailViolations,
  getGuardrailDefinitions,
  getGuardrailSummary,
  type GuardrailInput,
} from "@/services/control/guardrails";

describe("CRITICAL: Guardrails Override - NEGATIVE_IMPACT_BLOCK", () => {
  describe("Rule Definition Verification", () => {
    it("should define NEGATIVE_IMPACT_BLOCK rule as non-overridable", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("RULE DEFINITION: NEGATIVE_IMPACT_BLOCK");
      console.log("════════════════════════════════════════════════════════════");

      const guardrails = getGuardrailDefinitions();
      const rule = guardrails["NEGATIVE_IMPACT_BLOCK"];

      console.log("\nRule Configuration:");
      console.log(`  ruleId: ${rule.ruleId}`);
      console.log(`  description: ${rule.description}`);
      console.log(`  threshold: ${rule.threshold}`);
      console.log(`  severity: ${rule.severity}`);
      console.log(`  overrideAllowed: ${rule.overrideAllowed}`);
      console.log("");
      console.log("Blocking Condition:");
      console.log(`  expectedImpact <= ${rule.threshold} → BLOCKED`);
      console.log("");
      console.log("Override Capability:");
      console.log(`  overrideAllowed: ${rule.overrideAllowed}`);
      if (!rule.overrideAllowed) {
        console.log("  Status: ❌ CANNOT be overridden");
        console.log("  Impact: This rule is absolute - no exceptions allowed");
      }

      expect(rule.ruleId).toBe("NEGATIVE_IMPACT_BLOCK");
      expect(rule.threshold).toBe(0);
      expect(rule.severity).toBe("block");
      expect(rule.overrideAllowed).toBe(false);

      console.log("\n✅ Rule properly defined as non-overridable");
    });
  });

  describe("Scenario 1: Negative Impact (expectedImpact = -100), override=false", () => {
    it("should BLOCK negative impact decision", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SCENARIO 1: Negative Impact, Override Not Requested");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: -100, // NEGATIVE!
        confidence: 0.85,
        approvalFlag: false, // Not requesting override
      };

      console.log("\nInput:");
      console.log(`  expectedImpact: ${input.expectedImpact}`);
      console.log(`  confidence: ${input.confidence}`);
      console.log(`  approvalFlag: ${input.approvalFlag}`);
      console.log("");
      console.log("Expected: BLOCKED");
      console.log("Reason: Negative impact violates NEGATIVE_IMPACT_BLOCK rule");

      const result = evaluateGuardrails(input);

      console.log("\nResult:");
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  violations: ${result.violations.length}`);
      result.violations.forEach((v) => {
        console.log(`    - ${v.ruleId}: ${v.message}`);
        console.log(`      overrideAllowed: ${v.overrideAllowed}`);
      });

      expect(result.blocked).toBe(true);
      expect(
        result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")
      ).toBe(true);

      const negativeBlockViolation = result.violations.find(
        (v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK"
      );
      expect(negativeBlockViolation?.overrideAllowed).toBe(false);

      console.log("\n✅ BLOCKED: Negative impact properly rejected");
    });
  });

  describe("Scenario 2: Negative Impact (expectedImpact = -100), override=true", () => {
    it("should STILL BLOCK negative impact even with override attempt", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SCENARIO 2: Negative Impact, Override Requested");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: -100, // NEGATIVE!
        confidence: 0.85,
        approvalFlag: true, // ATTEMPTING OVERRIDE!
      };

      console.log("\nInput:");
      console.log(`  expectedImpact: ${input.expectedImpact}`);
      console.log(`  confidence: ${input.confidence}`);
      console.log(`  approvalFlag: ${input.approvalFlag} ← ATTEMPTING OVERRIDE`);
      console.log("");
      console.log("Key Question:");
      console.log("  Can NEGATIVE_IMPACT_BLOCK be overridden?");
      console.log("  Answer: NO - overrideAllowed: false");
      console.log("");
      console.log("Expected: STILL BLOCKED");
      console.log("Reason: Rule is non-overridable (overrideAllowed: false)");

      const result = evaluateGuardrails(input);

      console.log("\nResult:");
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  violations: ${result.violations.length}`);
      result.violations.forEach((v) => {
        console.log(`    - ${v.ruleId}: ${v.message}`);
        console.log(`      overrideAllowed: ${v.overrideAllowed}`);
      });

      expect(result.blocked).toBe(true);
      expect(
        result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")
      ).toBe(true);

      const negativeBlockViolation = result.violations.find(
        (v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK"
      );
      expect(negativeBlockViolation?.overrideAllowed).toBe(false);

      if (result.blocked && !negativeBlockViolation?.overrideAllowed) {
        console.log("\n✅ BLOCKED: Override not allowed for NEGATIVE_IMPACT_BLOCK");
        console.log("   approvalFlag=true was IGNORED (as expected)");
        console.log("   Rule enforced absolutely");
      } else {
        console.log("\n❌ CRITICAL FAILURE:");
        console.log("   Override was allowed for non-overridable rule!");
      }
    });
  });

  describe("Scenario 3: Zero Impact (expectedImpact = 0), override=false", () => {
    it("should BLOCK zero impact (boundary condition)", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SCENARIO 3: Zero Impact (Boundary), Override Not Requested");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: 0, // ZERO - at threshold!
        confidence: 0.85,
        approvalFlag: false,
      };

      console.log("\nInput:");
      console.log(`  expectedImpact: ${input.expectedImpact}`);
      console.log(`  confidence: ${input.confidence}`);
      console.log("  Note: expectedImpact <= 0 → BLOCKED");
      console.log("");
      console.log("Expected: BLOCKED");
      console.log("Reason: Zero impact violates 'positive impact required' rule");

      const result = evaluateGuardrails(input);

      console.log("\nResult:");
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  violations: ${result.violations.length}`);

      expect(result.blocked).toBe(true);
      expect(
        result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")
      ).toBe(true);

      console.log("\n✅ BLOCKED: Zero impact properly rejected at boundary");
    });
  });

  describe("Scenario 4: Positive Impact (expectedImpact = 100), override=false", () => {
    it("should ALLOW positive impact without override", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SCENARIO 4: Positive Impact, Override Not Requested");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: 100, // POSITIVE
        confidence: 0.85,
        approvalFlag: false,
      };

      console.log("\nInput:");
      console.log(`  expectedImpact: ${input.expectedImpact}`);
      console.log(`  confidence: ${input.confidence}`);
      console.log("  Note: expectedImpact > 0 → ALLOWED (no NEGATIVE_IMPACT_BLOCK)");
      console.log("");
      console.log("Expected: ALLOWED");
      console.log("Reason: Positive impact satisfies NEGATIVE_IMPACT_BLOCK rule");

      const result = evaluateGuardrails(input);

      console.log("\nResult:");
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  violations (NEGATIVE_IMPACT_BLOCK): ${result.violations.filter((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK").length}`);

      expect(result.blocked).toBe(false);
      expect(
        result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")
      ).toBe(false);

      console.log("\n✅ ALLOWED: Positive impact passes NEGATIVE_IMPACT_BLOCK rule");
    });
  });

  describe("Scenario 5: Positive Impact (expectedImpact = 100), override=true", () => {
    it("should ALLOW positive impact (no override needed)", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SCENARIO 5: Positive Impact, Override Requested (Unnecessary)");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: 100, // POSITIVE
        confidence: 0.85,
        approvalFlag: true, // Override flag set (but not needed)
      };

      console.log("\nInput:");
      console.log(`  expectedImpact: ${input.expectedImpact}`);
      console.log(`  confidence: ${input.confidence}`);
      console.log(`  approvalFlag: ${input.approvalFlag} ← Set but not needed`);
      console.log("");
      console.log("Expected: ALLOWED");
      console.log("Reason: No rule violations, approval flag doesn't affect result");

      const result = evaluateGuardrails(input);

      console.log("\nResult:");
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  violations: ${result.violations.length}`);

      expect(result.blocked).toBe(false);

      console.log("\n✅ ALLOWED: No rule violations to override");
    });
  });

  describe("Override Mechanism Verification", () => {
    it("should document which rules allow overrides", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("OVERRIDE CAPABILITY MATRIX");
      console.log("════════════════════════════════════════════════════════════");

      const guardrails = getGuardrailDefinitions();

      console.log("\nGuardrail Rules:");
      console.log("");
      Object.entries(guardrails).forEach(([key, rule]) => {
        const overrideStatus = rule.overrideAllowed
          ? "✅ CAN BE OVERRIDDEN"
          : "❌ CANNOT be overridden";
        console.log(`${rule.ruleId}:`);
        console.log(`  Description: ${rule.description}`);
        console.log(`  Severity: ${rule.severity}`);
        console.log(`  Override Allowed: ${overrideStatus}`);
        console.log("");
      });

      // Verify NEGATIVE_IMPACT_BLOCK is non-overridable
      const negativeBlockRule =
        guardrails["NEGATIVE_IMPACT_BLOCK"];
      expect(negativeBlockRule.overrideAllowed).toBe(false);

      console.log("Key Finding:");
      console.log("  NEGATIVE_IMPACT_BLOCK: Cannot be overridden");
      console.log("  Implications:");
      console.log("    - approvalFlag has no effect on this rule");
      console.log("    - Negative/zero impact decisions are always blocked");
      console.log("    - No exceptions or fallbacks allowed");
    });

    it("should enforce non-overridable rules strictly", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("STRICT ENFORCEMENT: Non-Overridable Rules");
      console.log("════════════════════════════════════════════════════════════");

      const testCases = [
        {
          name: "Negative impact, no override",
          expectedImpact: -50,
          approvalFlag: false,
          shouldBlock: true,
        },
        {
          name: "Negative impact, with override",
          expectedImpact: -50,
          approvalFlag: true,
          shouldBlock: true,
        },
        {
          name: "Zero impact, no override",
          expectedImpact: 0,
          approvalFlag: false,
          shouldBlock: true,
        },
        {
          name: "Zero impact, with override",
          expectedImpact: 0,
          approvalFlag: true,
          shouldBlock: true,
        },
        {
          name: "Slight positive impact, no override",
          expectedImpact: 1,
          approvalFlag: false,
          shouldBlock: false,
        },
      ];

      console.log("\nTest Matrix:");
      console.log("");

      let allCorrect = true;
      testCases.forEach((testCase) => {
        const result = evaluateGuardrails({
          expectedImpact: testCase.expectedImpact,
          confidence: 0.85,
          approvalFlag: testCase.approvalFlag,
        });

        const actual = result.blocked;
        const expected = testCase.shouldBlock;
        const status = actual === expected ? "✅" : "❌";

        console.log(`${status} ${testCase.name}`);
        console.log(`    expectedImpact: ${testCase.expectedImpact}`);
        console.log(`    approvalFlag: ${testCase.approvalFlag}`);
        console.log(`    expected: ${expected ? "BLOCKED" : "ALLOWED"}`);
        console.log(`    actual: ${actual ? "BLOCKED" : "ALLOWED"}`);

        if (actual !== expected) {
          allCorrect = false;
          console.log(`    ⚠️  MISMATCH`);
        }
        console.log("");
      });

      if (allCorrect) {
        console.log("✅ All enforcement checks passed");
      } else {
        console.log("❌ Some enforcement checks failed");
      }

      expect(allCorrect).toBe(true);
    });
  });

  describe("System Integrity Checks", () => {
    it("should NOT silently allow negative impact", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("INTEGRITY CHECK: No Silent Allows");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: -1000,
        confidence: 0.95,
        approvalFlag: true,
      };

      console.log("\nInput: expectedImpact = -1000 (clearly negative)");
      const result = evaluateGuardrails(input);

      console.log("\nVerification:");
      console.log(`  1. blocked: ${result.blocked}`);
      console.log(`  2. NEGATIVE_IMPACT_BLOCK violation present: ${result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")}`);

      if (!result.blocked) {
        console.log("\n❌ CRITICAL FAILURE: Negative impact was silently allowed!");
      } else {
        console.log(
          "\n✅ PASS: Negative impact properly blocked (no silent allow)"
        );
      }

      expect(result.blocked).toBe(true);
    });

    it("should NOT skip rule checking", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("INTEGRITY CHECK: Rule Checking Not Skipped");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: -50,
        confidence: 0.8,
        approvalFlag: false,
      };

      console.log("\nInput: expectedImpact = -50");
      const result = evaluateGuardrails(input);

      console.log("\nVerification:");
      console.log(`  Violations detected: ${result.violations.length}`);
      console.log(`  NEGATIVE_IMPACT_BLOCK checked: ${result.violations.some((v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK")}`);

      if (result.violations.length === 0) {
        console.log("\n❌ CRITICAL FAILURE: Rule checking was skipped!");
      } else {
        console.log("\n✅ PASS: Rule checking executed (violations detected)");
      }

      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should provide explicit override status for each violation", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TRANSPARENCY CHECK: Explicit Override Status");
      console.log("════════════════════════════════════════════════════════════");

      const input: GuardrailInput = {
        expectedImpact: -100,
        confidence: 0.85,
        approvalFlag: true,
      };

      const result = evaluateGuardrails(input);

      console.log("\nViolations Detected:");
      result.violations.forEach((v) => {
        const status = v.overrideAllowed ? "CAN" : "CANNOT";
        console.log(`  ${v.ruleId}: ${status} be overridden`);
      });

      // Each violation must have explicit overrideAllowed field
      expect(result.violations.every((v) => v.overrideAllowed !== undefined)).toBe(
        true
      );

      // NEGATIVE_IMPACT_BLOCK must explicitly say it cannot be overridden
      const negBlockViolation = result.violations.find(
        (v) => v.ruleId === "NEGATIVE_IMPACT_BLOCK"
      );
      expect(negBlockViolation?.overrideAllowed).toBe(false);

      console.log("\n✅ PASS: Override status explicitly defined for all violations");
    });
  });
});

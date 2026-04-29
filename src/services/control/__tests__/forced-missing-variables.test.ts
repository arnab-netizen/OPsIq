/**
 * FORCED DECISION TEST: Missing Required Variables
 *
 * Direct trace through control layers with intentionally broken inputs
 */

import { describe, it, expect } from "vitest";
import { validateDependencies } from "@/services/control/variable-registry";
import { evaluateDecisionGate } from "@/services/control/decision-gate";

describe("FORCED TEST: Decision with Missing Variables", () => {
  describe("ATTACK #1: Missing baselineRevenue (required for revenueChange)", () => {
    it("should BLOCK at dependency validation layer", () => {
      // Simulate inputMetrics with revenueChange but missing baselineRevenue
      const inputVariables = {
        baselineCost: 500000,
        revenueChange: 100000, // ← Depends on baselineRevenue which is MISSING!
        costChange: 50000,
        confidence: 0.85,
      };

      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TEST: Missing baselineRevenue");
      console.log("════════════════════════════════════════════════════════════");
      console.log("Input variables:", JSON.stringify(inputVariables, null, 2));
      console.log("\nExpected: validateDependencies() blocks with error");
      console.log("Reason: revenueChange depends on baselineRevenue (missing)");

      // TRACE LAYER 1: Variable dependency validation
      const depValidation = validateDependencies(inputVariables);

      console.log("\n─── LAYER 1: Dependency Validation ───");
      console.log("Function: validateDependencies()");
      console.log("Result:", depValidation);

      if (!depValidation.valid && depValidation.error) {
        console.log("\n✓ BLOCKED at dependency layer");
        console.log("  Status:", depValidation.error.status);
        console.log("  Reason:", depValidation.error.reason);
        console.log("  Variable:", depValidation.error.variable);
        console.log("  Missing:", depValidation.error.missingDependencies);
        console.log("  Details:", depValidation.error.details);
      } else {
        console.log(
          "\n✗ ERROR: Should have been blocked! Dependency validation passed."
        );
      }

      // Assert: MUST be blocked
      expect(depValidation.valid).toBe(false);
      expect(depValidation.error?.status).toBe("blocked");
      expect(depValidation.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(depValidation.error?.variable).toBe("revenueChange");
      expect(depValidation.error?.missingDependencies).toContain(
        "baselineRevenue"
      );
    });
  });

  describe("ATTACK #2: Missing baselineCost (required for costChange)", () => {
    it("should BLOCK at dependency validation layer", () => {
      // Simulate inputMetrics with costChange but missing baselineCost
      const inputVariables = {
        baselineRevenue: 1000000,
        revenueChange: 100000,
        costChange: 50000, // ← Depends on baselineCost which is MISSING!
        confidence: 0.85,
      };

      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TEST: Missing baselineCost");
      console.log("════════════════════════════════════════════════════════════");
      console.log("Input variables:", JSON.stringify(inputVariables, null, 2));
      console.log("\nExpected: validateDependencies() blocks with error");
      console.log("Reason: costChange depends on baselineCost (missing)");

      // TRACE LAYER 1: Variable dependency validation
      const depValidation = validateDependencies(inputVariables);

      console.log("\n─── LAYER 1: Dependency Validation ───");
      console.log("Function: validateDependencies()");
      console.log("Result:", depValidation);

      if (!depValidation.valid && depValidation.error) {
        console.log("\n✓ BLOCKED at dependency layer");
        console.log("  Status:", depValidation.error.status);
        console.log("  Reason:", depValidation.error.reason);
        console.log("  Variable:", depValidation.error.variable);
        console.log("  Missing:", depValidation.error.missingDependencies);
        console.log("  Details:", depValidation.error.details);
      } else {
        console.log(
          "\n✗ ERROR: Should have been blocked! Dependency validation passed."
        );
      }

      // Assert: MUST be blocked
      expect(depValidation.valid).toBe(false);
      expect(depValidation.error?.status).toBe("blocked");
      expect(depValidation.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(depValidation.error?.variable).toBe("costChange");
      expect(depValidation.error?.missingDependencies).toContain(
        "baselineCost"
      );
    });
  });

  describe("ATTACK #3: Missing BOTH baselineRevenue and baselineCost", () => {
    it("should BLOCK at dependency validation layer (first violation)", () => {
      // Simulate inputMetrics with both changes but missing both baselines
      const inputVariables = {
        revenueChange: 100000, // ← Depends on baselineRevenue (MISSING)
        costChange: 50000, // ← Depends on baselineCost (MISSING)
        confidence: 0.85,
      };

      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TEST: Missing BOTH baselineRevenue and baselineCost");
      console.log("════════════════════════════════════════════════════════════");
      console.log("Input variables:", JSON.stringify(inputVariables, null, 2));
      console.log(
        "\nExpected: validateDependencies() blocks on FIRST missing dependency"
      );
      console.log("Note: Will block on whichever variable is encountered first");

      // TRACE LAYER 1: Variable dependency validation
      const depValidation = validateDependencies(inputVariables);

      console.log("\n─── LAYER 1: Dependency Validation ───");
      console.log("Function: validateDependencies()");
      console.log("Result:", depValidation);

      if (!depValidation.valid && depValidation.error) {
        console.log("\n✓ BLOCKED at dependency layer");
        console.log("  Status:", depValidation.error.status);
        console.log("  Reason:", depValidation.error.reason);
        console.log("  Variable:", depValidation.error.variable);
        console.log("  Missing:", depValidation.error.missingDependencies);
        console.log("  Details:", depValidation.error.details);
      } else {
        console.log(
          "\n✗ ERROR: Should have been blocked! Dependency validation passed."
        );
      }

      // Assert: MUST be blocked on at least one missing dependency
      expect(depValidation.valid).toBe(false);
      expect(depValidation.error?.status).toBe("blocked");
      expect(depValidation.error?.reason).toBe("DEPENDENCY_MISSING");
      expect(depValidation.error?.missingDependencies.length).toBeGreaterThan(
        0
      );
    });
  });

  describe("ATTACK #4: Low confidence (0.3) should fail at decision gate", () => {
    it("should PASS dependency validation but BLOCK at decision gate", () => {
      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.3, // ← Below 0.5 gate threshold
      };

      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TEST: Low Confidence (0.3 < 0.5 threshold)");
      console.log("════════════════════════════════════════════════════════════");
      console.log("Input variables:", JSON.stringify(inputVariables, null, 2));
      console.log("\nExpected sequence:");
      console.log("  1. Dependency validation: PASS (all dependencies present)");
      console.log("  2. Decision gate: BLOCK (confidence < 0.5)");

      // TRACE LAYER 1: Variable dependency validation
      const depValidation = validateDependencies(inputVariables);

      console.log("\n─── LAYER 1: Dependency Validation ───");
      console.log("Function: validateDependencies()");
      console.log("Result: valid =", depValidation.valid);

      expect(depValidation.valid).toBe(true);
      console.log("✓ Passed - all dependencies present");

      // TRACE LAYER 2: Decision gate
      const gateResult = evaluateDecisionGate({
        variables: inputVariables,
        confidence: inputVariables.confidence,
      });

      console.log("\n─── LAYER 2: Decision Gate ───");
      console.log("Function: evaluateDecisionGate()");
      console.log("Result:", {
        allowed: gateResult.allowed,
        reason: gateResult.reason,
        overallConfidence: gateResult.overallConfidence,
      });

      if (!gateResult.allowed) {
        console.log("\n✓ BLOCKED at decision gate");
        console.log("  Reason:", gateResult.reason);
        console.log("  Overall Confidence:", gateResult.overallConfidence);
      } else {
        console.log("\n✗ ERROR: Should have been blocked by gate!");
      }

      // Assert: MUST be blocked at gate
      expect(gateResult.allowed).toBe(false);
      expect(gateResult.reason).toBeDefined();
    });
  });

  describe("CONTROL FLOW VERIFICATION", () => {
    it("should trace complete block path for missing variables", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("CONTROL FLOW: Complete Decision Block Path");
      console.log("════════════════════════════════════════════════════════════");

      const testCases = [
        {
          name: "Missing baselineRevenue",
          input: {
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
            confidence: 0.85,
          },
          expectedBlock: "LAYER 1: Dependency Validation",
          expectedError: "DEPENDENCY_MISSING",
        },
        {
          name: "Missing baselineCost",
          input: {
            baselineRevenue: 1000000,
            revenueChange: 100000,
            costChange: 50000,
            confidence: 0.85,
          },
          expectedBlock: "LAYER 1: Dependency Validation",
          expectedError: "DEPENDENCY_MISSING",
        },
        {
          name: "Low confidence",
          input: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
            confidence: 0.3,
          },
          expectedBlock: "LAYER 2: Decision Gate",
          expectedError: "Low confidence",
        },
      ];

      testCases.forEach((testCase) => {
        console.log(`\n  Test: ${testCase.name}`);

        const depVal = validateDependencies(testCase.input);
        if (!depVal.valid) {
          console.log(
            `    ✓ Blocked at ${testCase.expectedBlock} (${depVal.error?.reason})`
          );
          expect(depVal.error?.reason).toBe(testCase.expectedError);
        } else {
          const gateVal = evaluateDecisionGate({
            variables: testCase.input,
            confidence: testCase.input.confidence,
          });
          if (!gateVal.allowed) {
            console.log(
              `    ✓ Blocked at ${testCase.expectedBlock} (${gateVal.reason})`
            );
            expect(gateVal.allowed).toBe(false);
          } else {
            console.log(`    ✗ ERROR: Should have been blocked!`);
            expect(true).toBe(false);
          }
        }
      });

      console.log("\n─── SUMMARY ───");
      console.log("✓ All attacks blocked at appropriate control layers");
      console.log("✓ System properly enforces dependency validation");
      console.log("✓ System properly enforces decision gate thresholds");
    });
  });
});

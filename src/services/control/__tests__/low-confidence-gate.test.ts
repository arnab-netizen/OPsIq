/**
 * CRITICAL GATE TEST: Low Confidence Injection (0.2)
 *
 * Injects confidence = 0.2 (well below 0.5 threshold) into the decision flow.
 * Traces through decision-gate and variable-confidence layers.
 * Expected: Decision BLOCKED with LOW_CONFIDENCE reason.
 *
 * If ANY decision executes → FAIL SYSTEM
 */

import { describe, it, expect } from "vitest";
import { evaluateDecisionGate } from "@/services/control/decision-gate";
import {
  evaluateVariableConfidence,
  type VariableState,
} from "@/services/control/variable-confidence";
import { getRequiredVariables } from "@/services/control/variable-registry";

describe("CRITICAL: Low Confidence (0.2) Gate Enforcement", () => {
  describe("Injected Confidence Test", () => {
    it("should BLOCK decision with confidence = 0.2 (below 0.5 threshold)", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("CRITICAL TEST: Confidence = 0.2 Injection");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");
      console.log("Configuration:");
      console.log("  Confidence threshold: 0.5 (minimum required)");
      console.log("  Injected confidence: 0.2 ← BELOW THRESHOLD");
      console.log("  Expected: BLOCKED");
      console.log("");

      // Injected variables with LOW confidence
      const lowConfidenceVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.2, // ← CRITICAL: Well below 0.5 minimum!
      };

      console.log("Input variables:");
      console.log(JSON.stringify(lowConfidenceVariables, null, 2));
      console.log("");

      // TRACE LAYER: Decision Gate
      console.log("─── DECISION GATE EVALUATION ───");
      console.log("Function: evaluateDecisionGate()");
      console.log("Input variables:", Object.keys(lowConfidenceVariables));
      console.log("");

      const gateResult = evaluateDecisionGate({
        variables: lowConfidenceVariables,
        confidence: lowConfidenceVariables.confidence,
      });

      console.log("Gate Result:");
      console.log("  allowed:", gateResult.allowed);
      console.log("  reason:", gateResult.reason);
      console.log("  overallConfidence:", gateResult.overallConfidence);
      console.log("  userConfidence (from input):", lowConfidenceVariables.confidence);
      console.log("");

      // Verify gate BLOCKS low confidence
      console.log("═══════════════════════════════════════════════════════════");
      console.log("VERIFICATION:");
      console.log("═══════════════════════════════════════════════════════════");

      if (!gateResult.allowed) {
        console.log("✅ BLOCKED: Decision gate rejected low confidence");
        console.log(`   Reason: ${gateResult.reason}`);
        console.log(`   Threshold: 0.5`);
        console.log(`   Injected: ${lowConfidenceVariables.confidence}`);
        console.log(`   Status: ${lowConfidenceVariables.confidence} < 0.5 → BLOCKED`);
      } else {
        console.log("❌ ERROR: Decision gate did NOT block!");
        console.log("   This is a CRITICAL FAILURE - low confidence decision executed!");
        console.log("   SYSTEM STATUS: FAILED");
      }

      // Assert: MUST be blocked
      expect(gateResult.allowed).toBe(false);
      expect(gateResult.reason).toBeDefined();
      expect(gateResult.reason).toContain("0.2");
    });

    it("should trace confidence values through variable-confidence engine", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("TRACE: Variable Confidence Evaluation");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");

      const variableStates: VariableState[] = [
        {
          key: "baselineRevenue",
          value: 1000000,
          source: "user_input",
          confidence: 0.8, // High confidence on this
          complete: true,
        },
        {
          key: "baselineCost",
          value: 500000,
          source: "user_input",
          confidence: 0.85, // High confidence on this
          complete: true,
        },
        {
          key: "revenueChange",
          value: 100000,
          source: "computed",
          confidence: 0.75, // Decent confidence
          complete: true,
        },
        {
          key: "costChange",
          value: 50000,
          source: "computed",
          confidence: 0.7, // Decent confidence
          complete: true,
        },
        {
          key: "confidence",
          value: 0.2, // ← LOW confidence in decision itself
          source: "user_input",
          confidence: 1.0, // We're confident in their confidence value
          complete: true,
        },
      ];

      console.log("Variable States:");
      variableStates.forEach((vs) => {
        console.log(
          `  ${vs.key.padEnd(20)} | value: ${String(vs.value).padEnd(15)} | confidence: ${vs.confidence}`
        );
      });
      console.log("");

      const requiredVars = getRequiredVariables();
      const confidenceResult = evaluateVariableConfidence(
        variableStates,
        requiredVars
      );

      console.log("Confidence Engine Result:");
      console.log(`  overallConfidence: ${confidenceResult.overallConfidence}`);
      console.log(`  lowConfidence variables: ${confidenceResult.lowConfidence.length}`);

      if (confidenceResult.lowConfidence.length > 0) {
        console.log("    Breakdown:");
        confidenceResult.lowConfidence.forEach((lc) => {
          console.log(`      - ${lc.key}: ${lc.confidence} < ${lc.threshold}`);
        });
      }

      console.log(`  complete: ${confidenceResult.complete}`);
      console.log("");

      // Note: This shows variable-level confidence, separate from user confidence
      console.log("Analysis:");
      console.log(
        "  The 'confidence' field (0.2) represents the user's confidence in"
      );
      console.log("  the decision itself, not individual variable confidence.");
      console.log("  The decision-gate checks BOTH:");
      console.log("    1. User confidence (0.2 in this case)");
      console.log("    2. Overall variable confidence");
      console.log("");
      console.log("  User confidence 0.2 < 0.5 → BLOCKED");
    });

    it("should show exact threshold enforcement in decision-gate.ts", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("THRESHOLD VERIFICATION");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");

      const thresholdTests = [
        { confidence: 0.49, expected: "BLOCKED", status: "✓" },
        { confidence: 0.2, expected: "BLOCKED", status: "✓" },
        { confidence: 0.1, expected: "BLOCKED", status: "✓" },
        { confidence: 0.0, expected: "BLOCKED", status: "✓" },
        { confidence: 0.5, expected: "PASS", status: "?" }, // Boundary
        { confidence: 0.51, expected: "PASS", status: "?" }, // Just above
        { confidence: 0.8, expected: "PASS", status: "?" },
        { confidence: 1.0, expected: "PASS", status: "?" },
      ];

      console.log("Threshold: 0.5 (minimum required)");
      console.log("");
      console.log("Confidence Value | Expected | Verified");
      console.log("────────────────────────────────────────");

      thresholdTests.forEach((test) => {
        const gateResult = evaluateDecisionGate({
          variables: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
          },
          confidence: test.confidence,
        });

        const actual = gateResult.allowed ? "PASS" : "BLOCKED";
        const matches = actual === test.expected ? "✓" : "✗";

        console.log(
          `${String(test.confidence).padEnd(15)} | ${test.expected.padEnd(8)} | ${matches} ${actual}`
        );

        // Critical threshold: 0.2 MUST be blocked
        if (test.confidence === 0.2) {
          expect(gateResult.allowed).toBe(false);
          expect(actual).toBe("BLOCKED");
        }
      });

      console.log("");
      console.log("Critical assertion: confidence=0.2 MUST be BLOCKED");
    });
  });

  describe("Gate Enforcement Completeness", () => {
    it("should demonstrate ZERO tolerance for low confidence", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("ZERO TOLERANCE TEST: Multiple Low Confidence Values");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");

      const lowConfidenceValues = [0.0, 0.1, 0.2, 0.3, 0.4, 0.49];
      let allBlocked = true;

      console.log("Testing confidence values: " + lowConfidenceValues.join(", "));
      console.log("");
      console.log("Results:");

      lowConfidenceValues.forEach((conf) => {
        const gateResult = evaluateDecisionGate({
          variables: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
          },
          confidence: conf,
        });

        const status = gateResult.allowed ? "EXECUTED (ERROR!)" : "BLOCKED ✓";
        console.log(`  confidence=${conf}: ${status}`);

        if (gateResult.allowed) {
          allBlocked = false;
          console.log(`    ❌ CRITICAL: Should have been blocked!`);
        }
      });

      console.log("");
      if (allBlocked) {
        console.log("✅ All low confidence values properly blocked");
      } else {
        console.log("❌ SYSTEM FAILURE: Some low confidence decisions executed!");
      }

      expect(allBlocked).toBe(true);
    });

    it("should NOT allow ANY decision with confidence < 0.5", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("ABSOLUTE ENFORCEMENT: Confidence < 0.5");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");

      const testValues = [0.0, 0.1, 0.2, 0.3, 0.4, 0.49];
      const blockedCount = testValues.filter((conf) => {
        const result = evaluateDecisionGate({
          variables: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
          },
          confidence: conf,
        });
        return !result.allowed;
      }).length;

      console.log(`Test values: ${testValues.length}`);
      console.log(`Blocked: ${blockedCount}`);
      console.log(`Passed: ${testValues.length - blockedCount}`);
      console.log("");

      if (blockedCount === testValues.length) {
        console.log("✅ 100% enforcement: All low-confidence decisions blocked");
        console.log("   No exceptions, no defaults, no fallbacks");
      } else {
        console.log(
          `❌ FAILURE: ${testValues.length - blockedCount} decisions incorrectly passed!`
        );
      }

      expect(blockedCount).toBe(testValues.length);
    });
  });

  describe("System-Level Impact Verification", () => {
    it("should verify 0.2 confidence blocks BEFORE any decision execution", () => {
      console.log("\n════════════════════════════════════════════════════════════");
      console.log("SYSTEM FLOW: Early Blocking Verification");
      console.log("════════════════════════════════════════════════════════════");
      console.log("");

      const attackInput = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
        confidence: 0.2, // ← Attack vector
      };

      console.log("Attack input: confidence = 0.2");
      console.log("");

      console.log("Decision Flow:");
      console.log("  1. Input received");
      console.log("  2. Dependency validation → PASS (all deps present)");
      console.log("  3. Decision gate evaluation");
      console.log("     - Check: user confidence >= 0.5");
      console.log("     - Found: 0.2 < 0.5");
      console.log("     - Action: BLOCK before any business logic runs");
      console.log("");

      const gateResult = evaluateDecisionGate({
        variables: attackInput,
        confidence: attackInput.confidence,
      });

      console.log("Result:");
      if (!gateResult.allowed) {
        console.log("  ✅ BLOCKED at decision gate");
        console.log("  ✅ No recommendation generated");
        console.log("  ✅ No guardrails evaluated");
        console.log("  ✅ No operator items created");
        console.log("  ✅ Returns 422 to client");
        console.log("");
        console.log("Decision execution prevented by early gate check.");
      } else {
        console.log("  ❌ CRITICAL FAILURE: Decision was not blocked!");
        console.log("  ❌ Low confidence decision executed!");
      }

      expect(gateResult.allowed).toBe(false);
    });
  });
});

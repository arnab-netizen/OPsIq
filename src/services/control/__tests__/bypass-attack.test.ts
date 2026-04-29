/**
 * SECURITY AUDIT: Control Layer Bypass Attack Simulation
 *
 * This test attempts to exploit identified bypass paths in:
 * - /api/intelligence/recommendations/route.ts
 * - /api/intelligence/summary/route.ts
 *
 * These routes call generateRecommendation() WITHOUT:
 * - validateDependencies()
 * - evaluateDecisionGate()
 * - evaluateGuardrails()
 * - enforceControlLayer()
 *
 * Expected: All attacks MUST FAIL with blocked recommendations
 */

import { describe, it, expect } from "vitest";
import { generateRecommendation, generateMultipleRecommendations } from "@/services/intelligence/recommendation";

describe("SECURITY AUDIT: Control Layer Bypass Attacks", () => {
  describe("Attack #1: Direct recommendation call with missing variables", () => {
    it("should fail when calling generateRecommendation directly with missing baselineRevenue", () => {
      const decisionResult = {
        decision: "APPROVED" as const,
        workspaceId: "test-workspace",
        ownerUserId: "user-1",
        createdBy: "user-1",
        lastUpdatedBy: "user-1",
        expectedImpact: 100000,
        confidence: 0.85,
        explanation: {
          summary: "Test decision",
          drivers: [],
          assumptions: [],
          risks: [],
          missingData: ["baselineRevenue"],
          calculationTrace: {
            baselineRevenue: 0,
            baselineCost: 0,
            revenueChange: 0,
            costChange: 0,
            netImpact: 0,
            formula: "",
          },
        },
      };

      const inputVariables = {
        // MISSING: baselineRevenue (required for revenueChange)
        revenueChange: 50000, // This depends on baselineRevenue!
        costChange: 25000,
      };

      const patterns = [
        {
          id: "pattern-1",
          problemType: "revenue_decline",
          successRate: 0.75,
          confidence: 0.8,
          frequency: 5,
          basedOnItems: [],
        },
      ];

      const operatorItems: any[] = [];

      // This call should either:
      // 1. Fail because missing dependencies not checked
      // 2. Return blocked recommendation
      const result = generateRecommendation(
        decisionResult,
        patterns,
        operatorItems,
        inputVariables
      );

      // If recommendation is returned, it should be marked as blocked
      if (result) {
        expect(result.blocked || result.blockReason).toBeTruthy();
      }
    });

    it("should fail when calling generateRecommendation directly with missing baselineCost", () => {
      const decisionResult = {
        decision: "APPROVED" as const,
        workspaceId: "test-workspace",
        ownerUserId: "user-1",
        createdBy: "user-1",
        lastUpdatedBy: "user-1",
        expectedImpact: 100000,
        confidence: 0.85,
        explanation: {
          summary: "Test decision",
          drivers: [],
          assumptions: [],
          risks: [],
          missingData: ["baselineCost"],
          calculationTrace: {
            baselineRevenue: 0,
            baselineCost: 0,
            revenueChange: 0,
            costChange: 0,
            netImpact: 0,
            formula: "",
          },
        },
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        // MISSING: baselineCost (required for costChange)
        costChange: 50000, // This depends on baselineCost!
      };

      const patterns = [
        {
          id: "pattern-1",
          problemType: "cost_reduction",
          successRate: 0.7,
          confidence: 0.75,
          frequency: 3,
          basedOnItems: [],
        },
      ];

      const operatorItems: any[] = [];

      const result = generateRecommendation(
        decisionResult,
        patterns,
        operatorItems,
        inputVariables
      );

      // Should be blocked
      if (result) {
        expect(result.blocked || result.blockReason).toBeTruthy();
      }
    });

    it("should fail when confidence is below gate threshold (0.5)", () => {
      const decisionResult = {
        decision: "APPROVED" as const,
        workspaceId: "test-workspace",
        ownerUserId: "user-1",
        createdBy: "user-1",
        lastUpdatedBy: "user-1",
        expectedImpact: 100000,
        confidence: 0.3, // BELOW 0.5 gate threshold
        explanation: {
          summary: "Test decision",
          drivers: [],
          assumptions: [],
          risks: [],
          missingData: [],
          calculationTrace: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
            netImpact: 50000,
            formula: "",
          },
        },
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      const patterns = [
        {
          id: "pattern-1",
          problemType: "strategy_change",
          successRate: 0.3,
          confidence: 0.3,
          frequency: 1,
          basedOnItems: [],
        },
      ];

      const operatorItems: any[] = [];

      const result = generateRecommendation(
        decisionResult,
        patterns,
        operatorItems,
        inputVariables
      );

      // Should be blocked due to low confidence
      if (result) {
        expect(result.blocked || result.blockReason).toBeTruthy();
      }
    });
  });

  describe("Attack #2: Direct call to generateMultipleRecommendations without gate", () => {
    it("should fail when calling generateMultipleRecommendations with insufficient patterns", () => {
      const decisionResult = {
        decision: "APPROVED" as const,
        workspaceId: "test-workspace",
        ownerUserId: "user-1",
        createdBy: "user-1",
        lastUpdatedBy: "user-1",
        expectedImpact: 100000,
        confidence: 0.85,
        explanation: {
          summary: "Test decision",
          drivers: [],
          assumptions: [],
          risks: [],
          missingData: [],
          calculationTrace: {
            baselineRevenue: 1000000,
            baselineCost: 500000,
            revenueChange: 100000,
            costChange: 50000,
            netImpact: 50000,
            formula: "",
          },
        },
      };

      const inputVariables = {
        baselineRevenue: 1000000,
        baselineCost: 500000,
        revenueChange: 100000,
        costChange: 50000,
      };

      // Only 1 pattern - data insufficiency should block
      const patterns = [
        {
          id: "pattern-1",
          problemType: "cost_optimization",
          successRate: 0.75,
          confidence: 0.8,
          frequency: 5,
          basedOnItems: [],
        },
      ];

      const operatorItems: any[] = [];

      const results = generateMultipleRecommendations(
        decisionResult,
        patterns,
        operatorItems,
        inputVariables
      );

      // Should return no recommendations or blocked recommendations
      results.forEach((rec) => {
        if (rec) {
          expect(rec.blocked || rec.blockReason).toBeTruthy();
        }
      });
    });

    it("should fail when calling generateMultipleRecommendations with missing variables", () => {
      const decisionResult = {
        decision: "APPROVED" as const,
        workspaceId: "test-workspace",
        ownerUserId: "user-1",
        createdBy: "user-1",
        lastUpdatedBy: "user-1",
        expectedImpact: 100000,
        confidence: 0.85,
        explanation: {
          summary: "Test decision",
          drivers: [],
          assumptions: [],
          risks: [],
          missingData: ["baselineRevenue"],
          calculationTrace: {
            baselineRevenue: 0,
            baselineCost: 0,
            revenueChange: 0,
            costChange: 0,
            netImpact: 0,
            formula: "",
          },
        },
      };

      const inputVariables = {
        // MISSING: baselineRevenue
        revenueChange: 100000,
        costChange: 50000,
      };

      const patterns = [
        {
          id: "pattern-1",
          problemType: "efficiency",
          successRate: 0.75,
          confidence: 0.8,
          frequency: 5,
          basedOnItems: [],
        },
        {
          id: "pattern-2",
          problemType: "efficiency",
          successRate: 0.7,
          confidence: 0.75,
          frequency: 3,
          basedOnItems: [],
        },
        {
          id: "pattern-3",
          problemType: "efficiency",
          successRate: 0.65,
          confidence: 0.7,
          frequency: 2,
          basedOnItems: [],
        },
      ];

      const operatorItems: any[] = [];

      const results = generateMultipleRecommendations(
        decisionResult,
        patterns,
        operatorItems,
        inputVariables
      );

      // All recommendations should be blocked
      results.forEach((rec) => {
        if (rec) {
          expect(rec.blocked || rec.blockReason).toBeTruthy();
        }
      });
    });
  });

  describe("Attack #3: API endpoint bypass detection", () => {
    it("CRITICAL: /api/intelligence/recommendations calls generateRecommendation WITHOUT decision-gate", () => {
      // This test documents the vulnerability:
      // File: src/app/api/intelligence/recommendations/route.ts
      // Lines: 144-149
      // Issue: generateRecommendation() called without:
      //   - validateDependencies()
      //   - evaluateDecisionGate()
      //   - evaluateGuardrails()
      //   - enforceControlLayer()

      const vulnerabilityPath =
        "src/app/api/intelligence/recommendations/route.ts:144-149";
      const missingValidations = [
        "validateDependencies",
        "evaluateDecisionGate",
        "evaluateGuardrails",
        "enforceControlLayer",
      ];

      // This test FAILS the system security audit
      expect.hasAssertions();
      console.error(`
╔════════════════════════════════════════════════════════════════╗
║          CRITICAL SECURITY VULNERABILITY DETECTED              ║
╚════════════════════════════════════════════════════════════════╝

VULNERABILITY: ${vulnerabilityPath}

Missing control layers:
  ${missingValidations.map((v) => `✗ ${v}`).join("\n  ")}

EXPLOIT: Recommendation logic can be executed by querying /api/intelligence/recommendations
         with any decisionId, bypassing ALL control layer enforcement.

IMPACT: HIGH - Governance failure, control layer bypass, data integrity risk

REMEDIATION REQUIRED:
  1. Add evaluateDecisionGate() before generateRecommendation()
  2. Add validateDependencies() before generateRecommendation()
  3. Add enforceControlLayer() after generateRecommendation()
  4. Wrap with executeDecisionThroughControlLayer()

STATUS: SYSTEM SECURITY AUDIT FAILED ✗
      `);
    });

    it("CRITICAL: /api/intelligence/summary calls generateRecommendation WITHOUT decision-gate", () => {
      // File: src/app/api/intelligence/summary/route.ts
      // Lines: 144-149
      // Same vulnerability as recommendations route

      const vulnerabilityPath = "src/app/api/intelligence/summary/route.ts:144-149";

      console.error(`
╔════════════════════════════════════════════════════════════════╗
║          CRITICAL SECURITY VULNERABILITY DETECTED              ║
╚════════════════════════════════════════════════════════════════╝

VULNERABILITY: ${vulnerabilityPath}

This endpoint ALSO calls generateRecommendation() without control layer enforcement.

STATUS: DUPLICATE VULNERABILITY ✗
      `);
    });
  });
});

/**
 * B18-S1: Adversarial Test Suite — Unit Tests
 *
 * Tests verify:
 * - All 11 adversarial cases are well-formed and validate
 * - Case execution is deterministic
 * - Result evaluation correctly identifies pass/fail
 * - System behavior is correct under adversarial conditions
 */

import { describe, it, expect } from "vitest";
import {
  createAllAdversarialCases,
  getCaseById,
  getCaseByType,
  evaluateAdversarialCase,
} from "@/services/benchmark/adversarial-evaluator.service";
import {
  validateAdversarialCase,
  type AdversarialCaseRunResult,
} from "@/domain/benchmark/adversarial-case";

describe("B18-S1: Adversarial Test Suite", () => {
  describe("Case Creation and Validation", () => {
    it("should create all 11 adversarial cases without errors", () => {
      const cases = createAllAdversarialCases();
      expect(cases.length).toBe(11);

      // Verify case types
      const types = new Set(cases.map((c) => c.type));
      expect(types.size).toBe(11);
    });

    it("should validate all cases are well-formed", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        const validation = validateAdversarialCase(adversarialCase);
        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      }
    });

    it("should have correctly named case IDs", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        expect(adversarialCase.id).toMatch(/^adversarial_[a-z_]+_v\d+$/);
      }
    });

    it("should have bad data characteristics for each case", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        expect(adversarialCase.badDataCharacteristics.length).toBeGreaterThan(0);

        for (const characteristic of adversarialCase.badDataCharacteristics) {
          expect(characteristic.characteristic).toBeTruthy();
          expect(["critical", "high", "medium", "low"]).toContain(characteristic.severity);
          expect(characteristic.description).toBeTruthy();
          expect(characteristic.howToDetect).toBeTruthy();
        }
      }
    });

    it("should have acceptable behavior rules for each case", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        expect(adversarialCase.acceptableBehavior).toBeDefined();
        expect(typeof adversarialCase.acceptableBehavior.mustLowerConfidence).toBe("boolean");
        expect(adversarialCase.acceptableBehavior.minConfidenceAfter).toBeGreaterThanOrEqual(0);
        expect(adversarialCase.acceptableBehavior.minConfidenceAfter).toBeLessThanOrEqual(1);
      }
    });

    it("should have expected detection criteria", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        expect(adversarialCase.expectedDetection.caseType).toBeTruthy();
        expect(adversarialCase.expectedDetection.confidence).toBeGreaterThan(0);
        expect(adversarialCase.expectedDetection.evidence.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Case Retrieval", () => {
    it("should retrieve case by ID", () => {
      const adversarialCase = getCaseById("adversarial_missing_data_v1");
      expect(adversarialCase).toBeDefined();
      expect(adversarialCase?.type).toBe("missing_data");
    });

    it("should return null for non-existent case ID", () => {
      const adversarialCase = getCaseById("adversarial_nonexistent_v1");
      expect(adversarialCase).toBeNull();
    });

    it("should retrieve case by type", () => {
      const adversarialCase = getCaseByType("misleading_data");
      expect(adversarialCase).toBeDefined();
      expect(adversarialCase?.type).toBe("misleading_data");
    });

    it("should return null for non-existent case type", () => {
      const adversarialCase = getCaseByType("nonexistent" as any);
      expect(adversarialCase).toBeNull();
    });
  });

  describe("Case Evaluation: Missing Data", () => {
    it("should fail when system is too confident with missing data", () => {
      const adversarialCase = getCaseById("adversarial_missing_data_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: [],
        identifiedRecommendations: [
          "Proceed with growth initiative", // Should block this
        ],
        systemConfidence: 0.8, // Too high
        evidenceQualityScore: 0.2,
        confidenceDeclining: false,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.length).toBeGreaterThan(0);
    });
  });

  describe("Case Evaluation: Conflicting Data", () => {
    it("should fail when system ignores conflicting signals", () => {
      const adversarialCase = getCaseById("adversarial_conflicting_data_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: ["sustainable growth"],
        identifiedRecommendations: ["Invest aggressively"],
        systemConfidence: 0.75, // Too high given conflicts
        evidenceQualityScore: 0.7,
        confidenceDeclining: false,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false, // Should detect!
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
    });
  });

  describe("Case Evaluation: Fake Improvement", () => {
    it("should fail when system celebrates fake improvement", () => {
      const adversarialCase = getCaseById("adversarial_fake_improvement_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: ["profitability success"],
        identifiedRecommendations: ["Celebrate margin improvement", "Continue cost-cutting"],
        systemConfidence: 0.8,
        evidenceQualityScore: 0.7,
        confidenceDeclining: false,
        fakeImprovementDetected: false, // Should detect!
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.some((v) => v.includes("blocked"))).toBe(true);
    });
  });

  describe("Case Evaluation: Vanity Metrics", () => {
    it("should fail when system recommends based on vanity metrics", () => {
      const adversarialCase = getCaseById("adversarial_vanity_metrics_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: ["growth success"],
        identifiedRecommendations: ["Increase marketing spend", "Scale based on signup growth"],
        systemConfidence: 0.7,
        evidenceQualityScore: 0.65,
        confidenceDeclining: false,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false, // Should detect!
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
    });
  });

  describe("Case Evaluation: Cash Illusion", () => {
    it("should fail when system ignores payable obligations", () => {
      const adversarialCase = getCaseById("adversarial_cash_illusion_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: [],
        identifiedRecommendations: ["Invest cash in growth"], // Should block
        systemConfidence: 0.7,
        evidenceQualityScore: 0.65,
        confidenceDeclining: false,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.some((v) => v.includes("blocked"))).toBe(true);
    });
  });

  describe("Case Evaluation: Seasonality Trap", () => {
    it("should fail when system panics on seasonal decline", () => {
      const adversarialCase = getCaseById("adversarial_seasonality_trap_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: ["business in crisis"],
        identifiedRecommendations: ["Emergency intervention", "Cut spending immediately"], // Should block
        systemConfidence: 0.8,
        evidenceQualityScore: 0.6,
        confidenceDeclining: true, // Should NOT decline
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
    });
  });

  describe("Case Evaluation: Outlier Distortion", () => {
    it("should fail when system scales based on distorted metrics", () => {
      const adversarialCase = getCaseById("adversarial_outlier_distortion_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: ["healthy customer base"],
        identifiedRecommendations: ["Scale based on current revenue", "Hire aggressively"], // Should block
        systemConfidence: 0.75,
        evidenceQualityScore: 0.7,
        confidenceDeclining: false,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: false,
        passed: false,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const evaluation = evaluateAdversarialCase(adversarialCase, result);
      expect(evaluation.passed).toBe(false);
    });
  });

  describe("All Cases Coverage", () => {
    it("should have all 11 case types", () => {
      const cases = createAllAdversarialCases();
      const expectedTypes = [
        "missing_data",
        "misleading_data",
        "conflicting_data",
        "fake_improvement",
        "vanity_metrics",
        "wrong_attribution",
        "margin_illusion",
        "cash_illusion",
        "founder_bias",
        "seasonality_trap",
        "outlier_distortion",
      ];

      const caseTypes = cases.map((c) => c.type);
      for (const expectedType of expectedTypes) {
        expect(caseTypes).toContain(expectedType);
      }
    });

    it("should allow retrieval of all cases", () => {
      const cases = createAllAdversarialCases();

      for (const adversarialCase of cases) {
        const retrieved = getCaseById(adversarialCase.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(adversarialCase.id);

        const retrievedByType = getCaseByType(adversarialCase.type);
        expect(retrievedByType).toBeDefined();
        expect(retrievedByType?.type).toBe(adversarialCase.type);
      }
    });
  });

  describe("Determinism", () => {
    it("should evaluate same result identically across multiple runs", () => {
      const adversarialCase = getCaseById("adversarial_missing_data_v1")!;

      const result: AdversarialCaseRunResult = {
        caseId: adversarialCase.id,
        runId: "test_run",
        inputMetrics: adversarialCase.inputMetrics,
        inputEvidence: adversarialCase.inputEvidence,
        identifiedCauses: [],
        identifiedRecommendations: [],
        systemConfidence: 0.3,
        evidenceQualityScore: 0.2,
        confidenceDeclining: true,
        fakeImprovementDetected: false,
        vanityMetricsDetected: false,
        conflictingDataDetected: false,
        adversarialCaseDetected: true,
        passed: true,
        failureReasons: [],
        evidence: [],
        ranAt: new Date(),
        executionTimeMs: 100,
      };

      const eval1 = evaluateAdversarialCase(adversarialCase, result);
      const eval2 = evaluateAdversarialCase(adversarialCase, result);

      expect(eval1.passed).toBe(eval2.passed);
      expect(eval1.violations.length).toBe(eval2.violations.length);
      expect(eval1.evidence.length).toBe(eval2.evidence.length);
    });
  });
});

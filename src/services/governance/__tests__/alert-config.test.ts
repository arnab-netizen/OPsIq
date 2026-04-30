import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_ALERT_THRESHOLDS,
  validateThresholds,
} from "../alert-config";

describe("Governance Alert Configuration", () => {
  describe("Default thresholds", () => {
    it("should have explicit, system-wide thresholds", () => {
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("overallBlockRateThreshold");
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("guardrailBlockRateThreshold");
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("minAvgConfidenceBlocked");
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("errorRateThreshold");
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("slowRunRateThreshold");
      expect(GOVERNANCE_ALERT_THRESHOLDS).toHaveProperty("slowRunDurationMs");
    });

    it("should have reasonable default values", () => {
      // Block rate thresholds should be between 0 and 100
      expect(GOVERNANCE_ALERT_THRESHOLDS.overallBlockRateThreshold).toBeGreaterThan(0);
      expect(GOVERNANCE_ALERT_THRESHOLDS.overallBlockRateThreshold).toBeLessThan(100);

      expect(GOVERNANCE_ALERT_THRESHOLDS.guardrailBlockRateThreshold).toBeGreaterThan(0);
      expect(GOVERNANCE_ALERT_THRESHOLDS.guardrailBlockRateThreshold).toBeLessThan(100);

      // Confidence should be between 0 and 1
      expect(GOVERNANCE_ALERT_THRESHOLDS.minAvgConfidenceBlocked).toBeGreaterThanOrEqual(0);
      expect(GOVERNANCE_ALERT_THRESHOLDS.minAvgConfidenceBlocked).toBeLessThanOrEqual(1);

      // Error and slow run rates should be percentages
      expect(GOVERNANCE_ALERT_THRESHOLDS.errorRateThreshold).toBeGreaterThanOrEqual(0);
      expect(GOVERNANCE_ALERT_THRESHOLDS.errorRateThreshold).toBeLessThanOrEqual(100);

      expect(GOVERNANCE_ALERT_THRESHOLDS.slowRunRateThreshold).toBeGreaterThanOrEqual(0);
      expect(GOVERNANCE_ALERT_THRESHOLDS.slowRunRateThreshold).toBeLessThanOrEqual(100);

      // Duration should be non-negative
      expect(GOVERNANCE_ALERT_THRESHOLDS.slowRunDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Threshold validation", () => {
    it("should accept valid threshold configuration", () => {
      const validConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(validConfig)).not.toThrow();
    });

    it("should reject overall block rate threshold outside valid range", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 150, // > 100
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("overallBlockRateThreshold");
    });

    it("should reject negative overall block rate threshold", () => {
      const invalidConfig = {
        overallBlockRateThreshold: -5,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("overallBlockRateThreshold");
    });

    it("should reject guardrail block rate threshold outside valid range", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 150, // > 100
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("guardrailBlockRateThreshold");
    });

    it("should reject confidence threshold outside valid range", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 1.5, // > 1
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("minAvgConfidenceBlocked");
    });

    it("should reject error rate threshold outside valid range", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 150, // > 100
        slowRunRateThreshold: 10,
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("errorRateThreshold");
    });

    it("should reject slow run rate threshold outside valid range", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 150, // > 100
        slowRunDurationMs: 500,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("slowRunRateThreshold");
    });

    it("should reject negative slow run duration", () => {
      const invalidConfig = {
        overallBlockRateThreshold: 20,
        guardrailBlockRateThreshold: 50,
        minAvgConfidenceBlocked: 0.3,
        errorRateThreshold: 5,
        slowRunRateThreshold: 10,
        slowRunDurationMs: -100,
      };

      expect(() => validateThresholds(invalidConfig)).toThrow("slowRunDurationMs");
    });

    it("should accept boundary values", () => {
      const boundaryConfig = {
        overallBlockRateThreshold: 0,
        guardrailBlockRateThreshold: 100,
        minAvgConfidenceBlocked: 0,
        errorRateThreshold: 0,
        slowRunRateThreshold: 100,
        slowRunDurationMs: 0,
      };

      expect(() => validateThresholds(boundaryConfig)).not.toThrow();
    });
  });

  describe("Module initialization", () => {
    it("should validate default thresholds on module load", () => {
      // If we get here, the module loaded without throwing
      // which means the default thresholds pass validation
      expect(GOVERNANCE_ALERT_THRESHOLDS).toBeDefined();
    });
  });

  describe("Threshold semantics", () => {
    it("should have block rate threshold lower than confidence threshold percentage", () => {
      // Block rate thresholds are percentages (0-100)
      // If block rate is at threshold, it's a warning condition
      expect(GOVERNANCE_ALERT_THRESHOLDS.overallBlockRateThreshold).toBeLessThan(50);
      expect(GOVERNANCE_ALERT_THRESHOLDS.guardrailBlockRateThreshold).toBeLessThan(100);
    });

    it("should have error rate threshold low (critical condition)", () => {
      // Error rate is critical, so should be low
      expect(GOVERNANCE_ALERT_THRESHOLDS.errorRateThreshold).toBeLessThan(10);
    });

    it("should have slow run rate lower than overall block rate", () => {
      // Slow runs are less critical than blocks
      expect(GOVERNANCE_ALERT_THRESHOLDS.slowRunRateThreshold).toBeLessThanOrEqual(
        GOVERNANCE_ALERT_THRESHOLDS.overallBlockRateThreshold
      );
    });
  });
});

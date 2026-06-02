import { describe, it, expect } from "vitest";
import { classifyOutcome } from "@/services/operator/outcome-classifier";
import { checkFraudRisk } from "@/services/outcome/verification";

describe("P2B: Path Convergence Verification", () => {
  describe("Outcome Classification Consistency", () => {
    it("should classify success identically across all inputs", () => {
      const testCases = [
        { actual: 50000, expected: 50000 },
        { actual: 75000, expected: 50000 },
        { actual: 100000, expected: 50000 },
      ];

      testCases.forEach(({ actual, expected }) => {
        const result = classifyOutcome(actual, expected);
        expect(result.category).toBe("success");
      });
    });

    it("should classify failure identically for zero/null/undefined", () => {
      const testCases = [0, null, undefined];

      testCases.forEach((actual) => {
        const result = classifyOutcome(actual, 50000);
        expect(result.category).toBe("failure");
        expect(result.reason).toBe("No outcome achieved");
      });
    });

    it("should classify partial identically for <50% achievement", () => {
      const result1 = classifyOutcome(12500, 50000);
      const result2 = classifyOutcome(24999, 50000);

      expect(result1.category).toBe("partial");
      expect(result2.category).toBe("partial");
    });

    it("should classify uncertain identically for >200% variance", () => {
      const result1 = classifyOutcome(250000, 50000);
      const result2 = classifyOutcome(300000, 50000);

      expect(result1.category).toBe("uncertain");
      expect(result2.category).toBe("uncertain");
    });
  });

  describe("Fraud Risk Assessment Consistency", () => {
    it("should consistently assess fraud risk for extreme variance", () => {
      const result = checkFraudRisk(500000, 50000, null);
      expect(result.riskLevel).toBe("medium");
      expect(result.indicators.length).toBeGreaterThan(0);
    });

    it("should flag retroactive modifications consistently", () => {
      const result = checkFraudRisk(100000, 50000, 50000);
      expect(result.riskLevel).not.toBe("low");
      expect(
        result.indicators.some((i) =>
          i.includes("Retroactive modification")
        )
      ).toBe(true);
    });

    it("should consistently assess low risk for normal outcomes", () => {
      const result = checkFraudRisk(50000, 50000, null);
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("Verification Status Auto-flagging", () => {
    it("should auto-flag when fraud risk is high", () => {
      // Retroactive modification = high fraud risk
      const fraudRisk = checkFraudRisk(100000, 50000, 25000);
      const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
      expect(verificationStatus).toBe("flagged");
    });

    it("should not auto-flag when fraud risk is low", () => {
      const fraudRisk = checkFraudRisk(50000, 50000, null);
      const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
      expect(verificationStatus).toBe("unverified");
    });

    it("should not auto-flag when fraud risk is medium", () => {
      const fraudRisk = checkFraudRisk(150000, 50000, null);
      const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
      expect(verificationStatus).toBe("unverified");
    });
  });

  describe("Outcome Notes Requirement Consistency", () => {
    it("should require notes for failure", () => {
      const classification = classifyOutcome(0, 50000);
      const requiresNotes =
        classification.category === "failure" || classification.category === "uncertain";
      expect(requiresNotes).toBe(true);
    });

    it("should require notes for uncertain", () => {
      const classification = classifyOutcome(250000, 50000);
      const requiresNotes =
        classification.category === "failure" || classification.category === "uncertain";
      expect(requiresNotes).toBe(true);
    });

    it("should not require notes for success", () => {
      const classification = classifyOutcome(50000, 50000);
      const requiresNotes =
        classification.category === "failure" || classification.category === "uncertain";
      expect(requiresNotes).toBe(false);
    });

    it("should not require notes for partial", () => {
      const classification = classifyOutcome(12500, 50000);
      const requiresNotes =
        classification.category === "failure" || classification.category === "uncertain";
      expect(requiresNotes).toBe(false);
    });
  });

  describe("Determinism and Stability", () => {
    it("should produce identical results for identical inputs", () => {
      const inputs = [
        { actual: 50000, expected: 50000 },
        { actual: 0, expected: 50000 },
        { actual: 250000, expected: 50000 },
        { actual: 12500, expected: 50000 },
      ];

      inputs.forEach(({ actual, expected }) => {
        const result1 = classifyOutcome(actual, expected);
        const result2 = classifyOutcome(actual, expected);
        const result3 = classifyOutcome(actual, expected);

        expect(result1.category).toBe(result2.category);
        expect(result2.category).toBe(result3.category);
        expect(result1.reason).toBe(result2.reason);
        expect(result2.reason).toBe(result3.reason);
      });
    });

    it("should produce identical fraud risk assessments", () => {
      const result1 = checkFraudRisk(250000, 50000, null);
      const result2 = checkFraudRisk(250000, 50000, null);

      expect(result1.riskLevel).toBe(result2.riskLevel);
      expect(result1.confidence).toBe(result2.confidence);
    });
  });

  describe("Edge Cases Handled Consistently", () => {
    it("should handle missing expected impact consistently", () => {
      const result1 = classifyOutcome(50000, null);
      const result2 = classifyOutcome(50000, undefined);

      expect(result1.category).toBe("success");
      expect(result2.category).toBe("success");
      expect(result1.reason).toContain("no baseline");
    });

    it("should handle zero expected impact consistently", () => {
      const result = classifyOutcome(50000, 0);
      expect(result.category).toBe("success");
    });

    it("should handle negative outcomes consistently", () => {
      const result = classifyOutcome(-50000, 50000);
      // Negative outcomes with expected impact are classified as success
      // (not captured by null/zero/undefined, not uncertain, not partial)
      expect(result.category).toBe("success");
    });
  });
});

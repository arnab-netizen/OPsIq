import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  captureOutcomeVerificationMetadata,
  checkFraudRisk,
  verifyOutcomeValue,
} from "@/services/outcome/verification";

describe("Phase R1: Outcome Verification Service", () => {
  describe("captureOutcomeVerificationMetadata", () => {
    it("marks self-reported outcomes as unverified", () => {
      const metadata = captureOutcomeVerificationMetadata(
        50000,
        100000,
        null,
        "user-123"
      );

      expect(metadata.verificationStatus).toBe("unverified");
      expect(metadata.verificationConfidence).toBe(0);
    });

    it("captures audit trail with source and method", () => {
      const metadata = captureOutcomeVerificationMetadata(
        50000,
        100000,
        null,
        "user-123"
      );

      expect(metadata.auditTrail).toBeDefined();
      expect(Array.isArray(metadata.auditTrail)).toBe(true);
      expect(metadata.auditTrail[0]).toMatchObject({
        action: "OUTCOME_RECORDED",
        actorId: "user-123",
      });
    });

    it("captures verification evidence with fraud assessment", () => {
      const metadata = captureOutcomeVerificationMetadata(
        50000,
        100000,
        null,
        "user-123"
      );

      expect(metadata.verificationEvidence).toBeDefined();
      expect(metadata.verificationEvidence.fraudRiskAssessment).toBeDefined();
    });
  });

  describe("checkFraudRisk", () => {
    it("flags suspicious round numbers", () => {
      const risk = checkFraudRisk(100000, 50000, null);
      expect(risk.indicators.length).toBeGreaterThan(0);
      expect(risk.indicators.some((i) => i.includes("Round number"))).toBe(
        true
      );
    });

    it("flags retroactive modifications", () => {
      const risk = checkFraudRisk(50000, 50000, 30000);
      expect(risk.riskLevel).toBe("high");
      expect(
        risk.indicators.some((i) => i.includes("Retroactive modification"))
      ).toBe(true);
    });
  });

  describe("verifyOutcomeValue", () => {
    it("allows positive outcomes", () => {
      const result = verifyOutcomeValue(50000, 100000);
      expect(result.allowed).toBe(true);
    });

    it("flags negative outcomes for review", () => {
      const result = verifyOutcomeValue(-10000, 100000);
      expect(result.reason).toBeDefined();
    });

    it("sets customer-reported verification confidence to zero", () => {
      const result = verifyOutcomeValue(50000, 100000);
      expect(result.confidence).toBe(0);
    });
  });
});

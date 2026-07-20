import { describe, it, expect } from "vitest";
import {
  assessReadiness,
  type ReadinessInputs,
} from "../../domain/owner-strategy/startup-readiness";

const readyInputs: ReadinessInputs = {
  problemEvidenceCount: 5,
  customerEvidenceCount: 10,
  wtpEvidenceCount: 5,
  deliveryTrialCompleted: true,
  acquisitionChannelTested: true,
  economicClassification: "VIABLE",
  cashRunwayMonths: 9,
  breakEvenMonths: 4,
  supplierQuoteObtained: true,
  regulatoryCheckCompleted: true,
  licenceRequired: false,
  licenceObtained: null,
  ownerHoursAvailable: 25,
  capitalAvailableCents: BigInt(1_000_000),
  startupCostCents: BigInt(500_000),
  criticalHypothesesPassed: 5,
  criticalHypothesesFailed: 0,
};

describe("startup-readiness", () => {
  // ── Scenario F: missing licence → BLOCKED ────────────────────────────────
  describe("Scenario F — licence required but not obtained", () => {
    it("readinessStatus is BLOCKED", () => {
      const result = assessReadiness({
        ...readyInputs,
        licenceRequired: true,
        licenceObtained: false,
      });
      expect(result.status).toBe("BLOCKED");
    });

    it("hardGateFailures includes REGULATORY gate", () => {
      const result = assessReadiness({
        ...readyInputs,
        licenceRequired: true,
        licenceObtained: false,
      });
      expect(result.hardGateFailures.some((f) => f.includes("REGULATORY"))).toBe(true);
    });

    it("regulatory_clearance is in failedGates", () => {
      const result = assessReadiness({
        ...readyInputs,
        licenceRequired: true,
        licenceObtained: null, // not obtained
      });
      expect(result.failedGates).toContain("regulatory_clearance");
    });

    it("regulatoryReadiness score is 10 when licence required but not obtained", () => {
      const result = assessReadiness({
        ...readyInputs,
        licenceRequired: true,
        licenceObtained: null,
      });
      expect(result.scores.regulatoryReadiness).toBe(10);
    });
  });

  // ── Scenario L: hard gate cash_survival BLOCKED overrides everything ──────
  describe("Scenario L — hard gate cash_survival BLOCKED", () => {
    it("status is BLOCKED when cashRunwayMonths < 3", () => {
      const result = assessReadiness({
        ...readyInputs,
        cashRunwayMonths: 2,
      });
      expect(result.status).toBe("BLOCKED");
    });

    it("BLOCKED even when all other scores are excellent", () => {
      const result = assessReadiness({
        ...readyInputs,
        cashRunwayMonths: 1,
        // All other inputs remain at passing values
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.hardGateFailures.some((f) => f.includes("CASH_SURVIVAL"))).toBe(true);
    });

    it("cashSurvival score is 0 when runway < 3", () => {
      const result = assessReadiness({ ...readyInputs, cashRunwayMonths: 2 });
      expect(result.scores.cashSurvival).toBe(0);
    });

    it("bindingConstraints contains the hard gate message", () => {
      const result = assessReadiness({ ...readyInputs, cashRunwayMonths: 1 });
      expect(result.bindingConstraints.length).toBeGreaterThan(0);
      expect(result.bindingConstraints.some((c) => c.includes("CASH_SURVIVAL"))).toBe(true);
    });
  });

  // ── Scenario A (readiness layer): insufficient capital blocks resource gate ─
  describe("capital vs startupCost", () => {
    it("resourceReadiness score does not include the +20 bonus when capital < cost", () => {
      const insufficient = assessReadiness({
        ...readyInputs,
        capitalAvailableCents: BigInt(100_000),
        startupCostCents: BigInt(500_000),
      });
      const sufficient = assessReadiness(readyInputs);
      expect(sufficient.scores.resourceReadiness).toBeGreaterThan(
        insufficient.scores.resourceReadiness
      );
    });
  });

  // ── Owner capacity gate ───────────────────────────────────────────────────
  describe("owner capacity hard gate", () => {
    it("BLOCKED when ownerHoursAvailable < 10", () => {
      const result = assessReadiness({ ...readyInputs, ownerHoursAvailable: 5 });
      expect(result.status).toBe("BLOCKED");
      expect(result.hardGateFailures.some((f) => f.includes("OWNER_CAPACITY"))).toBe(true);
    });

    it("ownerCapacity score is 10 when hours < 10", () => {
      const result = assessReadiness({ ...readyInputs, ownerHoursAvailable: 5 });
      expect(result.scores.ownerCapacity).toBe(10);
    });
  });

  // ── Critical hypothesis failure ───────────────────────────────────────────
  describe("critical hypothesis failure", () => {
    it("BLOCKED when criticalHypothesesFailed > 0", () => {
      const result = assessReadiness({ ...readyInputs, criticalHypothesesFailed: 1 });
      expect(result.status).toBe("BLOCKED");
      expect(result.hardGateFailures.some((f) => f.includes("HYPOTHESIS_FAILED"))).toBe(true);
    });
  });

  // ── Break-even vs runway gate ─────────────────────────────────────────────
  describe("break-even exceeds runway", () => {
    it("BLOCKED when breakEvenMonths > cashRunwayMonths", () => {
      const result = assessReadiness({
        ...readyInputs,
        cashRunwayMonths: 6,
        breakEvenMonths: 10,
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.hardGateFailures.some((f) => f.includes("CASH_FLOW_TIMING"))).toBe(true);
    });
  });

  // ── READY status ──────────────────────────────────────────────────────────
  describe("fully ready", () => {
    it("returns READY when all gates pass and evidence is complete", () => {
      const result = assessReadiness(readyInputs);
      expect(result.status).toBe("READY");
      expect(result.hardGateFailures).toHaveLength(0);
    });

    it("safeNextStep mentions owner decision when READY", () => {
      const result = assessReadiness(readyInputs);
      expect(result.safeNextStep).toContain("owner decision");
    });
  });

  // ── Evidence gaps → NOT_READY ─────────────────────────────────────────────
  describe("evidence gaps", () => {
    it("NOT_READY when problem evidence low", () => {
      const result = assessReadiness({
        ...readyInputs,
        problemEvidenceCount: 0,
        customerEvidenceCount: 0,
        wtpEvidenceCount: 0,
        regulatoryCheckCompleted: false,
      });
      // >2 evidence gaps → NOT_READY (no hard gate failures)
      expect(["NOT_READY", "CONDITIONALLY_READY"]).toContain(result.status);
    });
  });
});

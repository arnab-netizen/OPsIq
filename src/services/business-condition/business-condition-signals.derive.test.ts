/**
 * Phase 1 — Reality Engine: deriveBusinessConditionSignals unit tests.
 *
 * Verifies each of the 11 risk-dimension derivation paths with known inputs → expected
 * outputs. Pure function; no DB, no mocks required.
 */

import { describe, it, expect } from "vitest";
import { deriveBusinessConditionSignals, type BusinessConditionSignalInputs } from "./business-condition-profile.service";

const BASE: BusinessConditionSignalInputs = {
  cashState: "SAFE",
  finState: "SAFE",
  cashRunwayDays: 90,
  supplierInventoryRiskScore: 0.1,
  ownerLoadPct: 0.3,
  staffOverloadPct: 0.4,
  ownerOverloaded: false,
  staffOverloaded: false,
  capacityUtilizationPct: 50,
  complaintsCount: 0,
  reworkCount: 0,
  overdueProofCount: 0,
  outcomeChecksDue: 0,
  churnRiskScore: 0.1,
  growthReadinessTier: "GROWTH_READY",
};

describe("deriveBusinessConditionSignals", () => {
  describe("cashPressureLevel", () => {
    it("returns LOW for SAFE cashflowState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "SAFE" });
      expect(result.cashPressureLevel).toBe("LOW");
    });

    it("returns MEDIUM for WATCH cashflowState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "WATCH" });
      expect(result.cashPressureLevel).toBe("MEDIUM");
    });

    it("returns HIGH for AT_RISK cashflowState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "AT_RISK" });
      expect(result.cashPressureLevel).toBe("HIGH");
    });

    it("returns CRITICAL for CRITICAL cashflowState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "CRITICAL" });
      expect(result.cashPressureLevel).toBe("CRITICAL");
    });

    it("returns CRITICAL for INSOLVENT_RISK cashflowState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "INSOLVENT_RISK" });
      expect(result.cashPressureLevel).toBe("CRITICAL");
    });

    it("returns unknown when cashState is absent", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: null });
      expect(result.cashPressureLevel).toBe("unknown");
    });
  });

  describe("marginPressureLevel", () => {
    it("returns LOW for SAFE finState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, finState: "SAFE" });
      expect(result.marginPressureLevel).toBe("LOW");
    });

    it("returns CRITICAL for INSOLVENT_RISK finState", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, finState: "INSOLVENT_RISK" });
      expect(result.marginPressureLevel).toBe("CRITICAL");
    });

    it("returns unknown when finState is absent", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, finState: null });
      expect(result.marginPressureLevel).toBe("unknown");
    });
  });

  describe("ownerDependencyRisk", () => {
    it("returns HIGH when ownerOverloaded flag is true", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, ownerOverloaded: true });
      expect(result.ownerDependencyRisk).toBe("HIGH");
    });

    it("returns HIGH when ownerLoadPct is 0.9 (bottleneck threshold)", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, ownerLoadPct: 0.9 });
      expect(result.ownerDependencyRisk).toBe("HIGH");
    });

    it("returns MEDIUM when ownerLoadPct is 0.65", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, ownerLoadPct: 0.65 });
      expect(result.ownerDependencyRisk).toBe("MEDIUM");
    });

    it("returns LOW when ownerLoadPct is 0.3", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, ownerLoadPct: 0.3 });
      expect(result.ownerDependencyRisk).toBe("LOW");
    });

    it("returns unknown when ownerLoadPct is 0 and not overloaded", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, ownerLoadPct: 0, ownerOverloaded: false });
      expect(result.ownerDependencyRisk).toBe("unknown");
    });
  });

  describe("keyPersonDependencyRisk", () => {
    it("returns HIGH when staffOverloaded flag is true", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloaded: true });
      expect(result.keyPersonDependencyRisk).toBe("HIGH");
    });

    it("returns HIGH when staffOverloadPct is 0.95", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloadPct: 0.95 });
      expect(result.keyPersonDependencyRisk).toBe("HIGH");
    });

    it("returns MEDIUM when staffOverloadPct is 0.75", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloadPct: 0.75 });
      expect(result.keyPersonDependencyRisk).toBe("MEDIUM");
    });

    it("returns LOW for low utilisation", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloadPct: 0.4 });
      expect(result.keyPersonDependencyRisk).toBe("LOW");
    });
  });

  describe("processMaturityLevel", () => {
    it("returns HIGH with no complaints/rework and financial data present", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, complaintsCount: 0, reworkCount: 0 });
      expect(result.processMaturityLevel).toBe("HIGH");
    });

    it("returns MEDIUM with 2-4 complaints", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, complaintsCount: 3 });
      expect(result.processMaturityLevel).toBe("MEDIUM");
    });

    it("returns LOW with 5+ complaints", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, complaintsCount: 7 });
      expect(result.processMaturityLevel).toBe("LOW");
    });

    it("returns LOW with 5+ rework jobs", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, reworkCount: 5 });
      expect(result.processMaturityLevel).toBe("LOW");
    });

    it("returns unknown when no financial data and no defects", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: null, finState: null, complaintsCount: 0, reworkCount: 0 });
      expect(result.processMaturityLevel).toBe("unknown");
    });
  });

  describe("managementMaturityLevel", () => {
    it("returns HIGH with no overdue items and financial data", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, overdueProofCount: 0, outcomeChecksDue: 0 });
      expect(result.managementMaturityLevel).toBe("HIGH");
    });

    it("returns MEDIUM with 1 overdue proof", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, overdueProofCount: 1 });
      expect(result.managementMaturityLevel).toBe("MEDIUM");
    });

    it("returns LOW with 3+ overdue proofs", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, overdueProofCount: 4 });
      expect(result.managementMaturityLevel).toBe("LOW");
    });

    it("returns LOW with 5+ outcome checks due", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, outcomeChecksDue: 6 });
      expect(result.managementMaturityLevel).toBe("LOW");
    });
  });

  describe("executionCapacityLevel", () => {
    it("returns HIGH at low utilisation", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, capacityUtilizationPct: 50 });
      expect(result.executionCapacityLevel).toBe("HIGH");
    });

    it("returns MEDIUM at 70% utilisation", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, capacityUtilizationPct: 70 });
      expect(result.executionCapacityLevel).toBe("MEDIUM");
    });

    it("returns LOW at 88% utilisation", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, capacityUtilizationPct: 88 });
      expect(result.executionCapacityLevel).toBe("LOW");
    });

    it("returns CRITICAL at 97% utilisation", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, capacityUtilizationPct: 97 });
      expect(result.executionCapacityLevel).toBe("CRITICAL");
    });

    it("returns unknown when no capacity data", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, capacityUtilizationPct: 0 });
      expect(result.executionCapacityLevel).toBe("unknown");
    });
  });

  describe("resilienceLevel", () => {
    it("returns HIGH when cash runway is long, suppliers are stable, and no overload", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashRunwayDays: 90, supplierInventoryRiskScore: 0.1, staffOverloaded: false, ownerOverloaded: false });
      expect(result.resilienceLevel).toBe("HIGH");
    });

    it("returns LOW when cash runway, suppliers, and staffing are all poor", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashRunwayDays: 10, supplierInventoryRiskScore: 0.8, staffOverloaded: true, ownerOverloaded: true });
      expect(result.resilienceLevel).toBe("LOW");
    });

    it("returns unknown when no cash runway data", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashRunwayDays: 0, cashState: null });
      expect(result.resilienceLevel).toBe("unknown");
    });
  });

  describe("growthReadinessLevel", () => {
    it("returns HIGH when growthReadinessTier is GROWTH_READY", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, growthReadinessTier: "GROWTH_READY" });
      expect(result.growthReadinessLevel).toBe("HIGH");
    });

    it("returns BLOCKED when cash pressure is CRITICAL", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, cashState: "CRITICAL", growthReadinessTier: "STABILIZE_FIRST" });
      expect(result.growthReadinessLevel).toBe("BLOCKED");
    });

    it("returns LOW when not growth-ready but has runway", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, growthReadinessTier: "STABILIZE_FIRST", cashRunwayDays: 30 });
      expect(result.growthReadinessLevel).toBe("LOW");
    });
  });

  describe("clientConcentrationRisk", () => {
    it("returns HIGH when churnRiskScore is very high", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, churnRiskScore: 0.8 });
      expect(result.clientConcentrationRisk).toBe("HIGH");
    });

    it("returns MEDIUM at moderate churn risk", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, churnRiskScore: 0.5 });
      expect(result.clientConcentrationRisk).toBe("MEDIUM");
    });

    it("returns LOW at low churn risk", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, churnRiskScore: 0.2 });
      expect(result.clientConcentrationRisk).toBe("LOW");
    });

    it("returns unknown when churnRiskScore is 0 (no customer data)", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, churnRiskScore: 0 });
      expect(result.clientConcentrationRisk).toBe("unknown");
    });
  });

  describe("moralFragilityLevel", () => {
    it("returns HIGH when both staff overloaded and high churn risk", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloaded: true, churnRiskScore: 0.6 });
      expect(result.moralFragilityLevel).toBe("HIGH");
    });

    it("returns MEDIUM when only staff overloaded", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloaded: true, churnRiskScore: 0.2 });
      expect(result.moralFragilityLevel).toBe("MEDIUM");
    });

    it("returns LOW when light utilisation and low churn", () => {
      const result = deriveBusinessConditionSignals({ ...BASE, staffOverloaded: false, staffOverloadPct: 0.3, churnRiskScore: 0.15 });
      expect(result.moralFragilityLevel).toBe("LOW");
    });
  });

  describe("no field is 'unknown' when full financial and workload data is present", () => {
    it("derives all 11 fields with known values from a healthy workspace", () => {
      const result = deriveBusinessConditionSignals({
        cashState: "SAFE",
        finState: "SAFE",
        cashRunwayDays: 90,
        supplierInventoryRiskScore: 0.1,
        ownerLoadPct: 0.4,
        staffOverloadPct: 0.5,
        ownerOverloaded: false,
        staffOverloaded: false,
        capacityUtilizationPct: 60,
        complaintsCount: 0,
        reworkCount: 0,
        overdueProofCount: 0,
        outcomeChecksDue: 0,
        churnRiskScore: 0.15,
        growthReadinessTier: "GROWTH_READY",
      });
      const unknownCount = Object.values(result).filter((v) => v === "unknown").length;
      expect(unknownCount).toBe(0);
    });

    it("derives all 11 fields for a distressed workspace", () => {
      const result = deriveBusinessConditionSignals({
        cashState: "CRITICAL",
        finState: "AT_RISK",
        cashRunwayDays: 7,
        supplierInventoryRiskScore: 0.8,
        ownerLoadPct: 0.95,
        staffOverloadPct: 0.92,
        ownerOverloaded: true,
        staffOverloaded: true,
        capacityUtilizationPct: 96,
        complaintsCount: 8,
        reworkCount: 6,
        overdueProofCount: 4,
        outcomeChecksDue: 7,
        churnRiskScore: 0.72,
        growthReadinessTier: "STABILIZE_FIRST",
      });
      expect(result.cashPressureLevel).toBe("CRITICAL");
      expect(result.marginPressureLevel).toBe("HIGH");
      expect(result.ownerDependencyRisk).toBe("HIGH");
      expect(result.keyPersonDependencyRisk).toBe("HIGH");
      expect(result.processMaturityLevel).toBe("LOW");
      expect(result.managementMaturityLevel).toBe("LOW");
      expect(result.executionCapacityLevel).toBe("CRITICAL");
      expect(result.moralFragilityLevel).toBe("HIGH");
      expect(result.resilienceLevel).toBe("LOW");
      expect(result.growthReadinessLevel).toBe("BLOCKED");
      expect(result.clientConcentrationRisk).toBe("HIGH");
    });
  });
});

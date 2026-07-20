import { describe, it, expect } from "vitest";
import {
  buildEconomicModel,
  classifyEconomicViability,
  type EconomicInputs,
} from "../../domain/owner-strategy/startup-economics";

const viableInputs: EconomicInputs = {
  startupCostCents: BigInt(500_000),        // $5 000
  fixedMonthlyCostCents: BigInt(100_000),   // $1 000/month
  variableUnitCostCents: BigInt(2_000),     // $20/unit
  pricePerUnitCents: BigInt(5_000),         // $50/unit
  cacCents: BigInt(10_000),
  workingCapitalCents: null,
  paymentDelayDays: null,
  ownerLabourHoursPerWeek: 20,
  capitalAvailableCents: BigInt(1_000_000),
  cashRunwayMonthsAvailable: 12,
};

describe("startup-economics", () => {
  // ── Scenario J: unknown fixedCost stays unknown ───────────────────────────
  describe("Scenario J — unknown fixedMonthlyCostCents", () => {
    it("fixedMonthlyCostCents in unknownInputs when null", () => {
      const result = buildEconomicModel({ ...viableInputs, fixedMonthlyCostCents: null });
      expect(result.unknownInputs).toContain("fixedMonthlyCostCents");
    });

    it("does NOT default fixedMonthlyCostCents to zero — breakEvenVolume is null", () => {
      const result = buildEconomicModel({ ...viableInputs, fixedMonthlyCostCents: null });
      // Without fixedMonthlyCostCents, breakEvenVolume cannot be computed
      expect(result.breakEvenVolume).toBeNull();
    });

    it("classification is INSUFFICIENT_DATA when two or more inputs are missing", () => {
      const result = buildEconomicModel({
        ...viableInputs,
        fixedMonthlyCostCents: null,
        variableUnitCostCents: null,
      });
      expect(result.classification).toBe("INSUFFICIENT_DATA");
    });
  });

  // ── Scenario K: breakEvenVolume when grossContribution is zero ───────────
  describe("Scenario K — zero gross contribution → UNVIABLE", () => {
    it("when price equals variable cost, breakEvenVolume is null (no break-even)", () => {
      const result = buildEconomicModel({
        ...viableInputs,
        pricePerUnitCents: BigInt(2_000),
        variableUnitCostCents: BigInt(2_000), // contribution = 0
      });
      expect(result.breakEvenVolume).toBeNull();
    });

    it("grossMarginBps is 0 when contribution is zero", () => {
      const result = buildEconomicModel({
        ...viableInputs,
        pricePerUnitCents: BigInt(2_000),
        variableUnitCostCents: BigInt(2_000),
      });
      expect(result.grossMarginBps).toBe(0);
    });

    it("negative contribution → UNVIABLE classification", () => {
      const result = buildEconomicModel({
        ...viableInputs,
        pricePerUnitCents: BigInt(1_000),     // $10
        variableUnitCostCents: BigInt(2_000), // $20 — negative contribution
      });
      expect(result.classification).toBe("UNVIABLE");
    });
  });

  // ── Scenario E: cashRunwayMonths-based preference (two-model comparison) ──
  describe("Scenario E — cash runway comparison between two ideas", () => {
    it("idea with higher cashRunwayMonths survives longer even with lower monthly revenue", () => {
      const ideaA = buildEconomicModel({
        ...viableInputs,
        cashRunwayMonthsAvailable: 3,          // tight runway
        fixedMonthlyCostCents: BigInt(200_000),
      });
      const ideaB = buildEconomicModel({
        ...viableInputs,
        cashRunwayMonthsAvailable: 12,         // comfortable runway
        fixedMonthlyCostCents: BigInt(200_000),
        pricePerUnitCents: BigInt(3_000),      // lower revenue potential
      });
      expect(ideaB.cashRunwayMonths!).toBeGreaterThan(ideaA.cashRunwayMonths!);
    });

    it("idea with longer runway is less likely to be UNVIABLE due to timing", () => {
      const shortRunway = buildEconomicModel({
        ...viableInputs,
        cashRunwayMonthsAvailable: 2,
        startupCostCents: BigInt(5_000_000), // heavy upfront cost
      });
      const longRunway = buildEconomicModel({
        ...viableInputs,
        cashRunwayMonthsAvailable: 24,
        startupCostCents: BigInt(5_000_000),
      });
      // Short runway model is more likely to show breakEvenMonths > cashRunwayMonths
      // Both have the same breakEven; but short runway triggers UNVIABLE condition
      expect(longRunway.cashRunwayMonths).toBeGreaterThan(shortRunway.cashRunwayMonths!);
    });
  });

  // ── Viable model ──────────────────────────────────────────────────────────
  describe("viable model", () => {
    it("classification is VIABLE for healthy inputs", () => {
      const result = buildEconomicModel(viableInputs);
      expect(result.classification).toBe("VIABLE");
    });

    it("grossMarginBps is positive and reflects price/cost ratio", () => {
      const result = buildEconomicModel(viableInputs);
      // contribution = 3000, price = 5000 → 60% = 6000 bps
      expect(result.grossMarginBps).toBe(6000);
    });

    it("breakEvenVolume is a positive integer", () => {
      const result = buildEconomicModel(viableInputs);
      // fixed 100_000, contribution 3000 → ceil(100000/3000) = 33
      expect(result.breakEvenVolume).toBeGreaterThan(0);
      expect(Number.isInteger(result.breakEvenVolume)).toBe(true);
    });

    it("sensitivity scenarios are all defined for viable model", () => {
      const result = buildEconomicModel(viableInputs);
      expect(result.sensitivityScenarios.down).not.toBeNull();
      expect(result.sensitivityScenarios.expected).not.toBeNull();
      expect(result.sensitivityScenarios.up).not.toBeNull();
    });

    it("up scenario has higher profit than down scenario", () => {
      const result = buildEconomicModel(viableInputs);
      const up = result.sensitivityScenarios.up!.monthlyProfit!;
      const down = result.sensitivityScenarios.down!.monthlyProfit!;
      expect(up > down).toBe(true);
    });
  });

  // ── MARGINAL classification ───────────────────────────────────────────────
  describe("marginal classification", () => {
    it("MARGINAL when grossMarginBps < 2000 but positive", () => {
      // 10% margin: price=10000, variable=9000 → contribution=1000, bps=1000
      const result = buildEconomicModel({
        ...viableInputs,
        pricePerUnitCents: BigInt(10_000),
        variableUnitCostCents: BigInt(9_000),
      });
      expect(result.grossMarginBps).toBe(1000);
      expect(result.classification).toBe("MARGINAL");
    });
  });

  // ── classifyEconomicViability delegates to result.classification ──────────
  describe("classifyEconomicViability", () => {
    it("returns the same classification as result.classification", () => {
      const result = buildEconomicModel(viableInputs);
      expect(classifyEconomicViability(result)).toBe(result.classification);
    });
  });

  // ── All monetary values must be bigint ───────────────────────────────────
  describe("bigint type enforcement", () => {
    it("accepts bigint monetary inputs without error", () => {
      expect(() => buildEconomicModel(viableInputs)).not.toThrow();
    });

    it("breakEvenVolume is a regular number (not bigint)", () => {
      const result = buildEconomicModel(viableInputs);
      expect(typeof result.breakEvenVolume).toBe("number");
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  buildEconomicModel,
  computeBreakEven,
  computeCashRunway,
  type EconomicInputs,
} from "@/domain/owner-strategy/startup-economics";

function baseInputs(overrides: Partial<EconomicInputs> = {}): EconomicInputs {
  return {
    startupCostCents: BigInt(500000), // $5000
    fixedMonthlyCostCents: BigInt(100000), // $1000/month
    variableUnitCostCents: BigInt(2000), // $20/unit
    pricePerUnitCents: BigInt(5000), // $50/unit — 60% gross margin
    cacCents: BigInt(10000),
    deliveryCostCents: BigInt(0),
    refundAllowanceCents: BigInt(0),
    workingCapitalCents: BigInt(0),
    paymentDelayDays: 0,
    ownerLabourHoursPerWeek: 20,
    hiredLabourCostCents: BigInt(0),
    capitalAvailableCents: BigInt(2000000), // $20000
    monthlySurvivalNeedCents: BigInt(300000), // $3000/month
    minViableCapacity: 40, // units/month
    maxCurrentCapacity: 100,
    ...overrides,
  };
}

describe("buildEconomicModel — viable scenario", () => {
  it("returns ECONOMICALLY_VIABLE or POTENTIALLY_VIABLE when healthy margins", () => {
    const result = buildEconomicModel(baseInputs());
    expect(["ECONOMICALLY_VIABLE", "POTENTIALLY_VIABLE"]).toContain(
      result.economicClassification
    );
  });

  it("grossContributionCents is price minus variable cost", () => {
    const result = buildEconomicModel(baseInputs());
    // price 5000 - variableCost 2000 - delivery 0 - refund 0 = 3000
    expect(result.grossContributionCents).toBe(BigInt(3000));
  });

  it("unknownInputs is empty when all inputs provided", () => {
    const result = buildEconomicModel(baseInputs());
    expect(result.unknownInputs).toHaveLength(0);
  });
});

describe("buildEconomicModel — zero gross contribution → UNVIABLE", () => {
  it("classifies as UNVIABLE when price equals variable cost", () => {
    const result = buildEconomicModel(
      baseInputs({
        pricePerUnitCents: BigInt(2000),
        variableUnitCostCents: BigInt(2000),
      })
    );
    expect(result.economicClassification).toBe("UNVIABLE");
    expect(result.grossContributionCents).toBe(BigInt(0));
  });

  it("classifies as UNVIABLE when variable cost exceeds price", () => {
    const result = buildEconomicModel(
      baseInputs({
        pricePerUnitCents: BigInt(1000),
        variableUnitCostCents: BigInt(3000),
      })
    );
    expect(result.economicClassification).toBe("UNVIABLE");
    expect(result.grossContributionCents).toBeLessThan(BigInt(0));
  });
});

describe("buildEconomicModel — null price → INSUFFICIENT_EVIDENCE", () => {
  it("returns INSUFFICIENT_EVIDENCE when price and variable cost are both null (≥2 unknowns)", () => {
    // The engine requires ≥2 unknown inputs to classify as INSUFFICIENT_EVIDENCE;
    // a single missing price yields VIABLE_ONLY_IF_ASSUMPTIONS_HOLD.
    const result = buildEconomicModel(
      baseInputs({ pricePerUnitCents: null, variableUnitCostCents: null })
    );
    expect(result.economicClassification).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("unknownInputs contains price_per_unit when price is null", () => {
    const result = buildEconomicModel(baseInputs({ pricePerUnitCents: null }));
    expect(result.unknownInputs).toContain("price_per_unit");
  });

  it("null price stays null — no silent coercion to zero", () => {
    const result = buildEconomicModel(baseInputs({ pricePerUnitCents: null }));
    expect(result.grossContributionCents).toBeNull();
    expect(result.grossMarginBps).toBeNull();
  });
});

describe("buildEconomicModel — CASH_FLOW_UNSAFE", () => {
  it("classifies CASH_FLOW_UNSAFE when runway < break-even", () => {
    // Adversarial A: capital $1000, startup $900, survival $300/mo, fixed $500/mo
    // After startup: capital left = 100. Monthly burn = 500+300 = 800 → runway = 0.125 months
    // gross contribution = 5000-2000 = 3000, fixed=500, breakeven vol = 500/3000 = 0.166
    // breakeven months = 0.166/40 = ~0.004 months. So runway > breakeven...
    // Need to ensure runway < breakeven: high fixed costs, low capital
    const result = buildEconomicModel(
      baseInputs({
        capitalAvailableCents: BigInt(100000), // $1000
        startupCostCents: BigInt(90000), // $900
        fixedMonthlyCostCents: BigInt(50000), // $500/month
        monthlySurvivalNeedCents: BigInt(30000), // $300/month
        minViableCapacity: 1,
        maxCurrentCapacity: 1,
        pricePerUnitCents: BigInt(5000),
        variableUnitCostCents: BigInt(2000),
      })
    );
    // cash after startup = 100000-90000 = 10000. monthly burn = 50000+30000 = 80000
    // runway = 10000/80000 = 0.125 months
    // breakeven vol = 50000/3000 ≈ 16.67, breakeven months = 16.67/1 = 16.67
    // runway 0.125 < breakeven 16.67 → CASH_FLOW_UNSAFE
    expect(result.economicClassification).toBe("CASH_FLOW_UNSAFE");
  });
});

describe("computeBreakEven", () => {
  it("returns null values when grossContribution is null", () => {
    const result = computeBreakEven({
      grossContributionCents: null,
      totalMonthlyCostCents: BigInt(100000),
      minViableCapacity: 10,
    });
    expect(result.breakEvenVolume).toBeNull();
    expect(result.breakEvenMonths).toBeNull();
  });

  it("returns null values when grossContribution is zero", () => {
    const result = computeBreakEven({
      grossContributionCents: BigInt(0),
      totalMonthlyCostCents: BigInt(100000),
      minViableCapacity: 10,
    });
    expect(result.breakEvenVolume).toBeNull();
    expect(result.breakEvenMonths).toBeNull();
  });

  it("computes break-even volume correctly", () => {
    // fixed 10000 / contribution 2000 = 5 units
    const result = computeBreakEven({
      grossContributionCents: BigInt(2000),
      totalMonthlyCostCents: BigInt(10000),
      minViableCapacity: 20,
    });
    expect(result.breakEvenVolume).toBeCloseTo(5, 1);
  });

  it("reason describes why break-even cannot be computed", () => {
    const result = computeBreakEven({
      grossContributionCents: null,
      totalMonthlyCostCents: null,
      minViableCapacity: null,
    });
    expect(result.reason).toContain("Cannot compute");
  });
});

describe("computeCashRunway", () => {
  it("returns cashRunwayMonths of 0 when startup cost exceeds capital", () => {
    const result = computeCashRunway({
      capitalAvailableCents: BigInt(50000),
      startupCostCents: BigInt(100000),
      workingCapitalCents: BigInt(0),
      totalMonthlyCostCents: BigInt(20000),
      monthlySurvivalNeedCents: BigInt(10000),
      breakEvenMonths: 6,
    });
    expect(result.cashRunwayMonths).toBe(0);
  });

  it("returns null cashRunwayMonths when capitalAvailableCents is null", () => {
    const result = computeCashRunway({
      capitalAvailableCents: null,
      startupCostCents: BigInt(100000),
      workingCapitalCents: null,
      totalMonthlyCostCents: BigInt(20000),
      monthlySurvivalNeedCents: null,
      breakEvenMonths: null,
    });
    expect(result.cashRunwayMonths).toBeNull();
  });

  it("computes runway correctly with known inputs", () => {
    // capital 300000, startup 100000 → left=200000, burn=50000/mo → 4 months
    const result = computeCashRunway({
      capitalAvailableCents: BigInt(300000),
      startupCostCents: BigInt(100000),
      workingCapitalCents: BigInt(0),
      totalMonthlyCostCents: BigInt(30000),
      monthlySurvivalNeedCents: BigInt(20000),
      breakEvenMonths: 2,
    });
    expect(result.cashRunwayMonths).toBeCloseTo(4, 0);
  });
});

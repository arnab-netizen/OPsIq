/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 1) — deterministic metrics
 * engine tests. Pure/no DB. Covers profit-delta, best/base/worst case, ROI,
 * payback, affordability, break-even, composite scores, strategy-state ladder,
 * data-confidence, industry-template adaptability, currency validation,
 * null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeStrategyMetrics,
  isValidCurrency,
  num,
  resolveStrategyThresholds,
  baseMonthlyProfitDelta,
  worstMonthlyProfitDelta,
  roiAnnualPct,
  paybackMonths,
  affordabilityRatio,
  type StrategySnapshotInput,
  STRATEGY_STATES,
} from "@/domain/owner-strategy";

/** A strong-go option: high ROI, fast payback, affordable, low risk. */
function strongGo(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    optionName: "Add a second machine",
    currentRevenue: 500000,
    expectedRevenueChange: 100000,
    costChange: 30000,
    investmentRequired: 200000,
    timeToImpactMonths: 3,
    riskLevel: "low",
    cashAvailable: 400000,
    capacityImpactPct: 20,
    staffImpact: 1,
  };
}

/** An avoid option: negative base case, never pays back, unaffordable, high risk. */
function avoid(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    optionName: "Open a second branch",
    currentRevenue: 500000,
    expectedRevenueChange: 20000,
    costChange: 60000,
    investmentRequired: 800000,
    timeToImpactMonths: 12,
    riskLevel: "high",
    cashAvailable: 100000,
    capacityImpactPct: 80,
    staffImpact: 4,
  };
}

describe("Owner Strategy engine — scenario economics", () => {
  it("computes base profit delta / ROI / payback from real inputs", () => {
    const i = strongGo();
    expect(baseMonthlyProfitDelta(i)).toBe(70000);
    expect(roiAnnualPct(i)).toBe(420);
    expect(paybackMonths(i)).toBe(2.9); // 200000 / 70000
    expect(affordabilityRatio(i)).toBe(2);
  });

  it("computes a worst case below the base case (risk spread)", () => {
    const i = strongGo();
    expect(worstMonthlyProfitDelta(i)).toBe(50000); // 100000*0.8 - 30000
    expect(baseMonthlyProfitDelta(i)).toBe(70000);
  });

  it("a no-capital cost cut pays back immediately and has no ROI ratio", () => {
    const costCut: StrategySnapshotInput = {
      periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
      currentRevenue: 500000, expectedRevenueChange: 0, costChange: -20000,
      investmentRequired: 0, riskLevel: "low", cashAvailable: 100000,
    };
    expect(baseMonthlyProfitDelta(costCut)).toBe(20000);
    expect(paybackMonths(costCut)).toBe(0);
    expect(roiAnnualPct(costCut)).toBeNull(); // no capital → ratio not applicable
    expect(computeStrategyMetrics(costCut).strategyState).toBe("STRONG_GO");
  });

  it("returns null (never invents) when inputs are missing", () => {
    expect(baseMonthlyProfitDelta({ periodStart: "", periodEnd: "", currency: "INR" })).toBeNull();
    expect(roiAnnualPct({ periodStart: "", periodEnd: "", currency: "INR", expectedRevenueChange: 10, costChange: 5 })).toBeNull(); // no investment
    expect(worstMonthlyProfitDelta({ periodStart: "", periodEnd: "", currency: "INR", expectedRevenueChange: 10, costChange: 5 })).toBeNull(); // no riskLevel
    expect(affordabilityRatio({ periodStart: "", periodEnd: "", currency: "INR", cashAvailable: 100, investmentRequired: 0 })).toBeNull();
  });
});

describe("Owner Strategy engine — composite scores", () => {
  it("a strong-go option scores attractive, low risk", () => {
    const m = computeStrategyMetrics(strongGo());
    expect(m.strategyHealthScore).toBeGreaterThanOrEqual(70);
    expect(m.strategyRiskScore).toBeLessThanOrEqual(30);
    expect(m.strategyState).toBe("STRONG_GO");
    expect(m.strategyTier).toBe("pursue");
  });

  it("an avoid option scores low health, high risk, AVOID state", () => {
    const m = computeStrategyMetrics(avoid());
    expect(m.strategyRiskScore).toBeGreaterThanOrEqual(70);
    expect(m.strategyHealthScore).toBeLessThanOrEqual(40);
    expect(m.strategyState).toBe("AVOID");
    expect(m.strategyTier).toBe("avoid");
  });

  it("all composite scores stay within [0,100]", () => {
    for (const input of [strongGo(), avoid(), { periodStart: "", periodEnd: "", currency: "INR" }]) {
      const m = computeStrategyMetrics(input);
      for (const s of [m.strategyHealthScore, m.strategyRiskScore, m.strategyOpportunityScore, m.dataConfidenceScore]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      expect(STRATEGY_STATES).toContain(m.strategyState);
    }
  });

  it("surfaces upside opportunity for a profitable option", () => {
    const m = computeStrategyMetrics(strongGo());
    expect(m.strategyOpportunityScore).toBeGreaterThan(0);
  });
});

describe("Owner Strategy engine — strategy-state ladder", () => {
  it("a long-payback but positive option is MARGINAL", () => {
    const m = computeStrategyMetrics({
      ...strongGo(),
      expectedRevenueChange: 42000,
      costChange: 30000, // base 12000
      investmentRequired: 300000, // payback 25 months (>18, <=36)
    });
    expect(m.paybackMonths).toBe(25);
    expect(m.strategyState).toBe("MARGINAL");
  });

  it("a high-risk option with positive economics is RISKY (not avoid)", () => {
    const m = computeStrategyMetrics({ ...strongGo(), riskLevel: "high" });
    expect(m.strategyState).toBe("RISKY");
  });
});

describe("Owner Strategy engine — data confidence + missing inputs", () => {
  it("full inputs give high confidence and no missing-critical", () => {
    const m = computeStrategyMetrics(strongGo());
    expect(m.dataConfidenceScore).toBeGreaterThanOrEqual(85);
    expect(m.missingRequiredInputs).toEqual([]);
  });

  it("missing critical inputs are listed and lower confidence", () => {
    const m = computeStrategyMetrics({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" });
    expect(m.missingRequiredInputs).toContain("expectedRevenueChange");
    expect(m.missingRequiredInputs).toContain("costChange");
    expect(m.missingRequiredInputs).toContain("investmentRequired");
    expect(m.dataConfidenceScore).toBeLessThan(50);
  });

  it("marks a stale snapshot down when now is provided", () => {
    const fresh = computeStrategyMetrics(strongGo(), { now: new Date("2026-06-05") });
    const stale = computeStrategyMetrics(strongGo(), { now: new Date("2026-09-01") });
    expect(stale.dataConfidenceScore).toBeLessThan(fresh.dataConfidenceScore);
  });
});

describe("Owner Strategy engine — thresholds, currency, purity", () => {
  it("applies industry-template overrides with a generic fallback", () => {
    const generic = resolveStrategyThresholds();
    const laundry = resolveStrategyThresholds("laundry_local_service");
    const unknown = resolveStrategyThresholds("does_not_exist");
    expect(laundry.strongRoiPct).toBeGreaterThan(generic.strongRoiPct);
    expect(unknown).toEqual(generic);
  });

  it("validates currency codes (fail closed)", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("12")).toBe(false);
    expect(num(Infinity)).toBeNull();
    expect(num(-5)).toBe(-5); // negative deltas are valid scenario inputs
  });

  it("does not mutate the input snapshot", () => {
    const input = strongGo();
    const copy = JSON.parse(JSON.stringify(input));
    computeStrategyMetrics(input);
    expect(input).toEqual(copy);
  });
});

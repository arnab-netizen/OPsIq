/**
 * Owner Strategy — calculation-integrity contract (Phase 1 of the Strategy remediation).
 *
 * Pure/no DB. Pins the corrected mathematical contract of the scenario engine:
 *  - the scenario range is ordered (worst ≤ base ≤ best) for every sign of revenue/cost change;
 *  - business rules (verdict, findings) read FULL-PRECISION values; rounding is display-only;
 *  - revenue/cost changes are MONTHLY amounts (ROI annualises ×12, payback is in months);
 *  - documented limitations that this phase deliberately does NOT change
 *    (cost uncertainty not modelled, time-to-impact unused).
 */
import { describe, it, expect } from "vitest";
import {
  computeStrategyMetrics,
  diagnoseStrategySnapshot,
  baseMonthlyProfitDelta,
  bestMonthlyProfitDelta,
  worstMonthlyProfitDelta,
  roiAnnualPct,
  paybackMonths,
  affordabilityRatio,
  STRATEGY_RISK_LEVELS,
  type StrategySnapshotInput,
  type StrategyRiskLevel,
} from "@/domain/owner-strategy";

const NOW = new Date("2026-09-26T00:00:00Z");

function scenario(over: Partial<StrategySnapshotInput>): StrategySnapshotInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currency: "INR",
    currentRevenue: 500000,
    timeToImpactMonths: 2,
    capacityImpactPct: 10,
    staffImpact: 1,
    riskLevel: "low",
    ...over,
  };
}

const codes = (i: StrategySnapshotInput) => diagnoseStrategySnapshot(i, { now: NOW }).findings.map((f) => f.code);
const finding = (i: StrategySnapshotInput, code: string) =>
  diagnoseStrategySnapshot(i, { now: NOW }).findings.find((f) => f.code === code);

describe("known scenario — 150k investment / 100k cash / +30k revenue / +12k cost, medium risk", () => {
  const known = scenario({
    investmentRequired: 150000,
    cashAvailable: 100000,
    expectedRevenueChange: 30000,
    costChange: 12000,
    riskLevel: "medium",
  });

  it("raw (decision) values", () => {
    const { raw } = computeStrategyMetrics(known, { now: NOW });
    expect(raw.baseMonthlyProfitDelta).toBe(18000);
    expect(raw.roiAnnualPct).toBe(144);
    // decision precision is 12 significant digits (float noise removed), so compare to 9 decimals
    expect(raw.paybackMonths).toBeCloseTo(150000 / 18000, 9); // 8.333…
    expect(raw.affordabilityRatio).toBeCloseTo(100000 / 150000, 9); // 0.6666…
    expect(raw.worstMonthlyProfitDelta).toBe(6000); // 30000 × (1 − 0.4) − 12000
    expect(raw.bestMonthlyProfitDelta).toBe(30000); // 30000 × (1 + 0.4) − 12000
  });

  it("display values are the rounded raw values", () => {
    const m = computeStrategyMetrics(known, { now: NOW });
    expect(m.baseMonthlyProfitDelta).toBe(18000);
    expect(m.roiAnnualPct).toBe(144);
    expect(m.paybackMonths).toBe(8.3);
    expect(m.affordabilityRatio).toBe(0.67);
    expect(m.worstMonthlyProfitDelta).toBe(6000);
  });

  it("verdict is unchanged by the fix (affordability 0.67 < 1 → RISKY)", () => {
    expect(computeStrategyMetrics(known, { now: NOW }).strategyState).toBe("RISKY");
  });
});

describe("scenario range — worst ≤ base ≤ best for every sign", () => {
  it("negative revenue change: worst/best are not inverted (cost-cut example)", () => {
    const cut = scenario({ expectedRevenueChange: -10000, costChange: -15000, riskLevel: "medium", investmentRequired: 50000, cashAvailable: 400000 });
    // candidates: −10000×0.6 + 15000 = 9000 and −10000×1.4 + 15000 = 1000
    expect(worstMonthlyProfitDelta(cut)).toBe(1000);
    expect(bestMonthlyProfitDelta(cut)).toBe(9000);
    expect(baseMonthlyProfitDelta(cut)).toBe(5000);
  });

  it("negative revenue with a negative base: the range is ordered around the base", () => {
    // candidates: −20000×0.4 + 10000 = 2000 and −20000×1.6 + 10000 = −22000 → worst −22000
    const i = scenario({ expectedRevenueChange: -20000, costChange: -10000, riskLevel: "high", investmentRequired: 1, cashAvailable: 400000 });
    const m = computeStrategyMetrics(i, { now: NOW });
    expect(m.raw.worstMonthlyProfitDelta).toBe(-22000);
    expect(m.raw.bestMonthlyProfitDelta).toBe(2000);
    expect(m.raw.baseMonthlyProfitDelta).toBe(-10000);
  });

  it("negative revenue with a positive base: a real downside loss is now flagged (previously read the optimistic case)", () => {
    // base = −20000 + 30000 = 10000; candidates −20000×0.4 + 30000 = 22000 and −20000×1.6 + 30000 = −2000
    const i = scenario({ expectedRevenueChange: -20000, costChange: -30000, riskLevel: "high", investmentRequired: 10000, cashAvailable: 400000 });
    const m = computeStrategyMetrics(i, { now: NOW });
    expect(m.raw.worstMonthlyProfitDelta).toBe(-2000);
    expect(m.raw.bestMonthlyProfitDelta).toBe(22000);
    const c = codes(i);
    expect(c).toContain("STR_NEGATIVE_WORST_CASE");
    expect(c).not.toContain("STR_OPP_SAFE_UPSIDE");
    expect(finding(i, "STR_NEGATIVE_WORST_CASE")!.sourceValue).toBe(-2000);
  });

  const revenues = [-50000, -10000, -1, -0.3, 0, 0.3, 1, 10000, 50000];
  const costs = [-40000, -15000, -0.3, 0, 0.3, 12000, 60000];
  for (const risk of STRATEGY_RISK_LEVELS as readonly StrategyRiskLevel[]) {
    it(`invariant holds across the revenue × cost matrix (risk ${risk})`, () => {
      for (const expectedRevenueChange of revenues) {
        for (const costChange of costs) {
          const m = computeStrategyMetrics(scenario({ expectedRevenueChange, costChange, riskLevel: risk, investmentRequired: 100000, cashAvailable: 100000 }), { now: NOW });
          const r = m.raw;
          expect(r.worstMonthlyProfitDelta!).toBeLessThanOrEqual(r.baseMonthlyProfitDelta!);
          expect(r.baseMonthlyProfitDelta!).toBeLessThanOrEqual(r.bestMonthlyProfitDelta!);
          // display rounding is monotone, so the order survives rounding
          expect(m.worstMonthlyProfitDelta!).toBeLessThanOrEqual(m.baseMonthlyProfitDelta!);
          expect(m.baseMonthlyProfitDelta!).toBeLessThanOrEqual(m.bestMonthlyProfitDelta!);
          expect(Object.is(m.worstMonthlyProfitDelta, -0)).toBe(false);
        }
      }
    });
  }

  it("zero revenue change collapses the range to the base case", () => {
    const m = computeStrategyMetrics(scenario({ expectedRevenueChange: 0, costChange: 12000, riskLevel: "high", investmentRequired: 1000 }), { now: NOW });
    expect(m.raw.worstMonthlyProfitDelta).toBe(-12000);
    expect(m.raw.bestMonthlyProfitDelta).toBe(-12000);
  });
});

describe("documented limitations (intentionally NOT changed in this phase)", () => {
  it("cost changes are treated as certain: a savings-only option has worst = base = best", () => {
    const savings = scenario({ expectedRevenueChange: 0, costChange: -8000, riskLevel: "high", investmentRequired: 50000, cashAvailable: 400000 });
    const { raw } = computeStrategyMetrics(savings, { now: NOW });
    expect(raw.worstMonthlyProfitDelta).toBe(8000);
    expect(raw.baseMonthlyProfitDelta).toBe(8000);
    expect(raw.bestMonthlyProfitDelta).toBe(8000);
  });

  it("timeToImpactMonths is collected but does not affect any metric, verdict or finding", () => {
    const a = scenario({ expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 150000, cashAvailable: 100000, timeToImpactMonths: 0 });
    const b = { ...a, timeToImpactMonths: 24 };
    const ma = computeStrategyMetrics(a, { now: NOW });
    const mb = computeStrategyMetrics(b, { now: NOW });
    expect(mb).toEqual(ma);
    expect(codes(b)).toEqual(codes(a));
  });
});

describe("units — revenue and cost changes are MONTHLY amounts", () => {
  it("ROI annualises the monthly profit change (×12); payback is expressed in months", () => {
    const i = scenario({ expectedRevenueChange: 1000, costChange: 0, investmentRequired: 12000, cashAvailable: 50000 });
    expect(roiAnnualPct(i)).toBe(100); // 1000/month × 12 / 12000
    expect(paybackMonths(i)).toBe(12); // 12000 / 1000 per month
  });
});

describe("rules use full-precision values — affordability boundaries (critical 0.5, min 1.0)", () => {
  // Economics are strong and safe so only affordability can move the verdict.
  const afford = (cashAvailable: number) =>
    scenario({ expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 10000, cashAvailable, riskLevel: "low" });

  it("0.4999 is critically unaffordable (display 0.5 must not hide it)", () => {
    const i = afford(4999);
    expect(computeStrategyMetrics(i, { now: NOW }).raw.affordabilityRatio).toBe(0.4999);
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("AVOID");
    const f = finding(i, "STR_UNAFFORDABLE")!;
    expect(f.severity).toBe("critical");
    expect(f.sourceValue).toBe(0.4999); // shown at a precision that agrees with the rule
  });
  it("0.5000 is unaffordable but not critical", () => {
    const i = afford(5000);
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("RISKY");
    expect(finding(i, "STR_UNAFFORDABLE")!.severity).toBe("high");
  });
  it("0.5001 is unaffordable but not critical", () => {
    const i = afford(5001);
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("RISKY");
    expect(finding(i, "STR_UNAFFORDABLE")!.severity).toBe("high");
  });
  it("0.9993 is unaffordable (display 1.00 must not pass it as funded)", () => {
    const i = afford(9993);
    const m = computeStrategyMetrics(i, { now: NOW });
    expect(m.affordabilityRatio).toBe(1); // display value
    expect(m.strategyState).toBe("RISKY");
    const f = finding(i, "STR_UNAFFORDABLE")!;
    expect(f.severity).toBe("high");
    expect(f.sourceValue).toBe(0.9993);
    expect(f.evidence[0]).toBe("affordabilityRatio = 0.9993 < 1");
  });
  it("1.0000 is fully covered", () => {
    expect(codes(afford(10000))).not.toContain("STR_UNAFFORDABLE");
    expect(computeStrategyMetrics(afford(10000), { now: NOW }).strategyState).toBe("STRONG_GO");
  });
  it("1.0001 is fully covered", () => {
    expect(codes(afford(10001))).not.toContain("STR_UNAFFORDABLE");
  });
});

describe("rules use full-precision values — ROI boundaries (0, 20, 100)", () => {
  // investment 120000 → ROI% = monthly profit / 100
  const roi = (expectedRevenueChange: number) =>
    scenario({ expectedRevenueChange, costChange: 0, investmentRequired: 120000, cashAvailable: 1000000 });

  it("ROI 19.9999 is weak even though it displays as 20", () => {
    const i = roi(1999.99);
    const m = computeStrategyMetrics(i, { now: NOW });
    expect(m.roiAnnualPct).toBe(20);
    expect(m.raw.roiAnnualPct).toBeLessThan(20);
    const f = finding(i, "STR_WEAK_ROI")!;
    expect(f).toBeDefined();
    expect(f.sourceValue).toBeLessThan(20);
  });
  it("ROI exactly 20 is not weak", () => {
    expect(codes(roi(2000))).not.toContain("STR_WEAK_ROI");
  });
  it("ROI 20.0001 is not weak", () => {
    expect(codes(roi(2000.01))).not.toContain("STR_WEAK_ROI");
  });
  it("ROI 99.9999 is not a strong return even though it displays as 100", () => {
    const i = roi(9999.99);
    expect(computeStrategyMetrics(i, { now: NOW }).roiAnnualPct).toBe(100);
    expect(codes(i)).not.toContain("STR_OPP_STRONG_RETURN");
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("GO");
  });
  it("ROI exactly 100 is a strong return", () => {
    expect(codes(roi(10000))).toContain("STR_OPP_STRONG_RETURN");
    expect(computeStrategyMetrics(roi(10000), { now: NOW }).strategyState).toBe("STRONG_GO");
  });
  it("ROI 100.0001 is a strong return", () => {
    expect(codes(roi(10000.01))).toContain("STR_OPP_STRONG_RETURN");
  });
  it("ROI just above 0 (tiny positive profit) is weak, not a loss", () => {
    const i = roi(0.001);
    const c = codes(i);
    expect(c).not.toContain("STR_NEGATIVE_BASE_CASE");
    expect(c).not.toContain("STR_NEGATIVE_ROI");
    expect(c).toContain("STR_WEAK_ROI");
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).not.toBe("AVOID");
  });
  it("ROI just below 0 is a loss", () => {
    expect(codes(roi(-0.001))).toContain("STR_NEGATIVE_BASE_CASE");
  });
});

describe("rules use full-precision values — payback boundaries (18, 36 months)", () => {
  // profit ≈ 10000/month; investment sets the payback
  const payback = (investmentRequired: number, expectedRevenueChange = 10000) =>
    scenario({ expectedRevenueChange, costChange: 0, investmentRequired, cashAvailable: 10000000 });

  it("exactly 18 months is within the comfortable window", () => {
    const c = codes(payback(180000));
    expect(c).not.toContain("STR_LONG_PAYBACK");
    expect(c).toContain("STR_OPP_FAST_PAYBACK");
  });
  it("18.00001 months is long even though it displays as 18", () => {
    const i = payback(180000, 9999.99);
    expect(computeStrategyMetrics(i, { now: NOW }).paybackMonths).toBe(18);
    const c = codes(i);
    expect(c).toContain("STR_LONG_PAYBACK");
    expect(c).not.toContain("STR_OPP_FAST_PAYBACK");
    expect(finding(i, "STR_LONG_PAYBACK")!.severity).toBe("medium");
  });
  it("17.99999 months is fast", () => {
    expect(codes(payback(180000, 10000.01))).toContain("STR_OPP_FAST_PAYBACK");
  });
  it("exactly 36 months is long but not critical", () => {
    expect(finding(payback(360000), "STR_LONG_PAYBACK")!.severity).toBe("medium");
    expect(computeStrategyMetrics(payback(360000), { now: NOW }).strategyState).toBe("MARGINAL");
  });
  it("36.00001 months is critical even though it displays as 36", () => {
    const i = payback(360000, 9999.99);
    expect(computeStrategyMetrics(i, { now: NOW }).paybackMonths).toBe(36);
    expect(finding(i, "STR_LONG_PAYBACK")!.severity).toBe("high");
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("RISKY");
  });
});

describe("rules use full-precision values — profit and downside signs", () => {
  const profit = (expectedRevenueChange: number, costChange: number) =>
    scenario({ expectedRevenueChange, costChange, investmentRequired: 1000, cashAvailable: 1000000 });

  it("negative monthly profit is a loss", () => {
    expect(codes(profit(9999.99, 10000))).toContain("STR_NEGATIVE_BASE_CASE");
  });
  it("zero monthly profit keeps the existing ≤ 0 rule (unchanged semantics)", () => {
    expect(codes(profit(10000, 10000))).toContain("STR_NEGATIVE_BASE_CASE");
  });
  it("tiny positive monthly profit is not a loss (display 0 must not flag it)", () => {
    const i = profit(10000.01, 10000);
    expect(computeStrategyMetrics(i, { now: NOW }).baseMonthlyProfitDelta).toBe(0);
    expect(codes(i)).not.toContain("STR_NEGATIVE_BASE_CASE");
  });

  // low risk spread 0.2 → worst = revenue × 0.8 − cost
  const downside = (costChange: number) =>
    scenario({ expectedRevenueChange: 10000, costChange, investmentRequired: 1000, cashAvailable: 1000000, riskLevel: "low" });

  it("slightly negative downside (−0.01) is flagged even though it displays as 0", () => {
    const i = downside(8000.01);
    const m = computeStrategyMetrics(i, { now: NOW });
    expect(m.worstMonthlyProfitDelta).toBe(0);
    expect(m.raw.worstMonthlyProfitDelta).toBeLessThan(0);
    expect(codes(i)).toContain("STR_NEGATIVE_WORST_CASE");
    expect(finding(i, "STR_NEGATIVE_WORST_CASE")!.sourceValue).toBeLessThan(0);
    expect(m.strategyState).toBe("RISKY");
  });
  it("zero downside is neither a loss nor a safe upside", () => {
    const c = codes(downside(8000));
    expect(c).not.toContain("STR_NEGATIVE_WORST_CASE");
    expect(c).not.toContain("STR_OPP_SAFE_UPSIDE");
  });
  it("slightly positive downside (+0.01) is a safe upside even though it displays as 0", () => {
    const c = codes(downside(7999.99));
    expect(c).toContain("STR_OPP_SAFE_UPSIDE");
    expect(c).not.toContain("STR_NEGATIVE_WORST_CASE");
  });
});

describe("zero and missing handling", () => {
  it("zero investment: no ROI ratio, payback 0, no affordability ratio, no division by zero", () => {
    const m = computeStrategyMetrics(scenario({ expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 0, cashAvailable: 0 }), { now: NOW });
    expect(m.raw.roiAnnualPct).toBeNull();
    expect(m.raw.paybackMonths).toBe(0);
    expect(m.raw.affordabilityRatio).toBeNull();
    for (const v of Object.values(m.raw)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
  });
  it("zero profit with an investment never pays back (payback null, not Infinity)", () => {
    const m = computeStrategyMetrics(scenario({ expectedRevenueChange: 12000, costChange: 12000, investmentRequired: 150000, cashAvailable: 400000 }), { now: NOW });
    expect(m.raw.paybackMonths).toBeNull();
    expect(m.raw.roiAnnualPct).toBe(0);
  });
  it("zero cash with an investment has affordability 0 (not missing)", () => {
    expect(affordabilityRatio(scenario({ expectedRevenueChange: 1, costChange: 0, investmentRequired: 1000, cashAvailable: 0 }))).toBe(0);
  });
  it("missing inputs yield null raw values, never invented numbers", () => {
    const { raw } = computeStrategyMetrics({ periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" }, { now: NOW });
    expect(raw).toEqual({
      baseMonthlyProfitDelta: null,
      bestMonthlyProfitDelta: null,
      worstMonthlyProfitDelta: null,
      roiAnnualPct: null,
      paybackMonths: null,
      affordabilityRatio: null,
    });
  });
});

describe("decimal inputs exactly on a threshold are not flipped by binary floating-point error", () => {
  // 16384.1 − 6384.1 is exactly 10000 in decimal but 10000.000000000002 in binary floating point.
  const dec = (investmentRequired: number) =>
    scenario({ expectedRevenueChange: 16384.1, costChange: 6384.1, investmentRequired, cashAvailable: 10000000, riskLevel: "low" });

  it("monthly profit of exactly 10000 is exactly 10000", () => {
    expect(computeStrategyMetrics(dec(180000), { now: NOW }).raw.baseMonthlyProfitDelta).toBe(10000);
  });
  it("payback of exactly 18 months is not long", () => {
    const i = dec(180000);
    expect(computeStrategyMetrics(i, { now: NOW }).raw.paybackMonths).toBe(18);
    expect(codes(i)).not.toContain("STR_LONG_PAYBACK");
    expect(codes(i)).toContain("STR_OPP_FAST_PAYBACK");
  });
  it("payback of exactly 36 months is long but not critical", () => {
    const i = dec(360000);
    expect(finding(i, "STR_LONG_PAYBACK")!.severity).toBe("medium");
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("MARGINAL");
  });
  it("ROI of exactly 100% is a strong return", () => {
    const i = dec(120000);
    expect(computeStrategyMetrics(i, { now: NOW }).raw.roiAnnualPct).toBe(100);
    expect(codes(i)).toContain("STR_OPP_STRONG_RETURN");
    expect(computeStrategyMetrics(i, { now: NOW }).strategyState).toBe("STRONG_GO");
  });
  it("a downside of exactly 0 (medium risk, 1.5 − 0.9 spread arithmetic) is neither a loss nor a safe upside", () => {
    // medium: 1.5 × 0.6 − 0.9 = 0 exactly in decimal, −1.1e-16 in binary
    const i = scenario({ expectedRevenueChange: 1.5, costChange: 0.9, investmentRequired: 1, cashAvailable: 1000, riskLevel: "medium" });
    expect(computeStrategyMetrics(i, { now: NOW }).raw.worstMonthlyProfitDelta).toBe(0);
    const c = codes(i);
    expect(c).not.toContain("STR_NEGATIVE_WORST_CASE");
    expect(c).not.toContain("STR_OPP_SAFE_UPSIDE");
  });
  it("a downside of exactly 0 (low risk, 0.1 − 0.08) is not a safe upside", () => {
    const i = scenario({ expectedRevenueChange: 0.1, costChange: 0.08, investmentRequired: 1, cashAvailable: 1000, riskLevel: "low" });
    expect(computeStrategyMetrics(i, { now: NOW }).raw.worstMonthlyProfitDelta).toBe(0);
    expect(codes(i)).not.toContain("STR_OPP_SAFE_UPSIDE");
  });
  it("real paise-level differences are still distinguished (not swallowed by noise removal)", () => {
    // 0.01/month of profit is real money, not floating-point noise
    const i = scenario({ expectedRevenueChange: 10000.01, costChange: 10000, investmentRequired: 1000, cashAvailable: 1000000 });
    expect(computeStrategyMetrics(i, { now: NOW }).raw.baseMonthlyProfitDelta).toBeCloseTo(0.01, 10);
    expect(codes(i)).not.toContain("STR_NEGATIVE_BASE_CASE");
  });
  it("a large exhaustive decimal sweep keeps exact-threshold inputs on the inclusive side", () => {
    // every paise pair whose decimal difference is exactly 10000 → payback exactly 18 with 180000 invested
    for (let paise = 1; paise <= 999; paise += 7) {
      const cost = 6384 + paise / 100;
      const rev = 16384 + paise / 100;
      const i = scenario({ expectedRevenueChange: rev, costChange: cost, investmentRequired: 180000, cashAvailable: 10000000 });
      const m = computeStrategyMetrics(i, { now: NOW });
      expect(m.raw.baseMonthlyProfitDelta).toBe(10000);
      expect(m.raw.paybackMonths).toBe(18);
    }
  });
});

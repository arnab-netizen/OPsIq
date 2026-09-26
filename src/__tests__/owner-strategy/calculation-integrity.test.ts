/**
 * Owner Strategy — scenario range ordering (worst ≤ base ≤ best for every sign). Pure/no DB.
 */
import { describe, it, expect } from "vitest";
import {
  computeStrategyMetrics,
  baseMonthlyProfitDelta,
  bestMonthlyProfitDelta,
  worstMonthlyProfitDelta,
  STRATEGY_RISK_LEVELS,
  type StrategySnapshotInput,
  type StrategyRiskLevel,
} from "@/domain/owner-strategy";

function scenario(over: Partial<StrategySnapshotInput>): StrategySnapshotInput {
  return { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", riskLevel: "low", ...over };
}

describe("scenario range — worst ≤ base ≤ best for every sign", () => {
  it("negative revenue change: worst/best are not inverted (cost-cut example)", () => {
    const cut = scenario({ expectedRevenueChange: -10000, costChange: -15000, riskLevel: "medium", investmentRequired: 50000, cashAvailable: 400000 });
    expect(worstMonthlyProfitDelta(cut)).toBe(1000);
    expect(bestMonthlyProfitDelta(cut)).toBe(9000);
    expect(baseMonthlyProfitDelta(cut)).toBe(5000);
  });
  const revenues = [-50000, -10000, -1, 0, 1, 10000, 50000];
  const costs = [-40000, -15000, 0, 12000, 60000];
  for (const risk of STRATEGY_RISK_LEVELS as readonly StrategyRiskLevel[]) {
    it(`invariant holds across the revenue × cost matrix (risk ${risk})`, () => {
      for (const expectedRevenueChange of revenues) for (const costChange of costs) {
        const m = computeStrategyMetrics(scenario({ expectedRevenueChange, costChange, riskLevel: risk, investmentRequired: 100000, cashAvailable: 100000 }));
        expect(m.worstMonthlyProfitDelta!).toBeLessThanOrEqual(m.baseMonthlyProfitDelta!);
        expect(m.baseMonthlyProfitDelta!).toBeLessThanOrEqual(m.bestMonthlyProfitDelta!);
      }
    });
  }
});

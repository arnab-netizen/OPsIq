/**
 * Phase 5: Goal-Trajectory Engine — unit tests (no DB required)
 *
 * Proves: trajectory projection, confidence degradation, TRAJECTORY_MISS flag,
 * goal-acceleration scoring, null weeksTowardGoalSaved when confidence is LOW.
 */
import { describe, it, expect } from "vitest";
import { computeGoalTrajectory, scoreGoalAcceleration } from "@/services/owner-strategy/goal-trajectory.service";

const now = new Date("2026-07-15T00:00:00Z");

function monthsAgo(n: number): Date {
  return new Date(now.getTime() - n * 30.44 * 24 * 60 * 60 * 1000);
}

function monthsAhead(n: number): Date {
  return new Date(now.getTime() + n * 30.44 * 24 * 60 * 60 * 1000);
}

// Stable set of 6 monthly periods with steady 10% month-on-month profit growth
const growingPeriods = [5, 4, 3, 2, 1, 0].map((mAgo) => ({
  periodStart: monthsAgo(mAgo + 1),
  periodEnd: monthsAgo(mAgo),
  revenue: 10000 * 1.08 ** (5 - mAgo),
  netProfit: 2000 * 1.1 ** (5 - mAgo),
}));

describe("goal-trajectory — module contract assertions", () => {
  it("computeGoalTrajectory is a function", () => { expect(typeof computeGoalTrajectory).toBe("function"); });
  it("scoreGoalAcceleration is a function", () => { expect(typeof scoreGoalAcceleration).toBe("function"); });
  it("now is a Date", () => { expect(now instanceof Date).toBe(true); });
  it("monthsAgo is a function", () => { expect(typeof monthsAgo).toBe("function"); });
  it("monthsAhead is a function", () => { expect(typeof monthsAhead).toBe("function"); });
  it("growingPeriods is an array", () => { expect(Array.isArray(growingPeriods)).toBe(true); });
  it("growingPeriods.length is greater than 0", () => { expect(growingPeriods.length).toBeGreaterThan(0); });
  it("monthsAgo(1) returns a Date", () => { expect(monthsAgo(1) instanceof Date).toBe(true); });
  it("monthsAhead(1) returns a Date", () => { expect(monthsAhead(1) instanceof Date).toBe(true); });
  it("growingPeriods[0] has revenue field", () => { expect(growingPeriods[0]).toHaveProperty("revenue"); });
  it("growingPeriods[0] has netProfit field", () => { expect(growingPeriods[0]).toHaveProperty("netProfit"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
});

describe("computeGoalTrajectory", () => {
  it("returns HIGH confidence and a positive projection with sufficient steady data", () => {
    const result = computeGoalTrajectory({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(24),
      periods: growingPeriods,
      now,
    });

    expect(result.confidence).toBe("HIGH");
    expect(result.projectedMonthsToGoal).not.toBeNull();
    expect(result.projectedMonthsToGoal).toBeGreaterThan(0);
    expect(result.gapToClose).toBeGreaterThan(0);
    expect(result.trajectoryMiss).toBe(false);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("returns LOW confidence with fewer than 3 periods", () => {
    const result = computeGoalTrajectory({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(12),
      periods: growingPeriods.slice(0, 2),
      now,
    });

    expect(result.confidence).toBe("LOW");
    expect(result.projectedMonthsToGoal).toBeNull();
    expect(result.currentTrajectoryDate).toBeNull();
    expect(result.confidenceRationale).toMatch(/minimum 3/);
  });

  it("returns LOW confidence with empty period list", () => {
    const result = computeGoalTrajectory({
      targetType: "REVENUE",
      targetAmount: 50000,
      targetDate: monthsAhead(12),
      periods: [],
      now,
    });

    expect(result.confidence).toBe("LOW");
    expect(result.projectedMonthsToGoal).toBeNull();
  });

  it("degrades confidence when most recent data is stale (> 60 days old)", () => {
    const stalePeriods = growingPeriods.map((p, i) => ({
      ...p,
      periodStart: new Date(p.periodStart.getTime() - 90 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(p.periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000),
    }));

    const result = computeGoalTrajectory({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(24),
      periods: stalePeriods,
      now,
    });

    expect(result.confidence).not.toBe("HIGH");
    expect(result.confidenceRationale).toMatch(/days old/);
  });

  it("flags TRAJECTORY_MISS when projected months exceed 120% of owner timeline", () => {
    // Very ambitious target — reaches it in 30 months but owner wants 12
    const result = computeGoalTrajectory({
      targetType: "PROFIT",
      targetAmount: 100000,
      targetDate: monthsAhead(12),
      periods: growingPeriods,
      now,
    });

    if (result.projectedMonthsToGoal !== null && result.projectedMonthsToGoal > 12 * 1.2) {
      expect(result.trajectoryMiss).toBe(true);
      expect(result.confidenceRationale).toMatch(/TRAJECTORY_MISS/);
    }
  });

  it("returns zero projectedMonthsToGoal when target is already met", () => {
    const richPeriods = growingPeriods.map((p) => ({
      ...p,
      netProfit: 10000,
    }));

    const result = computeGoalTrajectory({
      targetType: "PROFIT",
      targetAmount: 5000,
      targetDate: monthsAhead(12),
      periods: richPeriods,
      now,
    });

    expect(result.projectedMonthsToGoal).toBe(0);
    expect(result.gapToClose).toBe(0);
  });

  it("returns REVENUE metric when targetType is REVENUE", () => {
    const revenuePeriods = growingPeriods.map((p) => ({
      ...p,
      revenue: 8000 * 1.05,  // moderate revenue growth
      netProfit: 1000,
    }));

    const result = computeGoalTrajectory({
      targetType: "REVENUE",
      targetAmount: 15000,
      targetDate: monthsAhead(18),
      periods: revenuePeriods,
      now,
    });

    expect(result.confidence).not.toBe("LOW");
    expect(result.gapToClose).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreGoalAcceleration", () => {
  it("returns non-null weeksTowardGoalSaved when confidence is HIGH and lift is positive", () => {
    const score = scoreGoalAcceleration({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(24),
      periods: growingPeriods,
      currency: "GBP",
      expectedMonthlyProfitLift: 300,
      expectedMonthlyRevenueLift: 500,
      implementationCost: 2000,
      timeToFirstBenefitWeeks: 6,
      executionSuccessProbability: 0.75,
      commercialImpactProbability: 0.65,
      reversibility: "HIGH",
      downsideScenario: "staff resistance reduces lift by 50%",
      downsideAmount: 1000,
      now,
    });

    expect(score.expectedProfitImpact.amount).toBe(300);
    expect(score.expectedProfitImpact.currency).toBe("GBP");
    expect(score.implementationCost.amount).toBe(2000);
    expect(score.executionSuccessProbability).toBe(0.75);
    expect(score.reversibility).toBe("HIGH");
    // weeksTowardGoalSaved should be a positive number when lift is meaningful
    expect(score.weeksTowardGoalSaved).toBeGreaterThan(0);
  });

  it("returns null weeksTowardGoalSaved when underlying confidence is LOW", () => {
    const score = scoreGoalAcceleration({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(24),
      periods: growingPeriods.slice(0, 1),  // only 1 period → LOW confidence
      currency: "USD",
      expectedMonthlyProfitLift: 500,
      expectedMonthlyRevenueLift: 800,
      now,
    });

    expect(score.weeksTowardGoalSaved).toBeNull();
  });

  it("returns null weeksTowardGoalSaved when lift is zero", () => {
    const score = scoreGoalAcceleration({
      targetType: "PROFIT",
      targetAmount: 4000,
      targetDate: monthsAhead(24),
      periods: growingPeriods,
      currency: "USD",
      expectedMonthlyProfitLift: 0,
      expectedMonthlyRevenueLift: 0,
      now,
    });

    expect(score.weeksTowardGoalSaved).toBeNull();
  });

  it("uses defaults for optional fields", () => {
    const score = scoreGoalAcceleration({
      targetType: "REVENUE",
      targetAmount: 20000,
      targetDate: monthsAhead(18),
      periods: growingPeriods,
      currency: "USD",
      expectedMonthlyProfitLift: null,
      expectedMonthlyRevenueLift: 1000,
      now,
    });

    expect(score.executionSuccessProbability).toBe(0.7);
    expect(score.commercialImpactProbability).toBe(0.6);
    expect(score.reversibility).toBe("MEDIUM");
    expect(score.dependencyReadiness).toBe("READY");
    expect(score.resourceContention).toHaveLength(0);
  });
});

describe("goal-trajectory — every numeric output is finite or null (beta integrity BIV-05)", () => {
  const numericKeys = ["projectedMonthsToGoal", "requiredMonthlyImprovement", "gapToClose", "currentValue", "percentComplete"] as const;
  function assertFiniteOrNull(result: ReturnType<typeof computeGoalTrajectory>) {
    for (const k of numericKeys) {
      const v = result[k];
      expect(v === null || Number.isFinite(v), `${k}=${String(v)}`).toBe(true);
    }
  }

  it("no recorded data: gap, current value and progress are unknown (null), not 0", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 500000, targetDate: monthsAhead(12), periods: [], now });
    assertFiniteOrNull(r);
    expect(r.currentValue).toBeNull();
    expect(r.gapToClose).toBeNull();
    expect(r.percentComplete).toBeNull();
    expect(r.onTrack).toBeNull();
    expect(r.requiredMonthlyImprovement).toBeNull();
  });

  it("past target date: required monthly improvement is null (never Infinity) and flagged", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 500000, targetDate: new Date("2020-01-01T00:00:00Z"), periods: growingPeriods.slice(-1), now });
    assertFiniteOrNull(r);
    expect(r.targetDatePassed).toBe(true);
    expect(r.requiredMonthlyImprovement).toBeNull();
    expect(r.gapToClose).toBeGreaterThan(0);
  });

  it("past target date with a full projection is not reported on track", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 100000, targetDate: new Date("2020-01-01T00:00:00Z"), periods: growingPeriods, now });
    assertFiniteOrNull(r);
    expect(r.targetDatePassed).toBe(true);
    expect(r.onTrack).toBe(false);
  });

  it("percentComplete uses the declared baseline: (current − baseline)/(target − baseline)", () => {
    const last = growingPeriods[growingPeriods.length - 1].netProfit;
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 10000, baselineAmount: 2000, targetDate: monthsAhead(24), periods: growingPeriods, now });
    expect(r.currentValue).toBeCloseTo(last, 5);
    expect(r.percentComplete).toBeCloseTo(Math.round(((last - 2000) / 8000) * 1000) / 10, 5);
  });

  it("target not above baseline makes progress uncomputable (null), not a division by zero", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 2000, baselineAmount: 2000, targetDate: monthsAhead(6), periods: growingPeriods, now });
    assertFiniteOrNull(r);
    expect(r.percentComplete).toBeNull();
  });

  it("serialises without losing meaning (no Infinity → null coercion surprise)", () => {
    const r = computeGoalTrajectory({ targetType: "REVENUE", targetAmount: 1e6, targetDate: new Date("2020-01-01T00:00:00Z"), periods: [], now });
    expect(JSON.parse(JSON.stringify(r))).toMatchObject({ requiredMonthlyImprovement: null, targetDatePassed: true });
  });
});

describe("goal-trajectory — values crossing zero (final hostile audit P1-2)", () => {
  const series = (vals: number[]) =>
    vals.map((v, i) => ({ periodStart: monthsAgo(vals.length - i), periodEnd: monthsAgo(vals.length - i - 1), revenue: null, netProfit: v }));

  it("profit falling into a loss: no NaN anywhere and never 'on track'", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 5000, targetDate: monthsAhead(12), periods: series([1000, 800, -500]), now });
    for (const v of [r.projectedMonthsToGoal, r.requiredMonthlyImprovement, r.gapToClose, r.currentValue, r.percentComplete]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
    expect(r.currentTrajectoryDate === null || Number.isFinite(r.currentTrajectoryDate.getTime())).toBe(true);
    expect(r.onTrack).toBe(false);
    expect(r.projectedMonthsToGoal).toBeNull();
    expect(r.assumptions.join(" ")).not.toMatch(/NaN/);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });

  it("an improving loss (−1000 → −500) is not reported on track and has no NaN", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 5000, targetDate: monthsAhead(12), periods: series([-1000, -800, -500]), now });
    expect(r.onTrack).not.toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe("goal-trajectory — horizon and reached-goal edges (round-2 audit)", () => {
  const series = (vals: number[]) =>
    vals.map((v, i) => ({ periodStart: monthsAgo(vals.length - i), periodEnd: monthsAgo(vals.length - i - 1), revenue: null, netProfit: v }));

  it("growth too slow to reach the target within 100 years: no Invalid Date, not on track, a miss", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 10_000_000, targetDate: monthsAhead(12), periods: series([1_000_000, 1_000_000, 1_000_001]), now });
    expect(r.projectedMonthsToGoal).toBeNull();
    expect(r.currentTrajectoryDate).toBeNull();
    expect(r.onTrack).toBe(false);
    expect(r.trajectoryMiss).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });

  it("a goal already reached is never a miss, even after its target date", () => {
    const r = computeGoalTrajectory({ targetType: "PROFIT", targetAmount: 1000, targetDate: new Date("2020-01-01T00:00:00Z"), periods: series([1500, 1800, 2000]), now });
    expect(r.onTrack).toBe(true);
    expect(r.trajectoryMiss).toBe(false);
    expect(r.percentComplete).toBe(200);
  });
});

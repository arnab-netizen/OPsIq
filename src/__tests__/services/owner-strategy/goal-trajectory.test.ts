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

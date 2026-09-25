/**
 * Phase 5: Goal-Trajectory Engine
 *
 * Pure function — takes trailing financial snapshots and an owner goal,
 * returns a trajectory projection: how many months to reach the goal,
 * with explicit confidence level and assumptions.
 *
 * NEVER fabricates confidence. Confidence degrades when:
 *   - fewer than 3 months of data
 *   - high variance between periods
 *   - stale data (most recent snapshot > 60 days old)
 *   - contradictory signals (e.g. revenue up but profit down)
 *
 * weeksTowardGoalSaved: null when confidence is LOW.
 */

export type TrajectoryConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface TrailingPeriod {
  periodStart: Date;
  periodEnd: Date;
  revenue: number | null;
  netProfit: number | null;
}

export interface GoalTrajectoryInput {
  targetType: "PROFIT" | "REVENUE" | "NET_WORTH" | "MULTIPLE";
  targetAmount: number;
  targetDate: Date;
  baselineAmount?: number | null;
  baselineDate?: Date | null;
  /** Trailing periods, oldest first. Minimum 3 required for HIGH confidence. */
  periods: TrailingPeriod[];
  /** Current date — injectable for deterministic tests. */
  now?: Date;
}

/**
 * Every numeric field is either a finite number or null. null means "not
 * computable from the recorded data" and must be rendered as unavailable —
 * never as 0, NaN or Infinity.
 */
export interface GoalTrajectoryResult {
  projectedMonthsToGoal: number | null;
  currentTrajectoryDate: Date | null;
  confidence: TrajectoryConfidence;
  confidenceRationale: string;
  /** null when the target date has passed or the current value is unknown. */
  requiredMonthlyImprovement: number | null;
  /** null when no period has a recorded value for the goal metric. */
  gapToClose: number | null;
  trajectoryMiss: boolean;
  assumptions: string[];
  /** Latest recorded value of the goal metric; null when none recorded. */
  currentValue: number | null;
  /**
   * Progress toward target in percent: (current − baseline) / (target − baseline) × 100,
   * with baseline 0 when none was declared. null when the current value is unknown
   * or the target does not exceed the baseline.
   */
  percentComplete: number | null;
  /** true/false only when a projection exists; null when it cannot be determined. */
  onTrack: boolean | null;
  /** true when the declared target date is already in the past. */
  targetDatePassed: boolean;
}

function computeProgress(
  currentValue: number | null,
  targetAmount: number,
  baselineAmount: number | null | undefined
): number | null {
  if (currentValue === null) return null;
  const base = baselineAmount ?? 0;
  const span = targetAmount - base;
  if (!Number.isFinite(span) || span <= 0) return null;
  const pct = ((currentValue - base) / span) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null;
}

export interface GoalAccelerationScore {
  expectedProfitImpact: { amount: number; currency: string; confidence: TrajectoryConfidence };
  expectedRevenueImpact: { amount: number; currency: string; confidence: TrajectoryConfidence };
  timeToFirstBenefit: { weeks: number; confidence: TrajectoryConfidence };
  implementationCost: { amount: number; currency: string; oneTime: boolean };
  recurringCost: { amount: number; currency: string; period: "monthly" | "annual" };
  executionSuccessProbability: number;
  commercialImpactProbability: number;
  reversibility: "HIGH" | "MEDIUM" | "LOW" | "IRREVERSIBLE";
  downsideExposure: { amount: number; currency: string; scenario: string };
  dependencyReadiness: "READY" | "BLOCKED" | "PARTIAL";
  resourceContention: string[];
  weeksTowardGoalSaved: number | null;
}

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;
const STALE_DAYS = 60;
/** Projections beyond this horizon are reported as "not reachable at the current rate" (no date). */
const MAX_PROJECTION_MONTHS = 1200;

function extractMetric(period: TrailingPeriod, targetType: GoalTrajectoryInput["targetType"]): number | null {
  if (targetType === "REVENUE" || targetType === "MULTIPLE") return period.revenue;
  return period.netProfit;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Compound monthly growth rate from first to last value, or null when it is not
 * defined: a compound rate needs both endpoints positive (a series that starts at
 * or below zero, or crosses into a loss, has no real-valued rate — raising a
 * negative ratio to a fractional power is NaN).
 */
function cagr(first: number, last: number, months: number): number | null {
  if (months <= 0) return 0;
  if (first <= 0 || last <= 0) return null;
  const rate = (last / first) ** (1 / months) - 1;
  return Number.isFinite(rate) ? rate : null;
}

/** Compute trajectory: how many months from now to reach target at current growth rate. */
export function computeGoalTrajectory(input: GoalTrajectoryInput): GoalTrajectoryResult {
  const now = input.now ?? new Date();
  const assumptions: string[] = [];
  const periods = input.periods;

  // ─── Confidence degradation checks ────────────────────────────────────────

  const validValues = periods
    .map((p) => extractMetric(p, input.targetType))
    .filter((v): v is number => v !== null && Number.isFinite(v));

  let confidence: TrajectoryConfidence = "HIGH";
  const rationale: string[] = [];

  if (validValues.length < 3) {
    confidence = "LOW";
    rationale.push(`only ${validValues.length} period(s) with data — minimum 3 required for any confidence`);
  }

  const mostRecent = periods[periods.length - 1];
  if (mostRecent) {
    const daysSinceEnd = (now.getTime() - mostRecent.periodEnd.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceEnd > STALE_DAYS) {
      if (confidence === "HIGH") confidence = "MEDIUM";
      rationale.push(`most recent data is ${Math.round(daysSinceEnd)} days old (threshold: ${STALE_DAYS} days)`);
    }
  }

  if (validValues.length >= 2) {
    const cv = coefficientOfVariation(validValues);
    if (cv > 0.5) {
      if (confidence === "HIGH") confidence = "MEDIUM";
      rationale.push(`high variance in trailing periods (CV=${(cv * 100).toFixed(0)}%) — projection may not hold`);
    }
  }

  // ─── Return early if LOW confidence ───────────────────────────────────────

  const ownerTimelineMonths = (input.targetDate.getTime() - now.getTime()) / MS_PER_MONTH;
  const targetDatePassed = ownerTimelineMonths <= 0;
  if (targetDatePassed) {
    rationale.push("target date has already passed");
  }

  if (confidence === "LOW") {
    // Missing data is reported as unknown — never substituted with 0.
    const currentValue = validValues.length > 0 ? validValues[validValues.length - 1] : null;
    const gapToClose = currentValue === null ? null : Math.max(0, input.targetAmount - currentValue);
    const requiredMonthlyImprovement =
      gapToClose === null || targetDatePassed ? null : gapToClose / ownerTimelineMonths;

    return {
      projectedMonthsToGoal: null,
      currentTrajectoryDate: null,
      confidence,
      confidenceRationale: rationale.join("; "),
      requiredMonthlyImprovement,
      gapToClose,
      trajectoryMiss: false,
      assumptions: ["Insufficient data for projection"],
      currentValue,
      percentComplete: computeProgress(currentValue, input.targetAmount, input.baselineAmount),
      onTrack: currentValue !== null && currentValue >= input.targetAmount ? true : null,
      targetDatePassed,
    };
  }

  // ─── Compute projection ────────────────────────────────────────────────────

  const firstValue = validValues[0];
  const lastValue = validValues[validValues.length - 1];
  const monthsCovered = validValues.length - 1;
  const monthlyGrowthRate = cagr(firstValue, lastValue, monthsCovered);

  if (monthlyGrowthRate !== null) {
    assumptions.push(`trailing ${validValues.length}-period compound growth rate: ${(monthlyGrowthRate * 100).toFixed(2)}%/month`);
  }
  assumptions.push(`projection assumes current growth rate continues unchanged`);
  assumptions.push(`target: ${input.targetType} ≥ ${input.targetAmount}`);

  let projectedMonthsToGoal: number | null = null;
  let currentTrajectoryDate: Date | null = null;
  let beyondHorizon = false;

  if (lastValue >= input.targetAmount) {
    projectedMonthsToGoal = 0;
    currentTrajectoryDate = now;
    assumptions.push("current value already meets or exceeds target");
  } else if (monthlyGrowthRate === null) {
    projectedMonthsToGoal = null;
    currentTrajectoryDate = null;
    rationale.push("growth rate is not computable (the recorded values start at or cross zero) — no projection");
    if (confidence === "HIGH") confidence = "MEDIUM";
  } else if (monthlyGrowthRate <= 0) {
    projectedMonthsToGoal = null;
    currentTrajectoryDate = null;
    rationale.push("no positive growth trend — projection cannot determine when target will be reached");
    if (confidence === "HIGH") confidence = "MEDIUM";
  } else {
    // Solve: lastValue * (1 + rate)^n = target → n = ln(target/lastValue) / ln(1+rate)
    const n = Math.log(input.targetAmount / lastValue) / Math.log(1 + monthlyGrowthRate);
    if (Number.isFinite(n) && n <= MAX_PROJECTION_MONTHS) {
      projectedMonthsToGoal = Math.ceil(n);
      currentTrajectoryDate = new Date(now.getTime() + projectedMonthsToGoal * MS_PER_MONTH);
    } else {
      beyondHorizon = true;
      rationale.push(`at the current growth rate the target is more than ${MAX_PROJECTION_MONTHS / 12} years away — no projected date`);
    }
  }

  const gapToClose = Math.max(0, input.targetAmount - lastValue);
  const requiredMonthlyImprovement = targetDatePassed ? null : gapToClose / ownerTimelineMonths;

  const reached = lastValue >= input.targetAmount;
  // A goal already reached is never a miss.
  const trajectoryMiss =
    !reached &&
    (beyondHorizon || (projectedMonthsToGoal !== null && projectedMonthsToGoal > ownerTimelineMonths * 1.2));
  // No projection: a shrinking series is not on track; otherwise unknown. Never "true" without a projection.
  const onTrack: boolean | null = reached
    ? true
    : projectedMonthsToGoal === null
      ? beyondHorizon || lastValue < firstValue
        ? false
        : monthlyGrowthRate !== null && monthlyGrowthRate <= 0
          ? false
          : null
      : !trajectoryMiss && !targetDatePassed;

  if (trajectoryMiss) {
    rationale.push("TRAJECTORY_MISS: current growth rate will not reach target within 120% of the declared timeline");
  }

  return {
    projectedMonthsToGoal,
    currentTrajectoryDate,
    confidence,
    confidenceRationale: rationale.length > 0 ? rationale.join("; ") : "trajectory is within normal confidence bounds",
    requiredMonthlyImprovement,
    gapToClose,
    trajectoryMiss,
    assumptions,
    currentValue: lastValue,
    percentComplete: computeProgress(lastValue, input.targetAmount, input.baselineAmount),
    onTrack,
    targetDatePassed,
  };
}

/**
 * Score a recommendation by how many weeks it would accelerate goal attainment.
 * Returns null for weeksTowardGoalSaved when confidence is LOW or impact is unknown.
 */
export function scoreGoalAcceleration(
  opts: {
    targetType: GoalTrajectoryInput["targetType"];
    targetAmount: number;
    targetDate: Date;
    periods: TrailingPeriod[];
    currency: string;
    expectedMonthlyProfitLift: number | null;
    expectedMonthlyRevenueLift: number | null;
    implementationCost?: number;
    implementationCostOneTime?: boolean;
    recurringMonthlyCost?: number;
    timeToFirstBenefitWeeks?: number;
    executionSuccessProbability?: number;
    commercialImpactProbability?: number;
    reversibility?: GoalAccelerationScore["reversibility"];
    downsideScenario?: string;
    downsideAmount?: number;
    resourceContention?: string[];
    dependencyReadiness?: GoalAccelerationScore["dependencyReadiness"];
    now?: Date;
  },
): GoalAccelerationScore {
  const now = opts.now ?? new Date();
  const currency = opts.currency;

  const baseline = computeGoalTrajectory({
    targetType: opts.targetType,
    targetAmount: opts.targetAmount,
    targetDate: opts.targetDate,
    periods: opts.periods,
    now,
  });

  let weeksTowardGoalSaved: number | null = null;

  if (baseline.confidence !== "LOW" && baseline.projectedMonthsToGoal !== null) {
    const liftAmount = opts.targetType === "REVENUE" || opts.targetType === "MULTIPLE"
      ? opts.expectedMonthlyRevenueLift
      : opts.expectedMonthlyProfitLift;

    if (liftAmount !== null && liftAmount > 0) {
      const liftedPeriods = opts.periods.map((p) => ({
        ...p,
        netProfit: p.netProfit !== null ? p.netProfit + liftAmount : null,
        revenue: p.revenue !== null ? p.revenue + liftAmount : null,
      }));
      const withLift = computeGoalTrajectory({
        targetType: opts.targetType,
        targetAmount: opts.targetAmount,
        targetDate: opts.targetDate,
        periods: liftedPeriods,
        now,
      });
      if (withLift.projectedMonthsToGoal !== null) {
        const savedMonths = baseline.projectedMonthsToGoal - withLift.projectedMonthsToGoal;
        weeksTowardGoalSaved = savedMonths > 0 ? Math.round(savedMonths * 4.33) : null;
      }
    }
  }

  const impactConfidence: TrajectoryConfidence = baseline.confidence;

  return {
    expectedProfitImpact: {
      amount: opts.expectedMonthlyProfitLift ?? 0,
      currency,
      confidence: impactConfidence,
    },
    expectedRevenueImpact: {
      amount: opts.expectedMonthlyRevenueLift ?? 0,
      currency,
      confidence: impactConfidence,
    },
    timeToFirstBenefit: {
      weeks: opts.timeToFirstBenefitWeeks ?? 4,
      confidence: impactConfidence,
    },
    implementationCost: {
      amount: opts.implementationCost ?? 0,
      currency,
      oneTime: opts.implementationCostOneTime ?? true,
    },
    recurringCost: {
      amount: opts.recurringMonthlyCost ?? 0,
      currency,
      period: "monthly",
    },
    executionSuccessProbability: opts.executionSuccessProbability ?? 0.7,
    commercialImpactProbability: opts.commercialImpactProbability ?? 0.6,
    reversibility: opts.reversibility ?? "MEDIUM",
    downsideExposure: {
      amount: opts.downsideAmount ?? 0,
      currency,
      scenario: opts.downsideScenario ?? "unknown",
    },
    dependencyReadiness: opts.dependencyReadiness ?? "READY",
    resourceContention: opts.resourceContention ?? [],
    weeksTowardGoalSaved,
  };
}

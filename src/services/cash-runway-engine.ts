// CashRunwayEngine - Cash runway and burn rate analysis
// Phase 4 Slice 2: Temporal cash depletion modeling

export interface CashRunwayAnalysis {
  currentCash: number;
  monthlyBurn: number;
  runwayDays: number;
  runwayMonths: number;
  daysUntilCritical: number;
  projectedDepletion: Date;
  hasAdequateRunway: boolean;
  riskLevel: 'CRITICAL' | 'AT_RISK' | 'ADEQUATE' | 'HEALTHY' | 'STRONG';
}

export interface BurnTrendAnalysis {
  currentMonthBurn: number;
  previousMonthBurn: number;
  trendDirection: 'increasing' | 'stable' | 'decreasing';
  monthOverMonthChange: number;
  accelerationPercent: number;
  projectedBurnInSixMonths: number;
}

export class CashRunwayEngine {
  /**
   * Analyze cash runway based on current cash and monthly burn
   * Deterministic: same inputs always produce same runway
   */
  static analyzeCashRunway(
    currentCash: number,
    monthlyBurn: number
  ): CashRunwayAnalysis {
    // Validate inputs
    if (currentCash < 0) currentCash = 0;
    if (monthlyBurn <= 0) monthlyBurn = 0.01; // Prevent division by zero

    // Calculate runway in days
    const runwayDays =
      monthlyBurn === 0 ? 999 : (currentCash / monthlyBurn) * 30;
    const runwayMonths = runwayDays / 30;

    // Determine risk level (fail-closed: more conservative)
    let riskLevel: 'CRITICAL' | 'AT_RISK' | 'ADEQUATE' | 'HEALTHY' | 'STRONG';
    if (runwayDays < 30) {
      riskLevel = 'CRITICAL';
    } else if (runwayDays < 90) {
      riskLevel = 'AT_RISK';
    } else if (runwayDays < 120) {
      riskLevel = 'ADEQUATE';
    } else if (runwayDays < 180) {
      riskLevel = 'HEALTHY';
    } else {
      riskLevel = 'STRONG';
    }

    // Calculate critical depletion point (30 days)
    const daysUntilCritical = runwayDays - 30;

    // Project depletion date
    const projectedDepletion = new Date();
    projectedDepletion.setDate(projectedDepletion.getDate() + runwayDays);

    return {
      currentCash,
      monthlyBurn,
      runwayDays,
      runwayMonths,
      daysUntilCritical,
      projectedDepletion,
      hasAdequateRunway: runwayDays >= 120,
      riskLevel,
    };
  }

  /**
   * Analyze burn trend (acceleration/deceleration)
   * Returns directional trend and projected future burn
   */
  static analyzeBurnTrend(
    currentMonthBurn: number,
    previousMonthBurn: number
  ): BurnTrendAnalysis {
    const monthOverMonthChange =
      currentMonthBurn - previousMonthBurn;
    const accelerationPercent =
      previousMonthBurn > 0
        ? (monthOverMonthChange / previousMonthBurn) * 100
        : 0;

    // Determine trend direction
    let trendDirection: 'increasing' | 'stable' | 'decreasing';
    if (accelerationPercent > 5) {
      trendDirection = 'increasing';
    } else if (accelerationPercent < -5) {
      trendDirection = 'decreasing';
    } else {
      trendDirection = 'stable';
    }

    // Project burn in 6 months assuming trend continues
    const monthlyAcceleration = accelerationPercent / 100;
    const projectedBurnInSixMonths =
      currentMonthBurn * Math.pow(1 + monthlyAcceleration, 6);

    return {
      currentMonthBurn,
      previousMonthBurn,
      trendDirection,
      monthOverMonthChange,
      accelerationPercent,
      projectedBurnInSixMonths,
    };
  }

  /**
   * Forecast cash position at future date
   * Useful for planning and decision-making
   */
  static forecastCash(
    currentCash: number,
    monthlyBurn: number,
    monthsAhead: number
  ): {
    projectedCash: number;
    daysRemaining: number;
    depleted: boolean;
  } {
    const projectedCash = Math.max(
      0,
      currentCash - monthlyBurn * monthsAhead
    );
    const projectedRunway =
      monthlyBurn === 0
        ? 999
        : (projectedCash / monthlyBurn) * 30;

    return {
      projectedCash,
      daysRemaining: projectedRunway,
      depleted: projectedCash <= 0,
    };
  }

  /**
   * Calculate required monthly revenue to reach break-even
   */
  static calculateBreakEvenRevenue(
    currentCash: number,
    monthlyBurn: number,
    monthlyRevenue: number,
    targetMonths: number = 12
  ): {
    currentNetBurn: number;
    requiredRevenueGrowth: number;
    breakEvenMonthlyRevenue: number;
    achievableInTargetMonths: boolean;
  } {
    const currentNetBurn = monthlyBurn - monthlyRevenue;
    const requiredRevenueGrowth = currentNetBurn;
    const breakEvenMonthlyRevenue = monthlyBurn;

    // Check if break-even is achievable
    const requiredMonthlyGrowth = requiredRevenueGrowth / targetMonths;
    const achievableInTargetMonths = requiredMonthlyGrowth > 0;

    return {
      currentNetBurn,
      requiredRevenueGrowth,
      breakEvenMonthlyRevenue,
      achievableInTargetMonths,
    };
  }

  /**
   * Get runway by risk category
   * Used for monitoring and alerting
   */
  static getRunwayByRiskLevel(runwayDays: number): string {
    if (runwayDays < 30) return 'CRITICAL';
    if (runwayDays < 90) return 'AT_RISK';
    if (runwayDays < 120) return 'ADEQUATE';
    if (runwayDays < 180) return 'HEALTHY';
    return 'STRONG';
  }

  /**
   * Check if runway requires immediate action
   */
  static requiresImmediateAction(runwayDays: number): boolean {
    return runwayDays < 60; // 2 months - time to act
  }
}

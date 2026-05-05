import { logger } from "@/infra/logger";
import {
  MonetizationMetrics,
  FinancialProjection,
  PathWithMonetization,
} from "@/domain/decision/monetization";

export interface PathFinancialInput {
  pathId: string;
  expectedValue: number; // From scenario engine
  baselineAnnualRevenue: number;
  baselineAnnualCost: number;
  baselineGrossMarginPct: number;
  estimatedRevenueDelta: number; // New revenue or prevented loss
  estimatedCostDelta: number; // Savings (positive) or new costs (negative)
  capitalRequired: number; // Initial investment
  timeToResultDays: number; // When revenue starts flowing
}

export class MonetizationEngine {
  /**
   * Calculate complete financial projection for a path
   */
  projectFinancials(input: PathFinancialInput): FinancialProjection {
    const {
      pathId,
      expectedValue,
      baselineAnnualRevenue,
      baselineAnnualCost,
      baselineGrossMarginPct,
      estimatedRevenueDelta,
      estimatedCostDelta,
      capitalRequired,
      timeToResultDays,
    } = input;

    // Projected values
    const projectedAnnualRevenue = baselineAnnualRevenue + estimatedRevenueDelta;
    const projectedAnnualCost = baselineAnnualCost + estimatedCostDelta;
    const projectedGrossMargin = this.calculateGrossMargin(
      projectedAnnualRevenue,
      projectedAnnualCost
    );

    // Monetization metrics
    const marginDelta = projectedGrossMargin - baselineGrossMarginPct;

    const metrics: MonetizationMetrics = {
      revenue_delta: estimatedRevenueDelta,
      cost_delta: estimatedCostDelta,
      margin_delta: marginDelta,
      payback_days: this.calculatePaybackDays(
        estimatedRevenueDelta,
        estimatedCostDelta,
        capitalRequired,
        timeToResultDays
      ),
      capital_required: capitalRequired,
    };

    // Cash flow projection (monthly)
    const monthlyNetCashFlow = this.calculateMonthlyNetCashFlow(
      estimatedRevenueDelta,
      estimatedCostDelta,
      timeToResultDays
    );

    const cashFlowProjection = {
      month_1: monthlyNetCashFlow * 1,
      month_3: monthlyNetCashFlow * 3,
      month_6: monthlyNetCashFlow * 6,
      month_12: monthlyNetCashFlow * 12,
    };

    // ROI calculation
    const annualNetBenefit = estimatedRevenueDelta + estimatedCostDelta;
    const roi = this.calculateROI(annualNetBenefit, capitalRequired);

    // NPV calculation (12-month horizon, 10% discount rate)
    const npv = this.calculateNPV(monthlyNetCashFlow, capitalRequired);

    // Break-even date
    const breakEvenDate = this.calculateBreakEvenDate(
      capitalRequired,
      monthlyNetCashFlow,
      timeToResultDays
    );

    logger.info("Financial projection completed", {
      pathId,
      expectedValue,
      marginDelta,
      paybackDays: metrics.payback_days,
      roi,
      npv,
    });

    return {
      pathId,
      baseline: {
        annual_revenue: baselineAnnualRevenue,
        annual_cost: baselineAnnualCost,
        gross_margin_pct: baselineGrossMarginPct,
      },
      projected: {
        annual_revenue: projectedAnnualRevenue,
        annual_cost: projectedAnnualCost,
        gross_margin_pct: projectedGrossMargin,
      },
      delta: metrics,
      cashFlowProjection,
      breakEvenDate,
      roi_percent: roi,
      npv_12months: npv,
    };
  }

  /**
   * Project financials for multiple paths
   */
  projectMultiplePathFinancials(
    inputs: PathFinancialInput[]
  ): PathWithMonetization[] {
    return inputs.map((input) => ({
      pathId: input.pathId,
      expectedValue: input.expectedValue,
      monetization: this.projectFinancials(input),
    }));
  }

  /**
   * Calculate gross margin percentage
   */
  private calculateGrossMargin(revenue: number, cost: number): number {
    if (revenue === 0) return 0;
    return ((revenue - cost) / revenue) * 100;
  }

  /**
   * Calculate payback period in days
   * Payback = capital_required / (monthly_net_benefit)
   */
  private calculatePaybackDays(
    revenueDelta: number,
    costDelta: number,
    capitalRequired: number,
    timeToResultDays: number
  ): number {
    const monthlyNetBenefit = (revenueDelta + costDelta) / 12;

    // If no positive cash flow, return theoretical max
    if (monthlyNetBenefit <= 0) {
      return 999; // Never pays back
    }

    // Days to payback = (capital / monthly benefit) * 30 + time to result
    const paybackDays = Math.ceil(
      (capitalRequired / monthlyNetBenefit) * 30 + timeToResultDays
    );

    return Math.max(0, paybackDays);
  }

  /**
   * Calculate monthly net cash flow
   */
  private calculateMonthlyNetCashFlow(
    revenueDelta: number,
    costDelta: number,
    timeToResultDays: number
  ): number {
    // Only count cash flow after time to result
    if (timeToResultDays >= 365) {
      return 0; // No annual benefit in first year if delay exceeds 365 days
    }

    const monthlyBenefit = (revenueDelta + costDelta) / 12;

    // Apply ramp-up factor based on time to result
    const rampUpFactor = Math.max(0, (365 - timeToResultDays) / 365);
    return Math.round(monthlyBenefit * rampUpFactor);
  }

  /**
   * Calculate ROI percentage
   * ROI = ((annual_net_benefit - capital) / capital) * 100
   */
  private calculateROI(annualNetBenefit: number, capitalRequired: number): number {
    if (capitalRequired === 0) {
      return 0; // No capital required = undefined ROI
    }

    const roi = ((annualNetBenefit - capitalRequired) / capitalRequired) * 100;
    return Math.round(roi);
  }

  /**
   * Calculate NPV (12-month horizon, 10% discount rate)
   * NPV = Σ(CF / (1.1^t)) - capital_required
   */
  private calculateNPV(monthlyNetCashFlow: number, capitalRequired: number): number {
    const discountRate = 0.1; // 10% annual
    const monthlyDiscountRate = discountRate / 12;

    let npv = -capitalRequired;

    // Sum discounted monthly cash flows for 12 months
    for (let month = 1; month <= 12; month++) {
      const discountFactor = 1 / Math.pow(1 + monthlyDiscountRate, month);
      npv += monthlyNetCashFlow * discountFactor;
    }

    return Math.round(npv);
  }

  /**
   * Calculate break-even date
   */
  private calculateBreakEvenDate(
    capitalRequired: number,
    monthlyNetCashFlow: number,
    timeToResultDays: number
  ): string | undefined {
    if (monthlyNetCashFlow <= 0) {
      return undefined; // Never breaks even
    }

    const monthsToBreakEven = capitalRequired / monthlyNetCashFlow;
    const totalDays = timeToResultDays + monthsToBreakEven * 30;

    const breakEvenDate = new Date(Date.now() + totalDays * 24 * 60 * 60 * 1000);
    return breakEvenDate.toISOString().split("T")[0];
  }

  /**
   * Validate financial projection
   */
  validateFinancialProjection(projection: FinancialProjection): boolean {
    // Revenue deltas must be reasonable
    if (!Number.isFinite(projection.delta.revenue_delta)) {
      logger.warn("Invalid revenue delta", {
        pathId: projection.pathId,
        revenueDelta: projection.delta.revenue_delta,
      });
      return false;
    }

    // Cost deltas must be reasonable
    if (!Number.isFinite(projection.delta.cost_delta)) {
      logger.warn("Invalid cost delta", {
        pathId: projection.pathId,
        costDelta: projection.delta.cost_delta,
      });
      return false;
    }

    // Margin delta should be within reasonable bounds (-100 to 100)
    if (projection.delta.margin_delta < -100 || projection.delta.margin_delta > 100) {
      logger.warn("Unreasonable margin delta", {
        pathId: projection.pathId,
        marginDelta: projection.delta.margin_delta,
      });
      return false;
    }

    // Payback days should be positive
    if (projection.delta.payback_days < 0) {
      logger.warn("Negative payback days", {
        pathId: projection.pathId,
        paybackDays: projection.delta.payback_days,
      });
      return false;
    }

    // ROI should be a finite number
    if (!Number.isFinite(projection.roi_percent)) {
      logger.warn("Invalid ROI", {
        pathId: projection.pathId,
        roi: projection.roi_percent,
      });
      return false;
    }

    return true;
  }

  /**
   * Rank paths by ROI (highest first)
   */
  rankPathsByROI(projections: PathWithMonetization[]): PathWithMonetization[] {
    return [...projections].sort(
      (a, b) => b.monetization.roi_percent - a.monetization.roi_percent
    );
  }

  /**
   * Rank paths by payback period (shortest first)
   */
  rankPathsByPayback(projections: PathWithMonetization[]): PathWithMonetization[] {
    return [...projections].sort(
      (a, b) =>
        a.monetization.delta.payback_days - b.monetization.delta.payback_days
    );
  }

  /**
   * Rank paths by NPV (highest first)
   */
  rankPathsByNPV(projections: PathWithMonetization[]): PathWithMonetization[] {
    return [...projections].sort(
      (a, b) => b.monetization.npv_12months - a.monetization.npv_12months
    );
  }

  /**
   * Identify paths with positive ROI
   */
  identifyProfitablePaths(projections: PathWithMonetization[]): PathWithMonetization[] {
    return projections.filter((p) => p.monetization.roi_percent > 0);
  }

  /**
   * Identify paths with reasonable payback period (< 180 days)
   */
  identifyFastPaybackPaths(
    projections: PathWithMonetization[],
    maxPaybackDays: number = 180
  ): PathWithMonetization[] {
    return projections.filter((p) => p.monetization.delta.payback_days <= maxPaybackDays);
  }

  /**
   * Compare two paths by multiple financial metrics
   */
  comparePaths(path1: PathWithMonetization, path2: PathWithMonetization): {
    roiWinner: PathWithMonetization;
    paybackWinner: PathWithMonetization;
    npvWinner: PathWithMonetization;
    overallWinner: PathWithMonetization;
  } {
    return {
      roiWinner:
        path1.monetization.roi_percent > path2.monetization.roi_percent ? path1 : path2,
      paybackWinner:
        path1.monetization.delta.payback_days < path2.monetization.delta.payback_days
          ? path1
          : path2,
      npvWinner:
        path1.monetization.npv_12months > path2.monetization.npv_12months ? path1 : path2,
      overallWinner: this.selectBestPath(path1, path2),
    };
  }

  /**
   * Select best path based on multiple criteria
   * Weight: NPV (40%) + ROI (35%) + Payback (25%)
   */
  private selectBestPath(
    path1: PathWithMonetization,
    path2: PathWithMonetization
  ): PathWithMonetization {
    const p1Score =
      path1.monetization.npv_12months * 0.4 +
      path1.monetization.roi_percent * 0.35 +
      (180 - path1.monetization.delta.payback_days) * 0.25;

    const p2Score =
      path2.monetization.npv_12months * 0.4 +
      path2.monetization.roi_percent * 0.35 +
      (180 - path2.monetization.delta.payback_days) * 0.25;

    return p1Score > p2Score ? path1 : path2;
  }
}

export const monetizationEngine = new MonetizationEngine();

/**
 * Owner Finance — Pricing Analysis (pure domain logic).
 *
 * High-level pricing analysis from flat per-product/service inputs.
 * Returns contribution margin, minimum viable price, break-even units,
 * and total profitability. Pure + deterministic; no persistence.
 */

export interface PricingAnalysisInput {
  unitSellingPrice: number;
  variableCostPerUnit: number;
  fixedCosts: number;
  unitsSold: number;
  currency: string;
  /** Target margin fraction (0–1) for minimum viable price. Defaults to 0.20. */
  targetMarginPct?: number;
}

export interface PricingAnalysisResult {
  contributionMarginPerUnit: number;
  /** Contribution margin as a percentage of selling price (0–100). */
  contributionMarginPct: number;
  totalContributionMargin: number;
  /** Price at or above which the target margin fraction is satisfied. */
  minimumViablePrice: number;
  breakEvenUnits: number;
  totalRevenue: number;
  totalVariableCosts: number;
  netProfit: number;
  isProfitable: boolean;
  currency: string;
}

export function analyzePricing(input: PricingAnalysisInput): PricingAnalysisResult {
  const { unitSellingPrice, variableCostPerUnit, fixedCosts, unitsSold, currency } = input;
  const targetMarginPct = input.targetMarginPct ?? 0.2;

  const contributionMarginPerUnit = unitSellingPrice - variableCostPerUnit;
  const contributionMarginPct =
    unitSellingPrice > 0 ? (contributionMarginPerUnit / unitSellingPrice) * 100 : 0;
  const totalContributionMargin = contributionMarginPerUnit * unitsSold;
  const totalRevenue = unitSellingPrice * unitsSold;
  const totalVariableCosts = variableCostPerUnit * unitsSold;
  const netProfit = totalContributionMargin - fixedCosts;

  const clampedTarget = Math.min(Math.max(targetMarginPct, 0), 0.99);
  const minimumViablePrice =
    clampedTarget > 0
      ? variableCostPerUnit / (1 - clampedTarget)
      : variableCostPerUnit;

  const breakEvenUnits =
    contributionMarginPerUnit > 0
      ? Math.ceil(fixedCosts / contributionMarginPerUnit)
      : Infinity;

  return {
    contributionMarginPerUnit,
    contributionMarginPct,
    totalContributionMargin,
    minimumViablePrice,
    breakEvenUnits,
    totalRevenue,
    totalVariableCosts,
    netProfit,
    isProfitable: netProfit > 0,
    currency,
  };
}

/**
 * Unit Economics Definition (Phase 5 Slice 2)
 *
 * Defines customer acquisition cost, lifetime value, payback period,
 * and contribution margin calculations per revenue stream.
 * Non-DB foundation: pure TypeScript metrics and assessments.
 *
 * Tenant-scoped: all calculations bound to workspaceId.
 */

import { RevenueStreamType } from "@/domain/financial/revenue-model";

// Re-export for convenience
export { RevenueStreamType } from "@/domain/financial/revenue-model";

/**
 * Customer acquisition cost breakdown
 */
export interface CustomerAcquisitionCost {
  stream: RevenueStreamType;
  total_cac: number;
  cac_per_customer: number;
  marketing_spend: number;
  sales_spend: number;
  onboarding_cost_per_customer: number;
  payback_period_months: number;
  efficiency: "efficient" | "neutral" | "inefficient"; // Based on industry benchmarks
  workspaceId: string;
}

/**
 * Customer lifetime value
 */
export interface CustomerLifetimeValue {
  stream: RevenueStreamType;
  ltv: number;
  avg_customer_revenue_per_month: number;
  gross_margin_percent: number;
  avg_customer_lifespan_months: number;
  churn_rate_percent: number;
  repeat_purchase_rate?: number;
  expansion_revenue_rate?: number; // % monthly increase
  workspaceId: string;
}

/**
 * CAC:LTV ratio assessment
 */
export interface LTVtoCACRatio {
  stream: RevenueStreamType;
  ltv: number;
  cac: number;
  ratio: number; // LTV / CAC
  payback_months: number;
  health: "excellent" | "good" | "healthy" | "at_risk" | "critical";
  rationale: string;
  workspaceId: string;
}

/**
 * Payback period calculation
 */
export interface PaybackPeriod {
  stream: RevenueStreamType;
  cac: number;
  monthly_recurring_revenue: number;
  gross_margin_percent: number;
  payback_months: number;
  achievable: boolean; // Can org sustain to payback?
  workspaceId: string;
}

/**
 * Unit contribution margin
 */
export interface ContributionMargin {
  stream: RevenueStreamType;
  revenue_per_unit: number;
  variable_cost_per_unit: number;
  contribution_per_unit: number;
  contribution_margin_percent: number;
  contribution_dollars_monthly: number;
  profitability: "high" | "medium" | "low" | "negative";
  workspaceId: string;
}

/**
 * Blended unit economics across all revenue streams
 */
export interface BlendedUnitEconomics {
  workspaceId: string;
  blended_cac: number;
  blended_ltv: number;
  blended_ltv_cac_ratio: number;
  blended_payback_months: number;
  blended_gross_margin_percent: number;
  blended_contribution_margin_percent: number;
  avg_customer_lifetime_value: number;
  avg_customer_acquisition_cost: number;
  total_customers: number;
  streams_included: RevenueStreamType[];
  assessed_at: Date;
}

/**
 * Unit economics health assessment
 */
export enum UnitEconomicsHealth {
  EXCELLENT = "EXCELLENT",
  HEALTHY = "HEALTHY",
  AT_RISK = "AT_RISK",
  CRITICAL = "CRITICAL",
}

/**
 * Unit economics summary
 */
export interface UnitEconomicsSummary {
  workspaceId: string;
  health: UnitEconomicsHealth;
  ltv_cac_ratio: number;
  payback_months: number;
  gross_margin_percent: number;
  primary_concern?: string;
  recommendation?: string;
  assessed_at: Date;
}

/**
 * Unit economics calculation request
 */
export interface UnitEconomicsRequest {
  workspaceId: string;
  userId: string;
  stream: RevenueStreamType;
  total_cac?: number;
  marketing_spend?: number;
  sales_spend?: number;
  onboarding_cost?: number;
  new_customers_this_period?: number;
  avg_monthly_revenue_per_customer?: number;
  gross_margin_percent: number;
  avg_customer_lifespan_months?: number;
  churn_rate_percent?: number;
}

/**
 * Industry benchmark thresholds
 */
export const UNIT_ECONOMICS_BENCHMARKS = {
  excellent_ltv_cac_ratio: 5.0, // 5:1 or better
  healthy_ltv_cac_ratio: 3.0, // 3:1 or better
  at_risk_ltv_cac_ratio: 1.5, // Below 1.5:1 is critical
  efficient_payback_months: 12, // Payback within 12 months
  acceptable_payback_months: 18,
  critical_payback_months: 24,
  healthy_gross_margin_percent: 60,
  acceptable_gross_margin_percent: 40,
  minimum_gross_margin_percent: 20,
};

/**
 * Calculate customer acquisition cost (CAC)
 */
export function calculateCAC(
  marketing_spend: number,
  sales_spend: number,
  onboarding_cost: number,
  new_customers: number
): number {
  if (new_customers === 0) return 0;
  return (marketing_spend + sales_spend + onboarding_cost) / new_customers;
}

/**
 * Calculate customer lifetime value (LTV)
 */
export function calculateLTV(
  monthly_revenue: number,
  gross_margin_percent: number,
  customer_lifespan_months: number
): number {
  const gross_margin = monthly_revenue * (gross_margin_percent / 100);
  return gross_margin * customer_lifespan_months;
}

/**
 * Calculate payback period in months
 */
export function calculatePaybackPeriod(
  cac: number,
  monthly_mrr: number,
  gross_margin_percent: number
): number {
  const monthly_contribution = monthly_mrr * (gross_margin_percent / 100);
  if (monthly_contribution === 0) return Infinity;
  return cac / monthly_contribution;
}

/**
 * Calculate contribution margin per unit
 */
export function calculateContributionMargin(
  revenue_per_unit: number,
  variable_cost_per_unit: number
): { contribution: number; margin_percent: number } {
  const contribution = revenue_per_unit - variable_cost_per_unit;
  const margin_percent = revenue_per_unit === 0 ? 0 : (contribution / revenue_per_unit) * 100;
  return { contribution, margin_percent };
}

/**
 * Assess LTV:CAC ratio health
 */
export function assessLTVtoCACHealth(
  ltv: number,
  cac: number
): "excellent" | "good" | "healthy" | "at_risk" | "critical" {
  if (cac === 0) return "excellent";

  const ratio = ltv / cac;

  if (ratio >= UNIT_ECONOMICS_BENCHMARKS.excellent_ltv_cac_ratio) {
    return "excellent";
  } else if (ratio >= UNIT_ECONOMICS_BENCHMARKS.healthy_ltv_cac_ratio) {
    return "healthy";
  } else if (ratio >= UNIT_ECONOMICS_BENCHMARKS.at_risk_ltv_cac_ratio) {
    return "at_risk";
  } else {
    return "critical";
  }
}

/**
 * Assess overall unit economics health
 */
export function assessUnitEconomicsHealth(
  ltv_cac_ratio: number,
  payback_months: number,
  gross_margin_percent: number
): UnitEconomicsHealth {
  // CRITICAL: Poor ratio, long payback, low margins
  if (
    ltv_cac_ratio < UNIT_ECONOMICS_BENCHMARKS.at_risk_ltv_cac_ratio ||
    payback_months > UNIT_ECONOMICS_BENCHMARKS.critical_payback_months ||
    gross_margin_percent < UNIT_ECONOMICS_BENCHMARKS.minimum_gross_margin_percent
  ) {
    return UnitEconomicsHealth.CRITICAL;
  }

  // AT_RISK: Marginal metrics
  if (
    ltv_cac_ratio < UNIT_ECONOMICS_BENCHMARKS.healthy_ltv_cac_ratio ||
    payback_months > UNIT_ECONOMICS_BENCHMARKS.acceptable_payback_months ||
    gross_margin_percent < UNIT_ECONOMICS_BENCHMARKS.acceptable_gross_margin_percent
  ) {
    return UnitEconomicsHealth.AT_RISK;
  }

  // HEALTHY: Good metrics
  if (
    ltv_cac_ratio >= UNIT_ECONOMICS_BENCHMARKS.excellent_ltv_cac_ratio ||
    (ltv_cac_ratio >= UNIT_ECONOMICS_BENCHMARKS.healthy_ltv_cac_ratio &&
      payback_months <= UNIT_ECONOMICS_BENCHMARKS.efficient_payback_months &&
      gross_margin_percent >= UNIT_ECONOMICS_BENCHMARKS.healthy_gross_margin_percent)
  ) {
    return UnitEconomicsHealth.HEALTHY;
  }

  // Default to HEALTHY for marginal cases
  return UnitEconomicsHealth.HEALTHY;
}

/**
 * Validate unit economics data
 */
export function validateUnitEconomics(
  ltv: number,
  cac: number,
  payback_months: number,
  gross_margin_percent: number
): boolean {
  if (ltv < 0 || cac < 0) return false;
  if (payback_months < 0 || payback_months === Infinity) return false;
  if (gross_margin_percent < 0 || gross_margin_percent > 100) return false;
  return true;
}

/**
 * Unit economics result for API responses (DTO)
 * Redacts internal/sensitive fields
 */
export interface UnitEconomicsDTO {
  workspaceId: string;
  stream: RevenueStreamType;
  ltv: number;
  cac: number;
  ltv_cac_ratio: number;
  payback_months: number;
  gross_margin_percent: number;
  health: UnitEconomicsHealth;
  assessed_at: Date;
}

/**
 * Convert unit economics to DTO for API response
 */
export function unitEconomicsToDTO(
  ltv: number,
  cac: number,
  payback_months: number,
  gross_margin_percent: number,
  stream: RevenueStreamType,
  workspaceId: string
): UnitEconomicsDTO {
  const ratio = cac > 0 ? ltv / cac : ltv > 0 ? Infinity : 0;
  const health = assessUnitEconomicsHealth(ratio, payback_months, gross_margin_percent);

  return {
    workspaceId,
    stream,
    ltv,
    cac,
    ltv_cac_ratio: ratio,
    payback_months,
    gross_margin_percent,
    health,
    assessed_at: new Date(),
  };
}

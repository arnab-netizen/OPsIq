/**
 * Cash Runway Modeler (Phase 5 Slice 4)
 *
 * Projects cash depletion timeline using revenue/expense forecasts.
 * Integrates Slices 1-3 (revenue, unit economics, financial health)
 * into scenario-based runway modeling with funding triggers.
 *
 * Non-DB foundation: pure TypeScript projections and forecasting.
 * Tenant-scoped: all projections bound to workspaceId.
 */

import { RevenueModel } from "@/domain/financial/revenue-model";

/**
 * Scenario types for runway modeling
 */
export enum RunwayScenario {
  BEST_CASE = "BEST_CASE",
  BASE_CASE = "BASE_CASE",
  WORST_CASE = "WORST_CASE",
  CUSTOM = "CUSTOM",
}

/**
 * Monthly financial projection
 */
export interface MonthlyProjection {
  month: number;
  month_date: Date;
  revenue: number;
  operating_expenses: number;
  net_cash_flow: number;
  cumulative_cash_flow: number;
  cash_balance: number;
  burn_rate: number;
  runway_remaining_months: number;
  funding_needed: boolean;
  notes?: string;
}

/**
 * Scenario parameters
 */
export interface ScenarioParameters {
  scenario: RunwayScenario;
  revenue_growth_monthly_percent: number; // MoM growth
  expense_growth_monthly_percent: number; // MoM growth
  customer_churn_rate_monthly?: number; // For revenue reduction
  description?: string;
}

/**
 * Cash runway projection result
 */
export interface CashRunwayProjection {
  workspaceId: string;
  scenario: RunwayScenario;
  current_cash_balance: number;
  monthly_revenue: number;
  monthly_expenses: number;
  monthly_net_cash_flow: number;

  // Projection timeline
  projections: MonthlyProjection[];
  months_to_depletion: number | null; // null if always positive cash flow
  depletion_date?: Date;

  // Funding strategy
  funding_trigger_amount: number; // Cash level when funding needed
  months_until_trigger: number;
  recommended_funding_amount: number;
  funding_urgency: "none" | "low" | "medium" | "high" | "critical";

  // Summary
  projection_horizon_months: number;
  created_at: Date;
  valid_until?: Date;
}

/**
 * Funding trigger definition
 */
export interface FundingTrigger {
  cash_threshold: number;
  trigger_name: string;
  recommended_action: string;
  urgency_level: "low" | "medium" | "high" | "critical";
  target_funding_amount: number;
}

/**
 * Blended runway (across scenarios)
 */
export interface BlendedRunwayAssessment {
  workspaceId: string;
  best_case_months: number | null;
  base_case_months: number | null;
  worst_case_months: number | null;
  median_runway_months: number;
  confidence: "high" | "medium" | "low";
  primary_risk: string;
  recommendation: string;
  assessed_at: Date;
}

/**
 * Runway request
 */
export interface CashRunwayRequest {
  workspaceId: string;
  userId: string;
  current_cash_balance: number;
  monthly_revenue: number;
  monthly_expenses: number;
  scenario: RunwayScenario;
  revenue_growth_percent?: number;
  expense_growth_percent?: number;
  projection_months?: number;
}

/**
 * Runway thresholds
 */
export const CASH_RUNWAY_THRESHOLDS = {
  // Healthy runway levels (months of burn)
  excellent_runway_months: 24,
  healthy_runway_months: 12,
  caution_runway_months: 6,
  warning_runway_months: 3,
  critical_runway_months: 1,

  // Funding trigger percentages (% of monthly burn)
  trigger_6_months_burn: 6.0, // Trigger when cash = 6 months of expenses
  trigger_3_months_burn: 3.0, // Trigger when cash = 3 months of expenses
  trigger_critical: 1.0, // Critical when < 1 month

  // Default growth rates for scenarios
  best_case_revenue_growth: 0.15, // 15% MoM growth
  best_case_expense_growth: 0.02, // 2% MoM growth

  base_case_revenue_growth: 0.05, // 5% MoM growth
  base_case_expense_growth: 0.03, // 3% MoM growth

  worst_case_revenue_growth: -0.1, // -10% MoM decline
  worst_case_expense_growth: 0.05, // 5% MoM growth
};

/**
 * Project cash runway for single scenario
 */
export function projectCashRunway(
  current_cash: number,
  monthly_revenue: number,
  monthly_expenses: number,
  revenue_growth: number,
  expense_growth: number,
  projection_months: number = 36
): MonthlyProjection[] {
  const projections: MonthlyProjection[] = [];
  let cash_balance = current_cash;
  let revenue = monthly_revenue;
  let expenses = monthly_expenses;
  let cumulative_flow = 0;

  for (let month = 1; month <= projection_months; month++) {
    const net_flow = revenue - expenses;
    cumulative_flow += net_flow;
    cash_balance += net_flow;

    const runway = expenses > 0 ? cash_balance / expenses : Infinity;

    projections.push({
      month,
      month_date: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000),
      revenue: Math.round(revenue),
      operating_expenses: Math.round(expenses),
      net_cash_flow: Math.round(net_flow),
      cumulative_cash_flow: Math.round(cumulative_flow),
      cash_balance: Math.round(cash_balance),
      burn_rate: expenses > 0 ? -Math.max(0, expenses - revenue) : 0,
      runway_remaining_months: runway,
      funding_needed: cash_balance < expenses * CASH_RUNWAY_THRESHOLDS.trigger_3_months_burn,
    });

    // Stop if depleted
    if (cash_balance <= 0) break;

    // Apply growth rates
    revenue = revenue * (1 + revenue_growth);
    expenses = expenses * (1 + expense_growth);
  }

  return projections;
}

/**
 * Calculate months until cash depletion
 */
export function calculateMonthsUntilDepletion(
  current_cash: number,
  monthly_revenue: number,
  monthly_expenses: number,
  revenue_growth: number,
  expense_growth: number
): number | null {
  const net_monthly = monthly_revenue - monthly_expenses;

  // If always positive cash flow
  if (net_monthly >= 0 && revenue_growth > expense_growth) {
    return null; // Never depletes (or grows)
  }

  let cash = current_cash;
  let revenue = monthly_revenue;
  let expenses = monthly_expenses;
  let months = 0;

  // Simulate month by month (max 360 months = 30 years)
  for (let m = 0; m < 360; m++) {
    const net_flow = revenue - expenses;
    cash += net_flow;
    months++;

    if (cash <= 0) {
      return months;
    }

    revenue = revenue * (1 + revenue_growth);
    expenses = expenses * (1 + expense_growth);
  }

  return null; // Doesn't deplete within 30 years
}

/**
 * Get scenario parameters (defaults)
 */
export function getScenarioParameters(scenario: RunwayScenario): ScenarioParameters {
  switch (scenario) {
    case RunwayScenario.BEST_CASE:
      return {
        scenario: RunwayScenario.BEST_CASE,
        revenue_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.best_case_revenue_growth,
        expense_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.best_case_expense_growth,
        description: "Strong growth, expense discipline",
      };

    case RunwayScenario.BASE_CASE:
      return {
        scenario: RunwayScenario.BASE_CASE,
        revenue_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.base_case_revenue_growth,
        expense_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.base_case_expense_growth,
        description: "Conservative growth, moderate expense growth",
      };

    case RunwayScenario.WORST_CASE:
      return {
        scenario: RunwayScenario.WORST_CASE,
        revenue_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.worst_case_revenue_growth,
        expense_growth_monthly_percent: CASH_RUNWAY_THRESHOLDS.worst_case_expense_growth,
        description: "Revenue decline, cost pressures",
      };

    case RunwayScenario.CUSTOM:
      return {
        scenario: RunwayScenario.CUSTOM,
        revenue_growth_monthly_percent: 0,
        expense_growth_monthly_percent: 0,
        description: "Custom parameters",
      };
  }
}

/**
 * Determine funding trigger for cash level
 */
export function determineFundingTrigger(cash_balance: number, monthly_expenses: number): FundingTrigger | null {
  if (monthly_expenses === 0) return null;

  const months_of_runway = cash_balance / monthly_expenses;

  if (months_of_runway < CASH_RUNWAY_THRESHOLDS.trigger_critical) {
    return {
      cash_threshold: monthly_expenses * CASH_RUNWAY_THRESHOLDS.trigger_critical,
      trigger_name: "CRITICAL",
      recommended_action: "Immediate funding required or severe cost cuts",
      urgency_level: "critical",
      target_funding_amount: monthly_expenses * CASH_RUNWAY_THRESHOLDS.trigger_6_months_burn,
    };
  }

  if (months_of_runway < CASH_RUNWAY_THRESHOLDS.trigger_3_months_burn) {
    return {
      cash_threshold: monthly_expenses * CASH_RUNWAY_THRESHOLDS.trigger_3_months_burn,
      trigger_name: "WARNING",
      recommended_action: "Begin fundraising within 30 days",
      urgency_level: "high",
      target_funding_amount: monthly_expenses * CASH_RUNWAY_THRESHOLDS.trigger_6_months_burn,
    };
  }

  if (months_of_runway < CASH_RUNWAY_THRESHOLDS.caution_runway_months) {
    return {
      cash_threshold: monthly_expenses * CASH_RUNWAY_THRESHOLDS.caution_runway_months,
      trigger_name: "CAUTION",
      recommended_action: "Plan fundraising strategy",
      urgency_level: "medium",
      target_funding_amount: monthly_expenses * CASH_RUNWAY_THRESHOLDS.trigger_6_months_burn,
    };
  }

  return null;
}

/**
 * Calculate blended runway across scenarios
 */
export function calculateBlendedRunway(
  best_case_months: number | null,
  base_case_months: number | null,
  worst_case_months: number | null
): BlendedRunwayAssessment {
  const valid_months = [best_case_months, base_case_months, worst_case_months].filter(
    (m) => m !== null && m !== Infinity
  ) as number[];

  let median = 0;
  if (valid_months.length > 0) {
    valid_months.sort((a, b) => a - b);
    median = valid_months.length % 2 === 0
      ? (valid_months[valid_months.length / 2 - 1] + valid_months[valid_months.length / 2]) / 2
      : valid_months[Math.floor(valid_months.length / 2)];
  }

  // Determine confidence and risk
  let confidence: "high" | "medium" | "low" = "medium";
  let primary_risk = "Normal operation";
  let recommendation = "Monitor cash flow monthly";

  if (worst_case_months !== null && worst_case_months < 6) {
    confidence = "low";
    primary_risk = "Worst case shows critical runway";
    recommendation = "Urgent: Begin fundraising or reduce burn rate immediately";
  } else if (base_case_months !== null && base_case_months < 12) {
    confidence = "medium";
    primary_risk = "Base case shows limited runway";
    recommendation = "Plan fundraising for 90 days out";
  } else if (best_case_months !== null && best_case_months > 24) {
    confidence = "high";
    primary_risk = "None - strong runway in all scenarios";
    recommendation = "Focus on growth and market expansion";
  }

  return {
    workspaceId: "unknown",
    best_case_months,
    base_case_months,
    worst_case_months,
    median_runway_months: median,
    confidence,
    primary_risk,
    recommendation,
    assessed_at: new Date(),
  };
}

/**
 * Validate runway projection
 */
export function validateRunwayProjection(projection: CashRunwayProjection): boolean {
  if (!projection.workspaceId) return false;
  if (projection.current_cash_balance < 0) return false;
  if (projection.monthly_revenue < 0 || projection.monthly_expenses < 0) return false;
  if (!projection.projections || projection.projections.length === 0) return false;
  return true;
}

/**
 * Cash runway result for API responses (DTO)
 */
export interface CashRunwayDTO {
  workspaceId: string;
  scenario: RunwayScenario;
  months_to_depletion: number | null;
  depletion_date?: Date;
  funding_trigger_months: number;
  recommended_funding: number;
  funding_urgency: string;
  projection_summary: string;
  created_at: Date;
}

/**
 * Convert projection to DTO
 */
export function cashRunwayToDTO(projection: CashRunwayProjection): CashRunwayDTO {
  const depletion_text =
    projection.months_to_depletion === null
      ? "Cash positive, no depletion expected"
      : `Depletion in ${Math.ceil(projection.months_to_depletion)} months`;

  return {
    workspaceId: projection.workspaceId,
    scenario: projection.scenario,
    months_to_depletion: projection.months_to_depletion,
    depletion_date: projection.depletion_date,
    funding_trigger_months: projection.months_until_trigger,
    recommended_funding: projection.recommended_funding_amount,
    funding_urgency: projection.funding_urgency,
    projection_summary: depletion_text,
    created_at: projection.created_at,
  };
}

/**
 * Financial Health Scorer (Phase 5 Slice 3)
 *
 * Calculates financial health score combining profitability, margin health,
 * burn rate, and cash runway. Integrates Slice 1 (revenue model) and
 * Slice 2 (unit economics) into unified health assessment.
 *
 * Non-DB foundation: pure TypeScript metrics and scoring.
 * Tenant-scoped: all assessments bound to workspaceId.
 */

import { RevenueModel } from "@/domain/financial/revenue-model";
import { UnitEconomicsHealth } from "@/domain/financial/unit-economics";

/**
 * Financial health dimensions
 */
export enum FinancialHealthDimension {
  PROFITABILITY = "PROFITABILITY",
  MARGIN_HEALTH = "MARGIN_HEALTH",
  BURN_RATE = "BURN_RATE",
  RUNWAY = "RUNWAY",
  UNIT_ECONOMICS = "UNIT_ECONOMICS",
}

/**
 * Overall financial health status
 */
export enum FinancialHealthStatus {
  THRIVING = "THRIVING",
  HEALTHY = "HEALTHY",
  CAUTION = "CAUTION",
  AT_RISK = "AT_RISK",
  CRITICAL = "CRITICAL",
}

/**
 * Profitability assessment
 */
export interface ProfitabilityAssessment {
  gross_profit: number;
  net_profit: number;
  gross_profit_margin_percent: number;
  net_profit_margin_percent: number;
  is_profitable: boolean;
  profitability_trend: "improving" | "stable" | "declining";
  months_to_profitability?: number; // If not yet profitable
}

/**
 * Margin health assessment
 */
export interface MarginHealthAssessment {
  gross_margin_percent: number;
  contribution_margin_percent: number;
  operating_margin_percent?: number;
  health: "excellent" | "healthy" | "warning" | "critical";
  trend: "improving" | "stable" | "declining";
  primary_margin_driver: string; // e.g., "subscription" or "services"
}

/**
 * Burn rate assessment (monthly cash depletion)
 */
export interface BurnRateAssessment {
  monthly_operating_expenses: number;
  monthly_burn_rate: number; // Expenses - Revenue
  burn_rate_trend: "improving" | "stable" | "accelerating";
  monthly_cash_outflow: number;
  monthly_cash_inflow: number;
  net_monthly_cash_flow: number;
  is_cash_flow_positive: boolean;
}

/**
 * Cash runway assessment
 */
export interface RunwayAssessment {
  current_cash_balance: number;
  monthly_burn_rate: number;
  runway_months: number;
  funding_trigger_threshold: number; // Cash balance at which funding needed
  months_until_trigger: number;
  urgency: "none" | "low" | "medium" | "high" | "critical";
  recommendation: string;
}

/**
 * Combined financial health assessment
 */
export interface FinancialHealthAssessment {
  workspaceId: string;
  assessed_at: Date;

  // Overall health
  overall_health_status: FinancialHealthStatus;
  financial_health_score: number; // 0-100

  // Component scores (0-100 each)
  profitability_score: number;
  margin_health_score: number;
  burn_rate_score: number;
  runway_score: number;
  unit_economics_score: number;

  // Detailed assessments
  profitability: ProfitabilityAssessment;
  margins: MarginHealthAssessment;
  burn_rate: BurnRateAssessment;
  runway: RunwayAssessment;

  // Risk assessment
  primary_risks: string[];
  secondary_risks: string[];

  // Recommendations
  critical_actions: string[];
  growth_recommendations: string[];

  // Version/approval
  version: number;
  is_approved: boolean;
  approved_by?: string;
  approved_at?: Date;
}

/**
 * Financial health request
 */
export interface FinancialHealthRequest {
  workspaceId: string;
  userId: string;
  current_cash_balance: number;
  monthly_operating_expenses: number;
  revenue_model: RevenueModel;
  unit_economics_score?: number; // 0-100
  gross_margin_percent: number;
  net_margin_percent?: number;
}

/**
 * Financial health summary for dashboards
 */
export interface FinancialHealthSummary {
  workspaceId: string;
  health_status: FinancialHealthStatus;
  health_score: number;
  runway_months: number;
  profitability: "profitable" | "path_to_profitability" | "negative";
  primary_concern?: string;
  assessed_at: Date;
}

/**
 * Financial health thresholds/benchmarks
 */
export const FINANCIAL_HEALTH_THRESHOLDS = {
  // Score ranges
  thriving_score: 85,
  healthy_score: 70,
  caution_score: 50,
  at_risk_score: 30,
  critical_score: 0,

  // Margin thresholds
  excellent_gross_margin: 70,
  healthy_gross_margin: 60,
  acceptable_gross_margin: 40,
  critical_gross_margin: 20,

  // Runway thresholds
  excellent_runway_months: 24,
  healthy_runway_months: 12,
  caution_runway_months: 6,
  critical_runway_months: 3,

  // Burn rate thresholds
  sustainable_burn_ratio: 0.8, // Revenue / Expenses
  warning_burn_ratio: 0.5,
  critical_burn_ratio: 0.2,
};

/**
 * Calculate profitability score (0-100)
 */
export function calculateProfitabilityScore(
  gross_margin_percent: number,
  net_margin_percent: number,
  is_profitable: boolean
): number {
  // CRITICAL: negative profitability
  if (!is_profitable && net_margin_percent < -20) return 10;

  // AT_RISK: unprofitable but path clear
  if (!is_profitable && net_margin_percent >= -20) return 30;

  // CAUTION: low positive margin
  if (is_profitable && net_margin_percent < 10) return 50;

  // HEALTHY: solid margin
  if (net_margin_percent < 20) return 75;

  // THRIVING: strong margin
  return 90;
}

/**
 * Calculate margin health score (0-100)
 */
export function calculateMarginHealthScore(
  gross_margin_percent: number,
  contribution_margin_percent: number
): number {
  // Average the margins and scale to 0-100
  const avg_margin = (gross_margin_percent + contribution_margin_percent) / 2;

  if (avg_margin >= FINANCIAL_HEALTH_THRESHOLDS.excellent_gross_margin) return 95;
  if (avg_margin >= FINANCIAL_HEALTH_THRESHOLDS.healthy_gross_margin) return 85;
  if (avg_margin >= FINANCIAL_HEALTH_THRESHOLDS.acceptable_gross_margin) return 60;
  if (avg_margin >= FINANCIAL_HEALTH_THRESHOLDS.critical_gross_margin) return 30;
  return 10;
}

/**
 * Calculate burn rate score (0-100)
 */
export function calculateBurnRateScore(
  monthly_revenue: number,
  monthly_expenses: number
): number {
  if (monthly_expenses === 0) return 100;

  const burn_ratio = monthly_revenue / monthly_expenses;

  if (burn_ratio >= 1.2) return 95; // Growing and positive
  if (burn_ratio >= 1.0) return 85; // Breakeven or growing
  if (burn_ratio >= FINANCIAL_HEALTH_THRESHOLDS.sustainable_burn_ratio) return 70; // Sustainable
  if (burn_ratio >= FINANCIAL_HEALTH_THRESHOLDS.warning_burn_ratio) return 40; // At-risk
  return 15; // Critical burn rate
}

/**
 * Calculate runway score (0-100)
 */
export function calculateRunwayScore(runway_months: number): number {
  if (runway_months >= FINANCIAL_HEALTH_THRESHOLDS.excellent_runway_months) return 95;
  if (runway_months >= FINANCIAL_HEALTH_THRESHOLDS.healthy_runway_months) return 85;
  if (runway_months >= FINANCIAL_HEALTH_THRESHOLDS.caution_runway_months) return 60;
  if (runway_months >= FINANCIAL_HEALTH_THRESHOLDS.critical_runway_months) return 30;
  return 10;
}

/**
 * Assess overall financial health status from component scores
 */
export function assessFinancialHealthStatus(
  profitability_score: number,
  margin_score: number,
  burn_rate_score: number,
  runway_score: number
): FinancialHealthStatus {
  const avg_score = (profitability_score + margin_score + burn_rate_score + runway_score) / 4;

  // CRITICAL: multiple low scores
  const critical_count = [profitability_score, margin_score, burn_rate_score, runway_score].filter(
    (s) => s < 30
  ).length;
  if (critical_count >= 2 || avg_score < FINANCIAL_HEALTH_THRESHOLDS.critical_score) {
    return FinancialHealthStatus.CRITICAL;
  }

  // AT_RISK: avg in at-risk range
  if (avg_score < FINANCIAL_HEALTH_THRESHOLDS.at_risk_score) {
    return FinancialHealthStatus.AT_RISK;
  }

  // CAUTION: avg in caution range
  if (avg_score < FINANCIAL_HEALTH_THRESHOLDS.caution_score) {
    return FinancialHealthStatus.CAUTION;
  }

  // HEALTHY: avg in healthy range
  if (avg_score < FINANCIAL_HEALTH_THRESHOLDS.healthy_score) {
    return FinancialHealthStatus.HEALTHY;
  }

  // THRIVING: avg > healthy threshold
  return FinancialHealthStatus.THRIVING;
}

/**
 * Validate financial health assessment
 */
export function validateFinancialHealthAssessment(assessment: FinancialHealthAssessment): boolean {
  if (!assessment.workspaceId) return false;
  if (assessment.financial_health_score < 0 || assessment.financial_health_score > 100) return false;
  if (!assessment.profitability) return false;
  if (!assessment.margins) return false;
  if (!assessment.burn_rate) return false;
  if (!assessment.runway) return false;
  return true;
}

/**
 * Financial health result for API responses (DTO)
 */
export interface FinancialHealthDTO {
  workspaceId: string;
  health_status: FinancialHealthStatus;
  health_score: number;
  profitability_score: number;
  margin_health_score: number;
  burn_rate_score: number;
  runway_score: number;
  runway_months: number;
  is_profitable: boolean;
  monthly_net_cash_flow: number;
  primary_risks: string[];
  critical_actions: string[];
  assessed_at: Date;
}

/**
 * Convert assessment to DTO for API response
 */
export function financialHealthToDTO(assessment: FinancialHealthAssessment): FinancialHealthDTO {
  return {
    workspaceId: assessment.workspaceId,
    health_status: assessment.overall_health_status,
    health_score: assessment.financial_health_score,
    profitability_score: assessment.profitability_score,
    margin_health_score: assessment.margin_health_score,
    burn_rate_score: assessment.burn_rate_score,
    runway_score: assessment.runway_score,
    runway_months: assessment.runway.runway_months,
    is_profitable: assessment.profitability.is_profitable,
    monthly_net_cash_flow: assessment.burn_rate.net_monthly_cash_flow,
    primary_risks: assessment.primary_risks,
    critical_actions: assessment.critical_actions,
    assessed_at: assessment.assessed_at,
  };
}

/**
 * Generate financial health summary text
 */
export function generateHealthSummary(status: FinancialHealthStatus, runway_months: number): string {
  const runwayText = runway_months < 3 ? "URGENT: " : runway_months < 6 ? "CAUTION: " : "";

  switch (status) {
    case FinancialHealthStatus.THRIVING:
      return "Business is thriving financially. Growth is sustainable.";
    case FinancialHealthStatus.HEALTHY:
      return "Business is financially healthy with sustainable operations.";
    case FinancialHealthStatus.CAUTION:
      return `${runwayText}Business is financially sound but requires monitoring.`;
    case FinancialHealthStatus.AT_RISK:
      return `${runwayText}Financial health is at risk. Intervention needed within ${Math.ceil(runway_months)} months.`;
    case FinancialHealthStatus.CRITICAL:
      return `${runwayText}CRITICAL: Business faces imminent financial crisis. Immediate action required.`;
  }
}

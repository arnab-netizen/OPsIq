/**
 * Survival Factors Model
 *
 * Enterprise survival is determined by the organization's resilience against existential risks
 * across four dimensions: Financial, Operational, Market, and Strategic.
 *
 * Survival factors represent measurable, observable signals that indicate whether an
 * organization can sustain operations for 6+ months and execute critical business actions.
 *
 * These factors drive Phase 4 (Survival Intelligence):
 * - shock detection (when survival is threatened)
 * - resilience scoring (org's ability to absorb shocks)
 * - survival gating (blocking growth actions during existential risk)
 */

// Financial dimension: ability to fund operations and debt obligations
export const FINANCIAL_SURVIVAL_FACTORS = [
  "monthly_cash_burn_rate",
  "cash_runway_months",
  "debt_repayment_obligations",
  "revenue_stability_coefficient",
  "margin_health_pct",
  "working_capital_position",
] as const;

export type FinancialSurvivalFactor = (typeof FINANCIAL_SURVIVAL_FACTORS)[number];

// Operational dimension: ability to execute critical business processes
export const OPERATIONAL_SURVIVAL_FACTORS = [
  "key_person_dependency",
  "critical_vendor_concentration",
  "infrastructure_stability",
  "team_churn_rate",
  "process_documentation_coverage",
  "incident_recovery_time",
] as const;

export type OperationalSurvivalFactor = (typeof OPERATIONAL_SURVIVAL_FACTORS)[number];

// Market dimension: customer concentration and demand sustainability
export const MARKET_SURVIVAL_FACTORS = [
  "customer_concentration_ratio",
  "churn_rate_trend",
  "market_demand_trend",
  "competitive_displacement_risk",
  "customer_credit_quality",
  "renewal_rate_trend",
] as const;

export type MarketSurvivalFactor = (typeof MARKET_SURVIVAL_FACTORS)[number];

// Strategic dimension: ability to adapt to threats and capitalize on opportunities
export const STRATEGIC_SURVIVAL_FACTORS = [
  "market_opportunity_pipeline",
  "strategic_pivot_readiness",
  "competitive_differentiation_strength",
  "technology_debt_burden",
  "regulatory_compliance_status",
  "partnership_network_health",
] as const;

export type StrategicSurvivalFactor = (typeof STRATEGIC_SURVIVAL_FACTORS)[number];

// Union of all survival factor types
export const ALL_SURVIVAL_FACTORS = [
  ...FINANCIAL_SURVIVAL_FACTORS,
  ...OPERATIONAL_SURVIVAL_FACTORS,
  ...MARKET_SURVIVAL_FACTORS,
  ...STRATEGIC_SURVIVAL_FACTORS,
] as const;

export type SurvivalFactor = (typeof ALL_SURVIVAL_FACTORS)[number];

// Survival factor categories
export const SURVIVAL_FACTOR_CATEGORIES = [
  "financial",
  "operational",
  "market",
  "strategic",
] as const;

export type SurvivalFactorCategory = (typeof SURVIVAL_FACTOR_CATEGORIES)[number];

// Map factors to their categories
export const FACTOR_CATEGORIES: Record<SurvivalFactor, SurvivalFactorCategory> = {
  // Financial
  monthly_cash_burn_rate: "financial",
  cash_runway_months: "financial",
  debt_repayment_obligations: "financial",
  revenue_stability_coefficient: "financial",
  margin_health_pct: "financial",
  working_capital_position: "financial",
  // Operational
  key_person_dependency: "operational",
  critical_vendor_concentration: "operational",
  infrastructure_stability: "operational",
  team_churn_rate: "operational",
  process_documentation_coverage: "operational",
  incident_recovery_time: "operational",
  // Market
  customer_concentration_ratio: "market",
  churn_rate_trend: "market",
  market_demand_trend: "market",
  competitive_displacement_risk: "market",
  customer_credit_quality: "market",
  renewal_rate_trend: "market",
  // Strategic
  market_opportunity_pipeline: "strategic",
  strategic_pivot_readiness: "strategic",
  competitive_differentiation_strength: "strategic",
  technology_debt_burden: "strategic",
  regulatory_compliance_status: "strategic",
  partnership_network_health: "strategic",
};

// Threshold definitions for health assessment
export interface SurvivalThresholds {
  critical_below: number;
  warning_below: number;
  healthy_above: number;
  unit: string;
}

export const SURVIVAL_THRESHOLDS: Record<SurvivalFactor, SurvivalThresholds> = {
  monthly_cash_burn_rate: {
    critical_below: 0,
    warning_below: 50000,
    healthy_above: -10000, // Positive burn is warning
    unit: "USD/month",
  },
  cash_runway_months: {
    critical_below: 3,
    warning_below: 6,
    healthy_above: 12,
    unit: "months",
  },
  debt_repayment_obligations: {
    critical_below: 0,
    warning_below: 100000,
    healthy_above: -1000000, // Any debt is flag
    unit: "USD",
  },
  revenue_stability_coefficient: {
    critical_below: 0.3,
    warning_below: 0.5,
    healthy_above: 0.7,
    unit: "correlation coefficient",
  },
  margin_health_pct: {
    critical_below: 10,
    warning_below: 20,
    healthy_above: 35,
    unit: "%",
  },
  working_capital_position: {
    critical_below: -100000,
    warning_below: 0,
    healthy_above: 50000,
    unit: "USD",
  },
  key_person_dependency: {
    critical_below: 0.7,
    warning_below: 0.5,
    healthy_above: 0.2,
    unit: "dependency ratio",
  },
  critical_vendor_concentration: {
    critical_below: 0.8,
    warning_below: 0.6,
    healthy_above: 0.3,
    unit: "concentration ratio",
  },
  infrastructure_stability: {
    critical_below: 0.95,
    warning_below: 0.98,
    healthy_above: 0.99,
    unit: "uptime %",
  },
  team_churn_rate: {
    critical_below: 30,
    warning_below: 20,
    healthy_above: 10,
    unit: "%/year",
  },
  process_documentation_coverage: {
    critical_below: 40,
    warning_below: 60,
    healthy_above: 80,
    unit: "%",
  },
  incident_recovery_time: {
    critical_below: 8,
    warning_below: 4,
    healthy_above: 1,
    unit: "hours",
  },
  customer_concentration_ratio: {
    critical_below: 0.8,
    warning_below: 0.6,
    healthy_above: 0.3,
    unit: "concentration ratio",
  },
  churn_rate_trend: {
    critical_below: -5,
    warning_below: 0,
    healthy_above: -2,
    unit: "% change",
  },
  market_demand_trend: {
    critical_below: -10,
    warning_below: -3,
    healthy_above: 3,
    unit: "% change",
  },
  competitive_displacement_risk: {
    critical_below: 0.7,
    warning_below: 0.5,
    healthy_above: 0.2,
    unit: "risk score",
  },
  customer_credit_quality: {
    critical_below: 0.6,
    warning_below: 0.7,
    healthy_above: 0.85,
    unit: "credit score avg",
  },
  renewal_rate_trend: {
    critical_below: -5,
    warning_below: 0,
    healthy_above: 2,
    unit: "% change",
  },
  market_opportunity_pipeline: {
    critical_below: 0,
    warning_below: 100000,
    healthy_above: 500000,
    unit: "USD pipeline value",
  },
  strategic_pivot_readiness: {
    critical_below: 0.3,
    warning_below: 0.5,
    healthy_above: 0.7,
    unit: "readiness score",
  },
  competitive_differentiation_strength: {
    critical_below: 0.3,
    warning_below: 0.5,
    healthy_above: 0.7,
    unit: "strength score",
  },
  technology_debt_burden: {
    critical_below: 0.7,
    warning_below: 0.5,
    healthy_above: 0.2,
    unit: "debt ratio",
  },
  regulatory_compliance_status: {
    critical_below: 0.6,
    warning_below: 0.8,
    healthy_above: 0.95,
    unit: "compliance %",
  },
  partnership_network_health: {
    critical_below: 0.3,
    warning_below: 0.5,
    healthy_above: 0.7,
    unit: "health score",
  },
};

export enum SurvivalFactorHealth {
  CRITICAL = "CRITICAL",
  WARNING = "WARNING",
  HEALTHY = "HEALTHY",
  UNKNOWN = "UNKNOWN",
}

export interface SurvivalFactorAssessment {
  factor: SurvivalFactor;
  category: SurvivalFactorCategory;
  health: SurvivalFactorHealth;
  current_value: number;
  threshold_critical: number;
  threshold_warning: number;
  last_measured_at: Date;
  measurement_confidence: "high" | "medium" | "low";
}

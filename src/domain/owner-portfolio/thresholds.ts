/**
 * Owner Multi-Business Portfolio Command Center (Module 9) — deterministic
 * thresholds for portfolio-level alerts and the investment recommendation.
 */
export interface PortfolioThresholds {
  /** Survival risk at/above this raises a survival-risk alert. */
  survivalRiskAlertScore: number;
  /** A cashflow-domain risk at/above this raises a cash-risk alert. */
  cashRiskAlertScore: number;
  /** Execution risk at/above this raises an execution-risk alert. */
  executionRiskAlertScore: number;
  /** A business is "safe to invest in" only when survival risk is below this. */
  safeInvestmentSurvivalRiskBar: number;
  /** Minimum growth opportunity for an investment recommendation to be made. */
  minInvestmentOpportunityScore: number;
}

export const PORTFOLIO_THRESHOLDS: PortfolioThresholds = {
  survivalRiskAlertScore: 70,
  cashRiskAlertScore: 70,
  executionRiskAlertScore: 70,
  safeInvestmentSurvivalRiskBar: 50,
  minInvestmentOpportunityScore: 40,
};

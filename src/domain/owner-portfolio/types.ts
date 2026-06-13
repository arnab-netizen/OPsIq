/**
 * Owner Multi-Business Portfolio Command Center (Module 9) — shared types.
 *
 * Pure types only: no DB, no I/O, no LLM. The portfolio layer is a cross-business
 * AGGREGATION over each business's already-computed Owner Intelligence Spine
 * `BusinessConditionProfile` — it persists nothing of its own. It answers: which
 * business is healthiest, which needs attention today, which is leaking money,
 * where the owner should spend time, and which should receive investment.
 */
import type { BusinessConditionProfile, OwnerAction } from "@/domain/owner-spine/contracts";

/** One business + its latest condition profile (or null when it has no data yet). */
export interface PortfolioBusinessInput {
  businessId: string;
  name: string;
  businessType?: string;
  currency?: string;
  isActive?: boolean;
  profile: BusinessConditionProfile | null;
}

/** Per-business roll-up used in the portfolio view (16.1). */
export interface PortfolioBusinessSummary {
  businessId: string;
  name: string;
  businessType: string | null;
  currency: string | null;
  hasData: boolean;
  overallHealthScore: number;
  survivalRiskScore: number;
  growthOpportunityScore: number;
  executionRiskScore: number;
  dataConfidenceScore: number;
  // Per-domain health (null when the business has no cycle in that domain).
  financialScore: number | null;
  salesScore: number | null;
  operationsScore: number | null;
  cashflowScore: number | null;
  executionScore: number | null;
  recommendedNextAction: OwnerAction | null;
}

/** Cross-business ranking (16.2) — each is a businessId or null when undeterminable. */
export interface PortfolioRanking {
  mostUrgentBusinessId: string | null;
  highestProfitOpportunityBusinessId: string | null;
  highestCashRiskBusinessId: string | null;
  worstExecutionProblemBusinessId: string | null;
  bestGrowthCandidateBusinessId: string | null;
}

/** A portfolio-level priority: a business's next action surfaced for the owner. */
export interface PortfolioPriority {
  businessId: string;
  businessName: string;
  action: OwnerAction;
}

/** A portfolio-level risk alert. */
export interface PortfolioRiskAlert {
  businessId: string;
  businessName: string;
  type: "survival_risk" | "cash_risk" | "execution_risk";
  message: string;
  score: number;
}

/** Investment recommendation (16.3) — the best safe growth candidate, if any. */
export interface PortfolioInvestmentRecommendation {
  businessId: string;
  businessName: string;
  reason: string;
  growthOpportunityScore: number;
  survivalRiskScore: number;
}

/** The full deterministic portfolio view. */
export interface PortfolioView {
  hasData: boolean;
  businessCount: number;
  portfolioHealthScore: number;
  businesses: PortfolioBusinessSummary[]; // ranked: most urgent first
  ranking: PortfolioRanking;
  top3Priorities: PortfolioPriority[];
  riskAlerts: PortfolioRiskAlert[];
  investmentRecommendation: PortfolioInvestmentRecommendation | null;
  generatedAt: Date;
}

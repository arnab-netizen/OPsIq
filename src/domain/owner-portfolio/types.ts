/**
 * Owner Multi-Business Portfolio Command Center (Module 9) — shared types.
 *
 * Pure types only: no DB, no I/O, no LLM. The portfolio layer is a cross-business
 * AGGREGATION over each business's already-computed Owner Intelligence Spine
 * `BusinessConditionProfile` — it persists nothing of its own. It answers: which
 * business is healthiest, which needs attention today, which is leaking money,
 * where the owner should spend time, and which should receive investment.
 */
import type { BusinessConditionProfile } from "@/domain/owner-spine/contracts";
import type { SurvivalEvidenceAssessment } from "@/domain/owner-spine/survival-evidence";
import type { CurrentOwnerDecision, OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";

/** One business + its latest condition profile (or null when it has no data yet). */
export interface PortfolioBusinessInput {
  businessId: string;
  name: string;
  businessType?: string;
  currency?: string;
  isActive?: boolean;
  profile: BusinessConditionProfile | null;
  /** The business's ONE canonical owner decision (owner-home service); null when none resolved. */
  ownerDecision?: CurrentOwnerDecision | null;
  /**
   * The canonical stale-evidence domains the business's owner decision was resolved with (owner-candidate-builder).
   * INTERNAL context for investment eligibility only; Portfolio never computes freshness itself. Absent = unknown (fail closed).
   */
  staleDomains?: readonly string[];
  /**
   * Whether this business's survival reading is sufficiently evidenced (complete and current) to clear a material
   * investment recommendation — resolved once by Owner Home (survival-evidence.ts). INTERNAL context; absent = unknown (fail closed).
   * A numeric `survivalRiskScore` below the bar is never sufficient on its own.
   */
  survivalEvidence?: SurvivalEvidenceAssessment;
}

/** Per-business roll-up used in the portfolio view (16.1). */
export interface PortfolioBusinessSummary {
  businessId: string;
  name: string;
  businessType: string | null;
  currency: string | null;
  hasData: boolean;
  overallHealthScore: number;
  /** null = NOT MEASURED (no recovery/finance/cashflow evidence); distinct from a measured 0. */
  survivalRiskScore: number | null;
  growthOpportunityScore: number;
  /** null = NOT MEASURED (no operations/sop evidence); distinct from a measured 0. */
  executionRiskScore: number | null;
  dataConfidenceScore: number;
  // Per-domain health (null when the business has no cycle in that domain).
  financialScore: number | null;
  salesScore: number | null;
  operationsScore: number | null;
  cashflowScore: number | null;
  executionScore: number | null;
  /** The business's canonical main target (never re-ranked here). */
  mainTarget: OwnerDecisionTarget | null;
}

/** Cross-business ranking (16.2) — each is a businessId or null when undeterminable. */
export interface PortfolioRanking {
  mostUrgentBusinessId: string | null;
  highestProfitOpportunityBusinessId: string | null;
  highestCashRiskBusinessId: string | null;
  worstExecutionProblemBusinessId: string | null;
  bestGrowthCandidateBusinessId: string | null;
}

/** A portfolio-level priority: a business's canonical main target surfaced for the owner. */
export interface PortfolioPriority {
  businessId: string;
  businessName: string;
  target: OwnerDecisionTarget;
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

/** A business that met the quantitative criteria but is held by canonical owner policy (plain language only). */
export interface PortfolioInvestmentHold {
  businessId: string;
  businessName: string;
  ownerStatement: string;
  reasons: string[];
  /** What must happen before OpsIQ reassesses. */
  nextStep: string;
}

/**
 * Visible investment abstention (A2). RECOMMENDED: a business is eligible. HELD: none is eligible, but at least one met the
 * quantitative criteria and canonical owner policy holds it. NO_QUALIFYING_CANDIDATE: none met the quantitative criteria.
 */
export interface PortfolioInvestmentAssessment {
  status: "RECOMMENDED" | "HELD" | "NO_QUALIFYING_CANDIDATE";
  summary: string;
  /** Held businesses, ordered by growth signal desc then businessId asc (includes holds beside a recommendation). */
  held: PortfolioInvestmentHold[];
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
  /**
   * `investmentRecommendation !== null` means ALL of: the existing quantitative portfolio criteria pass; the business's
   * canonical decision/context is valid (present, for this business); no canonical owner-wide material-decision guard
   * applies (`ownerMaterialCommitmentGuard` is null); no higher-priority primary concern blocks discretionary
   * investment; and the supporting growth evidence is current under canonical freshness (`staleDomains`).
   * It does NOT imply `advicePolicy.canMakeMaterialCommitment === true`: a supported NO_OPEN_ACTIONS decision carries
   * no commitment flag yet has no guard. A ranking such as `ranking.bestGrowthCandidateBusinessId` is never permission.
   */
  investmentRecommendation: PortfolioInvestmentRecommendation | null;
  investmentAssessment: PortfolioInvestmentAssessment;
  generatedAt: Date;
}

/**
 * Owner Multi-Business Portfolio Command Center (Module 9) — deterministic
 * portfolio engine.
 *
 * Pure functions only (no DB/I/O/LLM). Aggregates each business's Owner
 * Intelligence Spine `BusinessConditionProfile` into a cross-business view:
 * per-business roll-up, portfolio health, cross-business ranking, today's top-3
 * priorities, risk alerts, and an investment recommendation. Nothing is invented —
 * businesses without data are reported as such and never fabricated into scores.
 */
import { clampScore, rankOwnerActions, type OwnerDomain, type OwnerAction } from "@/domain/owner-spine/contracts";
import type {
  PortfolioBusinessInput,
  PortfolioBusinessSummary,
  PortfolioRanking,
  PortfolioPriority,
  PortfolioRiskAlert,
  PortfolioInvestmentRecommendation,
  PortfolioView,
} from "./types";
import { PORTFOLIO_THRESHOLDS, type PortfolioThresholds } from "./thresholds";

/** Health score for a domain in the profile, or null when absent. */
function domainHealth(input: PortfolioBusinessInput, domain: OwnerDomain): number | null {
  const ds = input.profile?.domainScores.find((d) => d.domain === domain);
  return ds ? clampScore(ds.healthScore) : null;
}

/** Risk score for a domain in the profile, or null when absent. */
function domainRisk(input: PortfolioBusinessInput, domain: OwnerDomain): number | null {
  const ds = input.profile?.domainScores.find((d) => d.domain === domain);
  return ds ? clampScore(ds.riskScore) : null;
}

/** Build the per-business summary (16.1). */
export function toBusinessSummary(input: PortfolioBusinessInput): PortfolioBusinessSummary {
  const p = input.profile;
  return {
    businessId: input.businessId,
    name: input.name,
    businessType: input.businessType ?? null,
    currency: input.currency ?? null,
    hasData: p !== null,
    overallHealthScore: p ? clampScore(p.overallHealthScore) : 0,
    survivalRiskScore: p ? clampScore(p.survivalRiskScore) : 0,
    growthOpportunityScore: p ? clampScore(p.growthOpportunityScore) : 0,
    executionRiskScore: p ? clampScore(p.executionRiskScore) : 0,
    dataConfidenceScore: p ? clampScore(p.dataConfidenceScore) : 0,
    financialScore: domainHealth(input, "finance"),
    salesScore: domainHealth(input, "sales"),
    operationsScore: domainHealth(input, "operations"),
    cashflowScore: domainHealth(input, "cashflow"),
    executionScore: domainHealth(input, "sop"),
    recommendedNextAction: p?.recommendedNextAction ?? null,
  };
}

/**
 * Deterministic pick of the businessId maximising `value` (null values excluded),
 * tie-broken by businessId asc for stability. Returns null when nothing qualifies.
 */
function maxByBusiness(
  rows: PortfolioBusinessSummary[],
  value: (s: PortfolioBusinessSummary) => number | null
): string | null {
  let best: { id: string; v: number } | null = null;
  for (const s of rows) {
    const v = value(s);
    if (v === null) continue;
    if (best === null || v > best.v || (v === best.v && s.businessId < best.id)) {
      best = { id: s.businessId, v };
    }
  }
  return best ? best.id : null;
}

/**
 * Build the full portfolio view from per-business condition profiles.
 * Deterministic: same inputs → same ranking, alerts, and priorities.
 */
export function buildPortfolioView(
  inputs: PortfolioBusinessInput[],
  opts: { now?: Date; thresholds?: PortfolioThresholds } = {}
): PortfolioView {
  const now = opts.now ?? new Date();
  const t = opts.thresholds ?? PORTFOLIO_THRESHOLDS;

  const summaries = inputs.map(toBusinessSummary);
  const withData = summaries.filter((s) => s.hasData);

  // Most-urgent-first ordering: survival risk desc → overall health asc → name asc.
  const businesses = [...summaries].sort((a, b) => {
    if (b.survivalRiskScore !== a.survivalRiskScore) return b.survivalRiskScore - a.survivalRiskScore;
    if (a.overallHealthScore !== b.overallHealthScore) return a.overallHealthScore - b.overallHealthScore;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const portfolioHealthScore =
    withData.length > 0
      ? clampScore(withData.reduce((acc, s) => acc + s.overallHealthScore, 0) / withData.length)
      : 0;

  const ranking: PortfolioRanking = {
    mostUrgentBusinessId: maxByBusiness(withData, (s) => s.survivalRiskScore),
    highestProfitOpportunityBusinessId: maxByBusiness(withData, (s) => s.growthOpportunityScore),
    highestCashRiskBusinessId: maxByBusiness(withData, (s) => {
      const input = inputs.find((i) => i.businessId === s.businessId)!;
      return domainRisk(input, "cashflow");
    }),
    worstExecutionProblemBusinessId: maxByBusiness(withData, (s) => s.executionRiskScore),
    bestGrowthCandidateBusinessId: maxByBusiness(
      withData.filter((s) => s.survivalRiskScore < t.safeInvestmentSurvivalRiskBar),
      (s) => s.growthOpportunityScore
    ),
  };

  // Today's top 3 priorities: each business's recommended next action, spine-ranked.
  const priorityActions: Array<{ summary: PortfolioBusinessSummary; action: OwnerAction }> = [];
  for (const s of withData) {
    if (s.recommendedNextAction) priorityActions.push({ summary: s, action: s.recommendedNextAction });
  }
  const rankedActions = rankOwnerActions(priorityActions.map((p) => p.action));
  const top3Priorities: PortfolioPriority[] = rankedActions.slice(0, 3).map((action) => {
    const owner = priorityActions.find((p) => p.action === action)!;
    return { businessId: owner.summary.businessId, businessName: owner.summary.name, action };
  });

  // Risk alerts (deterministic, ordered by score desc within type, businessId asc tie-break).
  const riskAlerts: PortfolioRiskAlert[] = [];
  for (const s of withData) {
    if (s.survivalRiskScore >= t.survivalRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "survival_risk", message: `Survival risk is ${s.survivalRiskScore}/100`, score: s.survivalRiskScore });
    }
    const input = inputs.find((i) => i.businessId === s.businessId)!;
    const cashRisk = domainRisk(input, "cashflow");
    if (cashRisk !== null && cashRisk >= t.cashRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "cash_risk", message: `Cashflow risk is ${cashRisk}/100`, score: cashRisk });
    }
    if (s.executionRiskScore >= t.executionRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "execution_risk", message: `Execution risk is ${s.executionRiskScore}/100`, score: s.executionRiskScore });
    }
  }
  riskAlerts.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.businessId < b.businessId ? -1 : 1));

  // Investment recommendation: best safe growth candidate above the opportunity bar.
  let investmentRecommendation: PortfolioInvestmentRecommendation | null = null;
  const candidateId = ranking.bestGrowthCandidateBusinessId;
  if (candidateId) {
    const c = withData.find((s) => s.businessId === candidateId)!;
    if (c.growthOpportunityScore >= t.minInvestmentOpportunityScore) {
      investmentRecommendation = {
        businessId: c.businessId,
        businessName: c.name,
        reason: `Highest growth opportunity (${c.growthOpportunityScore}/100) among businesses with survival risk below ${t.safeInvestmentSurvivalRiskBar}/100 (this one: ${c.survivalRiskScore}/100).`,
        growthOpportunityScore: c.growthOpportunityScore,
        survivalRiskScore: c.survivalRiskScore,
      };
    }
  }

  return {
    hasData: withData.length > 0,
    businessCount: summaries.length,
    portfolioHealthScore,
    businesses,
    ranking,
    top3Priorities,
    riskAlerts,
    investmentRecommendation,
    generatedAt: now,
  };
}

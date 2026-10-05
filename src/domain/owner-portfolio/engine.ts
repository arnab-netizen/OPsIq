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
import { clampScore, ownerSeverityRank, type OwnerDomain } from "@/domain/owner-spine/contracts";
import { ownerPriorityClassRank } from "@/domain/owner-spine/owner-decision";
import type {
  PortfolioBusinessInput,
  PortfolioBusinessSummary,
  PortfolioRanking,
  PortfolioPriority,
  PortfolioRiskAlert,
  PortfolioInvestmentRecommendation,
  PortfolioInvestmentHold,
  PortfolioInvestmentAssessment,
  PortfolioView,
} from "./types";
import { assessPortfolioInvestmentEligibility } from "./investment-eligibility";
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
    survivalRiskScore: p && p.survivalRiskScore !== null ? clampScore(p.survivalRiskScore) : null,
    growthOpportunityScore: p ? clampScore(p.growthOpportunityScore) : 0,
    executionRiskScore: p && p.executionRiskScore !== null ? clampScore(p.executionRiskScore) : null,
    dataConfidenceScore: p ? clampScore(p.dataConfidenceScore) : 0,
    financialScore: domainHealth(input, "finance"),
    salesScore: domainHealth(input, "sales"),
    operationsScore: domainHealth(input, "operations"),
    cashflowScore: domainHealth(input, "cashflow"),
    executionScore: domainHealth(input, "sop"),
    // Only this row's own business's decision may fill its main target.
    mainTarget: input.ownerDecision && input.ownerDecision.businessId === input.businessId ? input.ownerDecision.primaryTarget : null,
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

  // ONE cross-business urgency order, used for the business list, "needing attention first" and
  // today's top 3 alike: each business's CANONICAL main target by business class → severity (the
  // arbiter's own precedence; a business without a target follows every business with one), then
  // survival risk desc → overall health asc → name → businessId for stability.
  const targetRank = (s: PortfolioBusinessSummary) => (s.mainTarget ? ownerPriorityClassRank(s.mainTarget.priorityClass) : Number.MAX_SAFE_INTEGER);
  const urgencyOrder = (a: PortfolioBusinessSummary, b: PortfolioBusinessSummary): number => {
    const cls = targetRank(a) - targetRank(b);
    if (cls !== 0) return cls;
    const sev = ownerSeverityRank(b.mainTarget?.severity ?? "") - ownerSeverityRank(a.mainTarget?.severity ?? "");
    if (sev !== 0) return sev;
    // Same tie-break as the arbiter: a target on CURRENT figures precedes a refresh of out-of-date ones.
    const cur = Number(b.mainTarget !== null && b.mainTarget.source !== "evidence_refresh") - Number(a.mainTarget !== null && a.mainTarget.source !== "evidence_refresh");
    if (cur !== 0) return cur;
    // NOT MEASURED sorts after any measured survival risk (it is neither safe nor urgent evidence).
    const sb = b.survivalRiskScore ?? -1;
    const sa = a.survivalRiskScore ?? -1;
    if (sb !== sa) return sb - sa;
    if (a.overallHealthScore !== b.overallHealthScore) return a.overallHealthScore - b.overallHealthScore;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.businessId < b.businessId ? -1 : a.businessId > b.businessId ? 1 : 0;
  };
  const businesses = [...summaries].sort((a, b) => {
    // Businesses with data first (a no-data business is never "most urgent").
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    return urgencyOrder(a, b);
  });

  const portfolioHealthScore =
    withData.length > 0
      ? clampScore(withData.reduce((acc, s) => acc + s.overallHealthScore, 0) / withData.length)
      : 0;

  const ranking: PortfolioRanking = {
    mostUrgentBusinessId: withData.length > 0 ? [...withData].sort(urgencyOrder)[0].businessId : null,
    highestProfitOpportunityBusinessId: maxByBusiness(withData, (s) => s.growthOpportunityScore),
    highestCashRiskBusinessId: maxByBusiness(withData, (s) => {
      const input = inputs.find((i) => i.businessId === s.businessId)!;
      return domainRisk(input, "cashflow");
    }),
    worstExecutionProblemBusinessId: maxByBusiness(withData, (s) => s.executionRiskScore),
    bestGrowthCandidateBusinessId: maxByBusiness(
      // Unmeasured survival risk is not evidence of safety: such a business is never a "safe" candidate.
      withData.filter((s) => s.survivalRiskScore !== null && s.survivalRiskScore < t.safeInvestmentSurvivalRiskBar),
      (s) => s.growthOpportunityScore
    ),
  };

  // Today's top 3 priorities: each business's CANONICAL main target (never re-elected here), in the
  // same urgency order as above.
  const top3Priorities: PortfolioPriority[] = [...withData]
    .filter((s): s is PortfolioBusinessSummary & { mainTarget: NonNullable<PortfolioBusinessSummary["mainTarget"]> } => s.mainTarget !== null)
    .sort(urgencyOrder)
    .slice(0, 3)
    .map((s) => ({ businessId: s.businessId, businessName: s.name, target: s.mainTarget }));

  // Risk alerts (deterministic, ordered by score desc within type, businessId asc tie-break).
  const riskAlerts: PortfolioRiskAlert[] = [];
  for (const s of withData) {
    if (s.survivalRiskScore !== null && s.survivalRiskScore >= t.survivalRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "survival_risk", message: `Survival risk is ${s.survivalRiskScore}/100`, score: s.survivalRiskScore });
    }
    const input = inputs.find((i) => i.businessId === s.businessId)!;
    const cashRisk = domainRisk(input, "cashflow");
    if (cashRisk !== null && cashRisk >= t.cashRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "cash_risk", message: `Cashflow risk is ${cashRisk}/100`, score: cashRisk });
    }
    if (s.executionRiskScore !== null && s.executionRiskScore >= t.executionRiskAlertScore) {
      riskAlerts.push({ businessId: s.businessId, businessName: s.name, type: "execution_risk", message: `Execution risk is ${s.executionRiskScore}/100`, score: s.executionRiskScore });
    }
  }
  riskAlerts.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.businessId < b.businessId ? -1 : 1));

  // Investment recommendation (A2): ranking is not permission. Each business is assessed against its OWN canonical owner
  // decision (advice policy, primary priority class, evidence freshness); the existing deterministic ranking is then applied
  // to the ELIGIBLE set only, so a blocked top candidate never suppresses an eligible runner-up. This does not make growth
  // scores comparable across businesses (P2) — it changes who MAY be recommended, not how scores are computed.
  const assessments = withData.map((s) => ({ s, a: assessPortfolioInvestmentEligibility(inputs.find((i) => i.businessId === s.businessId)!, t) }));
  const eligibleRows = assessments.filter((x) => x.a.eligible).map((x) => x.s);
  const eligibleId = maxByBusiness(eligibleRows, (s) => s.growthOpportunityScore);
  let investmentRecommendation: PortfolioInvestmentRecommendation | null = null;
  if (eligibleId) {
    const c = eligibleRows.find((s) => s.businessId === eligibleId)!;
    investmentRecommendation = {
      businessId: c.businessId,
      businessName: c.name,
      reason: `Highest growth opportunity (${c.growthOpportunityScore}/100) among businesses whose current evidence and owner policy do not require holding a material decision, and whose survival risk is below ${t.safeInvestmentSurvivalRiskBar}/100 (this one: ${c.survivalRiskScore}/100).`,
      growthOpportunityScore: c.growthOpportunityScore,
      survivalRiskScore: c.survivalRiskScore as number,
    };
  }
  const holds: PortfolioInvestmentHold[] = assessments
    .filter((x): x is { s: PortfolioBusinessSummary; a: Extract<typeof x.a, { eligible: false }> } => !x.a.eligible && x.a.held)
    .sort((x, y) => (y.s.growthOpportunityScore !== x.s.growthOpportunityScore ? y.s.growthOpportunityScore - x.s.growthOpportunityScore : x.s.businessId < y.s.businessId ? -1 : 1))
    .map((x) => ({ businessId: x.s.businessId, businessName: x.s.name, ownerStatement: x.a.ownerStatement, reasons: x.a.reasons, nextStep: x.a.nextStep }));
  const investmentAssessment: PortfolioInvestmentAssessment = investmentRecommendation
    ? { status: "RECOMMENDED", summary: `${investmentRecommendation.businessName} is the strongest growth candidate whose current evidence and owner policy do not require holding a material decision.`, held: holds }
    : holds.length > 0
      ? { status: "HELD", summary: "Investment recommendation on hold: a business shows a growth signal, but its current decision does not yet support committing money.", held: holds }
      : { status: "NO_QUALIFYING_CANDIDATE", summary: "No business currently meets the survival-risk and growth-signal criteria for an investment recommendation.", held: [] };

  return {
    hasData: withData.length > 0,
    businessCount: summaries.length,
    portfolioHealthScore,
    businesses,
    ranking,
    top3Priorities,
    riskAlerts,
    investmentRecommendation,
    investmentAssessment,
    generatedAt: now,
  };
}

/**
 * Opportunity Portfolio / Capital Allocation Engine (depth pass) — the final stage of the opportunity loop.
 * It takes the promoted candidates (PASS 7) and their validation experiments + status (PASS 8) and allocates
 * each into a governed portfolio decision, enforcing the loop's hardest rule: **capital and scale go only to
 * opportunities whose validation has actually passed** — everything else gets validation, data, owner review,
 * a park, or a kill. Nothing scales on a hunch.
 *
 * Pipeline (all pure + deterministic):
 *   candidate + matched validation status
 *   → decide (NEEDS_DATA / VALIDATE_CHEAPLY / OWNER_REVIEW_REQUIRED / PARK / REJECT / KILL / DO_NOW / SCALE_CANDIDATE)
 *   → gate scaling: SCALE_CANDIDATE only when validation PASSED AND cash-safe AND capacity known AND legal clear
 *   → band the capital-at-risk + expected return qualitatively (never a fabricated number)
 *   → owner cockpit summary (the single top portfolio action + capital-discipline note)
 *
 * Hard governance rules:
 * - SCALE_CANDIDATE / DO_NOW are UNREACHABLE unless the opportunity's validation status is PASSED.
 * - KILL is reachable only when validation status is FAILED (a real negative result, not a guess).
 * - An active cash/profit risk, high cash risk, unknown capacity, or unclear legal exposure BLOCKS scaling
 *   and routes to owner review — with an explicit `scaleBlockedReason`.
 * - No fabricated money: capital-at-risk and expected return are qualitative bands only.
 * - No profit guarantee, no hidden score, no reckless "scale now".
 */

import type {
  ExternalOpportunityCandidate,
  OpportunityType,
  SignalSourceType,
  RiskBand,
  OppConfidence,
} from "./external-opportunity-intelligence";
import type {
  OpportunityValidationAnalysis,
  ValidationExperiment,
  ValidationStatus,
} from "./opportunity-validation-experiment-engine";
import type { ApprovalLevel } from "./process-intelligence";

export type PortfolioDecision =
  | "NEEDS_DATA"
  | "VALIDATE_CHEAPLY"
  | "OWNER_REVIEW_REQUIRED"
  | "PARK"
  | "REJECT"
  | "KILL"
  | "DO_NOW"
  | "SCALE_CANDIDATE";

/** Qualitative bands — the engine never fabricates a monetary figure the business has not supplied. */
export type CapitalBand = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type ReturnBand = "SMALL" | "MODERATE" | "LARGE" | "UNKNOWN";

export interface PortfolioContext {
  cashProfitRiskActive: boolean; // an active cash/profit risk that blocks any scaling of capital
  capabilityGapPresent: boolean; // OpsIQ lacks a capability needed to run this class of opportunity safely
}

/** One governed portfolio item (24 fields). Capital/return are bands, never fabricated numbers. */
export interface PortfolioItem {
  itemId: string;
  workspaceId: string;
  opportunityType: OpportunityType;
  signalSourceType: SignalSourceType;
  title: string;
  targetCustomerSegment: string;
  portfolioDecision: PortfolioDecision;
  validationStatus: ValidationStatus;
  hasRunnableExperiment: boolean;
  confidence: OppConfidence;
  cashRisk: RiskBand;
  ownerWorkloadRisk: RiskBand;
  legalOrComplianceRisk: RiskBand;
  capacityKnown: boolean;
  capitalAtRiskBand: CapitalBand;
  expectedReturnBand: ReturnBand;
  priorityRank: number;
  requiresOwnerApproval: boolean;
  approvalLevel: ApprovalLevel;
  scaleBlockedReason: string | null; // why this is NOT scalable yet (null once genuinely scalable)
  recommendedAction: string; // owner-visible next action
  riskIfIgnored: string;
  supportingRefs: string[];
  evaluatedAt: string;
}

export interface PortfolioSummary {
  itemsConsidered: number;
  validateFirst: number; // NEEDS_DATA + VALIDATE_CHEAPLY
  ownerReviewRequired: number;
  parkedOrRejected: number;
  killed: number;
  scaleCandidates: number;
  doNow: number;
}

export interface OpportunityPortfolioAnalysis {
  workspaceId: string;
  items: PortfolioItem[];
  topItem: PortfolioItem | null;
  capitalDisciplineNote: string; // always present: capital follows proof, not hunches
  summary: PortfolioSummary;
  evaluatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────

/** Qualitative capital-at-risk band from the experiment's cost cap + the candidate's cash risk. Never a number. */
function capitalBand(experiment: ValidationExperiment | null, candidate: ExternalOpportunityCandidate): CapitalBand {
  if (experiment && experiment.experimentType === "DATA_COLLECTION_ONLY") return "NONE";
  if (experiment && experiment.costCap === 0) return "NONE";
  if (candidate.cashRisk === "HIGH") return "HIGH";
  if (candidate.cashRisk === "MEDIUM") return "MEDIUM";
  if (candidate.cashRisk === "LOW") return "LOW";
  return "UNKNOWN";
}

/** Qualitative expected-return band from confidence + fit. Never a fabricated monetary figure. */
function returnBand(candidate: ExternalOpportunityCandidate): ReturnBand {
  if (candidate.confidence === "NEEDS_DATA") return "UNKNOWN";
  if (candidate.confidence === "HIGH" && candidate.operationalFit === "STRONG") return "LARGE";
  if (candidate.confidence === "LOW") return "SMALL";
  return "MODERATE";
}

/** Capacity is "known" when the candidate's operational + local fit are both determined (not UNKNOWN). */
function capacityKnownFor(candidate: ExternalOpportunityCandidate): boolean {
  return candidate.operationalFit !== "UNKNOWN" && candidate.localFeasibility !== "UNKNOWN";
}

// ── Core: decide one portfolio item ──────────────────────────────────────────────────────────────────────

/**
 * Allocate a single candidate into a governed portfolio decision, given its validation status. Pure.
 * The scaling gate is the whole point: SCALE_CANDIDATE / DO_NOW require a PASSED validation and a clear
 * cash / capacity / legal picture; anything else falls back to validate / review / park / reject / kill.
 */
export function decidePortfolioItem(
  candidate: ExternalOpportunityCandidate,
  experiment: ValidationExperiment | null,
  ctx: PortfolioContext,
  evaluatedAt: string,
): PortfolioItem {
  const validationStatus: ValidationStatus = experiment?.validationStatus ?? "NOT_STARTED";
  const hasRunnableExperiment = experiment != null && experiment.experimentType !== "DATA_COLLECTION_ONLY";
  const capacityKnown = capacityKnownFor(candidate);
  const highCash = candidate.cashRisk === "HIGH" || ctx.cashProfitRiskActive;
  const legalUnclear = candidate.legalOrComplianceRisk === "HIGH" || candidate.legalOrComplianceRisk === "UNKNOWN";

  let decision: PortfolioDecision;
  let scaleBlockedReason: string | null = "Validation has not passed yet — capital and scale are withheld until it does.";
  let recommendedAction: string;
  let riskIfIgnored: string;

  if (candidate.recommendedNextStep === "REJECT") {
    decision = "REJECT";
    scaleBlockedReason = "Rejected — no business fit.";
    recommendedAction = "Drop this opportunity; it does not fit the business.";
    riskIfIgnored = "None — rejecting an unfit opportunity protects focus.";
  } else if (validationStatus === "FAILED") {
    // A real negative result — stop, do not quietly revive it.
    decision = "KILL";
    scaleBlockedReason = "Validation failed — the assumption did not hold.";
    recommendedAction = "Stop this opportunity; its validation experiment failed. Do not spend more on it.";
    riskIfIgnored = "Throwing good money after a disproven idea.";
  } else if (validationStatus === "PASSED" && !highCash && !legalUnclear && capacityKnown && !ctx.capabilityGapPresent) {
    // The one path to scale: validation actually passed AND the cash / capacity / legal picture is clear.
    scaleBlockedReason = null;
    if (candidate.cashRisk === "LOW" && candidate.ownerWorkloadRisk !== "HIGH") {
      decision = "DO_NOW";
      recommendedAction = "Validation passed and risk is low — act on it now at a small, controlled scale.";
      riskIfIgnored = "Leaving a proven, low-risk win on the table.";
    } else {
      decision = "SCALE_CANDIDATE";
      recommendedAction = "Validation passed — bring a scaling plan (capital, capacity, timeline) to the owner for approval.";
      riskIfIgnored = "A validated opportunity stalls for lack of a scaling decision.";
    }
  } else if (validationStatus === "PASSED") {
    // Passed but the cash / capacity / legal picture blocks scaling → owner reviews the blockers.
    decision = "OWNER_REVIEW_REQUIRED";
    scaleBlockedReason = highCash
      ? "Validation passed, but cash/profit risk blocks scaling until cash is safe."
      : legalUnclear
        ? "Validation passed, but legal/compliance exposure is unclear."
        : !capacityKnown
          ? "Validation passed, but delivery capacity is unknown."
          : "Validation passed, but OpsIQ lacks a capability needed to scale this safely.";
    recommendedAction = `Owner review: ${scaleBlockedReason}`;
    riskIfIgnored = "Scaling into a cash, capacity, or legal wall.";
  } else if (highCash || legalUnclear || candidate.recommendedNextStep === "OWNER_REVIEW") {
    decision = "OWNER_REVIEW_REQUIRED";
    recommendedAction = "Owner review required before any spend on validating this opportunity.";
    riskIfIgnored = "Committing owner time or cash to an unvetted opportunity.";
  } else if (candidate.recommendedNextStep === "PARK") {
    decision = "PARK";
    recommendedAction = "Park this opportunity; revisit if a stronger signal appears.";
    riskIfIgnored = "Minimal — parked opportunities are cheap to revisit.";
  } else if (
    candidate.missingData.length > 0 ||
    candidate.recommendedNextStep === "COLLECT_COST_DATA" ||
    candidate.recommendedNextStep === "COLLECT_DATA" ||
    candidate.recommendedNextStep === "COLLECT_ELIGIBILITY_DATA" ||
    candidate.recommendedNextStep === "NEEDS_CAPABILITY" ||
    !hasRunnableExperiment
  ) {
    decision = "NEEDS_DATA";
    recommendedAction = "Collect the missing data (economics / eligibility) before allocating any capital.";
    riskIfIgnored = "Deciding on an opportunity you cannot yet measure.";
  } else {
    decision = "VALIDATE_CHEAPLY";
    recommendedAction = "Run the cheap validation experiment before allocating any capital.";
    riskIfIgnored = "A plausible opportunity goes untested while capital sits idle or is misallocated.";
  }

  const capitalAtRiskBand = capitalBand(experiment, candidate);
  const expectedReturnBand = returnBand(candidate);

  // Owner approval whenever scaling, spending, or material exposure is in play.
  const requiresOwnerApproval =
    decision === "SCALE_CANDIDATE" ||
    decision === "OWNER_REVIEW_REQUIRED" ||
    decision === "KILL" ||
    highCash ||
    legalUnclear ||
    candidate.approvalLevel === "OWNER";
  const approvalLevel: ApprovalLevel = requiresOwnerApproval ? "OWNER" : "MANAGER";

  return {
    itemId: `port:${candidate.workspaceId.slice(0, 8)}:${candidate.signalSourceType}:${candidate.opportunityType}`,
    workspaceId: candidate.workspaceId,
    opportunityType: candidate.opportunityType,
    signalSourceType: candidate.signalSourceType,
    title: candidate.expectedValueHypothesis || "Opportunity",
    targetCustomerSegment: candidate.targetCustomerSegment,
    portfolioDecision: decision,
    validationStatus,
    hasRunnableExperiment,
    confidence: candidate.confidence,
    cashRisk: candidate.cashRisk,
    ownerWorkloadRisk: candidate.ownerWorkloadRisk,
    legalOrComplianceRisk: candidate.legalOrComplianceRisk,
    capacityKnown,
    capitalAtRiskBand,
    expectedReturnBand,
    priorityRank: 0, // assigned during orchestration
    requiresOwnerApproval,
    approvalLevel,
    scaleBlockedReason,
    recommendedAction,
    riskIfIgnored,
    supportingRefs: candidate.sourceRefs.slice(0, 8),
    evaluatedAt,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────────────────────────────────

// Act-on-proof first, then validate/collect, then govern, then park/reject/kill.
const DECISION_RANK: Record<PortfolioDecision, number> = {
  DO_NOW: 0,
  SCALE_CANDIDATE: 1,
  VALIDATE_CHEAPLY: 2,
  NEEDS_DATA: 3,
  OWNER_REVIEW_REQUIRED: 4,
  PARK: 5,
  KILL: 6,
  REJECT: 7,
};
const CONFIDENCE_RANK: Record<OppConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NEEDS_DATA: 3 };

/** Match a candidate to its validation experiment by (source type + opportunity type). Pure. */
function experimentFor(candidate: ExternalOpportunityCandidate, experiments: ValidationExperiment[]): ValidationExperiment | null {
  return experiments.find((e) => e.signalSourceType === candidate.signalSourceType && e.opportunityType === candidate.opportunityType) ?? null;
}

/**
 * Build the opportunity portfolio: allocate every candidate into a governed decision, gate scaling behind
 * passed validation, and surface only the single top action to the owner. Pure + deterministic.
 */
export function buildOpportunityPortfolio(
  candidates: ExternalOpportunityCandidate[],
  validation: OpportunityValidationAnalysis | null,
  ctx: PortfolioContext,
  workspaceId: string,
  evaluatedAt: string,
): OpportunityPortfolioAnalysis {
  const experiments = validation?.experiments ?? [];
  const items = candidates.map((c) => decidePortfolioItem(c, experimentFor(c, experiments), ctx, evaluatedAt));

  items.sort(
    (a, b) =>
      DECISION_RANK[a.portfolioDecision] - DECISION_RANK[b.portfolioDecision] ||
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );
  items.forEach((it, i) => { it.priorityRank = i + 1; });

  const summary: PortfolioSummary = {
    itemsConsidered: items.length,
    validateFirst: items.filter((i) => i.portfolioDecision === "NEEDS_DATA" || i.portfolioDecision === "VALIDATE_CHEAPLY").length,
    ownerReviewRequired: items.filter((i) => i.portfolioDecision === "OWNER_REVIEW_REQUIRED").length,
    parkedOrRejected: items.filter((i) => i.portfolioDecision === "PARK" || i.portfolioDecision === "REJECT").length,
    killed: items.filter((i) => i.portfolioDecision === "KILL").length,
    scaleCandidates: items.filter((i) => i.portfolioDecision === "SCALE_CANDIDATE").length,
    doNow: items.filter((i) => i.portfolioDecision === "DO_NOW").length,
  };

  return {
    workspaceId,
    items,
    topItem: items[0] ?? null,
    capitalDisciplineNote: "Capital and scale follow proof, not hunches: only opportunities whose validation has passed can be scaled — the rest are validated, reviewed, parked, or stopped.",
    summary,
    evaluatedAt,
  };
}

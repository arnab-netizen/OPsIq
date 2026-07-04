/**
 * Owner-value hardening (Wealth / Opportunity / Profit Generation Mode).
 *
 * `screenOpportunity` returns an accept/defer/reject verdict + reasons. That is a
 * gate, not owner decision support. The Wealth Standard requires every opportunity
 * recommendation to carry a full owner-reviewable envelope: what kind of opportunity,
 * how confident, what data is missing, the downside, the cash/operational burden,
 * whether the owner must approve, the first *test* action (never a full commitment),
 * the success metric, the stop-loss, and the reassessment trigger.
 *
 * This module derives that envelope DETERMINISTICALLY from the same signals the screen
 * already uses — no new scoring engine, and no fabricated ROI. When the data needed to
 * judge safety is missing (e.g. no margin), it does NOT invent an upside: it lowers
 * confidence, discloses the gap, and forces owner approval. Pure; no I/O.
 */

import type { ScreenResult, ScreenVerdict } from "@/domain/owner-mode/opportunity-contract-guardrails";
import { type CapacityStatus, capacityBlocksGrowth } from "@/domain/owner-mode/equipment-capacity";
import { type ConstraintType, GROWTH_BLOCKING_CONSTRAINTS } from "@/domain/owner-mode/constraint-engine";

export type DecisionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type RiskClass = "LOW" | "MEDIUM" | "HIGH";
/** A qualitative upside band — never a fabricated dollar figure. */
export type UpsideBand = "UNKNOWN_INSUFFICIENT_DATA" | "MARGINAL" | "MODERATE" | "STRONG";

export interface OpportunityEnvelopeInput {
  opportunityType: string;
  screen: ScreenResult;
  /** 0..1 gross margin, or null when unknown. */
  marginPct: number | null;
  marginFloorPct: number; // 0..1
  capacityStatus: CapacityStatus;
  paymentRisk: "low" | "medium" | "high";
  fitScore: number; // 0..1
  /** Owner-supplied capital outlay for this move, if known (currency units). */
  estimatedCapitalOutlay?: number | null;
  /** Threshold above which a capital move always needs explicit owner approval. */
  capitalApprovalThreshold?: number;
  /**
   * The business's CURRENT binding constraint (from the Constraint Engine). When it is a
   * growth-blocking constraint (cash/capacity/quality/owner/equipment/delivery), an expansion
   * opportunity must be owner-gated and its upside capped — you do not scale into a bottleneck.
   */
  currentConstraint?: ConstraintType | null;
}

export interface OpportunityDecisionEnvelope {
  opportunityType: string;
  verdict: ScreenVerdict;
  upsideBand: UpsideBand;
  confidence: DecisionConfidence;
  riskClass: RiskClass;
  requiredData: string[];
  missingData: string[];
  downsideRisk: string;
  cashImpact: string;
  operationalBurden: string;
  ownerApprovalRequired: boolean;
  ownerApprovalReasons: string[];
  firstTestAction: string;
  successMetric: string;
  stopLossCondition: string;
  reassessmentTrigger: string;
}

const DEFAULT_CAPITAL_APPROVAL_THRESHOLD = 25000;

/** How close (in margin points) to the floor still counts as "thin" and owner-gated. */
const THIN_MARGIN_BUFFER = 0.05;

export function buildOpportunityEnvelope(input: OpportunityEnvelopeInput): OpportunityDecisionEnvelope {
  const {
    opportunityType, screen, marginPct, marginFloorPct, capacityStatus, paymentRisk, fitScore,
  } = input;
  const verdict = screen.verdict;
  const threshold = input.capitalApprovalThreshold ?? DEFAULT_CAPITAL_APPROVAL_THRESHOLD;

  // Data completeness drives confidence and forbids fabricated upside.
  const requiredData = ["gross margin %", "fleet/equipment capacity status", "payment/credit risk", "fit score"];
  const missingData: string[] = [];
  if (marginPct == null) missingData.push("gross margin % (no financial snapshot)");
  if (input.estimatedCapitalOutlay == null) missingData.push("estimated capital outlay for this move");

  const marginKnown = marginPct != null;
  const capacityKnown = capacityStatus != null;
  // Confidence keys off SAFETY-CRITICAL data (margin + capacity). A missing optional
  // capital figure is still disclosed in missingData but does not, alone, lower confidence.
  const safetyDataComplete = marginKnown && capacityKnown;
  const confidence: DecisionConfidence = !marginKnown
    ? "LOW"
    : safetyDataComplete
      ? "HIGH"
      : "MEDIUM";

  // Upside band — qualitative, and UNKNOWN when we cannot see margin. Never a dollar figure.
  const thinMargin = marginKnown && marginPct! < marginFloorPct + THIN_MARGIN_BUFFER;
  let upsideBand: UpsideBand;
  if (verdict === "reject") upsideBand = "MARGINAL";
  else if (!marginKnown) upsideBand = "UNKNOWN_INSUFFICIENT_DATA";
  else if (thinMargin || fitScore < 0.55) upsideBand = "MARGINAL";
  else if (fitScore >= 0.75 && !thinMargin) upsideBand = "STRONG";
  else upsideBand = "MODERATE";

  // Risk classification from the concrete safety signals.
  const capacityConstrained = capacityBlocksGrowth(capacityStatus);
  let riskClass: RiskClass = "LOW";
  if (paymentRisk === "high" || !marginKnown || (input.estimatedCapitalOutlay ?? 0) >= threshold) riskClass = "HIGH";
  else if (paymentRisk === "medium" || capacityConstrained || thinMargin) riskClass = "MEDIUM";

  // Owner approval: any high-risk / high-capital / data-blind / thin-margin non-reject move.
  const ownerApprovalReasons: string[] = [];
  if (paymentRisk === "high") ownerApprovalReasons.push("high payment/credit risk");
  if (!marginKnown) ownerApprovalReasons.push("margin unknown — safety cannot be verified without owner review");
  if ((input.estimatedCapitalOutlay ?? 0) >= threshold) ownerApprovalReasons.push(`capital outlay >= ${threshold}`);
  if (thinMargin) ownerApprovalReasons.push("margin is within the thin-margin buffer of the floor");
  if (capacityConstrained) ownerApprovalReasons.push("capacity is constrained");

  // Constraint-Engine integration: do not scale into the current binding constraint. When a
  // growth-blocking constraint (cash/capacity/quality/owner/equipment/delivery) is active, an
  // expansion opportunity is owner-gated and its upside is capped (never STRONG while blocked).
  const constraintBlocksGrowth =
    input.currentConstraint != null && GROWTH_BLOCKING_CONSTRAINTS.has(input.currentConstraint);
  if (constraintBlocksGrowth && verdict !== "reject") {
    ownerApprovalReasons.push(`current binding constraint is ${input.currentConstraint} — relieve it before scaling`);
    if (upsideBand === "STRONG") upsideBand = "MODERATE";
  }

  const ownerApprovalRequired = verdict !== "reject" && ownerApprovalReasons.length > 0;

  const downsideRisk = verdict === "reject"
    ? "Pursuing anyway erodes margin below the floor or chases a poor-fit deal — direct profit loss."
    : capacityConstrained
      ? "Committing beyond capacity degrades existing service quality and on-time delivery."
      : paymentRisk !== "low"
        ? "Payment default or slow terms tie up working capital."
        : "Limited — passes margin, capacity, and payment screens.";

  const cashImpact = !marginKnown
    ? "Unknown — no margin data; treat as cash-negative until proven otherwise."
    : (input.estimatedCapitalOutlay ?? 0) >= threshold
      ? "Material upfront capital; protect runway before committing."
      : paymentRisk !== "low"
        ? "Working-capital exposure from payment terms/credit risk."
        : "Low upfront cash; margin-positive if delivered.";

  const operationalBurden = capacityConstrained
    ? "High — current capacity is saturated/down; fulfilling this needs added capacity or reprioritization."
    : "Moderate — fits within current capacity headroom.";

  // First action is always a bounded TEST, never a full commitment.
  const firstTestAction = verdict === "reject"
    ? "Do not pursue; if strategic, renegotiate terms/price to clear the margin floor first, then re-screen."
    : verdict === "defer"
      ? "Hold; run the smallest reversible pilot only after the blocking condition (capacity/terms/margin data) clears."
      : `Run a small, time-boxed pilot of "${opportunityType}" (one route/segment) before any full commitment.`;

  const successMetric = marginKnown
    ? `Realized gross margin on the pilot stays at or above the ${Math.round(marginFloorPct * 100)}% floor, with on-time fulfillment.`
    : "Establish the true gross margin from the pilot before scaling — that IS the first success gate.";

  const stopLossCondition = "Stop and revert if pilot margin drops below the floor, fulfillment slips, or payment terms are missed.";

  const reassessmentTrigger = "Re-evaluate the opportunity if pilot outcome underperforms the success metric, capacity degrades, or a shock/major-client change occurs.";

  return {
    opportunityType, verdict, upsideBand, confidence, riskClass,
    requiredData, missingData, downsideRisk, cashImpact, operationalBurden,
    ownerApprovalRequired, ownerApprovalReasons, firstTestAction, successMetric,
    stopLossCondition, reassessmentTrigger,
  };
}

/**
 * Budget Outcome Learning (Dynamic Budget). Pure, deterministic.
 *
 * Wraps the existing `classifyInitiativeOutcome` (outcome class + next step +
 * safe-for-learning) and adds the LEARNING decision: what to do next with the
 * recommendation (repeat / modify / escalate / block) and how the outcome should move
 * confidence (raise / maintain / lower the recommendation / lower DATA confidence).
 *
 * Honesty rules:
 *  - A failure with no provided impact / unverified result lowers DATA confidence, not
 *    the recommendation's quality.
 *  - An owner-override or external-factor failure is classified separately and does NOT
 *    count as a bad recommendation.
 *  - A recommendation that has already failed before is NOT blindly repeated — it
 *    escalates, then blocks.
 *
 * No new engine: this composes the existing outcome classifier.
 */
import {
  classifyInitiativeOutcome,
  type InitiativeCloseInput,
  type InitiativeCloseResult,
} from "@/domain/owner-budget/initiative-outcome";

export type BudgetActionDisposition = "repeat" | "modify" | "escalate" | "block";
export type BudgetConfidenceImpact = "raise" | "maintain" | "lower_recommendation" | "lower_data";

export interface BudgetOutcomeInput extends InitiativeCloseInput {
  /** How many times this same recommendation has already failed (for "don't blindly repeat"). */
  priorFailures?: number;
}

export interface BudgetOutcomeResult extends InitiativeCloseResult {
  disposition: BudgetActionDisposition;
  confidenceImpact: BudgetConfidenceImpact;
}

/**
 * Classify a budget action/recommendation outcome and derive the learning disposition +
 * confidence impact. Pure: identical input ⇒ identical output.
 */
export function classifyBudgetOutcome(input: BudgetOutcomeInput): BudgetOutcomeResult {
  const base = classifyInitiativeOutcome(input);
  const priorFailures = Math.max(0, input.priorFailures ?? 0);

  let disposition: BudgetActionDisposition;
  let confidenceImpact: BudgetConfidenceImpact;

  switch (base.outcome) {
    case "SUCCESS":
      // Verified success — safe to repeat/scale; raises confidence in the recommendation.
      disposition = "repeat";
      confidenceImpact = "raise";
      break;
    case "PARTIAL":
      disposition = "modify";
      confidenceImpact = "maintain";
      break;
    case "FAILED":
      // Verified bad result: escalate first, BLOCK once it has failed before.
      disposition = priorFailures >= 1 ? "block" : "escalate";
      confidenceImpact = "lower_recommendation";
      break;
    case "UNVERIFIED":
      // Missing/unverified data ⇒ lower DATA confidence, not the recommendation; collect more.
      disposition = "modify";
      confidenceImpact = "lower_data";
      break;
    case "OVERRIDDEN":
      // Owner overrode the advice — not attributable to the recommendation's quality.
      disposition = "modify";
      confidenceImpact = "maintain";
      break;
    case "EXTERNAL_FACTOR":
      // External event changed the result — not attributable to the recommendation.
      disposition = "modify";
      confidenceImpact = "maintain";
      break;
    case "CANCELLED":
    default:
      disposition = "block";
      confidenceImpact = "maintain";
      break;
  }

  return { ...base, disposition, confidenceImpact };
}

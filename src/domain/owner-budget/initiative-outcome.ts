/**
 * Funded Initiative Outcome learning classifier (Section 44). Pure, deterministic.
 *
 * Closes a funded initiative by comparing expected vs actual spend/impact and
 * returns a learning-safe outcome class plus the next step (repeat/scale/stop/
 * redesign/collect_evidence). Unverified outcomes are never treated as success.
 */

export type InitiativeOutcome =
  | "SUCCESS" | "FAILED" | "PARTIAL" | "UNVERIFIED" | "CANCELLED" | "OVERRIDDEN" | "EXTERNAL_FACTOR";

export type InitiativeNextStep = "repeat" | "scale" | "stop" | "redesign" | "collect_evidence";

export interface InitiativeCloseInput {
  cancelled?: boolean;
  overridden?: boolean;
  externalFactor?: boolean;
  outcomeVerified: boolean;
  expectedImpact?: number | null;
  actualImpact?: number | null;
  expectedSpend?: number | null;
  actualSpend?: number | null;
}

export interface InitiativeCloseResult {
  outcome: InitiativeOutcome;
  nextStep: InitiativeNextStep;
  /** True only for verified, non-overridden, non-external outcomes (safe to learn from). */
  safeForLearning: boolean;
  reason: string;
}

export function classifyInitiativeOutcome(i: InitiativeCloseInput): InitiativeCloseResult {
  if (i.cancelled) return { outcome: "CANCELLED", nextStep: "stop", safeForLearning: false, reason: "Initiative cancelled before completion." };
  if (i.overridden) return { outcome: "OVERRIDDEN", nextStep: "redesign", safeForLearning: false, reason: "Owner overrode the planned initiative." };
  if (i.externalFactor) return { outcome: "EXTERNAL_FACTOR", nextStep: "collect_evidence", safeForLearning: false, reason: "External event changed the result; not attributable." };
  if (!i.outcomeVerified) return { outcome: "UNVERIFIED", nextStep: "collect_evidence", safeForLearning: false, reason: "Outcome not verified — cannot classify success." };

  const expected = i.expectedImpact;
  const actual = i.actualImpact;
  if (typeof expected !== "number" || typeof actual !== "number") {
    return { outcome: "UNVERIFIED", nextStep: "collect_evidence", safeForLearning: false, reason: "Impact data incomplete." };
  }

  const ratio = expected === 0 ? (actual > 0 ? 1 : 0) : actual / expected;
  if (ratio >= 0.9) return { outcome: "SUCCESS", nextStep: "scale", safeForLearning: true, reason: "Actual impact met/exceeded expectation." };
  if (ratio >= 0.5) return { outcome: "PARTIAL", nextStep: "repeat", safeForLearning: true, reason: "Partial impact — refine and repeat before scaling." };
  return { outcome: "FAILED", nextStep: "redesign", safeForLearning: true, reason: "Actual impact well below expectation — redesign or stop." };
}

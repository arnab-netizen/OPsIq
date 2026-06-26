/**
 * Module 34 — Negative Recommendation Engine (pure domain core).
 *
 * A "negative recommendation" is an explicit "do NOT do X / stop doing X / avoid X"
 * recommendation — the inverse of a positive action. OpsIQ must be able to tell an
 * owner what NOT to do (e.g. "do not discount further", "do not hire now", "do not
 * take on this client", "stop the unprofitable service line").
 * Pure + deterministic.
 */

export type ImpactSeverity = "low" | "medium" | "high" | "critical";

export type NegativeRecommendationKind =
  | "DO_NOT_START"
  | "STOP_CONTINUING"
  | "AVOID_ESCALATION"
  | "REVERSE_RECENT_CHANGE";

export type NegativeUrgency = "ADVISORY" | "STRONG" | "BLOCKING";

export interface NegativeRecommendationInput {
  action: string;
  kind: NegativeRecommendationKind;
  /** How much harm results if the (positive) action IS done / continued. */
  harmIfDone: ImpactSeverity;
  evidenceStrength: "weak" | "moderate" | "strong";
  /** Whether doing the action can be cheaply undone afterward. */
  reversible: boolean;
}

export interface NegativeRecommendationResult {
  issue: boolean;
  urgency: NegativeUrgency;
  rationale: string;
}

/**
 * Evaluate a single negative recommendation.
 *
 * - BLOCKING: harm critical AND evidence strong, OR harm critical AND irreversible.
 * - STRONG: harm high.
 * - ADVISORY: otherwise.
 * - issue is false only when harm is low AND evidence weak.
 */
export function evaluateNegativeRecommendation(
  input: NegativeRecommendationInput
): NegativeRecommendationResult {
  const { harmIfDone, evidenceStrength, reversible } = input;

  let urgency: NegativeUrgency;
  if (
    harmIfDone === "critical" &&
    (evidenceStrength === "strong" || !reversible)
  ) {
    urgency = "BLOCKING";
  } else if (harmIfDone === "high") {
    urgency = "STRONG";
  } else {
    urgency = "ADVISORY";
  }

  const issue = !(harmIfDone === "low" && evidenceStrength === "weak");

  const rationale = buildRationale(input, urgency, issue);

  return { issue, urgency, rationale };
}

function buildRationale(
  input: NegativeRecommendationInput,
  urgency: NegativeUrgency,
  issue: boolean
): string {
  const { action, harmIfDone, evidenceStrength, reversible } = input;
  const head = `"${action}"`;
  const tail = `(harm=${harmIfDone}, evidence=${evidenceStrength}, ${reversible ? "reversible" : "irreversible"})`;
  if (!issue) {
    return `${head}: no negative recommendation — harm is low and evidence is weak ${tail}.`;
  }
  switch (urgency) {
    case "BLOCKING":
      return `${head}: BLOCKING — must not proceed; critical harm ${tail}.`;
    case "STRONG":
      return `${head}: STRONG — strongly advised against ${tail}.`;
    default:
      return `${head}: ADVISORY — caution advised ${tail}.`;
  }
}

const URGENCY_RANK: Record<NegativeUrgency, number> = {
  BLOCKING: 0,
  STRONG: 1,
  ADVISORY: 2,
};

export interface RankedNegativeRecommendation extends NegativeRecommendationResult {
  input: NegativeRecommendationInput;
}

/**
 * Rank negative recommendations BLOCKING-first, then STRONG, then ADVISORY.
 * Deterministic tie-break by action name. Only those with issue === true are returned.
 */
export function rankNegativeRecommendations(
  inputs: NegativeRecommendationInput[]
): RankedNegativeRecommendation[] {
  return inputs
    .map((input) => ({ input, ...evaluateNegativeRecommendation(input) }))
    .filter((r) => r.issue)
    .sort((a, b) => {
      const byUrgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
      if (byUrgency !== 0) return byUrgency;
      return a.input.action.localeCompare(b.input.action);
    });
}

/** Thrown when a blocking negative recommendation would be violated. */
export class BlockingNegativeRecommendationError extends Error {
  readonly code = "BLOCKING_NEGATIVE_RECOMMENDATION";
  readonly blockingActions: string[];
  constructor(ref: string, blockingActions: string[]) {
    super(
      `Action ${ref} blocked by negative recommendation(s): ${blockingActions.join(", ")}.`
    );
    this.name = "BlockingNegativeRecommendationError";
    this.blockingActions = blockingActions;
  }
}

/**
 * Guard: throws BlockingNegativeRecommendationError if any input evaluates to BLOCKING.
 * Mirrors the NotScaleReadyError guard style.
 */
export function assertNoBlockingNegative(
  inputs: NegativeRecommendationInput[],
  ref: string
): void {
  const blockingActions = inputs
    .filter((i) => evaluateNegativeRecommendation(i).urgency === "BLOCKING")
    .map((i) => i.action);
  if (blockingActions.length > 0) {
    throw new BlockingNegativeRecommendationError(ref, blockingActions);
  }
}

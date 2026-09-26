/**
 * Owner Strategy — verdict/action arbitration (Decision Overhaul, root cause 3).
 *
 * Pure. Given the current decision, decides which actions may be shown and which ONE is the
 * primary next step:
 *  - Only GO may carry a "proceed" step (STRREC_PROCEED, as its primary). Legacy "Pursue"
 *    (STRREC_PURSUE) and "Size up" (STRREC_SCALE) are retired: never planned again, and a
 *    persisted one is on hold (or, under GO, superseded by the single primary step).
 *  - Each decision allows a fixed set of supporting steps; anything else is on hold because it
 *    conflicts with the decision (e.g. "secure funding" for an option that loses money).
 *  - Exactly one open action is the primary: the one matching the decision's primary step.
 * The same rules apply to freshly planned actions and to persisted rows from earlier cycles, so
 * Strategy, Home and the business condition all see one coherent recommendation.
 */
import type { StrategyDecision, StrategyDecisionCode } from "./decision";

/** Steps that gather or correct an input. */
const DATA_STEPS = ["STRREC_IMPROVE_DATA_QUALITY", "STRREC_PROVIDE_CASH", "STRREC_SET_RISK_LEVEL", "STRREC_FIX_CURRENCY"] as const;
/** Steps that handle a condition of an otherwise-worthwhile option. */
const CONDITION_STEPS = [
  "STRREC_CAP_DOWNSIDE",
  "STRREC_DE_RISK",
  "STRREC_SET_RISK_LEVEL",
  "STRREC_KEEP_RESERVE",
  "STRREC_STAGE_PAYBACK",
  "STRREC_COMPARE_ALTERNATIVES",
] as const;

/** Supporting (non-primary) steps allowed under each decision. */
export const STRATEGY_SUPPORTING_STEPS: Record<StrategyDecisionCode, readonly string[]> = {
  NEED_INFO: DATA_STEPS,
  DONT_AS_PLANNED: [],
  NOT_YET: [...CONDITION_STEPS.filter((c) => c !== "STRREC_KEEP_RESERVE"), ...DATA_STEPS],
  GO_WITH_CONDITIONS: [...CONDITION_STEPS, ...DATA_STEPS],
  GO: DATA_STEPS,
};

/** Retired recommendation codes: positive findings are reasons, not commands. */
export const RETIRED_STRATEGY_RECOMMENDATION_CODES: readonly string[] = ["STRREC_PURSUE", "STRREC_SCALE"];

/** "closed": completed/cancelled — history, never a next step. */
export type StrategyActionFit = "primary" | "supporting" | "on_hold" | "superseded" | "closed";

export interface ArbitrableStrategyAction {
  findingCode: string;
  recommendationCode?: string | null;
  status?: string;
}

function isPrimaryStep(a: ArbitrableStrategyAction, d: StrategyDecision): boolean {
  return a.recommendationCode === d.primaryStep.recommendationCode && a.findingCode === d.primaryStep.findingCode;
}

/** Fit of one action under the decision, ignoring duplicates (see arbitrateStrategyActionRows). */
export function strategyActionFit(a: ArbitrableStrategyAction, d: StrategyDecision): StrategyActionFit {
  const code = a.recommendationCode ?? "";
  if (isPrimaryStep(a, d)) return "primary";
  if (RETIRED_STRATEGY_RECOMMENDATION_CODES.includes(code)) return d.code === "GO" ? "superseded" : "on_hold";
  if (d.prohibitedRecommendationCodes.includes(code)) return "on_hold";
  if (STRATEGY_SUPPORTING_STEPS[d.code].includes(code)) {
    // The same step as the primary but for a different finding duplicates it.
    return code === d.primaryStep.recommendationCode ? "superseded" : "supporting";
  }
  return "on_hold";
}

const TERMINAL = new Set(["completed", "cancelled"]);
const ENGAGED = new Set(["assigned", "in_progress", "blocked"]);

export interface StrategyActionFitNote {
  decisionFit: StrategyActionFit;
  /** Owner-facing reason when the action is not the primary or a supporting step, else null. */
  decisionFitNote: string | null;
}

/**
 * Annotate persisted/planned actions with their fit. Exactly one OPEN action is "primary"
 * (engaged work first, then input order); further matches are "superseded". Supporting steps are
 * deduplicated by recommendation code the same way. Completed/cancelled actions are "closed" and
 * never take a slot. Returns a new array in the input order.
 */
export function arbitrateStrategyActionRows<T extends ArbitrableStrategyAction>(
  rows: readonly T[],
  d: StrategyDecision
): Array<T & StrategyActionFitNote> {
  const open = (i: number) => !TERMINAL.has(rows[i].status ?? "proposed");
  const fits = rows.map((r, i): StrategyActionFit => (open(i) ? strategyActionFit(r, d) : "closed"));
  const order = rows
    .map((_, i) => i)
    .filter(open)
    .sort((a, b) => Number(ENGAGED.has(rows[b].status ?? "")) - Number(ENGAGED.has(rows[a].status ?? "")) || a - b);

  const seenPrimary = { taken: false };
  const seenSupporting = new Set<string>();
  for (const i of order) {
    if (fits[i] === "primary") {
      if (seenPrimary.taken) fits[i] = "superseded";
      seenPrimary.taken = true;
    } else if (fits[i] === "supporting") {
      const key = rows[i].recommendationCode ?? "";
      if (seenSupporting.has(key)) fits[i] = "superseded";
      seenSupporting.add(key);
    }
  }

  return rows.map((r, i) => ({ ...r, decisionFit: fits[i], decisionFitNote: fitNote(fits[i], d) }));
}

function fitNote(fit: StrategyActionFit, d: StrategyDecision): string | null {
  if (fit === "on_hold") return `On hold — doesn't fit the current decision (${d.headline}).`;
  if (fit === "superseded") return "Replaced by the current next step.";
  return null;
}

/** Actions that belong in any "what to do next" list: the primary and supporting steps only. */
export function coherentStrategyActionRows<T extends ArbitrableStrategyAction>(rows: readonly T[], d: StrategyDecision): T[] {
  const annotated = arbitrateStrategyActionRows(rows, d);
  return rows.filter((_, i) => annotated[i].decisionFit === "primary" || annotated[i].decisionFit === "supporting");
}

/** Without a decision (no evaluated snapshot), fail safe: never surface a retired go-ahead command. */
export function withoutRetiredStrategyActions<T extends ArbitrableStrategyAction>(rows: readonly T[]): T[] {
  return rows.filter((r) => !RETIRED_STRATEGY_RECOMMENDATION_CODES.includes(r.recommendationCode ?? ""));
}

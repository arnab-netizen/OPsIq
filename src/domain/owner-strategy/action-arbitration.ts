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
const DATA_STEPS = [
  "STRREC_PROVIDE_REVENUE_CHANGE",
  "STRREC_PROVIDE_COST_CHANGE",
  "STRREC_PROVIDE_INVESTMENT",
  "STRREC_CORRECT_INVESTMENT",
  "STRREC_PROVIDE_CASH",
  "STRREC_CORRECT_CASH",
  "STRREC_IMPROVE_DATA_QUALITY",
  "STRREC_SET_RISK_LEVEL",
  "STRREC_FIX_CURRENCY",
] as const;
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

/**
 * "resolved": a step whose problem the current evaluation no longer raises (e.g. "enter the cash"
 * once cash is entered). "closed": completed/cancelled — history, never a next step.
 */
export type StrategyActionFit = "primary" | "supporting" | "on_hold" | "superseded" | "resolved" | "closed";

/**
 * The decision reason (or missing input) each step addresses. A persisted step is a supporting step
 * only while the current decision still raises its reason; otherwise it is "resolved".
 */
const STEP_ADDRESSES: Record<string, (d: StrategyDecision) => boolean> = {
  STRREC_PROVIDE_REVENUE_CHANGE: (d) => missing(d, "expectedRevenueChange"),
  STRREC_PROVIDE_COST_CHANGE: (d) => missing(d, "costChange"),
  STRREC_PROVIDE_INVESTMENT: (d) => missing(d, "investmentRequired"),
  STRREC_IMPROVE_DATA_QUALITY: (d) => missing(d, "expectedRevenueChange") || missing(d, "costChange") || missing(d, "investmentRequired"),
  STRREC_PROVIDE_CASH: (d) => hasReason(d, "MISSING_CASH"),
  STRREC_CORRECT_INVESTMENT: (d) => hasReason(d, "INVALID_INVESTMENT"),
  STRREC_CORRECT_CASH: (d) => hasReason(d, "INVALID_CASH"),
  STRREC_FIX_CURRENCY: (d) => hasReason(d, "INVALID_CURRENCY"),
  STRREC_SET_RISK_LEVEL: (d) => missing(d, "riskLevel"),
  STRREC_CAP_DOWNSIDE: (d) => hasReason(d, "DOWNSIDE_LOSS"),
  STRREC_DE_RISK: (d) => hasReason(d, "HIGH_EXECUTION_RISK"),
  STRREC_KEEP_RESERVE: (d) => hasReason(d, "LOW_CASH_RESERVE"),
  STRREC_STAGE_PAYBACK: (d) => hasReason(d, "LONG_PAYBACK"),
  STRREC_COMPARE_ALTERNATIVES: (d) => hasReason(d, "WEAK_RETURN"),
};

function missing(d: StrategyDecision, input: string): boolean {
  return d.dimensions.evidence.missingInputs.includes(input);
}

function hasReason(d: StrategyDecision, code: string): boolean {
  return d.reasons.some((r) => r.code === code);
}

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
  // The same advice as the primary step (same step for another finding, or another step for the
  // same finding — e.g. the generic "enter the missing inputs") duplicates it.
  if (code === d.primaryStep.recommendationCode || a.findingCode === d.primaryStep.findingCode) return "superseded";
  if (STRATEGY_SUPPORTING_STEPS[d.code].includes(code)) {
    const addresses = STEP_ADDRESSES[code];
    return addresses && !addresses(d) ? "resolved" : "supporting";
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

  return rows.map((r, i) => ({ ...r, decisionFit: fits[i], decisionFitNote: fitNote(fits[i], d, r.status ?? "proposed") }));
}

const DECISION_SHORT_LABEL: Record<StrategyDecision["code"], string> = {
  NEED_INFO: "can't say yet",
  DONT_AS_PLANNED: "don't do it as planned",
  NOT_YET: "not yet",
  GO_WITH_CONDITIONS: "go ahead with conditions",
  GO: "go ahead",
};

function fitNote(fit: StrategyActionFit, d: StrategyDecision, status: string): string | null {
  // Work the owner has already taken on may be finished; a proposal should just be cancelled.
  const what = ENGAGED.has(status) ? "cancel it, or carry on and finish it since you've taken it on" : "cancel it";
  if (fit === "on_hold") return `Not part of the current decision (${DECISION_SHORT_LABEL[d.code]}) — ${what}.`;
  if (fit === "superseded") return `Covered by the current next step — ${what}.`;
  if (fit === "resolved") return `The latest evaluation no longer flags this — ${what}.`;
  return null;
}

/** Owner-safe rejection when a proposed step that doesn't fit the decision is taken on. */
export const STRATEGY_STEP_NOT_IN_DECISION_MESSAGE =
  "This step isn't part of the current Strategy decision. Refresh to see your current next step.";

/**
 * Fits whose actions the owner must not newly take on (proposed → assigned). Work already taken on
 * stays the owner's to finish or cancel; it is simply never recommended.
 */
export const STRATEGY_FITS_WITHOUT_FORWARD_STEPS: readonly StrategyActionFit[] = ["on_hold", "superseded", "resolved"];

/**
 * Retired findings whose stored type no longer describes them. STR_OPP_DATA_QUALITY (no longer
 * emitted) was stored as an "opportunity" but is a data gap: readers present it as a risk so it
 * never appears as an upside. The stored row itself is not changed.
 */
const RETIRED_FINDING_TYPE: Record<string, string> = { STR_OPP_DATA_QUALITY: "risk" };

export function presentStoredStrategyFinding<T extends { code: string; findingType: string }>(row: T): T {
  const type = Object.prototype.hasOwnProperty.call(RETIRED_FINDING_TYPE, row.code) ? RETIRED_FINDING_TYPE[row.code] : null;
  return type && type !== row.findingType ? { ...row, findingType: type } : row;
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

const FIT_ORDER: Record<StrategyActionFit, number> = { primary: 0, supporting: 1, on_hold: 2, superseded: 3, resolved: 4, closed: 5 };

/** Stable display order: the primary step, supporting steps, then on-hold, superseded and closed. */
export function orderByDecisionFit<T extends { decisionFit: StrategyActionFit }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => FIT_ORDER[a.r.decisionFit] - FIT_ORDER[b.r.decisionFit] || a.i - b.i)
    .map((x) => x.r);
}

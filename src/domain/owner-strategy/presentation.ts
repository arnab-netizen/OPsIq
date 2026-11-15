/**
 * Owner Strategy — owner-facing labels for the Strategy page (pure, no I/O).
 *
 * Presentation only: nothing here changes a decision, a dimension or a stored value. It names
 * scenarios and assessment periods, words the supporting-points heading so it never contradicts
 * the decision, and labels ratings stored by the previous scoring model as legacy.
 */
import type { StrategyDecisionCode } from "./decision";

/** A saved scenario as the Strategy page lists it (dashboard payload `scenarios`). */
export interface StrategyScenarioSummary {
  id: string;
  optionName: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  /** Sequence number of the most recent evaluation of this scenario (null = never evaluated). */
  lastEvaluationSequence: number | null;
  /** True for the scenario the current decision was derived from (the latest evaluation). */
  isCurrentDecision: boolean;
}

/**
 * Heading over the decision's supporting points (`decision.promising`). Those points are facts
 * about the option; whether they read as "promising" depends on the decision they sit under.
 */
export const STRATEGY_SUPPORTING_POINTS_HEADING: Record<StrategyDecisionCode, string> = {
  GO: "Why this looks promising",
  GO_WITH_CONDITIONS: "What supports this — and what needs attention",
  NOT_YET: "What the numbers say",
  NEED_INFO: "What we know so far",
  DONT_AS_PLANNED: "Why this plan needs to change",
};

/** Ratings stored by the previous Strategy scoring model (`OwnerStrategyCycle.strategyState`). */
const LEGACY_STRATEGY_RATING_LABEL: Record<string, string> = {
  STRONG_GO: "Strong go",
  GO: "Go",
  MARGINAL: "Marginal",
  RISKY: "Risky",
  AVOID: "Avoid",
};

/** Supporting line shown with every legacy rating. */
export const LEGACY_STRATEGY_RATING_NOTE = "Calculated using the previous Strategy model";

/**
 * "Legacy rating: Go" — a stored rating shown as stored (never recomputed, never mapped onto the
 * current decision states). Unknown stored values are shown verbatim.
 */
export function legacyStrategyRatingText(strategyState: string | null | undefined): string {
  const stored = strategyState ?? "";
  const label = Object.prototype.hasOwnProperty.call(LEGACY_STRATEGY_RATING_LABEL, stored)
    ? LEGACY_STRATEGY_RATING_LABEL[stored]
    : stored || "not recorded";
  return `Legacy rating: ${label}`;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "1 Jul 2026 – 31 Jul 2026". Assessment periods are calendar dates stored at UTC midnight, so
 * they are read in UTC (a viewer west of UTC would otherwise see the previous day). Month names
 * are fixed rather than locale-formatted so server and browser render identical text.
 */
export function formatStrategyPeriod(periodStart: string | Date, periodEnd: string | Date): string {
  const fmt = (v: string | Date) => {
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  return `${fmt(periodStart)} – ${fmt(periodEnd)}`;
}

/** The owner's name for a scenario ("Unnamed scenario" when no option name was entered). */
export function strategyScenarioName(optionName: string | null | undefined): string {
  const name = (optionName ?? "").trim();
  return name || "Unnamed scenario";
}

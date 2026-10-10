/**
 * Progressive OBQ — choose the ONE next question from actual missing evidence.
 *
 * Reuses buildInputGuidance's CategoryGuidance (INPUT_CATALOG + archetype tiers + confidence projection);
 * adds only a skip-aware ranking and a stop rule. No second taxonomy. Pure.
 */
import type { CategoryGuidance, InputGuidance } from "@/domain/owner-mode/input-guidance";

/** Hard ceiling on questions per improvement session: the flow can never loop forever. */
export const MAX_PROGRESSIVE_QUESTIONS = 3;

export type StopReason = "NOTHING_WORTH_ASKING" | "CONFIDENCE_SUFFICIENT" | "QUESTION_LIMIT" | "FIRST_READ_NOT_READY";

export interface NextQuestion {
  category: CategoryGuidance["category"];
  label: string;
  /** What is being requested. */
  request: string;
  /** Why it matters. */
  why: string;
  /** Which decision/recommendation it could change. */
  couldChange: string;
  /** Approximate owner effort. */
  effort: CategoryGuidance["ownerEffort"];
  effortLabel: string;
}

export type NextQuestionResult =
  | { done: false; question: NextQuestion }
  | { done: true; reason: StopReason };

const GAIN_RANK = { high: 0, medium: 1, low: 2 } as const;
const EFFORT_RANK = { low: 0, medium: 1, high: 2 } as const;
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const EFFORT_LABEL = { low: "About a minute", medium: "A few minutes", high: "Needs some digging" } as const;

export interface SelectNextQuestionArgs {
  guidance: InputGuidance;
  /** Categories the owner already skipped / deferred this session: never asked again. */
  skipped: readonly string[];
  /** Questions already answered in this improvement session. */
  answeredCount: number;
}

/**
 * The first result is a MONEY read, so evidence can only change it if it feeds the money domains
 * (confidence domains in INPUT_CATALOG), or the archetype's own minimum requirement (e.g. a B2B firm's
 * contracts). Anything else (proof of completion, rotas, training…) is a legitimate later question but
 * would not change THIS recommendation, so it is never asked here. Money-domain evidence is always asked before
 * an archetype-specific non-money minimum (it is what most directly changes a money read); the business type then
 * decides what else is required and how the rest is tiered.
 */
export const MONEY_CONFIDENCE_DOMAINS: readonly string[] = ["finance_cash", "margin_pricing", "working_capital"];

function isMoneyDomain(g: CategoryGuidance): boolean {
  return MONEY_CONFIDENCE_DOMAINS.includes(g.confidenceDomain);
}

function changesThisRead(g: CategoryGuidance): boolean {
  return isMoneyDomain(g) || g.tier === "minimum";
}

/**
 * A missing category is worth asking only when it is profile-relevant (minimum/recommended tier — optional
 * categories are never asked just to raise completeness), could change this read, and answering it could
 * change the recommendation: it would lift confidence, or carries high catalog value.
 */
function worthAsking(g: CategoryGuidance): boolean {
  if (g.status !== "missing") return false;
  if (g.tier === "optional") return false;
  if (!changesThisRead(g)) return false;
  return g.confidenceWouldImprove || g.expectedConfidenceGain === "high" || g.severity === "critical";
}

export function selectNextQuestion(args: SelectNextQuestionArgs): NextQuestionResult {
  const { guidance } = args;
  if (!guidance.canRunFirstDiagnosis) return { done: true, reason: "FIRST_READ_NOT_READY" };
  if (args.answeredCount >= MAX_PROGRESSIVE_QUESTIONS) return { done: true, reason: "QUESTION_LIMIT" };
  if (guidance.overallConfidence === "high") return { done: true, reason: "CONFIDENCE_SUFFICIENT" };

  const skipped = new Set(args.skipped);
  const pool = guidance.guidance.filter((g) => worthAsking(g) && !skipped.has(g.category));
  if (pool.length === 0) return { done: true, reason: "NOTHING_WORTH_ASKING" };

  const best = [...pool].sort(
    (a, b) =>
      (isMoneyDomain(a) ? 0 : 1) - (isMoneyDomain(b) ? 0 : 1) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      GAIN_RANK[a.expectedConfidenceGain] - GAIN_RANK[b.expectedConfidenceGain] ||
      (b.confidenceWouldImprove ? 1 : 0) - (a.confidenceWouldImprove ? 1 : 0) ||
      EFFORT_RANK[a.ownerEffort] - EFFORT_RANK[b.ownerEffort] ||
      a.category.localeCompare(b.category),
  )[0];

  return {
    done: false,
    question: {
      category: best.category,
      label: best.label,
      request: best.label,
      why: best.why,
      couldChange: best.recommendationAtRiskIfMissing || best.decisionAffected,
      effort: best.ownerEffort,
      effortLabel: EFFORT_LABEL[best.ownerEffort],
    },
  };
}

/**
 * Module 27 — Outcome Causality Review (pure domain core).
 *
 * When an intervention action is taken and a business outcome later occurs, OpsIQ
 * must NOT naively claim the action caused the outcome. This module reviews the
 * causal link before crediting/blaming the action — guarding against false
 * attribution (post-hoc reasoning, uncontrolled confounders, missing baseline).
 * A spurious or under-evidenced link must never feed the learning loop.
 * Pure + deterministic.
 */

export type CausalityVerdict =
  | "CAUSAL_LIKELY"
  | "PLAUSIBLE"
  | "INSUFFICIENT_EVIDENCE"
  | "SPURIOUS_RISK";

export interface CausalityEvidence {
  /** A pre-action baseline measurement exists. */
  hasBaseline: boolean;
  /** Measured value before the action (the baseline). */
  baselineValue?: number;
  /** Measured value after the action (the outcome). */
  outcomeValue?: number;
  /** The action provably precedes the outcome in time. */
  temporalOrderCorrect: boolean;
  /** Known confounding factors were controlled for / ruled out. */
  confoundersControlled: boolean;
  /** Sample / observation window is large enough to be meaningful. */
  sampleAdequate: boolean;
  /** Count of credible alternative explanations for the outcome. */
  alternativeExplanations: number;
}

export interface CausalityAssessment {
  verdict: CausalityVerdict;
  /** Deterministic 0..1 confidence in the causal claim. */
  confidence: number;
  reasons: string[];
}

const FEW_ALTERNATIVES_MAX = 1;
const MANY_ALTERNATIVES_MIN = 3;

function altCount(evidence: CausalityEvidence): number {
  const a = evidence.alternativeExplanations;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? Math.floor(a) : 0;
}

/**
 * The five positive causal criteria. Confidence is derived from how many hold,
 * so more criteria met always yields a higher (or equal) confidence.
 */
function criteria(evidence: CausalityEvidence): boolean[] {
  return [
    evidence.hasBaseline === true,
    evidence.temporalOrderCorrect === true,
    evidence.confoundersControlled === true,
    evidence.sampleAdequate === true,
    altCount(evidence) <= FEW_ALTERNATIVES_MAX,
  ];
}

function metCount(evidence: CausalityEvidence): number {
  return criteria(evidence).filter(Boolean).length;
}

/**
 * Confidence derived deterministically from the fraction of criteria met,
 * monotonic in the number of criteria satisfied (0..1).
 */
function deriveConfidence(evidence: CausalityEvidence): number {
  const all = criteria(evidence);
  return metCount(evidence) / all.length;
}

/**
 * Assess the causal link between an action and an outcome.
 *
 * - SPURIOUS_RISK: temporal order wrong OR no baseline (cannot rule out post-hoc).
 * - INSUFFICIENT_EVIDENCE: sample inadequate, OR many alternative explanations with
 *   confounders not controlled.
 * - CAUSAL_LIKELY: baseline + correct temporal order + confounders controlled +
 *   adequate sample + few alternatives.
 * - PLAUSIBLE: everything in between.
 */
export function assessCausality(evidence: CausalityEvidence): CausalityAssessment {
  const reasons: string[] = [];
  const alternatives = altCount(evidence);
  const confidence = deriveConfidence(evidence);

  // SPURIOUS_RISK — the link cannot be trusted at all.
  if (!evidence.temporalOrderCorrect) reasons.push("temporal_order_incorrect");
  if (!evidence.hasBaseline) reasons.push("no_baseline");
  if (reasons.length > 0) {
    return { verdict: "SPURIOUS_RISK", confidence, reasons };
  }

  // INSUFFICIENT_EVIDENCE — measurement is too weak to conclude.
  if (!evidence.sampleAdequate) reasons.push("sample_inadequate");
  if (alternatives >= MANY_ALTERNATIVES_MIN && !evidence.confoundersControlled) {
    reasons.push("many_uncontrolled_alternatives");
  }
  if (reasons.length > 0) {
    return { verdict: "INSUFFICIENT_EVIDENCE", confidence, reasons };
  }

  // CAUSAL_LIKELY — all positive criteria hold.
  if (
    evidence.hasBaseline &&
    evidence.temporalOrderCorrect &&
    evidence.confoundersControlled &&
    evidence.sampleAdequate &&
    alternatives <= FEW_ALTERNATIVES_MAX
  ) {
    reasons.push("baseline_present");
    reasons.push("temporal_order_correct");
    reasons.push("confounders_controlled");
    reasons.push("sample_adequate");
    reasons.push("few_alternative_explanations");
    return { verdict: "CAUSAL_LIKELY", confidence, reasons };
  }

  // PLAUSIBLE — credible but not fully evidenced.
  if (!evidence.confoundersControlled) reasons.push("confounders_not_controlled");
  if (alternatives > FEW_ALTERNATIVES_MAX) reasons.push("some_alternative_explanations");
  if (reasons.length === 0) reasons.push("partial_causal_support");
  return { verdict: "PLAUSIBLE", confidence, reasons };
}

/**
 * Observed relative effect size = (outcome - baseline) / baseline.
 * Returns null when either value is missing or the baseline is zero.
 */
export function observedEffectSize(evidence: CausalityEvidence): number | null {
  const { baselineValue, outcomeValue } = evidence;
  if (
    typeof baselineValue !== "number" ||
    typeof outcomeValue !== "number" ||
    !Number.isFinite(baselineValue) ||
    !Number.isFinite(outcomeValue) ||
    baselineValue === 0
  ) {
    return null;
  }
  return (outcomeValue - baselineValue) / baselineValue;
}

/** The action may be credited/blamed only when the link is CAUSAL_LIKELY. */
export function shouldCreditAction(evidence: CausalityEvidence): boolean {
  return assessCausality(evidence).verdict === "CAUSAL_LIKELY";
}

/** Thrown when a learning step is attempted on an unproven causal link. */
export class UnprovenCausalityError extends Error {
  readonly code = "UNPROVEN_CAUSALITY";
  readonly reasons: string[];
  readonly verdict: CausalityVerdict;
  constructor(ref: string, verdict: CausalityVerdict, reasons: string[]) {
    super(
      `Causal learning for ${ref} blocked: ${verdict} (${reasons.join(", ")}).`
    );
    this.name = "UnprovenCausalityError";
    this.verdict = verdict;
    this.reasons = reasons;
  }
}

/**
 * Guard: throws UnprovenCausalityError when the link is SPURIOUS_RISK or
 * INSUFFICIENT_EVIDENCE, so a spurious/under-evidenced link cannot feed the
 * learning loop. Passes for CAUSAL_LIKELY and PLAUSIBLE.
 */
export function assertCausalBeforeLearning(
  evidence: CausalityEvidence,
  ref: string
): void {
  const r = assessCausality(evidence);
  if (r.verdict === "SPURIOUS_RISK" || r.verdict === "INSUFFICIENT_EVIDENCE") {
    throw new UnprovenCausalityError(ref, r.verdict, r.reasons);
  }
}

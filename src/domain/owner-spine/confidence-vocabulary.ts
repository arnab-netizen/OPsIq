/**
 * Owner Intelligence Spine — the ONE owner-facing confidence vocabulary for EVIDENCE STRENGTH (pure).
 *
 * "How sure OpsIQ is" about a reading is its data confidence on 0–100 (score-semantics.ts: a heuristic, not a probability).
 * Finding confidence (0–1) is that same quantity ×100. Every surface that words it — findings, the Money page, the first
 * read — maps the number through this module, so one number always reads the same:
 *
 *   HIGH         ≥ 85   "High"
 *   MODERATE     ≥ 60   "Moderate"
 *   LOW          ≥ 30   "Low"
 *   INSUFFICIENT  < 30  "Too low to rely on"   (the repo's tier contract: should not be acted upon)
 *
 * The thresholds are the pre-existing finance confidence tiers (owner-finance/data-confidence.ts), now defined here once.
 * Surfaces may add the number ("85/100") or a plain sentence, never a different word or threshold.
 *
 * Not covered: the canonical owner decision's own `confidence.level` (owner-spine/owner-decision.ts) scores the arbitration of
 * a recommendation (a different quantity, thresholds 75/50/25); it keeps its own vocabulary and is labelled as such.
 */
export type OwnerConfidenceLevel = "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT";

export const OWNER_CONFIDENCE_MIN = { HIGH: 85, MODERATE: 60, LOW: 30 } as const;

export function ownerConfidenceLevel(score0to100: number): OwnerConfidenceLevel {
  const s = Number.isFinite(score0to100) ? score0to100 : 0;
  if (s >= OWNER_CONFIDENCE_MIN.HIGH) return "HIGH";
  if (s >= OWNER_CONFIDENCE_MIN.MODERATE) return "MODERATE";
  if (s >= OWNER_CONFIDENCE_MIN.LOW) return "LOW";
  return "INSUFFICIENT";
}

export const OWNER_CONFIDENCE_WORD: Record<OwnerConfidenceLevel, string> = {
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Low",
  INSUFFICIENT: "Too low to rely on",
};

/** "High confidence", "Moderate confidence", "Low confidence", "Too low to rely on". */
export function ownerConfidenceLabel(score0to100: number): string {
  const level = ownerConfidenceLevel(score0to100);
  return level === "INSUFFICIENT" ? OWNER_CONFIDENCE_WORD[level] : `${OWNER_CONFIDENCE_WORD[level]} confidence`;
}

/** The label with its number, e.g. "High confidence (85/100)". */
export function ownerConfidencePhrase(score0to100: number): string {
  return `${ownerConfidenceLabel(score0to100)} (${Math.round(Number.isFinite(score0to100) ? score0to100 : 0)}/100)`;
}

/**
 * The FOUR different things an owner surface can call "confidence". They are different quantities that can legitimately differ
 * for the same evidence (a business can hold a finding that is strongly supported by the few figures it has, while its
 * information is mostly incomplete). Each therefore carries its OWN label wherever it is shown; the bare word "confidence" is
 * never used alone, and no two concepts share a label. The 4-step scale (High / Moderate / Low / Too low to rely on) is the
 * same for the 0–100 concepts so the format reads coherently; the concepts are not merged and their numbers are not averaged.
 *
 *   DATA_COMPLETENESS  data-confidence.ts `dataConfidenceScore` (0–100): the share of the information OpsIQ looks for that was
 *                      supplied. Says nothing about whether any single finding is right.
 *   FINDING_STRENGTH   a finding's own `confidence` (0–1 → 0–100): how directly the figures entered support THAT finding.
 *   TARGET_CONFIDENCE  `CurrentOwnerDecision.confidence.level`: how sure OpsIQ is that the elected main target is the right
 *                      thing to do first (an arbitration quantity, capped by data completeness; thresholds 75/50/25).
 *   GOAL_FORECAST      goal trajectory confidence (HIGH / MEDIUM / LOW): how reliable the projected path to a goal is.
 */
export type OwnerConfidenceConcept = "DATA_COMPLETENESS" | "FINDING_STRENGTH" | "TARGET_CONFIDENCE" | "GOAL_FORECAST";

export const OWNER_CONFIDENCE_CONCEPT: Readonly<Record<OwnerConfidenceConcept, { label: string; measures: string }>> = Object.freeze({
  DATA_COMPLETENESS: {
    label: "Data completeness",
    measures: "How much of the information OpsIQ looks for you have supplied. It is lowered further when the numbers are estimates rather than from your records.",
  },
  FINDING_STRENGTH: {
    label: "Finding strength",
    measures: "How directly the figures you entered support this one finding. It is separate from data completeness.",
  },
  TARGET_CONFIDENCE: {
    label: "Confidence in this main target",
    measures: "How sure OpsIQ is that this is the right thing to do first. It is held down while information is missing.",
  },
  GOAL_FORECAST: {
    label: "Forecast confidence",
    measures: "How reliable the projected path to this goal is, given the history behind it.",
  },
});

/** "Data completeness: Low (50/100)" — a 0–100 concept on the shared scale, always with its own label and number. */
export function ownerConceptScorePhrase(concept: "DATA_COMPLETENESS" | "FINDING_STRENGTH", score0to100: number): string {
  const s = Number.isFinite(score0to100) ? score0to100 : 0;
  return `${OWNER_CONFIDENCE_CONCEPT[concept].label}: ${OWNER_CONFIDENCE_WORD[ownerConfidenceLevel(s)]} (${Math.round(s)}/100)`;
}

const TARGET_LEVEL_WORD: Readonly<Record<string, string>> = Object.freeze({
  high: "High", moderate: "Moderate", low: "Low", insufficient: "Too low to rely on",
});

/** "Confidence in this main target: Moderate" — the arbitration level of the elected target (no number: it is a level). */
export function ownerTargetConfidencePhrase(level: string): string {
  const word = Object.prototype.hasOwnProperty.call(TARGET_LEVEL_WORD, level) ? TARGET_LEVEL_WORD[level] : "Not rated";
  return `${OWNER_CONFIDENCE_CONCEPT.TARGET_CONFIDENCE.label}: ${word}`;
}

const FORECAST_LEVEL_WORD: Readonly<Record<string, string>> = Object.freeze({ HIGH: "High", MEDIUM: "Moderate", LOW: "Low" });

/** "Forecast confidence: Moderate" — the goal trajectory's own level, on the same words as the rest of the scale. */
export function ownerForecastConfidencePhrase(level: string): string {
  const word = Object.prototype.hasOwnProperty.call(FORECAST_LEVEL_WORD, level) ? FORECAST_LEVEL_WORD[level] : "Not rated";
  return `${OWNER_CONFIDENCE_CONCEPT.GOAL_FORECAST.label}: ${word}`;
}

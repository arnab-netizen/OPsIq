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

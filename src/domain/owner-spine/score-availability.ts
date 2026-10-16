/**
 * Owner Intelligence Spine — SCORE AVAILABILITY (pure, presentation contract; no formula, threshold or persisted value changes).
 *
 * The 0–100 health / risk / opportunity scores are fixed-rule heuristics (score-semantics.ts). A rule can only fire on
 * evidence it HAS, so with evidence UNKNOWN the arithmetic still returns a number — risk 0, opportunity 0, a capped but
 * healthy-looking health — that reads as "known low risk" when the truth is "no risk could be assessed". NO KNOWN RISK is
 * not KNOWN LOW RISK, and UNKNOWN is never healthy, safe, zero-risk or zero-opportunity.
 *
 * The existing confidence-tier contract (finance/data-confidence.ts: BLOCKED <30 "should not be acted upon", LOW 30–59
 * "directional only", MEDIUM 60–84, HIGH ≥85) and the finance cost model ("UNKNOWN is never zero") decide the rule here:
 *
 *   WITHHELD  a CRITICAL input (revenue or any cost) is UNKNOWN, or confidence is BLOCKED. The scores abstain: no number is
 *             shown, the owner is told what is missing. (Option A: abstain.)
 *   PARTIAL   no critical gap, but confidence is below HIGH or a conclusion was withheld (cash / a cost half UNKNOWN). The numbers may be shown only with the explicit limitation
 *             that they rest on what was entered; a risk/opportunity of 0 is worded "none found so far", never "0/100".
 *   FULL      no critical gap and HIGH confidence: the scores stand as computed.
 *
 * An explicit numeric 0 is a KNOWN value and is not a gap here; callers pass only genuinely missing fields.
 */

export type ScoreAvailability = "FULL" | "PARTIAL" | "WITHHELD";
export type ScoreKind = "health" | "risk" | "opportunity";

export interface ScoreAvailabilityInput {
  /** 0..100 data confidence of the reading the scores came from. */
  dataConfidenceScore: number;
  /** Critical inputs that are UNKNOWN for that reading (finance: "revenue", "costs"). */
  missingCritical: readonly string[];
  /**
   * How many conclusions the reading explicitly WITHHELD because evidence is UNKNOWN (finance: cash, a cost half —
   * unsupportedConclusions). Any withheld conclusion means the scores did not see everything: never FULL.
   */
  withheldConclusions?: number;
}

/** Confidence at/above which a reading with no critical gap is complete enough to stand unqualified (tier HIGH). */
export const FULL_AVAILABILITY_MIN_CONFIDENCE = 85;
/** Below this the existing tier contract says the reading should not be acted upon (tier BLOCKED). */
export const WITHHELD_MAX_CONFIDENCE = 30;

export function assessScoreAvailability(i: ScoreAvailabilityInput): ScoreAvailability {
  if (i.missingCritical.length > 0) return "WITHHELD";
  if (!Number.isFinite(i.dataConfidenceScore) || i.dataConfidenceScore < WITHHELD_MAX_CONFIDENCE) return "WITHHELD";
  if (i.dataConfidenceScore < FULL_AVAILABILITY_MIN_CONFIDENCE || (i.withheldConclusions ?? 0) > 0) return "PARTIAL";
  return "FULL";
}

export interface PresentedScore {
  kind: ScoreKind;
  availability: ScoreAvailability;
  /** Headline text: "75/100", "None found so far", or "Not scored yet". */
  value: string;
  /** Owner-facing label. */
  label: string;
  /** Explicit limitation or reason, or null when the score stands unqualified. */
  note: string | null;
}

const LABEL: Record<ScoreKind, string> = {
  health: "Health score",
  risk: "Risk score (lower is better)",
  opportunity: "Opportunity score",
};

export const SCORES_WITHHELD_NOTE =
  "Not scored yet: OpsIQ is missing information it needs to score this fairly. A missing figure is not a healthy one, so no score is shown.";
export const SCORES_PARTIAL_NOTE =
  "Based only on what you have entered. Anything not entered could not be checked, so a low risk here means \"none found so far\", not \"none exists\".";

export function presentScore(kind: ScoreKind, value: number, availability: ScoreAvailability, labelOverride?: string): PresentedScore {
  const label = labelOverride ?? LABEL[kind];
  if (availability === "WITHHELD") return { kind, availability, value: "Not scored yet", label, note: null };
  const rounded = Math.round(value);
  if (availability === "PARTIAL") {
    // Zero risk/opportunity from rules that could not all run is the absence of a finding, not a measured zero.
    if ((kind === "risk" || kind === "opportunity") && rounded === 0) {
      return { kind, availability, value: "None found so far", label, note: null };
    }
    return { kind, availability, value: `${rounded}/100`, label: `${label} · so far`, note: null };
  }
  return { kind, availability, value: `${rounded}/100`, label, note: null };
}

export function presentScores(
  scores: { health: number; risk: number; opportunity: number },
  availability: ScoreAvailability,
  labels: Partial<Record<ScoreKind, string>> = {},
): { scores: PresentedScore[]; note: string | null } {
  return {
    scores: (["health", "risk", "opportunity"] as const).map((k) => presentScore(k, scores[k], availability, labels[k])),
    note: availability === "WITHHELD" ? SCORES_WITHHELD_NOTE : availability === "PARTIAL" ? SCORES_PARTIAL_NOTE : null,
  };
}

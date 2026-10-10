/**
 * Owner Finance — evidence quality (provenance) of a financial snapshot.
 *
 * Snapshot-level by design: the Quick Money Picture has one honesty control for the whole entry, and
 * a field-level model would imply precision the capture surface does not collect. NULL means the snapshot
 * predates this field ("unspecified"): it is never treated as ACTUAL and is never penalised either, so
 * existing records keep their stored confidence. Pure (no I/O).
 */

export const EVIDENCE_QUALITIES = ["ACTUAL", "GOOD_ESTIMATE", "ROUGH_ESTIMATE"] as const;
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

export function isEvidenceQuality(value: unknown): value is EvidenceQuality {
  return typeof value === "string" && (EVIDENCE_QUALITIES as readonly string[]).includes(value);
}

/** Owner-facing wording. */
export const EVIDENCE_QUALITY_LABEL: Record<EvidenceQuality, string> = {
  ACTUAL: "From my records",
  GOOD_ESTIMATE: "A good estimate",
  ROUGH_ESTIMATE: "A rough guess",
};

export const EVIDENCE_QUALITY_EXPLANATION: Record<EvidenceQuality, string> = {
  ACTUAL: "These numbers come from your bank, accounts or sales records.",
  GOOD_ESTIMATE: "These numbers are estimated from memory or partial records and are probably close.",
  ROUGH_ESTIMATE: "These numbers are a rough guess, so the read below is directional only.",
};

/** Points removed from the confidence score. ACTUAL and unspecified (null) are unchanged. */
export const EVIDENCE_QUALITY_PENALTY: Record<EvidenceQuality, number> = {
  ACTUAL: 0,
  GOOD_ESTIMATE: 10,
  ROUGH_ESTIMATE: 25,
};

/** Highest score an estimate can reach: a good estimate cannot read HIGH, a rough one cannot read MEDIUM. */
export const EVIDENCE_QUALITY_SCORE_CEILING: Record<EvidenceQuality, number> = {
  ACTUAL: 100,
  GOOD_ESTIMATE: 84,
  ROUGH_ESTIMATE: 59,
};

export function applyEvidenceQualityToScore(score: number, quality: EvidenceQuality | null | undefined): number {
  if (!quality) return score;
  return Math.min(score - EVIDENCE_QUALITY_PENALTY[quality], EVIDENCE_QUALITY_SCORE_CEILING[quality]);
}

export function isEstimate(quality: EvidenceQuality | null | undefined): boolean {
  return quality === "GOOD_ESTIMATE" || quality === "ROUGH_ESTIMATE";
}

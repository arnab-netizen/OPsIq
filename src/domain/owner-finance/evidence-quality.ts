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

/**
 * Points removed from the confidence score. ACTUAL and unspecified (null) are unchanged. The penalty is
 * deliberately modest: provenance is ALSO carried explicitly (the label, the tier ceiling below), so it must not
 * by itself turn an otherwise-LOW read into BLOCKED ("do not act on this") — missing evidence does that.
 */
export const EVIDENCE_QUALITY_PENALTY: Record<EvidenceQuality, number> = {
  ACTUAL: 0,
  GOOD_ESTIMATE: 5,
  ROUGH_ESTIMATE: 15,
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

/**
 * What a snapshot's provenance IS, with legacy made explicit: NULL in storage means the snapshot predates the field
 * (or was entered without saying), so its provenance is UNKNOWN. Unknown is never authoritative and never presented
 * as ACTUAL; it is not penalised either (existing records keep their stored confidence).
 */
export const LEGACY_UNKNOWN = "LEGACY_UNKNOWN" as const;
export type EvidenceProvenance = EvidenceQuality | typeof LEGACY_UNKNOWN;

export function provenanceOf(quality: EvidenceQuality | string | null | undefined): EvidenceProvenance {
  return isEvidenceQuality(quality) ? quality : LEGACY_UNKNOWN;
}

/** Only evidence the owner stated is from their records may be recorded as authoritative. Unknown and estimates are not. */
export function isAuthoritativeEvidence(quality: EvidenceQuality | string | null | undefined): boolean {
  return quality === "ACTUAL";
}

export const LEGACY_UNKNOWN_LABEL = "Not stated";
export const LEGACY_UNKNOWN_BASIS = "reliability not stated";

export function isEstimate(quality: EvidenceQuality | null | undefined): boolean {
  return quality === "GOOD_ESTIMATE" || quality === "ROUGH_ESTIMATE";
}

/**
 * The reliability recorded on an AMENDED snapshot. An explicit choice always wins. If the owner changed numbers but
 * said nothing about how reliable the new ones are, "from my records" can no longer be assumed for the whole
 * snapshot, so ACTUAL steps down to GOOD_ESTIMATE (never silently stays ACTUAL). Legacy (null) stays unspecified.
 */
export function resolveAmendedEvidenceQuality(
  current: string | null | undefined,
  requested: EvidenceQuality | undefined,
  numbersChanged: boolean,
): EvidenceQuality | null {
  if (requested) return requested;
  const cur = isEvidenceQuality(current) ? current : null;
  if (numbersChanged && cur === "ACTUAL") return "GOOD_ESTIMATE";
  return cur;
}

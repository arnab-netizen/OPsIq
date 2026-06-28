/**
 * Jarvis 360 Slice 6 — observed-gap staff-training rules (pure).
 *
 * Audit finding: training was generic, not driven by observed failures, and there
 * was no skills matrix or equipment-authorization-by-training. These rules require
 * a training recommendation to cite at least one observed gap (repeated error,
 * complaint, rework, missed checklist, equipment misuse, poor proof compliance,
 * quality issue, or a genuinely new SOP/process/equipment). A request with no
 * evidence is rejected (never generic). No DB/I-O.
 */

export const OBSERVED_GAP_CODES = [
  "repeated_error",
  "customer_complaint",
  "rework",
  "missed_checklist",
  "equipment_misuse",
  "poor_proof_compliance",
  "quality_issue",
  "new_sop_or_equipment",
] as const;
export type ObservedGapCode = (typeof OBSERVED_GAP_CODES)[number];

export interface ObservedEvidence {
  code: ObservedGapCode;
  /** Count / severity signal (e.g. number of repeated errors). */
  occurrences: number;
  evidenceRef?: string;
}

export interface TrainingNeedResult {
  needed: boolean;
  /** Strongest observed reason, when needed. */
  reason: ObservedGapCode | null;
  confidence: number; // 0..1
  rejectionReason?: string;
}

/**
 * Decide whether observed evidence justifies a training recommendation. Generic
 * requests (no evidence, or zero-occurrence noise) are rejected, not produced.
 */
export function evaluateTrainingNeed(evidence: ObservedEvidence[]): TrainingNeedResult {
  const real = evidence.filter((e) => OBSERVED_GAP_CODES.includes(e.code) && e.occurrences > 0);
  if (real.length === 0) {
    return { needed: false, reason: null, confidence: 0, rejectionReason: "No observed evidence — generic training is not recommended." };
  }
  const strongest = real.slice().sort((a, b) => b.occurrences - a.occurrences)[0];
  // Confidence grows with corroborating signals + occurrence count, capped at 1.
  const confidence = Math.min(1, 0.5 + 0.1 * real.length + Math.min(0.4, strongest.occurrences * 0.05));
  return { needed: true, reason: strongest.code, confidence: Math.round(confidence * 100) / 100 };
}

export interface SkillRecord {
  proven: boolean;
}

/** Equipment may only be authorized for a staff member whose relevant skill is proven. */
export function canAuthorizeEquipment(skill: SkillRecord | null): boolean {
  return !!skill && skill.proven === true;
}

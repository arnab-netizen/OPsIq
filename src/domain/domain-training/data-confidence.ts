/**
 * F2 — Data confidence engine (pure).
 *
 * Classifies the PROVENANCE/quality of each data point and maps it to the maximum
 * recommendation confidence that data can justify, feeding the existing M1
 * EvidenceConfidenceLevel scale (no duplicate confidence scale). Enforces:
 *   - high-confidence advice cannot rest on low-confidence data
 *   - contradictory CRITICAL data blocks confident diagnosis
 *   - stale data downgrades confidence
 *   - assumptions/estimates are never treated as facts
 *
 * Pure + deterministic.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";

export enum DataConfidenceStatus {
  VERIFIED = "VERIFIED",
  OWNER_REPORTED = "OWNER_REPORTED",
  STAFF_REPORTED = "STAFF_REPORTED",
  ESTIMATED = "ESTIMATED",
  MISSING = "MISSING",
  CONTRADICTORY = "CONTRADICTORY",
  STALE = "STALE",
  MANIPULABLE = "MANIPULABLE",
  DERIVED = "DERIVED",
  UNUSABLE = "UNUSABLE",
}

export interface DataPoint {
  key: string;
  status: DataConfidenceStatus;
  /** Whether this field is required for confident advice in its domain. */
  critical: boolean;
}

const CONF_ORDER: readonly EvidenceConfidenceLevel[] = [
  EvidenceConfidenceLevel.INSUFFICIENT,
  EvidenceConfidenceLevel.WEAK,
  EvidenceConfidenceLevel.MODERATE,
  EvidenceConfidenceLevel.STRONG,
  EvidenceConfidenceLevel.VERIFIED,
];

/** The maximum confidence a single data point's provenance can justify. */
export function confidenceCeiling(status: DataConfidenceStatus): EvidenceConfidenceLevel {
  switch (status) {
    case DataConfidenceStatus.VERIFIED: return EvidenceConfidenceLevel.VERIFIED;
    case DataConfidenceStatus.DERIVED: return EvidenceConfidenceLevel.STRONG;
    case DataConfidenceStatus.OWNER_REPORTED: return EvidenceConfidenceLevel.MODERATE;
    case DataConfidenceStatus.STAFF_REPORTED: return EvidenceConfidenceLevel.MODERATE;
    case DataConfidenceStatus.ESTIMATED: return EvidenceConfidenceLevel.WEAK;
    case DataConfidenceStatus.STALE: return EvidenceConfidenceLevel.WEAK;
    default: return EvidenceConfidenceLevel.INSUFFICIENT; // MISSING / CONTRADICTORY / MANIPULABLE / UNUSABLE
  }
}

/** Only VERIFIED data may be treated as fact; everything else is reported/estimated. */
export function canTreatAsFact(status: DataConfidenceStatus): boolean {
  return status === DataConfidenceStatus.VERIFIED;
}

function downgradeOne(level: EvidenceConfidenceLevel): EvidenceConfidenceLevel {
  const i = CONF_ORDER.indexOf(level);
  return CONF_ORDER[Math.max(0, i - 1)];
}

function minConf(a: EvidenceConfidenceLevel, b: EvidenceConfidenceLevel): EvidenceConfidenceLevel {
  return CONF_ORDER.indexOf(a) <= CONF_ORDER.indexOf(b) ? a : b;
}

export interface DataConfidenceAssessment {
  /** Ceiling confidence justified by the supplied data (weakest critical point caps it). */
  ceiling: EvidenceConfidenceLevel;
  /** True when contradictory critical data blocks any confident diagnosis. */
  blockedByContradiction: boolean;
  missingCritical: string[];
  staleDowngradeApplied: boolean;
  notes: string[];
}

/**
 * Assess the overall confidence ceiling for a set of data points. Critical data
 * dominates: a single contradictory/missing critical field collapses confidence.
 */
export function assessDataConfidence(points: readonly DataPoint[]): DataConfidenceAssessment {
  const notes: string[] = [];
  const critical = points.filter((p) => p.critical);

  const contradictoryCritical = critical.filter((p) => p.status === DataConfidenceStatus.CONTRADICTORY);
  if (contradictoryCritical.length > 0) {
    notes.push(`contradictory critical data: ${contradictoryCritical.map((p) => p.key).join(", ")}`);
    return {
      ceiling: EvidenceConfidenceLevel.INSUFFICIENT,
      blockedByContradiction: true,
      missingCritical: critical.filter((p) => p.status === DataConfidenceStatus.MISSING || p.status === DataConfidenceStatus.UNUSABLE).map((p) => p.key),
      staleDowngradeApplied: false,
      notes,
    };
  }

  const missingCritical = critical
    .filter((p) => p.status === DataConfidenceStatus.MISSING || p.status === DataConfidenceStatus.UNUSABLE)
    .map((p) => p.key);

  // Ceiling = weakest point (critical fields cap; if no points, INSUFFICIENT).
  let ceiling: EvidenceConfidenceLevel = points.length === 0
    ? EvidenceConfidenceLevel.INSUFFICIENT
    : points.map((p) => confidenceCeiling(p.status)).reduce(minConf, EvidenceConfidenceLevel.VERIFIED);

  if (missingCritical.length > 0) {
    ceiling = EvidenceConfidenceLevel.INSUFFICIENT;
    notes.push(`missing critical data: ${missingCritical.join(", ")}`);
  }

  const staleDowngradeApplied = points.some((p) => p.status === DataConfidenceStatus.STALE)
    && ceiling !== EvidenceConfidenceLevel.INSUFFICIENT;
  if (staleDowngradeApplied) {
    ceiling = downgradeOne(ceiling);
    notes.push("stale data present → confidence downgraded one step");
  }

  return { ceiling, blockedByContradiction: false, missingCritical, staleDowngradeApplied, notes };
}

/** True when a HIGH-confidence recommendation is justified by the data. */
export function allowsHighConfidence(assessment: DataConfidenceAssessment): boolean {
  return !assessment.blockedByContradiction
    && assessment.missingCritical.length === 0
    && (assessment.ceiling === EvidenceConfidenceLevel.STRONG || assessment.ceiling === EvidenceConfidenceLevel.VERIFIED);
}

/** Estimated/weak data may only support conservative, reversible actions. */
export function reversibleActionsOnly(assessment: DataConfidenceAssessment): boolean {
  return assessment.ceiling === EvidenceConfidenceLevel.WEAK
    || assessment.ceiling === EvidenceConfidenceLevel.INSUFFICIENT
    || assessment.blockedByContradiction;
}

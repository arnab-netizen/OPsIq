/**
 * F4 — Recommendation confidence protocol (pure).
 *
 * Composes the F2 data-confidence assessment + compliance sensitivity into the
 * recommendation confidence class the existing M3 confidence gate consumes
 * (HIGH/MEDIUM/LOW/BLOCKED/ESCALATE). Does not re-derive scoring — it maps the
 * already-computed evidence ceiling. Fail-closed on compliance + missing data.
 *
 * Pure + deterministic.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import type { RecommendationConfidence } from "@/domain/domain-training/training-types";

export interface ConfidenceInput {
  /** Ceiling confidence from F2 assessDataConfidence. */
  dataConfidence: EvidenceConfidenceLevel;
  blockedByContradiction: boolean;
  missingCritical: boolean;
  /** Legal / tax / labour / safety / compliance-sensitive decision. */
  complianceSensitive: boolean;
  /** Whether a verified, jurisdiction-appropriate expert source is attached. */
  verifiedExpertSource?: boolean;
}

/**
 * Classify recommendation confidence. Precedence:
 *  1. compliance-sensitive without a verified expert source → ESCALATE
 *  2. contradictory or missing critical data → BLOCKED
 *  3. otherwise map the evidence ceiling to HIGH/MEDIUM/LOW
 */
export function classifyConfidence(input: ConfidenceInput): RecommendationConfidence {
  if (input.complianceSensitive && input.verifiedExpertSource !== true) return "ESCALATE";
  if (input.blockedByContradiction || input.missingCritical) return "BLOCKED";

  switch (input.dataConfidence) {
    case EvidenceConfidenceLevel.VERIFIED:
    case EvidenceConfidenceLevel.STRONG:
      return "HIGH";
    case EvidenceConfidenceLevel.MODERATE:
      return "MEDIUM";
    case EvidenceConfidenceLevel.WEAK:
      return "LOW";
    default:
      return "BLOCKED"; // INSUFFICIENT
  }
}

/** BLOCKED and ESCALATE must prevent execution of the recommendation. */
export function allowsExecution(c: RecommendationConfidence): boolean {
  return c !== "BLOCKED" && c !== "ESCALATE";
}

/** LOW confidence may only drive investigative / reversible actions. */
export function reversibleOnly(c: RecommendationConfidence): boolean {
  return c === "LOW";
}

export function requiresEscalation(c: RecommendationConfidence): boolean {
  return c === "ESCALATE";
}

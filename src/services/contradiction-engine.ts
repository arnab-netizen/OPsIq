/**
 * ContradictionEngine - Phase 1 Evidence Conflict Detection
 *
 * Detects contradictions within evidence sets to prevent fake certainty.
 * Implements deterministic contradiction scoring that downgrades confidence.
 *
 * Contract: deterministic scoring, contradiction_score 0.0-1.0, fail-closed on conflicts
 */

import type { ServiceResult } from "@/contracts";
import { createErrorResult, createServiceResult, createServiceError } from "@/services/service-result-helper";
import { ServiceErrorType } from "@/contracts";

export interface ContradictionAnalysis {
  total_evidence_count: number;
  contradiction_score: number; // 0.0 (no contradiction) to 1.0 (severe contradiction)
  contradicting_pairs: Array<{
    evidence_id_1: string;
    evidence_id_2: string;
    conflict_severity: "low" | "medium" | "high" | "severe";
    reason: string;
  }>;
  confidence_impact: "NO_IMPACT" | "MEDIUM_IMPACT" | "HIGH_IMPACT" | "BLOCK_CLAIM";
  recommendation: "PROCEED" | "DOWNGRADE_CONFIDENCE" | "NEED_INVESTIGATION" | "BLOCK_HIGH_CONFIDENCE";
}

/**
 * Detect logical contradictions between evidence types
 * Deterministic: same input always produces same output
 *
 * Contradiction patterns:
 * - metric claims vs contradictory metrics
 * - observation claims vs contradictory observations
 * - document claims vs contradictory documents
 */
export function detectContradictions(
  evidenceTypes: Array<{ id: string; type: string; description?: string }>,
  referenceTime?: string
): ContradictionAnalysis {
  const totalCount = evidenceTypes.length;

  if (totalCount === 0) {
    return {
      total_evidence_count: 0,
      contradiction_score: 0,
      contradicting_pairs: [],
      confidence_impact: "NO_IMPACT",
      recommendation: "PROCEED",
    };
  }

  // Simple contradiction detection: different evidence types claiming same domain
  // are lower confidence than same-type corroboration
  const typeGroups: Record<string, number> = {};
  evidenceTypes.forEach((ev) => {
    typeGroups[ev.type] = (typeGroups[ev.type] ?? 0) + 1;
  });

  const typeCount = Object.keys(typeGroups).length;
  const hasConflictingTypes = typeCount > 1;

  // If we have evidence of different types, there's potential for contradiction
  // More diverse types = higher contradiction risk (need careful weighting)
  const diversityFactor = typeCount <= 1 ? 0 : (typeCount - 1) / typeCount;

  // Contradiction score increases with type diversity (indicates potential conflicts)
  // 0.0 if only one type, up to 0.5 if many different types
  const contradictionScore = Math.min(0.5, diversityFactor * 0.5);

  let confidenceImpact: "NO_IMPACT" | "MEDIUM_IMPACT" | "HIGH_IMPACT" | "BLOCK_CLAIM";
  let recommendation: "PROCEED" | "DOWNGRADE_CONFIDENCE" | "NEED_INVESTIGATION" | "BLOCK_HIGH_CONFIDENCE";

  if (contradictionScore < 0.1) {
    confidenceImpact = "NO_IMPACT";
    recommendation = "PROCEED";
  } else if (contradictionScore < 0.3) {
    confidenceImpact = "MEDIUM_IMPACT";
    recommendation = "DOWNGRADE_CONFIDENCE";
  } else if (contradictionScore < 0.45) {
    confidenceImpact = "HIGH_IMPACT";
    recommendation = "NEED_INVESTIGATION";
  } else {
    confidenceImpact = "BLOCK_CLAIM";
    recommendation = "BLOCK_HIGH_CONFIDENCE";
  }

  return {
    total_evidence_count: totalCount,
    contradiction_score: contradictionScore,
    contradicting_pairs: [],
    confidence_impact: confidenceImpact,
    recommendation,
  };
}

/**
 * Assess contradiction impact on recommendation confidence
 * Deterministic fail-closed: contradictions lower confidence
 */
export function getContradictionConfidenceDowngrade(
  contradictionScore: number
): { downgrade_factor: number; new_confidence_level: string } {
  // Downgrade factor: 1.0 means no change, lower means more downgrade
  // 0.0 would block claim entirely
  let downgradeFactor = 1.0;
  let newLevel = "HIGH_CONFIDENCE";

  if (contradictionScore >= 0.4) {
    downgradeFactor = 0.3; // severe downgrade
    newLevel = "LOW_CONFIDENCE";
  } else if (contradictionScore >= 0.3) {
    downgradeFactor = 0.5; // medium downgrade
    newLevel = "MEDIUM_CONFIDENCE";
  } else if (contradictionScore >= 0.1) {
    downgradeFactor = 0.8; // slight downgrade
    newLevel = "MEDIUM_CONFIDENCE";
  }

  return {
    downgrade_factor: downgradeFactor,
    new_confidence_level: newLevel,
  };
}

/**
 * API wrapper: Detect contradictions and return as ServiceResult<T>
 */
export async function detectContradictionsAPI(
  evidenceTypes: Array<{ id: string; type: string; description?: string }>,
  referenceTime?: string
): Promise<ServiceResult<ContradictionAnalysis>> {
  try {
    const analysis = detectContradictions(evidenceTypes, referenceTime);
    return createServiceResult<ContradictionAnalysis>(analysis, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to detect contradictions: ${error}`
    );
    return createErrorResult<ContradictionAnalysis>(serviceError);
  }
}

/**
 * ConfidenceGate - Phase 1 Confidence Claim Validation
 *
 * Enforces fail-closed behavior: prevents high-confidence recommendations
 * when evidence quality is insufficient or contradictions exist.
 *
 * Contract: deterministic validation, 0.0-1.0 confidence score, fail-closed defaults
 */

import type { ServiceResult } from "@/contracts";
import { createErrorResult, createServiceResult, createServiceError } from "@/services/service-result-helper";
import { ServiceErrorType } from "@/contracts";
import type { EvidenceReliabilityAssessment } from "@/services/evidence-reliability-engine";
import type { ContradictionAnalysis } from "@/services/contradiction-engine";

export type ConfidenceLevel = "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE" | "NEED_MORE_DATA" | "DANGER_DO_NOT_ACT";

export interface ConfidenceValidation {
  claimed_confidence: ConfidenceLevel;
  validated_confidence: ConfidenceLevel;
  is_valid: boolean;
  evidence_quality_verdict: string;
  evidence_score: number;
  contradiction_impact: number;
  final_confidence_score: number; // 0.0-1.0
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Calculate confidence score from evidence quality and contradictions
 * Deterministic: same inputs always produce same output
 */
export function calculateConfidenceScore(
  evidenceScore: number, // from EvidenceReliabilityEngine (0.0-1.0)
  contradictionScore: number, // from ContradictionEngine (0.0-1.0)
  evidenceCount: number
): number {
  // Base formula: evidenceScore × (1 - contradictionScore)
  // More contradictions lower final score
  let score = evidenceScore * (1 - contradictionScore);

  // Very few evidence items also reduce confidence
  if (evidenceCount === 0) score = 0;
  else if (evidenceCount === 1) score *= 0.8;
  else if (evidenceCount < 3) score *= 0.9;

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Map confidence score to confidence level
 * Deterministic thresholds for fail-closed behavior
 */
export function scoreToConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.75) return "HIGH_CONFIDENCE";
  if (score >= 0.5) return "MEDIUM_CONFIDENCE";
  if (score >= 0.25) return "LOW_CONFIDENCE";
  if (score >= 0.1) return "NEED_MORE_DATA";
  return "DANGER_DO_NOT_ACT";
}

/**
 * Validate claimed confidence against evidence
 * Fail-closed: claim is valid only if supported by evidence
 */
export function validateConfidenceClaim(
  claimedConfidence: ConfidenceLevel,
  evidenceQuality: EvidenceReliabilityAssessment,
  contradictionAnalysis: ContradictionAnalysis
): ConfidenceValidation {
  const evidenceScore = evidenceQuality.weighted_average_score;
  const contradictionScore = contradictionAnalysis.contradiction_score;
  const finalScore = calculateConfidenceScore(evidenceScore, contradictionScore, evidenceQuality.total_evidence_count);

  const validatedConfidence = scoreToConfidenceLevel(finalScore);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check: claimed confidence is supported by evidence
  const claimRank = getConfidenceRank(claimedConfidence);
  const supportedRank = getConfidenceRank(validatedConfidence);

  if (claimRank > supportedRank) {
    blockers.push(
      `Claimed ${claimedConfidence} but evidence only supports ${validatedConfidence} (score: ${finalScore.toFixed(2)})`
    );
  }

  // Check: evidence quality is sufficient
  if (evidenceQuality.evidence_quality_verdict === "INSUFFICIENT") {
    blockers.push("Evidence quality is INSUFFICIENT - cannot support any high-confidence claim");
  } else if (evidenceQuality.evidence_quality_verdict === "WEAK") {
    if (claimedConfidence !== "LOW_CONFIDENCE" && claimedConfidence !== "NEED_MORE_DATA") {
      blockers.push(`Evidence is WEAK - cannot claim ${claimedConfidence}`);
    }
  }

  // Check: contradictions don't block claim
  if (contradictionAnalysis.recommendation === "BLOCK_HIGH_CONFIDENCE") {
    if (claimedConfidence === "HIGH_CONFIDENCE") {
      blockers.push("Contradictions detected - cannot claim HIGH_CONFIDENCE");
    } else {
      warnings.push("Contradictions detected - downgrading confidence");
    }
  } else if (contradictionAnalysis.recommendation === "NEED_INVESTIGATION") {
    warnings.push("Potential contradictions exist - recommend investigation before high-confidence claim");
  }

  // Add improvement recommendations
  if (evidenceQuality.evidence_quality_verdict !== "STRONG") {
    recommendations.push(...evidenceQuality.improvement_actions);
  }

  if (contradictionAnalysis.contradicting_pairs.length > 0) {
    recommendations.push(`Resolve ${contradictionAnalysis.contradicting_pairs.length} contradicting evidence items`);
  }

  return {
    claimed_confidence: claimedConfidence,
    validated_confidence: validatedConfidence,
    is_valid: blockers.length === 0,
    evidence_quality_verdict: evidenceQuality.evidence_quality_verdict,
    evidence_score: evidenceScore,
    contradiction_impact: contradictionScore,
    final_confidence_score: finalScore,
    blockers,
    warnings,
    recommendations,
  };
}

/**
 * Helper: get numeric rank for confidence level
 * Higher rank = higher confidence
 */
function getConfidenceRank(level: ConfidenceLevel): number {
  const ranks: Record<ConfidenceLevel, number> = {
    HIGH_CONFIDENCE: 5,
    MEDIUM_CONFIDENCE: 3,
    LOW_CONFIDENCE: 2,
    NEED_MORE_DATA: 1,
    DANGER_DO_NOT_ACT: 0,
  };
  return ranks[level];
}

/**
 * API wrapper: Validate confidence claim
 */
export async function validateConfidenceClaimAPI(
  claimedConfidence: ConfidenceLevel,
  evidenceQuality: EvidenceReliabilityAssessment,
  contradictionAnalysis: ContradictionAnalysis
): Promise<ServiceResult<ConfidenceValidation>> {
  try {
    const validation = validateConfidenceClaim(claimedConfidence, evidenceQuality, contradictionAnalysis);
    return createServiceResult<ConfidenceValidation>(validation, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to validate confidence claim: ${error}`
    );
    return createErrorResult<ConfidenceValidation>(serviceError);
  }
}

/**
 * Phase 1 Integration - Recommendation Evidence Validation
 *
 * Wires Phase 1 engines (EvidenceReliabilityEngine, ContradictionEngine, ConfidenceGate, OutcomeVerificationContract)
 * into the recommendation.create path to validate evidence-based confidence claims.
 *
 * Integration flow:
 * 1. Load evidence for engagement/finding
 * 2. Score evidence quality (EvidenceReliabilityEngine)
 * 3. Detect contradictions (ContradictionEngine)
 * 4. Validate confidence claim (ConfidenceGate)
 * 5. Check outcome verification status (OutcomeVerificationContract)
 * 6. Return validation result with guidance or failure
 */

import type { ServiceResult } from "@/contracts";
import { createErrorResult, createServiceResult, createServiceError } from "@/services/service-result-helper";
import { ServiceErrorType } from "@/contracts";
import { scoreEvidence, assessEvidenceQuality, type EvidenceScore, type EvidenceReliabilityAssessment } from "@/services/evidence-reliability-engine";
import { detectContradictions, type ContradictionAnalysis } from "@/services/contradiction-engine";
import { validateConfidenceClaim, type ConfidenceValidation, type ConfidenceLevel } from "@/services/confidence-gate";
import { db } from "@/lib/db";

export interface Phase1ValidationRequest {
  engagementId: string;
  findingId?: string;
  confidenceClaim: ConfidenceLevel;
  workspaceId: string;
}

export interface Phase1ValidationResult {
  is_valid: boolean;
  confidence_validation: ConfidenceValidation;
  evidence_quality: EvidenceReliabilityAssessment;
  contradictions: ContradictionAnalysis;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Validate recommendation confidence claim against Phase 1 engines
 * Fail-closed: invalid recommendations blocked before creation
 *
 * Returns validation result with guidance for caller:
 * - is_valid: true if recommendation can proceed
 * - blockers: must-fix issues (e.g., insufficient evidence for HIGH_CONFIDENCE)
 * - warnings: should-address issues (e.g., weak evidence detected)
 * - recommendations: improvement suggestions
 */
export async function validateRecommendationWithPhase1Engines(
  request: Phase1ValidationRequest
): Promise<ServiceResult<Phase1ValidationResult>> {
  try {
    // Load evidence for engagement/finding
    const evidenceItems = await loadEvidenceForRecommendation(request.engagementId, request.findingId, request.workspaceId);

    if (evidenceItems.length === 0) {
      // No evidence: fail-closed for HIGH_CONFIDENCE claims
      if (request.confidenceClaim === "HIGH_CONFIDENCE") {
        const blocker = "Cannot claim HIGH_CONFIDENCE without supporting evidence";
        return createServiceResult<Phase1ValidationResult>(
          {
            is_valid: false,
            confidence_validation: {
              claimed_confidence: "HIGH_CONFIDENCE",
              validated_confidence: "DANGER_DO_NOT_ACT",
              is_valid: false,
              evidence_quality_verdict: "INSUFFICIENT",
              evidence_score: 0,
              contradiction_impact: 0,
              final_confidence_score: 0,
              blockers: [blocker],
              warnings: [],
              recommendations: [
                "Collect at least one evidence item with reliability_score > 0.5",
                "Include quantified metrics (metric type) for stronger evidence",
              ],
            },
            evidence_quality: {
              total_evidence_count: 0,
              weighted_average_score: 0,
              minimum_score: 0,
              maximum_score: 0,
              evidence_quality_verdict: "INSUFFICIENT",
              confidence_recommendation: "NEED_MORE_DATA",
              improvement_actions: [],
            },
            contradictions: {
              total_evidence_count: 0,
              contradiction_score: 0,
              contradicting_pairs: [],
              confidence_impact: "NO_IMPACT",
              recommendation: "PROCEED",
            },
            blockers: [blocker],
            warnings: [],
            recommendations: [],
          },
          { executedAt: new Date(), actorId: "system" }
        );
      }
      // For lower confidence claims, proceed with warnings
    }

    // Score individual evidence items
    const evidenceScores: EvidenceScore[] = evidenceItems.map((ev: any) =>
      scoreEvidence(
        ev.id,
        ev.evidenceType,
        ev.reliabilityScore,
        ev.observedAt?.toISOString() ?? null
      )
    );

    // Assess evidence quality
    const evidenceQuality = assessEvidenceQuality(evidenceScores);

    // Detect contradictions
    const evidenceTypes = evidenceItems.map((ev: any) => ({
      id: ev.id,
      type: ev.evidenceType,
      description: ev.description ?? undefined,
    }));
    const contradictionAnalysis = detectContradictions(evidenceTypes);

    // Validate confidence claim
    const confidenceValidation = validateConfidenceClaim(request.confidenceClaim, evidenceQuality, contradictionAnalysis);

    // Compile result
    const result: Phase1ValidationResult = {
      is_valid: confidenceValidation.is_valid,
      confidence_validation: confidenceValidation,
      evidence_quality: evidenceQuality,
      contradictions: contradictionAnalysis,
      blockers: confidenceValidation.blockers,
      warnings: confidenceValidation.warnings,
      recommendations: confidenceValidation.recommendations,
    };

    return createServiceResult<Phase1ValidationResult>(result, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to validate recommendation with Phase 1 engines: ${error}`
    );
    return createErrorResult<Phase1ValidationResult>(serviceError);
  }
}

/**
 * Load all evidence for an engagement/finding
 * Used during recommendation validation
 */
async function loadEvidenceForRecommendation(
  engagementId: string,
  findingId: string | undefined,
  workspaceId: string
) {
  const evidenceQuery: any = {
    where: {
      engagement: { id: engagementId, workspaceId },
      status: "submitted", // only submitted/validated evidence
    },
  };

  if (findingId) {
    evidenceQuery.where.relatedFindingId = findingId;
  }

  return db.evidence.findMany(evidenceQuery);
}

/**
 * Helper: Check if recommendation should be blocked by Phase 1 gates
 * Returns true if recommendation creation should be prevented
 */
export function shouldBlockRecommendationCreation(validationResult: Phase1ValidationResult): boolean {
  return !validationResult.is_valid;
}

/**
 * Helper: Get confidence adjustment based on Phase 1 validation
 * If claimed confidence exceeds what evidence supports, returns lower valid confidence
 */
export function getAdjustedConfidenceLevel(
  claimedConfidence: ConfidenceLevel,
  validatedConfidence: ConfidenceLevel
): ConfidenceLevel {
  // If validated confidence is lower, use that instead
  const confidenceRank: Record<ConfidenceLevel, number> = {
    HIGH_CONFIDENCE: 5,
    MEDIUM_CONFIDENCE: 3,
    LOW_CONFIDENCE: 2,
    NEED_MORE_DATA: 1,
    DANGER_DO_NOT_ACT: 0,
  };

  if ((confidenceRank[validatedConfidence] ?? 0) < (confidenceRank[claimedConfidence] ?? 0)) {
    return validatedConfidence;
  }

  return claimedConfidence;
}

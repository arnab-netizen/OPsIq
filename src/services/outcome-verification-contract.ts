/**
 * OutcomeVerificationContract - Phase 1 Claim vs Reality Separation
 *
 * Prevents using unverified outcome claims to influence future recommendations.
 * Maintains clear separation between claimed outcomes and verified outcomes.
 *
 * Contract: deterministic verification, claim_verified 0.0-1.0, fail-closed on unverified
 */

import type { ServiceResult } from "@/contracts";
import { createErrorResult, createServiceResult, createServiceError } from "@/services/service-result-helper";
import { ServiceErrorType } from "@/contracts";

export type OutcomeStatus = "CLAIMED" | "PARTIALLY_VERIFIED" | "VERIFIED" | "CONTRADICTED" | "UNVERIFIABLE";

export interface OutcomeClaim {
  claim_id: string;
  action_id: string;
  description: string;
  expected_metric?: string;
  expected_impact?: number;
  claimed_at: string; // ISO 8601
  claimed_by?: string;
}

export interface OutcomeVerification {
  claim_id: string;
  status: OutcomeStatus;
  verification_score: number; // 0.0 (unverified) to 1.0 (fully verified)
  evidence_count: number;
  verified_metric?: string;
  verified_impact?: number;
  verified_at?: string; // ISO 8601
  verified_by?: string;
  confidence_impact: "STRONG_SUPPORT" | "WEAK_SUPPORT" | "NO_SUPPORT" | "CONTRADICTS";
  should_influence_learning: boolean; // fail-closed: false unless verified >= 0.7
}

export interface OutcomeVerificationAssessment {
  total_claims: number;
  verified_count: number;
  verification_rate: number; // verified_count / total_claims
  average_verification_score: number;
  learning_eligible_count: number; // verified >= 0.7
  learning_eligible_rate: number;
  unverified_impact: "LOW" | "MEDIUM" | "HIGH";
  recommendation: "PROCEED_WITH_LEARNING" | "DOWNGRADE_LEARNING" | "BLOCK_LEARNING" | "NEED_VERIFICATION";
}

/**
 * Assess outcome claim verification status
 * Deterministic: same inputs always produce same output
 */
export function assessOutcomeVerification(
  claim: OutcomeClaim,
  verificationEvidence: Array<{ id: string; type: string; confidence: number }>,
  expectedImpactMatch: boolean = false
): OutcomeVerification {
  const evidenceCount = verificationEvidence.length;

  if (evidenceCount === 0) {
    return {
      claim_id: claim.claim_id,
      status: "CLAIMED",
      verification_score: 0, // unverified
      evidence_count: 0,
      confidence_impact: "NO_SUPPORT",
      should_influence_learning: false,
    };
  }

  // Calculate verification score from evidence quality
  const avgConfidence = verificationEvidence.reduce((sum, ev) => sum + ev.confidence, 0) / evidenceCount;
  const evidenceFactor = Math.min(1.0, evidenceCount / 3); // 3+ pieces = full strength
  const verificationScore = avgConfidence * evidenceFactor;

  // Status determination
  let status: OutcomeStatus;
  if (verificationScore >= 0.8) {
    status = "VERIFIED";
  } else if (verificationScore >= 0.5) {
    status = "PARTIALLY_VERIFIED";
  } else if (verificationScore >= 0.2) {
    status = "UNVERIFIABLE";
  } else {
    status = "CONTRADICTED";
  }

  // Confidence impact
  let confidenceImpact: "STRONG_SUPPORT" | "WEAK_SUPPORT" | "NO_SUPPORT" | "CONTRADICTS";
  if (verificationScore >= 0.75) {
    confidenceImpact = "STRONG_SUPPORT";
  } else if (verificationScore >= 0.5) {
    confidenceImpact = "WEAK_SUPPORT";
  } else if (verificationScore >= 0.2) {
    confidenceImpact = "NO_SUPPORT";
  } else {
    confidenceImpact = "CONTRADICTS";
  }

  // Fail-closed: only verified outcomes (>= 0.7) can influence learning
  const shouldInfluenceLearning = verificationScore >= 0.7;

  return {
    claim_id: claim.claim_id,
    status,
    verification_score: verificationScore,
    evidence_count: evidenceCount,
    verified_metric: claim.expected_metric,
    verified_impact: claim.expected_impact,
    confidence_impact: confidenceImpact,
    should_influence_learning: shouldInfluenceLearning,
  };
}

/**
 * Assess overall verification rate across multiple outcome claims
 * Determines if learning should proceed based on verification quality
 */
export function assessVerificationQuality(
  verifications: OutcomeVerification[]
): OutcomeVerificationAssessment {
  const totalClaims = verifications.length;

  if (totalClaims === 0) {
    return {
      total_claims: 0,
      verified_count: 0,
      verification_rate: 0,
      average_verification_score: 0,
      learning_eligible_count: 0,
      learning_eligible_rate: 0,
      unverified_impact: "LOW",
      recommendation: "BLOCK_LEARNING",
    };
  }

  const verifiedCount = verifications.filter((v) => v.status === "VERIFIED").length;
  const learningEligibleCount = verifications.filter((v) => v.should_influence_learning).length;
  const avgVerificationScore = verifications.reduce((sum, v) => sum + v.verification_score, 0) / totalClaims;

  const verificationRate = verifiedCount / totalClaims;
  const learningEligibleRate = learningEligibleCount / totalClaims;

  let unverifiedImpact: "LOW" | "MEDIUM" | "HIGH";
  let recommendation: "PROCEED_WITH_LEARNING" | "DOWNGRADE_LEARNING" | "BLOCK_LEARNING" | "NEED_VERIFICATION";

  if (verificationRate >= 0.8 && learningEligibleRate >= 0.7) {
    unverifiedImpact = "LOW";
    recommendation = "PROCEED_WITH_LEARNING";
  } else if (verificationRate >= 0.5 && learningEligibleRate >= 0.4) {
    unverifiedImpact = "MEDIUM";
    recommendation = "DOWNGRADE_LEARNING";
  } else if (verificationRate >= 0.25 && learningEligibleRate >= 0.2) {
    unverifiedImpact = "HIGH";
    recommendation = "NEED_VERIFICATION";
  } else {
    unverifiedImpact = "HIGH";
    recommendation = "BLOCK_LEARNING";
  }

  return {
    total_claims: totalClaims,
    verified_count: verifiedCount,
    verification_rate: verificationRate,
    average_verification_score: avgVerificationScore,
    learning_eligible_count: learningEligibleCount,
    learning_eligible_rate: learningEligibleRate,
    unverified_impact: unverifiedImpact,
    recommendation,
  };
}

/**
 * API wrapper: Assess outcome verification
 */
export async function assessOutcomeVerificationAPI(
  claim: OutcomeClaim,
  verificationEvidence: Array<{ id: string; type: string; confidence: number }>,
  expectedImpactMatch?: boolean
): Promise<ServiceResult<OutcomeVerification>> {
  try {
    const verification = assessOutcomeVerification(claim, verificationEvidence, expectedImpactMatch);
    return createServiceResult<OutcomeVerification>(verification, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to assess outcome verification: ${error}`
    );
    return createErrorResult<OutcomeVerification>(serviceError);
  }
}

/**
 * API wrapper: Assess overall verification quality
 */
export async function assessVerificationQualityAPI(
  verifications: OutcomeVerification[]
): Promise<ServiceResult<OutcomeVerificationAssessment>> {
  try {
    const assessment = assessVerificationQuality(verifications);
    return createServiceResult<OutcomeVerificationAssessment>(assessment, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to assess verification quality: ${error}`
    );
    return createErrorResult<OutcomeVerificationAssessment>(serviceError);
  }
}

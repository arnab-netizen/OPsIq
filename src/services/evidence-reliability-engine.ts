/**
 * EvidenceReliabilityEngine - Phase 1 Evidence Weighting
 *
 * Prevents fake certainty by weighting evidence contributions.
 * Implements weighted evidence scoring based on:
 * - Source type credibility
 * - Age/freshness
 * - Validation status
 *
 * Contract: deterministic scoring, 0.0-1.0 output, immutable inputs
 */

import type { ServiceResult } from "@/contracts";
import { createErrorResult, createServiceResult, createServiceError } from "@/services/service-result-helper";
import { ServiceErrorType } from "@/contracts";

// Evidence source credibility weights (0.0 = unreliable, 1.0 = highly reliable)
const SOURCE_TYPE_WEIGHTS: Record<string, number> = {
  document: 0.8, // verified documentation
  interview: 0.6, // subject to bias, depends on interviewer skill
  metric: 0.85, // quantified measurement
  observation: 0.7, // firsthand observation, subject to interpretation
  estimate: 0.3, // low confidence estimate
  assumption: 0.2, // unverified assumption
};

const DEFAULT_SOURCE_WEIGHT = 0.5; // fallback for unknown types
const MAX_EVIDENCE_AGE_DAYS = 365; // evidence older than this gets max freshness decay
const FRESHNESS_HALF_LIFE_DAYS = 90; // after 90 days, freshness score is 0.5

export interface EvidenceScore {
  evidence_id: string;
  reliability_score: number; // 0.0 to 1.0
  freshness_score: number; // 0.0 to 1.0
  composite_score: number; // weighted reliability * freshness
  confidence_impact: "HIGH" | "MEDIUM" | "LOW"; // how much this evidence affects confidence
  reason: string;
}

export interface EvidenceReliabilityAssessment {
  total_evidence_count: number;
  weighted_average_score: number; // average of all evidence reliability scores
  minimum_score: number; // weakest evidence
  maximum_score: number; // strongest evidence
  evidence_quality_verdict: "STRONG" | "ACCEPTABLE" | "WEAK" | "INSUFFICIENT";
  confidence_recommendation: "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE" | "NEED_MORE_DATA";
  improvement_actions: string[];
}

/**
 * Calculate source type credibility weight
 * Deterministic: same input always produces same output
 */
export function getSourceTypeWeight(evidenceType: string | null | undefined): number {
  if (!evidenceType) return DEFAULT_SOURCE_WEIGHT;
  const normalized = evidenceType.toLowerCase().trim();
  return SOURCE_TYPE_WEIGHTS[normalized] ?? DEFAULT_SOURCE_WEIGHT;
}

/**
 * Calculate freshness score based on age
 * Deterministic exponential decay: starts at 1.0, decays to 0.0 over time
 * Formula: score = 2^(-age_days / half_life_days)
 */
export function calculateFreshnessScore(observedAtIso: string | null | undefined, referenceTimeIso?: string): number {
  if (!observedAtIso) return 0.5; // unknown age gets neutral score

  const referenceTime = referenceTimeIso ? new Date(referenceTimeIso) : new Date();
  const observedTime = new Date(observedAtIso);
  const ageDays = (referenceTime.getTime() - observedTime.getTime()) / (1000 * 60 * 60 * 24);

  // Clamp to 0.0 minimum (don't go negative)
  if (ageDays >= MAX_EVIDENCE_AGE_DAYS) return 0.0;

  // Exponential decay: score = 2^(-age / half-life)
  const score = Math.pow(2, -ageDays / FRESHNESS_HALF_LIFE_DAYS);
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Calculate composite reliability score
 * Deterministic: reliability_weight * freshness_score
 */
export function calculateCompositeScore(reliabilityScore: number | null, freshnessScore: number): number {
  const reliability = reliabilityScore ?? 0.5; // default to neutral if not set
  const composite = reliability * freshnessScore;
  return Math.min(1.0, Math.max(0.0, composite));
}

/**
 * Score individual piece of evidence
 * Returns standardized EvidenceScore for deterministic testing and comparison
 */
export function scoreEvidence(
  evidenceId: string,
  evidenceType: string | null,
  reliabilityScore: number | null,
  observedAt: string | null,
  referenceTime?: string
): EvidenceScore {
  const sourceWeight = getSourceTypeWeight(evidenceType);
  const freshnessScore = calculateFreshnessScore(observedAt, referenceTime);
  const compositeScore = calculateCompositeScore(reliabilityScore ?? sourceWeight, freshnessScore);

  const confidence: "HIGH" | "MEDIUM" | "LOW" =
    compositeScore >= 0.7 ? "HIGH" : compositeScore >= 0.4 ? "MEDIUM" : "LOW";

  return {
    evidence_id: evidenceId,
    reliability_score: reliabilityScore ?? sourceWeight,
    freshness_score: freshnessScore,
    composite_score: compositeScore,
    confidence_impact: confidence,
    reason: `${evidenceType ?? "unknown"} source (${(sourceWeight * 100).toFixed(0)}%) × freshness (${(freshnessScore * 100).toFixed(0)}%)`,
  };
}

/**
 * Assess total evidence quality for a set of evidence items
 * Used during recommendation generation to validate evidence sufficiency
 */
export function assessEvidenceQuality(scores: EvidenceScore[]): EvidenceReliabilityAssessment {
  const totalCount = scores.length;

  if (totalCount === 0) {
    return {
      total_evidence_count: 0,
      weighted_average_score: 0,
      minimum_score: 0,
      maximum_score: 0,
      evidence_quality_verdict: "INSUFFICIENT",
      confidence_recommendation: "NEED_MORE_DATA",
      improvement_actions: [
        "Collect at least one evidence item with reliability_score > 0.5",
        "Include quantified metrics (metric type) for stronger evidence",
      ],
    };
  }

  const compositeScores = scores.map((s) => s.composite_score);
  const weightedAverage = compositeScores.reduce((a, b) => a + b, 0) / totalCount;
  const minScore = Math.min(...compositeScores);
  const maxScore = Math.max(...compositeScores);

  let verdict: "STRONG" | "ACCEPTABLE" | "WEAK" | "INSUFFICIENT";
  let confidenceRec: "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE" | "NEED_MORE_DATA";
  const actions: string[] = [];

  if (weightedAverage >= 0.7 && minScore >= 0.5) {
    verdict = "STRONG";
    confidenceRec = "HIGH_CONFIDENCE";
  } else if (weightedAverage >= 0.5 && minScore >= 0.3) {
    verdict = "ACCEPTABLE";
    confidenceRec = "MEDIUM_CONFIDENCE";
    if (minScore < 0.5) {
      actions.push(`Strengthen weakest evidence (score: ${minScore.toFixed(2)}) with additional validation`);
    }
  } else if (weightedAverage >= 0.3) {
    verdict = "WEAK";
    confidenceRec = "LOW_CONFIDENCE";
    actions.push("Add higher-quality evidence sources (metrics, documents) with validation");
    actions.push("Reduce confidence claim or add additional corroborating evidence");
  } else {
    verdict = "INSUFFICIENT";
    confidenceRec = "NEED_MORE_DATA";
    actions.push("Collect substantially more evidence before making high-confidence claims");
  }

  // Check for age-related issues
  const staleCount = scores.filter((s) => s.freshness_score < 0.3).length;
  if (staleCount > 0) {
    actions.push(`${staleCount} evidence item(s) are stale (freshnessScore < 0.3), consider refresh`);
  }

  return {
    total_evidence_count: totalCount,
    weighted_average_score: weightedAverage,
    minimum_score: minScore,
    maximum_score: maxScore,
    evidence_quality_verdict: verdict,
    confidence_recommendation: confidenceRec,
    improvement_actions: actions,
  };
}

/**
 * API wrapper: Score evidence and return as ServiceResult<T>
 * Used by recommendation service to validate evidence before generating advice
 */
export async function scoreEvidenceAPI(
  evidenceId: string,
  evidenceType: string | null,
  reliabilityScore: number | null,
  observedAt: string | null,
  referenceTime?: string
): Promise<ServiceResult<EvidenceScore>> {
  try {
    const score = scoreEvidence(evidenceId, evidenceType, reliabilityScore, observedAt, referenceTime);
    return createServiceResult<EvidenceScore>(score, {
      executedAt: new Date(),
      actorId: "system", // evidence scoring is deterministic, no actor needed
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to score evidence: ${error}`
    );
    return createErrorResult<EvidenceScore>(serviceError);
  }
}

/**
 * API wrapper: Assess total evidence quality
 * Used during recommendation generation to validate evidence sufficiency
 */
export async function assessEvidenceQualityAPI(
  scores: EvidenceScore[]
): Promise<ServiceResult<EvidenceReliabilityAssessment>> {
  try {
    const assessment = assessEvidenceQuality(scores);
    return createServiceResult<EvidenceReliabilityAssessment>(assessment, {
      executedAt: new Date(),
      actorId: "system",
    });
  } catch (error) {
    const serviceError = createServiceError(
      ServiceErrorType.DETERMINISM_VIOLATION,
      `Failed to assess evidence quality: ${error}`
    );
    return createErrorResult<EvidenceReliabilityAssessment>(serviceError);
  }
}

/**
 * Module 3 — Recommendation Confidence promotion gate (pure logic).
 *
 * The existing confidence-engine.ts computes a DecisionConfidenceScore
 * (confidenceLevel very_low..very_high) but is not wired into promotion. This adds
 * the promotion-time classification the spec requires — tying confidence + safety
 * + data-sufficiency to a fail-closed promotion decision — reusing the engine's
 * confidenceLevel type (no duplication).
 *
 * Pure: no DB, no I/O. Wiring (assemble engine inputs + enforce at the approval
 * path) is layered on top of this gate.
 */

import type { DecisionConfidenceScore } from "@/domain/decision-confidence/confidence-engine";

type ConfidenceLevel = DecisionConfidenceScore["confidenceLevel"];

export enum ConfidencePromotionClass {
  HIGH_CONFIDENCE = "HIGH_CONFIDENCE",
  MEDIUM_CONFIDENCE = "MEDIUM_CONFIDENCE",
  LOW_CONFIDENCE = "LOW_CONFIDENCE",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  BLOCKED_UNSAFE = "BLOCKED_UNSAFE",
  REQUIRES_OWNER_REVIEW = "REQUIRES_OWNER_REVIEW",
  REQUIRES_PROFESSIONAL_REVIEW = "REQUIRES_PROFESSIONAL_REVIEW",
}

export interface ConfidenceGateInput {
  confidenceLevel: ConfidenceLevel;
  /** False when required inputs for the decision are missing. */
  hasSufficientData: boolean;
  /** The action is intrinsically unsafe (e.g. boundary/cash/legal hard-stop). */
  isUnsafe: boolean;
  /** Requires a licensed professional (tax/legal/compliance). */
  needsProfessionalReview: boolean;
}

export interface ConfidenceGateResult {
  classification: ConfidencePromotionClass;
  /** Auto-promotion allowed only for HIGH/MEDIUM confidence. */
  allowed: boolean;
  reason: string;
}

/**
 * Classify a recommendation for promotion. Fail-closed precedence: professional
 * review > unsafe > insufficient data > confidence level. OpsIQ must not hide weak
 * evidence behind confident language, so low/very_low never auto-promote.
 */
export function classifyRecommendationConfidence(input: ConfidenceGateInput): ConfidenceGateResult {
  if (input.needsProfessionalReview) {
    return { classification: ConfidencePromotionClass.REQUIRES_PROFESSIONAL_REVIEW, allowed: false, reason: "Requires licensed professional review." };
  }
  if (input.isUnsafe) {
    return { classification: ConfidencePromotionClass.BLOCKED_UNSAFE, allowed: false, reason: "Recommendation is unsafe; promotion blocked." };
  }
  if (!input.hasSufficientData) {
    return { classification: ConfidencePromotionClass.INSUFFICIENT_DATA, allowed: false, reason: "Insufficient data to promote." };
  }
  switch (input.confidenceLevel) {
    case "very_high":
    case "high":
      return { classification: ConfidencePromotionClass.HIGH_CONFIDENCE, allowed: true, reason: "High confidence." };
    case "moderate":
      return { classification: ConfidencePromotionClass.MEDIUM_CONFIDENCE, allowed: true, reason: "Medium confidence; monitor outcome." };
    case "low":
      return { classification: ConfidencePromotionClass.REQUIRES_OWNER_REVIEW, allowed: false, reason: "Low confidence; owner review required before promotion." };
    case "very_low":
    default:
      return { classification: ConfidencePromotionClass.LOW_CONFIDENCE, allowed: false, reason: "Confidence too low to promote." };
  }
}

/** Thrown when a recommendation's confidence is too low/unsafe to promote. */
export class ConfidenceGateError extends Error {
  readonly code = "CONFIDENCE_GATE_BLOCKED";
  readonly classification: ConfidencePromotionClass;
  constructor(recommendationId: string, result: ConfidenceGateResult) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${result.reason}`);
    this.name = "ConfidenceGateError";
    this.classification = result.classification;
  }
}

/** Guard the recommendation service calls; throws ConfidenceGateError when blocked. */
export function assertConfidenceForPromotion(input: ConfidenceGateInput, recommendationId: string): void {
  const result = classifyRecommendationConfidence(input);
  if (!result.allowed) throw new ConfidenceGateError(recommendationId, result);
}

/**
 * Recommendation Tracking domain logic for Owner Mode Reality Loop — Phase 7.
 *
 * Pure TypeScript — no DB calls.
 * Status transitions are deterministic data structures; no AI controls them.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";
import type { DiagnosisEvidenceValidationResult } from "./diagnosis-evidence";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RecommendationStatus =
  | "draft"
  | "recommended"
  | "verification_required"
  | "verified_enough"
  | "provisional"
  | "data_limited"
  | "owner_decision_pending"
  | "accepted"
  | "rejected"
  | "modified"
  | "deferred"
  | "superseded";

export type RecommendationType = "tactical" | "strategic" | "operational" | "emergency";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type TargetDirection = "increase" | "decrease" | "stabilize";

// ─────────────────────────────────────────────
// Status Machine
// ─────────────────────────────────────────────

export const RECOMMENDATION_STATUS_TRANSITIONS: Readonly<
  Record<RecommendationStatus, ReadonlyArray<RecommendationStatus>>
> = {
  draft: ["recommended", "rejected"],
  recommended: ["verification_required", "owner_decision_pending", "rejected"],
  verification_required: ["verified_enough", "data_limited", "rejected"],
  verified_enough: ["owner_decision_pending", "rejected"],
  provisional: ["owner_decision_pending", "verification_required", "rejected"],
  data_limited: ["owner_decision_pending", "rejected"],
  owner_decision_pending: ["accepted", "rejected", "modified", "deferred"],
  accepted: ["superseded"],
  rejected: [],
  modified: ["owner_decision_pending"],
  deferred: ["owner_decision_pending", "rejected", "superseded"],
  superseded: [],
};

// ─────────────────────────────────────────────
// Input / Output Types
// ─────────────────────────────────────────────

export interface RecommendationInput {
  workspaceId: string;
  businessId: string;
  ownerUserId: string;
  diagnosisId?: string;
  recommendationText: string;
  recommendationType: RecommendationType;
  priorityRank: number;
  expectedOutcomeSummary: string;
  targetMetricName?: string;
  baselineValue?: number;
  targetValue?: number;
  targetDirection?: TargetDirection;
  measurementWindowDays?: number;
  confidenceScore: number;
  confidenceReason: string;
  riskLevel: RiskLevel;
  evidenceFor: string[];
  assumptions: string[];
  constraints: string[];
}

export interface RecommendationValidationResult {
  valid: boolean;
  violations: string[];
  recommendationStatus: RecommendationStatus;
  allowsOwnerDecision: boolean;
  effectiveConfidenceScore: number;
}

// ─────────────────────────────────────────────
// Functions
// ─────────────────────────────────────────────

/**
 * Pure status-machine lookup: is the given transition allowed?
 */
export function isRecommendationStatusTransitionAllowed(
  from: RecommendationStatus,
  to: RecommendationStatus
): boolean {
  const allowed = RECOMMENDATION_STATUS_TRANSITIONS[from];
  return (allowed as ReadonlyArray<RecommendationStatus>).includes(to);
}

/**
 * Compute the effective confidence score, applying caps based on diagnosis
 * validity and missing data flags.
 */
export function computeRecommendationConfidence(
  rawScore: number,
  diagnosisValid: boolean,
  hasMissingData: boolean
): number {
  let score = rawScore;
  if (!diagnosisValid) {
    score = Math.min(score, 40);
  }
  if (hasMissingData) {
    score = Math.min(score, 60);
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Validate a recommendation input against REC-RULE-1 through REC-RULE-6.
 * Returns a full validation result including derived status.
 */
export function validateRecommendation(
  input: RecommendationInput,
  diagnosisValidation?: DiagnosisEvidenceValidationResult
): RecommendationValidationResult {
  // Workspace scoping enforcement
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // REC-RULE-1: recommendationText >= 20 chars
  if (!input.recommendationText || input.recommendationText.length < 20) {
    violations.push("REC-RULE-1: recommendationText must be at least 20 characters");
  }

  // REC-RULE-2: expectedOutcomeSummary >= 10 chars
  if (!input.expectedOutcomeSummary || input.expectedOutcomeSummary.length < 10) {
    violations.push("REC-RULE-2: expectedOutcomeSummary must be at least 10 characters");
  }

  // REC-RULE-3: confidenceReason >= 10 chars
  if (!input.confidenceReason || input.confidenceReason.length < 10) {
    violations.push("REC-RULE-3: confidenceReason must be at least 10 characters");
  }

  // REC-RULE-4: confidenceScore 0-100
  if (
    typeof input.confidenceScore !== "number" ||
    input.confidenceScore < 0 ||
    input.confidenceScore > 100
  ) {
    violations.push("REC-RULE-4: confidenceScore must be between 0 and 100");
  }

  // REC-RULE-5: evidenceFor must have >= 1 item
  if (!input.evidenceFor || input.evidenceFor.length < 1) {
    violations.push("REC-RULE-5: evidenceFor must contain at least 1 item");
  }

  // REC-RULE-6: if diagnosisValidation provided and not valid, cap confidence at 40
  const diagnosisValid = diagnosisValidation ? diagnosisValidation.valid : true;
  let effectiveConfidenceScore = input.confidenceScore;
  if (diagnosisValidation && !diagnosisValidation.valid) {
    effectiveConfidenceScore = Math.min(effectiveConfidenceScore, 40);
  }

  const valid = violations.length === 0;

  // Derive recommendation status
  let recommendationStatus: RecommendationStatus;
  if (!valid) {
    recommendationStatus = "draft";
  } else if (effectiveConfidenceScore < 50) {
    recommendationStatus = "data_limited";
  } else if (input.riskLevel === "critical") {
    recommendationStatus = "verification_required";
  } else {
    recommendationStatus = "recommended";
  }

  const allowsOwnerDecision = valid && effectiveConfidenceScore >= 50;

  return {
    valid,
    violations,
    recommendationStatus,
    allowsOwnerDecision,
    effectiveConfidenceScore,
  };
}

/**
 * Assert that a recommendation is ready for owner decision.
 * Throws if the current status does not allow transition to owner_decision_pending.
 */
export function assertOwnerDecisionReady(
  currentStatus: RecommendationStatus,
  validation: RecommendationValidationResult
): void {
  if (!validation.valid) {
    throw new Error(
      `Owner decision not allowed: recommendation has ${validation.violations.length} validation violation(s): ${validation.violations.join("; ")}`
    );
  }

  if (!isRecommendationStatusTransitionAllowed(currentStatus, "owner_decision_pending")) {
    throw new Error(
      `Owner decision not allowed: transition from "${currentStatus}" to "owner_decision_pending" is not permitted`
    );
  }

  if (!validation.allowsOwnerDecision) {
    throw new Error(
      `Owner decision not allowed: effectiveConfidenceScore (${validation.effectiveConfidenceScore}) is below the required threshold of 50`
    );
  }
}

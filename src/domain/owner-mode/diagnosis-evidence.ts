/**
 * Owner Mode Diagnosis Evidence Contract — Phase 6
 *
 * Deterministic evidence contract enforcing that every diagnosis must
 * state what supports it, what contradicts it, and what would change it.
 * No AI decides; AI may only suggest (advise_only per CAP-002).
 *
 * Execution.md Phase 6: Diagnosis Evidence Contract.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";
import type { InputQualityAssessmentResult } from "./input-quality";

// ─── Diagnosis status machine ────────────────────────────────────────────────

export type DiagnosisStatus =
  | "draft"
  | "evidence_reviewed"
  | "confidence_assessed"
  | "ready_for_recommendation"
  | "rejected"
  | "superseded";

/** Legal status transitions — deterministic, not AI-controlled. */
export const DIAGNOSIS_STATUS_TRANSITIONS: Readonly<
  Record<DiagnosisStatus, ReadonlyArray<DiagnosisStatus>>
> = {
  draft: ["evidence_reviewed", "rejected"],
  evidence_reviewed: ["confidence_assessed", "rejected"],
  confidence_assessed: ["ready_for_recommendation", "rejected"],
  ready_for_recommendation: ["superseded"],
  rejected: [],
  superseded: [],
};

export function isDiagnosisStatusTransitionAllowed(
  from: DiagnosisStatus,
  to: DiagnosisStatus
): boolean {
  return (DIAGNOSIS_STATUS_TRANSITIONS[from] as DiagnosisStatus[]).includes(to);
}

// ─── Evidence contract input ──────────────────────────────────────────────────

export interface DiagnosisEvidenceInput {
  workspaceId: string;
  businessId: string;
  inputRecordId?: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingData: string[];
  assumptions: string[];
  confidenceScore: number; // 0–100
  confidenceReason: string;
  riskFlags: string[];
  whatWouldChangeThis: string;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface DiagnosisEvidenceValidationResult {
  valid: boolean;
  violations: string[];
  diagnosisStatus: DiagnosisStatus;
  allowsStrongRecommendation: boolean;
  effectiveConfidenceScore: number;
}

// ─── Deterministic guardrail rules ───────────────────────────────────────────

const MIN_EVIDENCE_FOR_STRONG_RECOMMENDATION = 1;
const MAX_CONFIDENCE_WITH_CRITICAL_MISSING = 60;
const MIN_CONFIDENCE_FOR_RECOMMENDATION = 50;

/**
 * Validates a diagnosis evidence record against Phase 6 hard rules.
 * All state transitions and confidence limits are deterministic.
 */
export function validateDiagnosisEvidence(
  input: DiagnosisEvidenceInput,
  qualityAssessment?: InputQualityAssessmentResult
): DiagnosisEvidenceValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];
  let effectiveConfidence = input.confidenceScore;

  // Rule 1: No diagnosis without evidence_for
  if (input.evidenceFor.length < MIN_EVIDENCE_FOR_STRONG_RECOMMENDATION) {
    violations.push(
      "DIAG-RULE-1: evidenceFor must contain at least one evidence item"
    );
  }

  // Rule 2: No high confidence with unresolved critical missing data
  if (
    input.missingData.length > 0 &&
    effectiveConfidence > MAX_CONFIDENCE_WITH_CRITICAL_MISSING
  ) {
    effectiveConfidence = MAX_CONFIDENCE_WITH_CRITICAL_MISSING;
    violations.push(
      `DIAG-RULE-2: confidence capped at ${MAX_CONFIDENCE_WITH_CRITICAL_MISSING} — unresolved missing data present`
    );
  }

  // Rule 3: No diagnosis may hide contradictory evidence
  // (evidence_against must be explicitly listed or explicitly empty — no null allowed at type level)
  // This is enforced by the type requiring evidenceAgainst: string[]; an empty array is explicit.

  // Rule 4: No diagnosis may proceed to recommendation without confidence_reason
  if (!input.confidenceReason || input.confidenceReason.trim().length < 10) {
    violations.push(
      "DIAG-RULE-4: confidenceReason required (minimum 10 characters)"
    );
  }

  // Rule 5: No diagnosis proceeds without whatWouldChangeThis
  if (
    !input.whatWouldChangeThis ||
    input.whatWouldChangeThis.trim().length < 10
  ) {
    violations.push(
      "DIAG-RULE-5: whatWouldChangeThis required (minimum 10 characters)"
    );
  }

  // Rule 6: confidence_score must be 0–100
  if (input.confidenceScore < 0 || input.confidenceScore > 100) {
    violations.push("DIAG-RULE-6: confidenceScore must be between 0 and 100");
  }

  // Apply quality assessment downgrade if provided
  if (qualityAssessment) {
    if (!qualityAssessment.allowsStrongRecommendation) {
      // Input quality gate blocks strong recommendation
      effectiveConfidence = Math.min(effectiveConfidence, 50);
      if (!violations.some((v) => v.includes("DIAG-RULE-2"))) {
        violations.push(
          `DIAG-RULE-QA: confidence capped at 50 — input quality status is '${qualityAssessment.qualityStatus}'`
        );
      }
    }
  }

  const valid = violations.length === 0;

  // Determine diagnosis status
  let diagnosisStatus: DiagnosisStatus;
  if (!valid) {
    diagnosisStatus = "draft";
  } else if (effectiveConfidence < MIN_CONFIDENCE_FOR_RECOMMENDATION) {
    diagnosisStatus = "evidence_reviewed";
  } else if (input.confidenceReason.trim().length >= 10 && input.evidenceFor.length > 0) {
    diagnosisStatus = "confidence_assessed";
  } else {
    diagnosisStatus = "evidence_reviewed";
  }

  const allowsStrongRecommendation =
    valid &&
    effectiveConfidence >= MIN_CONFIDENCE_FOR_RECOMMENDATION &&
    input.evidenceFor.length >= MIN_EVIDENCE_FOR_STRONG_RECOMMENDATION;

  return {
    valid,
    violations,
    diagnosisStatus,
    allowsStrongRecommendation,
    effectiveConfidenceScore: effectiveConfidence,
  };
}

/**
 * Advances a diagnosis to ready_for_recommendation.
 * Throws if the transition is not permitted by the status machine.
 */
export function assertReadyForRecommendation(
  currentStatus: DiagnosisStatus,
  validation: DiagnosisEvidenceValidationResult
): void {
  if (!validation.valid) {
    throw new Error(
      `Diagnosis cannot advance to ready_for_recommendation: ${validation.violations.join("; ")}`
    );
  }
  if (!validation.allowsStrongRecommendation) {
    throw new Error(
      `Diagnosis cannot advance to ready_for_recommendation: effectiveConfidence=${validation.effectiveConfidenceScore} < ${MIN_CONFIDENCE_FOR_RECOMMENDATION}`
    );
  }
  if (!isDiagnosisStatusTransitionAllowed(currentStatus, "ready_for_recommendation")) {
    throw new Error(
      `Illegal status transition: ${currentStatus} → ready_for_recommendation`
    );
  }
}

/**
 * Returns true if evidence_against contains items — contradictory evidence is visible.
 * This is a read-only proof function, not a gate.
 */
export function hasContradictoryEvidence(input: DiagnosisEvidenceInput): boolean {
  return input.evidenceAgainst.length > 0;
}

/**
 * Computes effective confidence after applying missing-data cap.
 * Pure function — no side effects.
 */
export function computeEffectiveConfidence(
  rawScore: number,
  missingData: string[],
  qualityAllowsStrong: boolean
): number {
  let score = Math.max(0, Math.min(100, rawScore));
  if (missingData.length > 0) {
    score = Math.min(score, MAX_CONFIDENCE_WITH_CRITICAL_MISSING);
  }
  if (!qualityAllowsStrong) {
    score = Math.min(score, 50);
  }
  return score;
}

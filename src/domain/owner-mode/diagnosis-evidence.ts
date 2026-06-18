/**
 * Diagnosis Evidence domain contracts for Owner Mode Reality Loop.
 * Enforces evidence validation, confidence scoring, and status transitions
 * for the diagnosis phase before recommendations are generated.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";
import type { InputQualityAssessmentResult } from "./input-quality";

// ─── Status Machine ───────────────────────────────────────────────────────────

export type DiagnosisStatus =
  | "draft"
  | "evidence_reviewed"
  | "confidence_assessed"
  | "ready_for_recommendation"
  | "superseded"
  | "rejected";

export const DIAGNOSIS_STATUS_TRANSITIONS: Record<DiagnosisStatus, DiagnosisStatus[]> = {
  draft: ["evidence_reviewed", "rejected"],
  evidence_reviewed: ["confidence_assessed", "rejected"],
  confidence_assessed: ["ready_for_recommendation", "rejected"],
  ready_for_recommendation: ["superseded"],
  superseded: [],
  rejected: [],
};

export function isDiagnosisStatusTransitionAllowed(from: DiagnosisStatus, to: DiagnosisStatus): boolean {
  return DIAGNOSIS_STATUS_TRANSITIONS[from].includes(to);
}

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface DiagnosisEvidenceInput {
  workspaceId: string;
  businessId: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingData: string[];
  assumptions: string[];
  confidenceScore: number;
  confidenceReason: string;
  riskFlags: string[];
  whatWouldChangeThis: string;
}

// ─── Validation Result ────────────────────────────────────────────────────────

export interface DiagnosisEvidenceValidationResult {
  valid: boolean;
  violations: string[];
  diagnosisStatus: DiagnosisStatus;
  allowsStrongRecommendation: boolean;
  effectiveConfidenceScore: number;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

export function computeEffectiveConfidence(
  rawScore: number,
  missingData: string[],
  qualityAllows: boolean
): number {
  let cap = 100;
  if (missingData.length > 0) cap = Math.min(cap, 60);
  if (!qualityAllows) cap = Math.min(cap, 50);
  return Math.max(0, Math.min(100, Math.min(rawScore, cap)));
}

export function hasContradictoryEvidence(input: DiagnosisEvidenceInput): boolean {
  return input.evidenceAgainst.length > 0;
}

export function validateDiagnosisEvidence(
  input: DiagnosisEvidenceInput,
  quality?: InputQualityAssessmentResult
): DiagnosisEvidenceValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // DIAG-RULE-1: evidenceFor must not be empty
  if (!input.evidenceFor || input.evidenceFor.length === 0) {
    violations.push("DIAG-RULE-1: At least one piece of supporting evidence is required");
  }

  const qualityAllows = quality ? quality.allowsStrongRecommendation : true;
  const effectiveConfidenceScore = computeEffectiveConfidence(
    input.confidenceScore,
    input.missingData,
    qualityAllows
  );

  // DIAG-RULE-2: confidenceScore > 60 with missingData → violation (cap already applied)
  if (input.missingData.length > 0 && input.confidenceScore > 60) {
    violations.push("DIAG-RULE-2: Confidence score capped at 60 due to missing data");
  }

  // DIAG-RULE-4: confidenceReason required and >= 10 chars
  if (!input.confidenceReason || input.confidenceReason.trim().length < 10) {
    violations.push("DIAG-RULE-4: confidenceReason must be at least 10 characters");
  }

  // DIAG-RULE-5: whatWouldChangeThis required
  if (!input.whatWouldChangeThis || input.whatWouldChangeThis.trim().length === 0) {
    violations.push("DIAG-RULE-5: whatWouldChangeThis is required");
  }

  const valid = violations.length === 0;
  const allowsStrongRecommendation = valid && qualityAllows;
  const diagnosisStatus: DiagnosisStatus = valid ? "confidence_assessed" : "draft";

  return {
    valid,
    violations,
    diagnosisStatus,
    allowsStrongRecommendation,
    effectiveConfidenceScore,
  };
}

export function assertReadyForRecommendation(
  currentStatus: DiagnosisStatus,
  validation: DiagnosisEvidenceValidationResult
): void {
  if (!validation.valid) {
    throw new Error(
      `Diagnosis is not valid for recommendation: ${validation.violations.join("; ")}`
    );
  }
  if (!isDiagnosisStatusTransitionAllowed(currentStatus, "ready_for_recommendation")) {
    throw new Error(
      `Illegal status transition: "${currentStatus}" → "ready_for_recommendation"`
    );
  }
}

/**
 * Diagnosis Evidence domain contracts for Owner Mode Reality Loop.
 * Defines validation result types used by recommendation tracking.
 */

export interface DiagnosisEvidenceValidationResult {
  valid: boolean;
  violations: string[];
  evidenceCount: number;
  hasConflictingEvidence: boolean;
}

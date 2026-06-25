/**
 * Implementation-quality assessment (Slice 13).
 *
 * Assesses EXECUTION/PROCESS quality (consumed by the Slice 15 learning gate),
 * NOT employee discipline. It never produces a punishment or disciplinary
 * recommendation — only a quality grade. An external blocker can reduce blame
 * (lift an otherwise-weak grade); a boundary breach makes execution INVALID.
 */

import { ImplementationQualityStatus } from "@/domain/execution/learning-gate";

export interface QualityAssessmentInput {
  assessed: boolean;
  proofComplete: boolean;
  /** 0..1 fraction of checklist steps adhered to. */
  checklistAdherence: number;
  onTime: boolean;
  boundaryCompliant: boolean;
  /** Were raised blockers legitimate (affects validity, not discipline). */
  blockerValid?: boolean;
  /** An external factor (e.g. customer unavailable) reduces blame. */
  externalBlockerAdjustment?: boolean;
}

/** This module models quality only; it never emits a disciplinary signal. */
export const EMITS_DISCIPLINARY_RECOMMENDATION = false;

export function assessImplementationQuality(
  input: QualityAssessmentInput
): ImplementationQualityStatus {
  if (!input.assessed) return ImplementationQualityStatus.NOT_ASSESSED;
  // A boundary breach invalidates the execution regardless of other dimensions.
  if (!input.boundaryCompliant) return ImplementationQualityStatus.INVALID_EXECUTION;
  if (!input.proofComplete) return ImplementationQualityStatus.WEAK;

  const adherence = input.checklistAdherence;
  const onTimeOrExcused = input.onTime || input.externalBlockerAdjustment === true;

  if (adherence >= 0.9 && input.onTime) return ImplementationQualityStatus.HIGH_QUALITY;
  if (adherence >= 0.7 && onTimeOrExcused) return ImplementationQualityStatus.ACCEPTABLE;
  if (adherence >= 0.5) return ImplementationQualityStatus.WEAK;
  return ImplementationQualityStatus.POOR;
}

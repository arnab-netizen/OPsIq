/**
 * R14 / R15 — Deterministic AI operations reviewer + flag-to-action map (§64–§68). Pure.
 *
 * The prompt allows a deterministic, mockable reviewer interface when live AI is unsafe/
 * unavailable. The reviewer PRODUCES FLAGS, never final high-risk verification: every flag
 * maps to a deterministic workflow effect, and an AI "no issue" result can NEVER fully
 * verify a high-risk task alone.
 */

import type { ProofAuthenticitySignals } from "@/domain/remote-operations/proof";

export type AiProofReviewStatus =
  | "AI_NO_ISSUE_FOUND" | "AI_MISSING_PROOF" | "AI_WEAK_PROOF" | "AI_SUSPICIOUS_PROOF"
  | "AI_DUPLICATE_SUSPECTED" | "AI_BEFORE_AFTER_MISMATCH" | "AI_NO_VISIBLE_CHANGE"
  | "AI_RESOLUTION_TOO_LOW" | "AI_METADATA_INCONSISTENT" | "AI_CONTRADICTION_FOUND"
  | "AI_REVIEW_INCONCLUSIVE" | "AI_HUMAN_REVIEW_REQUIRED";

export interface AiReviewResult {
  status: AiProofReviewStatus;
  /** AI can never be the sole verifier of a high-risk task. */
  canVerifyHighRiskAlone: false;
  humanReviewRequired: boolean;
}

/** Deterministic reviewer: maps authenticity signals to an AI status (flags, not verification). */
export function reviewProofDeterministic(s: ProofAuthenticitySignals): AiReviewResult {
  const wrap = (status: AiProofReviewStatus, humanReviewRequired = true): AiReviewResult => ({ status, canVerifyHighRiskAlone: false, humanReviewRequired });
  if (!s.requiredProofPresent) return wrap("AI_MISSING_PROOF");
  if (s.duplicateSuspected) return wrap("AI_DUPLICATE_SUSPECTED");
  if (s.samePhotoBeforeAndAfter) return wrap("AI_BEFORE_AFTER_MISMATCH");
  if (s.noVisibleChangeWhereExpected) return wrap("AI_NO_VISIBLE_CHANGE");
  if (s.timestampSuspicious || s.contradictedByComplaint) return wrap("AI_CONTRADICTION_FOUND");
  if (s.locationMismatch) return wrap("AI_SUSPICIOUS_PROOF");
  if (s.resolutionBelowMinimum) return wrap("AI_RESOLUTION_TOO_LOW");
  if (!s.metadataPresent) return wrap("AI_METADATA_INCONSISTENT");
  if (!s.hasRequiredView || !s.imageQualityOk) return wrap("AI_WEAK_PROOF");
  return wrap("AI_NO_ISSUE_FOUND", false);
}

export type AiWorkflowEffect =
  | "BLOCK_VERIFICATION_REQUEST_PROOF" | "SUPERVISOR_REVIEW_REQUIRED" | "MANAGER_REVIEW_AND_AUDIT"
  | "BLOCK_HIGH_CONFIDENCE_VERIFICATION" | "REQUEST_NEW_PROOF" | "CREATE_CONTRADICTION_EXCEPTION"
  | "MANAGER_REVIEW_REQUIRED" | "CANNOT_AUTO_CLOSE" | "KEEP_LOW_CONFIDENCE_HUMAN_REVIEW" | "NO_EFFECT";

/** §68 deterministic flag → workflow effect map. AI no-issue cannot auto-verify high-risk. */
export const AI_FLAG_ACTION: Record<AiProofReviewStatus, AiWorkflowEffect> = {
  AI_MISSING_PROOF: "BLOCK_VERIFICATION_REQUEST_PROOF",
  AI_WEAK_PROOF: "SUPERVISOR_REVIEW_REQUIRED",
  AI_SUSPICIOUS_PROOF: "MANAGER_REVIEW_AND_AUDIT",
  AI_DUPLICATE_SUSPECTED: "BLOCK_HIGH_CONFIDENCE_VERIFICATION",
  AI_BEFORE_AFTER_MISMATCH: "SUPERVISOR_REVIEW_REQUIRED",
  AI_NO_VISIBLE_CHANGE: "SUPERVISOR_REVIEW_REQUIRED",
  AI_RESOLUTION_TOO_LOW: "REQUEST_NEW_PROOF",
  AI_METADATA_INCONSISTENT: "MANAGER_REVIEW_REQUIRED",
  AI_CONTRADICTION_FOUND: "CREATE_CONTRADICTION_EXCEPTION",
  AI_REVIEW_INCONCLUSIVE: "KEEP_LOW_CONFIDENCE_HUMAN_REVIEW",
  AI_HUMAN_REVIEW_REQUIRED: "CANNOT_AUTO_CLOSE",
  AI_NO_ISSUE_FOUND: "NO_EFFECT",
};

export function aiFlagToAction(status: AiProofReviewStatus): AiWorkflowEffect {
  return AI_FLAG_ACTION[status];
}

/** Even AI_NO_ISSUE_FOUND cannot fully verify a high-risk task — human verification is required. */
export function aiResultClosesHighRisk(): boolean {
  return false;
}

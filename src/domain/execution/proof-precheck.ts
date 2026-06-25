/**
 * AI proof precheck (Slice 11, pure logic).
 *
 * The AI/system may PRECHECK a submitted proof but can NEVER final-accept it.
 * Precheck maps only to AI_PRECHECK_PASSED / AI_PRECHECK_FAILED /
 * NEEDS_HUMAN_REVIEW — never ACCEPTED — and high-risk proof types are always
 * routed to human review. The proof FSM independently forbids a SYSTEM actor from
 * reaching ACCEPTED, so AI cannot final-accept payment/complaint/lost-damaged
 * proof even if this logic were bypassed. Untrusted proof notes never affect the
 * outcome (it is computed from typed fields only).
 */

import {
  ProofRequirement,
  ProofStatus,
  ProofSubmission,
  isDuplicateFileHash,
  requiresHumanReview,
  validateProofSubmission,
} from "@/domain/execution/proof";

export enum AiProofPrecheckOutcome {
  PASS_PRELIMINARY = "PASS_PRELIMINARY",
  FAIL_MISSING_REQUIRED_PROOF = "FAIL_MISSING_REQUIRED_PROOF",
  FAIL_WRONG_FORMAT = "FAIL_WRONG_FORMAT",
  FAIL_INCONSISTENT = "FAIL_INCONSISTENT",
  NEEDS_OWNER_REVIEW = "NEEDS_OWNER_REVIEW",
  POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",
  POSSIBLE_TAMPER_RISK = "POSSIBLE_TAMPER_RISK",
}

export interface PrecheckSignals {
  existingHashes?: ReadonlySet<string>;
  /** A consistency check (e.g. amount/text mismatch) flagged the submission. */
  inconsistent?: boolean;
  /** A tamper heuristic (metadata/EXIF/hash anomaly) flagged the submission. */
  tamperRisk?: boolean;
}

/**
 * Deterministic precheck, computed only from typed requirement/submission fields
 * plus structural signals — never from free-text notes.
 */
export function computeProofPrecheck(
  requirement: ProofRequirement,
  submission: ProofSubmission,
  signals: PrecheckSignals = {}
): AiProofPrecheckOutcome {
  const validation = validateProofSubmission(requirement, submission);
  if (validation.issues.some((i) => i.startsWith("WRONG_PROOF_TYPE"))) {
    return AiProofPrecheckOutcome.FAIL_WRONG_FORMAT;
  }
  if (validation.issues.some((i) => i.startsWith("MISSING_FIELD"))) {
    return AiProofPrecheckOutcome.FAIL_MISSING_REQUIRED_PROOF;
  }
  if (signals.tamperRisk) return AiProofPrecheckOutcome.POSSIBLE_TAMPER_RISK;
  if (isDuplicateFileHash(submission.fileHash, signals.existingHashes ?? new Set())) {
    return AiProofPrecheckOutcome.POSSIBLE_DUPLICATE;
  }
  if (signals.inconsistent) return AiProofPrecheckOutcome.FAIL_INCONSISTENT;
  if (requiresHumanReview(requirement.proofType, requirement.riskLevel)) {
    return AiProofPrecheckOutcome.NEEDS_OWNER_REVIEW;
  }
  return AiProofPrecheckOutcome.PASS_PRELIMINARY;
}

/**
 * Map a precheck outcome to the proof status it advances to. The codomain is
 * strictly {AI_PRECHECK_PASSED, AI_PRECHECK_FAILED, NEEDS_HUMAN_REVIEW} — ACCEPTED
 * is never reachable from a precheck.
 */
export function mapPrecheckToProofStatus(
  outcome: AiProofPrecheckOutcome
): ProofStatus {
  switch (outcome) {
    case AiProofPrecheckOutcome.PASS_PRELIMINARY:
      return ProofStatus.AI_PRECHECK_PASSED;
    case AiProofPrecheckOutcome.FAIL_MISSING_REQUIRED_PROOF:
    case AiProofPrecheckOutcome.FAIL_WRONG_FORMAT:
    case AiProofPrecheckOutcome.FAIL_INCONSISTENT:
      return ProofStatus.AI_PRECHECK_FAILED;
    case AiProofPrecheckOutcome.NEEDS_OWNER_REVIEW:
    case AiProofPrecheckOutcome.POSSIBLE_DUPLICATE:
    case AiProofPrecheckOutcome.POSSIBLE_TAMPER_RISK:
      return ProofStatus.NEEDS_HUMAN_REVIEW;
    default:
      // Fail closed: anything unexpected routes to a human.
      return ProofStatus.NEEDS_HUMAN_REVIEW;
  }
}

/** Precheck never yields an accepting status — a structural guarantee. */
export function precheckCanFinalAccept(): false {
  return false;
}

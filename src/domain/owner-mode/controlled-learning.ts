/**
 * Phase 29: Controlled Learning Candidate Store — Eligibility Gate
 *
 * This module classifies simulation outcomes as learning candidates.
 * It enforces SEC-005: four deterministic records + human approvedBy required.
 *
 * INVARIANTS:
 * - No engine modification occurs here
 * - No automatic promotion without human approvedBy
 * - No synthetic benchmark data is treated as real-world learning signal
 * - No cross-tenant data flows
 * - Workspace scoping is enforced on every entry point
 * - All candidate records are append-only (no mutation of approved records)
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Candidate Source Types ───────────────────────────────────────────────────

export type CandidateSourceLabel =
  | "SYNTHETIC_ONLY_CANDIDATE"
  | "HUMAN_VERIFIED_CANDIDATE"
  | "REAL_SOURCE_BACKED_CANDIDATE";

// REAL_SOURCE_BACKED_CANDIDATE requires full-text verification from a primary domain.
// SYNTHETIC_ONLY_CANDIDATE is the only label allowed when no real-world source is verified.
export const CANDIDATE_SOURCE_REQUIRES_REAL_WORLD: Readonly<
  Record<CandidateSourceLabel, boolean>
> = {
  SYNTHETIC_ONLY_CANDIDATE: false,
  HUMAN_VERIFIED_CANDIDATE: false,
  REAL_SOURCE_BACKED_CANDIDATE: true,
};

// ─── Evidence Origin ──────────────────────────────────────────────────────────

export type EvidenceOrigin =
  | "owner_manual_entry"
  | "owner_file_upload"
  | "owner_csv"
  | "owner_pdf"
  | "system_computed"
  | "ai_generated"            // forbidden — engine output as learning signal
  | "synthetic_benchmark"     // forbidden — benchmark corpus as real-world signal
  | "search_snippet_only";    // forbidden — unverified snippet as real-world signal

export const EVIDENCE_ORIGIN_FORBIDDEN: ReadonlySet<EvidenceOrigin> = new Set([
  "ai_generated",
  "synthetic_benchmark",
  "search_snippet_only",
]);

// ─── Eligibility Status (12 classes) ─────────────────────────────────────────

export type ControlledLearningEligibilityStatus =
  | "LEARNING_ELIGIBLE_VERIFIED_OUTCOME"
  | "LEARNING_ELIGIBLE_HUMAN_REVIEWED"
  | "LEARNING_INELIGIBLE_UNVERIFIED"
  | "LEARNING_INELIGIBLE_SYNTHETIC"
  | "LEARNING_INELIGIBLE_AI_GENERATED"
  | "LEARNING_INELIGIBLE_CROSS_TENANT"
  | "LEARNING_INELIGIBLE_NO_OWNER_DECISION"
  | "LEARNING_INELIGIBLE_NO_ACTION_TAKEN"
  | "LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW"
  | "LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE"
  | "LEARNING_INELIGIBLE_SAFETY_RELATED"
  | "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED";

export const ELIGIBILITY_ALLOWS_PROMOTION: Readonly<
  Record<ControlledLearningEligibilityStatus, boolean>
> = {
  LEARNING_ELIGIBLE_VERIFIED_OUTCOME: true,
  LEARNING_ELIGIBLE_HUMAN_REVIEWED: true,
  LEARNING_INELIGIBLE_UNVERIFIED: false,
  LEARNING_INELIGIBLE_SYNTHETIC: false,
  LEARNING_INELIGIBLE_AI_GENERATED: false,
  LEARNING_INELIGIBLE_CROSS_TENANT: false,
  LEARNING_INELIGIBLE_NO_OWNER_DECISION: false,
  LEARNING_INELIGIBLE_NO_ACTION_TAKEN: false,
  LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW: false,
  LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE: false,
  LEARNING_INELIGIBLE_SAFETY_RELATED: false,
  LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED: false,
};

// Terminal rejections cannot be overturned by adding evidence
export const ELIGIBILITY_IS_TERMINAL: Readonly<
  Record<ControlledLearningEligibilityStatus, boolean>
> = {
  LEARNING_ELIGIBLE_VERIFIED_OUTCOME: false,
  LEARNING_ELIGIBLE_HUMAN_REVIEWED: false,
  LEARNING_INELIGIBLE_UNVERIFIED: false,
  LEARNING_INELIGIBLE_SYNTHETIC: true,
  LEARNING_INELIGIBLE_AI_GENERATED: true,
  LEARNING_INELIGIBLE_CROSS_TENANT: true,
  LEARNING_INELIGIBLE_NO_OWNER_DECISION: false,
  LEARNING_INELIGIBLE_NO_ACTION_TAKEN: false,
  LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW: false,
  LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE: false,
  LEARNING_INELIGIBLE_SAFETY_RELATED: true,
  LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED: false,
};

// ─── SEC-005: Four Deterministic Records ─────────────────────────────────────

export interface LearningCandidateRecord {
  // Record 1 — Owner decision context (required by SEC-005)
  ownerDecisionId: string;
  ownerDecisionVerdict: "approved" | "rejected" | "deferred";
  ownerDecisionWorkspaceId: string;

  // Record 2 — Action taken (required by SEC-005)
  actionId: string;
  actionWasTaken: boolean;
  actionWorkspaceId: string;

  // Record 3 — Outcome window elapsed (required by SEC-005)
  outcomeId: string;
  outcomeWindowElapsed: boolean;
  outcomeWorkspaceId: string;

  // Record 4 — Human review (required by SEC-005)
  humanApprovedBy: string | null;   // null = not yet approved
  humanApprovedAt: string | null;   // ISO timestamp or null
  humanReviewWorkspaceId: string;
}

// ─── Candidate Submission Input ───────────────────────────────────────────────

export interface ControlledLearningCandidateInput {
  // Workspace isolation — all four record workspaceIds must match
  workspaceId: string;

  // Source classification
  sourceLabel: CandidateSourceLabel;
  evidenceOrigin: EvidenceOrigin;

  // Public source verification (for REAL_SOURCE_BACKED_CANDIDATE)
  publicSourceFullTextVerified: boolean;

  // Cross-tenant signal
  originatingWorkspaceId: string;   // must equal workspaceId; cross-tenant is forbidden

  // Safety signal
  involvesSafetyRelatedFailure: boolean;

  // Evidence conflict signal
  hasConflictingEvidence: boolean;

  // SEC-005: Four deterministic records
  candidateRecord: LearningCandidateRecord;
}

// ─── Eligibility Result ───────────────────────────────────────────────────────

export interface ControlledLearningEligibilityResult {
  eligible: boolean;
  status: ControlledLearningEligibilityStatus;
  allowsPromotion: boolean;
  isTerminalRejection: boolean;
  requiresHumanApproval: boolean;
  violations: string[];
  rejectionReasons: string[];
}

// ─── Promotion Input (SEC-005 gate) ──────────────────────────────────────────

export interface ControlledLearningPromotionInput {
  workspaceId: string;
  candidateId: string;
  approvedBy: string;      // non-empty human identity required
  approvedAt: string;      // ISO timestamp
  sourceLabel: CandidateSourceLabel;
}

export interface ControlledLearningPromotionResult {
  approved: boolean;
  violations: string[];
}

// ─── Append-Only Audit Record ─────────────────────────────────────────────────

export interface CandidateAuditEntry {
  workspaceId: string;
  candidateId: string;
  action: "SUBMITTED" | "REJECTED" | "HUMAN_APPROVED" | "PROMOTED";
  actorId: string | null;
  timestamp: string;
  detail: string;
}

// ─── Rule Evaluation ─────────────────────────────────────────────────────────

function evaluateRules(
  input: ControlledLearningCandidateInput
): { violations: string[]; rejectionReasons: string[]; status: ControlledLearningEligibilityStatus | null } {
  const violations: string[] = [];
  const rejectionReasons: string[] = [];

  const rec = input.candidateRecord;

  // CL-RULE-1: Workspace isolation — all four records must share the submission workspaceId
  if (rec.ownerDecisionWorkspaceId !== input.workspaceId) {
    violations.push("CL-RULE-1: ownerDecisionWorkspaceId does not match submission workspaceId");
  }
  if (rec.actionWorkspaceId !== input.workspaceId) {
    violations.push("CL-RULE-1: actionWorkspaceId does not match submission workspaceId");
  }
  if (rec.outcomeWorkspaceId !== input.workspaceId) {
    violations.push("CL-RULE-1: outcomeWorkspaceId does not match submission workspaceId");
  }
  if (rec.humanReviewWorkspaceId !== input.workspaceId) {
    violations.push("CL-RULE-1: humanReviewWorkspaceId does not match submission workspaceId");
  }

  // CL-RULE-2: Cross-tenant forbidden
  if (input.originatingWorkspaceId !== input.workspaceId) {
    rejectionReasons.push("CROSS_TENANT_ORIGIN");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_CROSS_TENANT" };
  }

  // CL-RULE-3: AI-generated evidence forbidden as learning signal
  if (input.evidenceOrigin === "ai_generated") {
    rejectionReasons.push("AI_GENERATED_EVIDENCE");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_AI_GENERATED" };
  }

  // CL-RULE-4: Synthetic benchmark forbidden as real-world learning signal
  if (input.evidenceOrigin === "synthetic_benchmark") {
    rejectionReasons.push("SYNTHETIC_BENCHMARK_EVIDENCE");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_SYNTHETIC" };
  }

  // CL-RULE-5: Search-snippet-only forbidden as public source verification
  if (input.evidenceOrigin === "search_snippet_only") {
    rejectionReasons.push("SEARCH_SNIPPET_UNVERIFIED");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED" };
  }

  // CL-RULE-6: REAL_SOURCE_BACKED_CANDIDATE requires full-text verification
  if (
    input.sourceLabel === "REAL_SOURCE_BACKED_CANDIDATE" &&
    !input.publicSourceFullTextVerified
  ) {
    rejectionReasons.push("PUBLIC_SOURCE_NOT_FULL_TEXT_VERIFIED");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED" };
  }

  // CL-RULE-7: Safety-related failures forbidden from automated ingestion
  if (input.involvesSafetyRelatedFailure) {
    rejectionReasons.push("SAFETY_RELATED_FAILURE");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_SAFETY_RELATED" };
  }

  // CL-RULE-8: Owner decision must be present and approved (not rejected/deferred)
  if (!rec.ownerDecisionId || rec.ownerDecisionId.trim() === "") {
    violations.push("CL-RULE-8: ownerDecisionId is required");
    rejectionReasons.push("NO_OWNER_DECISION");
  }
  if (rec.ownerDecisionVerdict !== "approved") {
    rejectionReasons.push("OWNER_DECISION_NOT_APPROVED");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_NO_OWNER_DECISION" };
  }

  // CL-RULE-9: Action must have been taken
  if (!rec.actionId || rec.actionId.trim() === "") {
    violations.push("CL-RULE-9: actionId is required");
  }
  if (!rec.actionWasTaken) {
    rejectionReasons.push("ACTION_NOT_TAKEN");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_NO_ACTION_TAKEN" };
  }

  // CL-RULE-10: Outcome window must have elapsed
  if (!rec.outcomeId || rec.outcomeId.trim() === "") {
    violations.push("CL-RULE-10: outcomeId is required");
  }
  if (!rec.outcomeWindowElapsed) {
    rejectionReasons.push("OUTCOME_WINDOW_NOT_ELAPSED");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW" };
  }

  // CL-RULE-11: Conflicting evidence requires human review before promotion
  if (input.hasConflictingEvidence) {
    rejectionReasons.push("CONFLICTING_EVIDENCE_REQUIRES_REVIEW");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE" };
  }

  // CL-RULE-12: Human approvedBy required for promotion (SEC-005)
  // Absent humanApprovedBy means HUMAN_REVIEWED eligible but not yet promoted
  const hasHumanApproval =
    rec.humanApprovedBy !== null &&
    rec.humanApprovedBy.trim() !== "" &&
    rec.humanApprovedAt !== null;

  // CL-RULE-13: Unverified evidence (not owner-supplied) without human approval
  const evidenceIsOwnerSupplied =
    input.evidenceOrigin === "owner_manual_entry" ||
    input.evidenceOrigin === "owner_file_upload" ||
    input.evidenceOrigin === "owner_csv" ||
    input.evidenceOrigin === "owner_pdf";

  if (!evidenceIsOwnerSupplied && !hasHumanApproval) {
    rejectionReasons.push("UNVERIFIED_NON_OWNER_EVIDENCE");
    return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_UNVERIFIED" };
  }

  // CL-RULE-14: REAL_SOURCE_BACKED_CANDIDATE path
  if (input.sourceLabel === "REAL_SOURCE_BACKED_CANDIDATE" && hasHumanApproval) {
    return { violations, rejectionReasons, status: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" };
  }

  // CL-RULE-15: HUMAN_VERIFIED_CANDIDATE path (includes SYNTHETIC_ONLY with human approval)
  if (hasHumanApproval) {
    return { violations, rejectionReasons, status: "LEARNING_ELIGIBLE_HUMAN_REVIEWED" };
  }

  // No human approval yet — not yet eligible for promotion
  rejectionReasons.push("AWAITING_HUMAN_APPROVAL");
  return { violations, rejectionReasons, status: "LEARNING_INELIGIBLE_UNVERIFIED" };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a controlled learning candidate submission against all eligibility rules.
 * Enforces SEC-005 four deterministic records.
 */
export function classifyLearningCandidate(
  input: ControlledLearningCandidateInput
): ControlledLearningEligibilityResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const { violations, rejectionReasons, status } = evaluateRules(input);

  // status is guaranteed non-null after evaluateRules when all rules complete
  const resolvedStatus: ControlledLearningEligibilityStatus =
    status ?? "LEARNING_INELIGIBLE_UNVERIFIED";

  const eligible =
    violations.length === 0 &&
    rejectionReasons.length === 0 &&
    ELIGIBILITY_ALLOWS_PROMOTION[resolvedStatus];

  const requiresHumanApproval =
    !eligible &&
    !ELIGIBILITY_IS_TERMINAL[resolvedStatus] &&
    resolvedStatus !== "LEARNING_INELIGIBLE_CROSS_TENANT";

  return {
    eligible,
    status: resolvedStatus,
    allowsPromotion: eligible,
    isTerminalRejection: ELIGIBILITY_IS_TERMINAL[resolvedStatus],
    requiresHumanApproval,
    violations,
    rejectionReasons,
  };
}

/**
 * Validate a promotion request. SEC-005: human approvedBy + approvedAt required.
 * SYNTHETIC_ONLY_CANDIDATE may never claim real-world-validated status.
 */
export function validateCandidatePromotion(
  input: ControlledLearningPromotionInput
): ControlledLearningPromotionResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  if (!input.candidateId || input.candidateId.trim() === "") {
    violations.push("candidateId is required");
  }
  if (!input.approvedBy || input.approvedBy.trim() === "") {
    violations.push("SEC-005: approvedBy (human identity) is required for promotion");
  }
  if (!input.approvedAt || input.approvedAt.trim() === "") {
    violations.push("SEC-005: approvedAt timestamp is required for promotion");
  }

  return {
    approved: violations.length === 0,
    violations,
  };
}

/**
 * Build an append-only audit entry for a candidate lifecycle event.
 * Callers must persist this entry; this module does not write to DB.
 */
export function buildCandidateAuditEntry(
  workspaceId: string,
  candidateId: string,
  action: CandidateAuditEntry["action"],
  actorId: string | null,
  detail: string,
  now: string
): CandidateAuditEntry {
  assertWorkspaceScopedQuery({ workspaceId });

  if (!candidateId || candidateId.trim() === "") {
    throw new Error("candidateId is required for audit entry");
  }
  if (!detail || detail.trim() === "") {
    throw new Error("detail is required for audit entry");
  }
  if (!now || now.trim() === "") {
    throw new Error("timestamp is required for audit entry");
  }

  return {
    workspaceId,
    candidateId,
    action,
    actorId,
    timestamp: now,
    detail,
  };
}

/**
 * Verify that an existing candidate record has not been mutated.
 * Enforces append-only invariant: once PROMOTED, a record must not change status.
 */
export function assertCandidateImmutable(
  existingStatus: ControlledLearningEligibilityStatus,
  proposedStatus: ControlledLearningEligibilityStatus
): void {
  if (
    existingStatus === "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" ||
    existingStatus === "LEARNING_ELIGIBLE_HUMAN_REVIEWED"
  ) {
    if (proposedStatus !== existingStatus) {
      throw new Error(
        `Append-only violation: promoted candidate with status ${existingStatus} cannot be mutated to ${proposedStatus}`
      );
    }
  }
}

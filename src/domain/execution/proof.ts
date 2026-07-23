/**
 * Proof requirement / submission / review state machine (Slice 8, pure logic).
 *
 * Structured proof with a fail-closed status FSM, submission validation
 * (proof-type match + required fields), duplicate-hash detection, and review
 * authority. Final acceptance/rejection requires a HUMAN reviewer
 * (canReviewProof) — an AI/system actor can only precheck or route to human
 * review, so AI can never final-accept proof (Slice 11 builds on this).
 *
 * Persistence (the Prisma Proof table) is MIGRATION_LANE_PENDING; this is the
 * enforcement core the service + table must use.
 */

import { TaskActorRole } from "@/domain/execution/delegated-task";

export enum ProofStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  REQUIRED = "REQUIRED",
  PENDING_SUBMISSION = "PENDING_SUBMISSION",
  SUBMITTED = "SUBMITTED",
  AI_PRECHECK_PASSED = "AI_PRECHECK_PASSED",
  AI_PRECHECK_FAILED = "AI_PRECHECK_FAILED",
  NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  RESUBMISSION_REQUIRED = "RESUBMISSION_REQUIRED",
  DISPUTED = "DISPUTED",
  OVERRIDDEN_NOT_VERIFIED = "OVERRIDDEN_NOT_VERIFIED",
}

const P = ProofStatus;

export const VALID_PROOF_TRANSITIONS: Record<ProofStatus, ProofStatus[]> = {
  [P.NOT_REQUIRED]: [],
  [P.REQUIRED]: [P.PENDING_SUBMISSION],
  [P.PENDING_SUBMISSION]: [P.SUBMITTED],
  [P.SUBMITTED]: [P.AI_PRECHECK_PASSED, P.AI_PRECHECK_FAILED, P.NEEDS_HUMAN_REVIEW, P.ACCEPTED, P.REJECTED, P.RESUBMISSION_REQUIRED],
  [P.AI_PRECHECK_PASSED]: [P.NEEDS_HUMAN_REVIEW, P.ACCEPTED],
  [P.AI_PRECHECK_FAILED]: [P.NEEDS_HUMAN_REVIEW, P.REJECTED, P.RESUBMISSION_REQUIRED],
  [P.NEEDS_HUMAN_REVIEW]: [P.ACCEPTED, P.REJECTED, P.DISPUTED, P.RESUBMISSION_REQUIRED],
  [P.ACCEPTED]: [P.DISPUTED, P.OVERRIDDEN_NOT_VERIFIED],
  [P.REJECTED]: [P.RESUBMISSION_REQUIRED],
  [P.RESUBMISSION_REQUIRED]: [P.SUBMITTED],
  [P.DISPUTED]: [P.ACCEPTED, P.REJECTED],
  [P.OVERRIDDEN_NOT_VERIFIED]: [],
};

export enum ProofType {
  PHOTO = "photo",
  SCREENSHOT = "screenshot",
  BEFORE_AFTER_IMAGE = "before_after_image",
  CALL_LOG = "call_log",
  MESSAGE_SCREENSHOT = "message_screenshot",
  CUSTOMER_RESPONSE_TAG = "customer_response_tag",
  CSV_UPLOAD = "csv_upload",
  INVOICE = "invoice",
  PAYMENT_CONFIRMATION = "payment_confirmation",
  DELIVERY_PROOF = "delivery_proof",
  PICKUP_PROOF = "pickup_proof",
  MANAGER_CONFIRMATION = "manager_confirmation",
  CUSTOMER_CONFIRMATION = "customer_confirmation",
  SHORT_NOTE = "short_note",
  CHECKLIST_COMPLETION = "checklist_completion",
}

export enum ProofRiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

/** Proof types that always require human review (never AI final-accept). */
export const HIGH_RISK_PROOF_TYPES: ReadonlySet<ProofType> = new Set([
  ProofType.PAYMENT_CONFIRMATION,
  ProofType.INVOICE,
  ProofType.CUSTOMER_CONFIRMATION,
]);

export function requiresHumanReview(
  proofType: ProofType,
  riskLevel: ProofRiskLevel
): boolean {
  return riskLevel === ProofRiskLevel.HIGH || HIGH_RISK_PROOF_TYPES.has(proofType);
}

export interface ProofActor {
  role: TaskActorRole;
  /** True when this actor is the employee the task is assigned to. */
  isAssignee: boolean;
  /** Owner, or manager with a PROOF_REVIEW_* grant. */
  canReviewProof: boolean;
}

const SUBMISSION_TARGETS: ReadonlySet<ProofStatus> = new Set([P.SUBMITTED]);
const AI_TARGETS: ReadonlySet<ProofStatus> = new Set([
  P.AI_PRECHECK_PASSED,
  P.AI_PRECHECK_FAILED,
  P.NEEDS_HUMAN_REVIEW,
]);
const REVIEW_TARGETS: ReadonlySet<ProofStatus> = new Set([
  P.ACCEPTED,
  P.REJECTED,
  P.DISPUTED,
  P.RESUBMISSION_REQUIRED,
]);

export interface ProofTransitionDecision {
  allowed: boolean;
  reason: string;
}
function deny(reason: string): ProofTransitionDecision {
  return { allowed: false, reason };
}
const ALLOW: ProofTransitionDecision = { allowed: true, reason: "ok" };

/**
 * Fail-closed proof transition authorization.
 * - submission (→ SUBMITTED): the assignee employee, or a manager/owner.
 * - AI precheck (→ AI_PRECHECK_x or NEEDS_HUMAN_REVIEW): SYSTEM only.
 * - review outcomes (ACCEPT/REJECT/DISPUTE/RESUBMIT): a human reviewer only;
 *   REJECTED requires a non-empty reason.
 * - OVERRIDDEN_NOT_VERIFIED: owner only.
 */
export function planProofTransition(
  from: ProofStatus,
  to: ProofStatus,
  actor: ProofActor,
  opts?: { reason?: string }
): ProofTransitionDecision {
  if (from === to) return deny(`No-op transition (${from}).`);
  if (!VALID_PROOF_TRANSITIONS[from].includes(to)) {
    return deny(`Invalid proof transition ${from} → ${to}.`);
  }

  if (to === P.OVERRIDDEN_NOT_VERIFIED) {
    return actor.role === TaskActorRole.OWNER
      ? ALLOW
      : deny("Only the owner may override proof (OVERRIDDEN_NOT_VERIFIED).");
  }

  if (AI_TARGETS.has(to)) {
    return actor.role === TaskActorRole.SYSTEM
      ? ALLOW
      : deny("AI precheck transitions are system-only.");
  }

  if (SUBMISSION_TARGETS.has(to)) {
    if (actor.role === TaskActorRole.EMPLOYEE) {
      return actor.isAssignee
        ? ALLOW
        : deny("An employee may only submit proof for their own task.");
    }
    return ALLOW; // manager/owner submitting on behalf
  }

  if (REVIEW_TARGETS.has(to)) {
    if (!actor.canReviewProof) {
      return deny("Actor lacks proof-review authority.");
    }
    if (to === P.REJECTED && !(opts?.reason && opts.reason.trim().length > 0)) {
      return deny("A proof rejection requires a reason.");
    }
    return ALLOW;
  }

  return deny(`Proof transition ${from} → ${to} is not authorized.`);
}

// ── Submission validation + duplicate detection ──────────────────────────────

export interface ProofRequirement {
  proofType: ProofType;
  requiredFields: string[];
  riskLevel: ProofRiskLevel;
}

export interface ProofSubmission {
  proofType: ProofType;
  fields: Record<string, unknown>;
  fileHash?: string | null;
  submittedByUserId: string;
}

export interface ProofSubmissionValidation {
  ok: boolean;
  issues: string[];
}

/** Validate a submission against its requirement (type match + required fields). */
export function validateProofSubmission(
  requirement: ProofRequirement,
  submission: ProofSubmission
): ProofSubmissionValidation {
  const issues: string[] = [];
  if (submission.proofType !== requirement.proofType) {
    issues.push(
      `WRONG_PROOF_TYPE: expected ${requirement.proofType}, got ${submission.proofType}`
    );
  }
  for (const f of requirement.requiredFields) {
    const v = submission.fields[f];
    if (v === undefined || v === null || v === "") {
      issues.push(`MISSING_FIELD: ${f}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Duplicate-file detection: true if this hash already exists for the workspace. */
export function isDuplicateFileHash(
  fileHash: string | null | undefined,
  existingHashes: ReadonlySet<string>
): boolean {
  if (!fileHash) return false;
  return existingHashes.has(fileHash);
}

/** A task may be approved complete only when its proof is accepted (or not required). */
export function isProofClearedForCompletion(status: ProofStatus): boolean {
  return status === ProofStatus.ACCEPTED || status === ProofStatus.NOT_REQUIRED;
}

export interface ProofClearanceContext {
  /** When the proof was accepted (for freshness). */
  acceptedAt?: Date | null;
  /** True when the proof's file hash duplicates a prior submission. */
  duplicateFlagged?: boolean;
  now?: Date;
  /** Max age (days) an accepted proof stays valid for completion; null = no limit. */
  maxAgeDays?: number | null;
}

export interface ProofClearanceResult {
  cleared: boolean;
  /** Machine reason when not cleared (proof_not_accepted | duplicate_proof | proof_stale). */
  reason: "proof_not_accepted" | "duplicate_proof" | "proof_stale" | null;
}

/**
 * Strict clearance for completion. Extends isProofClearedForCompletion with:
 *  - duplicate rejection (a duplicate-flagged proof can never clear), and
 *  - freshness (an accepted proof older than maxAgeDays is stale → not cleared).
 * Closes strict re-audit loopholes 3 (no freshness) and 4 (duplicate flagged-not-rejected).
 */
export function evaluateProofClearance(status: ProofStatus, ctx: ProofClearanceContext = {}): ProofClearanceResult {
  if (status === ProofStatus.NOT_REQUIRED) return { cleared: true, reason: null };
  if (status !== ProofStatus.ACCEPTED) return { cleared: false, reason: "proof_not_accepted" };
  if (ctx.duplicateFlagged) return { cleared: false, reason: "duplicate_proof" };
  if (ctx.maxAgeDays != null && ctx.acceptedAt) {
    const ageMs = (ctx.now ?? new Date()).getTime() - ctx.acceptedAt.getTime();
    if (ageMs > ctx.maxAgeDays * 24 * 60 * 60 * 1000) return { cleared: false, reason: "proof_stale" };
  }
  return { cleared: true, reason: null };
}

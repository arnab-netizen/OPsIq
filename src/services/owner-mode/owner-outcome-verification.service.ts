/**
 * Phase 3 — Owner Execution and Outcome Closure Engine
 * Outcome verification service.
 *
 * Provides:
 *   1. classifyOutcomeVerification()   — pure, deterministic classification (no DB)
 *   2. assertVerificationSeparationOfDuty() — throws if actor tries to self-verify
 *   3. verifyOwnerActionOutcome()       — atomic DB write + audit (optimistic lock)
 *   4. triggerPostVerificationSideEffects() — best-effort post-commit side effects
 *   5. determineAndCreateLearningCandidate() — wires learning gate to outcome verification
 *
 * All DB writes for verification are atomic: the verification update and its audit event
 * are committed in a single Prisma $transaction. Side effects (reassessment, learning)
 * run best-effort AFTER the transaction commits and do NOT roll it back.
 *
 * Workspace isolation is enforced: outcomeId lookups always include workspaceId.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  determineLearningEligibility,
  isLearningEligible,
  OutcomeStatus as GateOutcomeStatus,
  AttributionStatus,
  ImplementationQualityStatus,
  ProfitImpactConfidence,
  ProofGateStatus,
  OwnerLearningApproval,
  AiMutationAttemptStatus,
} from "@/domain/execution/learning-gate";
import { createReassessmentEvent } from "@/services/owner-mode/reassessment-event.service";

// ─── Classification types ────────────────────────────────────────────────────

export type OwnerOutcomeVerificationClass =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NO_MEASURABLE_IMPACT"
  | "FAILURE"
  | "NEGATIVE_IMPACT"
  | "INCONCLUSIVE"
  | "OBSERVATION_WINDOW_OPEN"
  | "INSUFFICIENT_EVIDENCE";

// Verification status written to the outcome row
export type OutcomeVerificationStatus =
  | "unverified"
  | "observation_window_open"
  | "insufficient_evidence"
  | "verified"
  | "disputed";

// Outcome classifications that produce a terminal "verified" status
const TERMINAL_VERIFIED_CLASSES = new Set<OwnerOutcomeVerificationClass>([
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "NO_MEASURABLE_IMPACT",
  "FAILURE",
  "NEGATIVE_IMPACT",
  "INCONCLUSIVE",
]);

// ─── Row shape (minimal — only fields used by classification and verification) ─

export interface OutcomeRowForClassification {
  id: string;
  workspaceId: string;
  businessId: string;
  outcomeStatus: string;
  ownerReportedResult: string | null;
  actualMetricName: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  measurementPeriodEnd: Date | null;
  evidenceQuality: string | null;
  externalEventFlag: boolean;
  observationWindowDays: number | null;
  verificationClassification: string | null;
  taskKey: string | null;
  // Set by the recording actor — used for separation-of-duty
  createdAt: Date;
}

export interface TaskRowForClassification {
  id: string;
  workspaceId: string;
  taskKey: string;
  targetValue: number | null;
  verificationWindowDays: number | null;
  outcomeRecordedAt: Date | null;
  // actorId of the outcome recorder — derived from completedByUserId
  completedByUserId: string | null;
}

// ─── Custom errors ──────────────────────────────────────────────────────────

export class OutcomeNotFoundError extends Error {
  readonly code = "OUTCOME_NOT_FOUND";
  readonly statusCode = 404;
  constructor(outcomeId: string) {
    super(`OwnerActionOutcome not found: ${outcomeId}`);
    this.name = "OutcomeNotFoundError";
  }
}

export class OutcomeAlreadyVerifiedError extends Error {
  readonly code = "OUTCOME_ALREADY_VERIFIED";
  readonly statusCode = 409;
  constructor(outcomeId: string) {
    super(`OwnerActionOutcome already verified: ${outcomeId}`);
    this.name = "OutcomeAlreadyVerifiedError";
  }
}

export class SeparationOfDutyViolationError extends Error {
  readonly code = "SEPARATION_OF_DUTY_VIOLATION";
  readonly statusCode = 403;
  constructor() {
    super("The actor who recorded this outcome cannot verify it (separation of duty)");
    this.name = "SeparationOfDutyViolationError";
  }
}

export class ObservationWindowOpenError extends Error {
  readonly code = "OBSERVATION_WINDOW_OPEN";
  readonly statusCode = 409;
  constructor(remainingDays: number) {
    super(`Observation window is still open (${remainingDays} day(s) remaining)`);
    this.name = "ObservationWindowOpenError";
  }
}

export class InsufficientEvidenceError extends Error {
  readonly code = "INSUFFICIENT_EVIDENCE";
  readonly statusCode = 409;
  constructor() {
    super("Cannot verify outcome: insufficient evidence or owner-reported result");
    this.name = "InsufficientEvidenceError";
  }
}

// ─── 1. Pure classification function ────────────────────────────────────────

/**
 * Deterministically classify an outcome. Rules are first-match in priority order.
 * The function is pure: same inputs → same output; no DB access, no wall-clock.
 *
 * @param outcome  — the stored OwnerActionOutcome row
 * @param task     — optional ProcessExecutionTask (needed for metric comparison)
 * @param now      — reference instant for window checks (defaults to real Date.now())
 */
export function classifyOutcomeVerification(
  outcome: OutcomeRowForClassification,
  task?: TaskRowForClassification | null,
  now: Date = new Date()
): OwnerOutcomeVerificationClass {
  const { outcomeStatus, evidenceQuality, ownerReportedResult } = outcome;

  // Rule 1 — observation window from outcome itself
  if (outcome.observationWindowDays != null) {
    if (outcome.measurementPeriodEnd == null || outcome.measurementPeriodEnd > now) {
      return "OBSERVATION_WINDOW_OPEN";
    }
  }

  // Rule 1b — verification window from task (overrides early)
  if (task?.verificationWindowDays != null && task.outcomeRecordedAt != null) {
    const windowMs = task.verificationWindowDays * 24 * 60 * 60 * 1000;
    const elapsed = now.getTime() - task.outcomeRecordedAt.getTime();
    if (elapsed < windowMs) {
      return "OBSERVATION_WINDOW_OPEN";
    }
  }

  // Rule 2 — no evidence and no reported result
  if (evidenceQuality === "none" && ownerReportedResult == null) {
    return "INSUFFICIENT_EVIDENCE";
  }

  // Rule 3 — outcome made things worse
  if (outcomeStatus === "made_worse") {
    return "NEGATIVE_IMPACT";
  }

  // Rule 4 — outcome did not work
  if (outcomeStatus === "did_not_work") {
    return "FAILURE";
  }

  // Rule 5 — unmeasurable or externally interfered
  if (outcomeStatus === "not_measurable" || outcomeStatus === "external_event_interference") {
    return "NO_MEASURABLE_IMPACT";
  }

  // Rule 6 — too early or invalid
  if (outcomeStatus === "too_early_to_judge" || outcomeStatus === "invalid_test") {
    return "INCONCLUSIVE";
  }

  // Rule 7 — metric-based partial success (improvement < 20% of target delta)
  if (
    outcome.beforeValue != null &&
    outcome.afterValue != null &&
    task?.targetValue != null
  ) {
    const actualImprovement = outcome.afterValue - outcome.beforeValue;
    const targetImprovement = task.targetValue - outcome.beforeValue;
    if (targetImprovement > 0 && actualImprovement / targetImprovement < 0.2) {
      return "PARTIAL_SUCCESS";
    }
  }

  // Rule 8 — owner-reported partial
  if (outcomeStatus === "partially_worked" || outcomeStatus === "executed_differently") {
    return "PARTIAL_SUCCESS";
  }

  // Rule 9 — success: worked with optional metric validation
  if (outcomeStatus === "worked") {
    if (
      outcome.afterValue != null &&
      task?.targetValue != null &&
      outcome.afterValue < task.targetValue
    ) {
      return "PARTIAL_SUCCESS";
    }
    return "SUCCESS";
  }

  // Rule 10 — fallback
  return "INCONCLUSIVE";
}

// ─── 2. Separation-of-duty guard ────────────────────────────────────────────

/**
 * Assert that the verification actor is not the same as the outcome recorder.
 * Throws SeparationOfDutyViolationError when violated.
 *
 * We treat the outcome's task completedByUserId as the "recorder" identity.
 * If it's unset (e.g., recorded via API without task context), we skip the check
 * to avoid false blocks on outcomes created by non-task flows.
 */
export function assertVerificationSeparationOfDuty(
  recorderActorId: string | null | undefined,
  verificationActorId: string
): void {
  if (recorderActorId && recorderActorId === verificationActorId) {
    throw new SeparationOfDutyViolationError();
  }
}

// ─── Dependency injection types ──────────────────────────────────────────────

export interface VerifyOutcomeDeps {
  db: typeof db;
  uuid: () => string;
  now: () => Date;
}

async function resolveVerifyDeps(): Promise<VerifyOutcomeDeps> {
  return { db, uuid: () => randomUUID(), now: () => new Date() };
}

// ─── 3. Atomic verification persistence ─────────────────────────────────────

export interface VerifyOutcomeResult {
  ok: boolean;
  verificationClassification: OwnerOutcomeVerificationClass;
  verificationStatus: OutcomeVerificationStatus;
  reason?: string;
  code?: string;
}

/**
 * Verify an OwnerActionOutcome atomically.
 *
 * Steps (all inside $transaction):
 *  1. Load outcome (workspace-isolated)
 *  2. Load associated task for metric context
 *  3. Check observation window (throws ObservationWindowOpenError if too early)
 *  4. classifyOutcomeVerification() — deterministic
 *  5. assertVerificationSeparationOfDuty()
 *  6. updateMany where verificationClassification IS NULL (optimistic lock)
 *  7. emitAuditEvent inside transaction
 *
 * Returns { ok, verificationClassification, verificationStatus }.
 * Side effects (reassessment, learning) are triggered AFTER commit by the caller.
 */
export async function verifyOwnerActionOutcome(
  workspaceId: string,
  outcomeId: string,
  verificationActorId: string,
  verificationNotes: string | null,
  injected?: VerifyOutcomeDeps
): Promise<VerifyOutcomeResult> {
  const deps = injected ?? (await resolveVerifyDeps());
  const now = deps.now();

  return deps.db.$transaction(async (tx: typeof db) => {
    // 1. Load outcome — workspace-isolated
    const outcome = await (tx as any).ownerActionOutcome.findFirst({
      where: { id: outcomeId, workspaceId },
    }) as OutcomeRowForClassification | null;

    if (!outcome) throw new OutcomeNotFoundError(outcomeId);
    if (outcome.verificationClassification != null) throw new OutcomeAlreadyVerifiedError(outcomeId);

    // 2. Load associated task for metric context + window check
    let task: TaskRowForClassification | null = null;
    if (outcome.taskKey) {
      task = await (tx as any).processExecutionTask.findFirst({
        where: { workspaceId, taskKey: outcome.taskKey },
        select: {
          id: true,
          workspaceId: true,
          taskKey: true,
          targetValue: true,
          verificationWindowDays: true,
          outcomeRecordedAt: true,
          completedByUserId: true,
        },
      }) as TaskRowForClassification | null;
    }

    // 3. Observation window guard (task-level)
    if (task?.verificationWindowDays != null && task.outcomeRecordedAt != null) {
      const windowMs = task.verificationWindowDays * 24 * 60 * 60 * 1000;
      const elapsed = now.getTime() - task.outcomeRecordedAt.getTime();
      if (elapsed < windowMs) {
        const remainingMs = windowMs - elapsed;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        throw new ObservationWindowOpenError(remainingDays);
      }
    }

    // 4. Classify
    const verificationClassification = classifyOutcomeVerification(outcome, task, now);

    // 4a. Guard: non-terminal classifications must not write to DB or transition the task.
    // Throwing here causes applyProcessExecutionAction to return INVALID_TRANSITION without
    // updating the task status, preserving the ability to verify once the window closes.
    if (!TERMINAL_VERIFIED_CLASSES.has(verificationClassification)) {
      if (verificationClassification === "OBSERVATION_WINDOW_OPEN") {
        let remainingDays = 0;
        if (outcome.observationWindowDays != null && outcome.measurementPeriodEnd != null) {
          const remainingMs = outcome.measurementPeriodEnd.getTime() - now.getTime();
          remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
        }
        throw new ObservationWindowOpenError(remainingDays);
      }
      // INSUFFICIENT_EVIDENCE: cannot write a terminal classification; reject without writing
      throw new InsufficientEvidenceError();
    }

    // 5. Separation-of-duty (use task's completedByUserId as the recorder)
    const recorderActorId = task?.completedByUserId ?? null;
    assertVerificationSeparationOfDuty(recorderActorId, verificationActorId);

    // Determine status
    const verificationStatus: OutcomeVerificationStatus = TERMINAL_VERIFIED_CLASSES.has(
      verificationClassification
    ) ? "verified" : (verificationClassification === "OBSERVATION_WINDOW_OPEN" ? "observation_window_open" : "insufficient_evidence");

    // 6. Optimistic lock: update only when verificationClassification IS NULL
    const updated = await (tx as any).ownerActionOutcome.updateMany({
      where: { id: outcomeId, workspaceId, verificationClassification: null },
      data: {
        verificationClassification,
        verificationStatus,
        verifiedByActorId: verificationActorId,
        verifiedAt: now,
        verificationNotes: verificationNotes ?? null,
        updatedAt: now,
      },
    });

    // If count === 0 a concurrent verifier won — treat as already verified
    if (updated.count === 0) {
      throw new OutcomeAlreadyVerifiedError(outcomeId);
    }

    // 7. Audit inside transaction — failure rolls back verification
    const auditEventKey =
      verificationClassification === "INCONCLUSIVE" ||
      verificationClassification === "NO_MEASURABLE_IMPACT"
        ? AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_OUTCOME_VERIFIED
        : AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_OUTCOME_VERIFIED;

    await emitAuditEvent(
      {
        eventName: auditEventKey,
        actorId: verificationActorId,
        entityType: "owner_action_outcome",
        entityId: outcomeId,
        workspaceId,
        payload: {
          verificationClassification,
          verificationStatus,
          taskKey: outcome.taskKey ?? null,
          businessId: outcome.businessId,
          notes: verificationNotes ?? null,
        },
        visibility: "internal",
      },
      tx as any
    );

    return { ok: true, verificationClassification, verificationStatus };
  });
}

// ─── 4. Post-verification side effects (best-effort, non-blocking) ──────────

export interface PostVerificationSideEffectResult {
  reassessmentId: string | null;
  learningCandidateId: string | null;
}

/**
 * Trigger reassessment and learning candidate creation after a verified outcome.
 * These are fire-and-forget: failure does not roll back the verification.
 * Always returns — never throws.
 */
export async function triggerPostVerificationSideEffects(
  workspaceId: string,
  businessId: string,
  outcomeId: string,
  taskKey: string | null,
  verificationClassification: OwnerOutcomeVerificationClass,
  actorId: string
): Promise<PostVerificationSideEffectResult> {
  let reassessmentId: string | null = null;
  let learningCandidateId: string | null = null;

  // Reassessment — triggered for all terminal classifications
  try {
    const reopensDiagnosis =
      verificationClassification === "FAILURE" ||
      verificationClassification === "NEGATIVE_IMPACT";

    const event = await createReassessmentEvent({
      workspaceId,
      businessId,
      trigger: "verified_outcome",
      triggerDescription: `Outcome verified: ${verificationClassification}${taskKey ? ` for task ${taskKey}` : ""}`,
      outcomeId,
      actorId,
    });

    reassessmentId = event.id;

    // If we need to mark reopensDiagnosis, update the created event
    if (reopensDiagnosis && !event.deduped) {
      await db.ownerReassessmentEvent.update({
        where: { id: event.id },
        data: { reopensDiagnosis: true },
      });
    }

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_REASSESSMENT_TRIGGERED,
      actorId,
      entityType: "owner_reassessment_event",
      entityId: event.id,
      workspaceId,
      payload: { outcomeId, verificationClassification, taskKey },
      visibility: "internal",
    });
  } catch (err) {
    console.error("[phase3] triggerPostVerificationSideEffects: reassessment failed", err);
  }

  // Learning candidate
  try {
    learningCandidateId = await determineAndCreateLearningCandidate(
      workspaceId,
      outcomeId,
      verificationClassification,
      actorId
    );
  } catch (err) {
    console.error("[phase3] triggerPostVerificationSideEffects: learning candidate failed", err);
  }

  return { reassessmentId, learningCandidateId };
}

// ─── 5. Learning candidate creation ─────────────────────────────────────────

/**
 * Map a verification classification to the learning gate's OutcomeStatus enum
 * and check eligibility. If eligible, update the outcome row with the candidateId.
 * Returns the candidateId string or null.
 */
export async function determineAndCreateLearningCandidate(
  workspaceId: string,
  outcomeId: string,
  verificationClassification: OwnerOutcomeVerificationClass,
  actorId: string
): Promise<string | null> {
  // Map classification to learning gate's OutcomeStatus
  const outcomeStatusMap: Partial<Record<OwnerOutcomeVerificationClass, GateOutcomeStatus>> = {
    SUCCESS: GateOutcomeStatus.VERIFIED_SUCCESS,
    PARTIAL_SUCCESS: GateOutcomeStatus.PARTIAL_SUCCESS,
    FAILURE: GateOutcomeStatus.VERIFIED_FAILURE,
    NEGATIVE_IMPACT: GateOutcomeStatus.VERIFIED_FAILURE,
    NO_MEASURABLE_IMPACT: GateOutcomeStatus.INSUFFICIENT_DATA,
    INCONCLUSIVE: GateOutcomeStatus.INSUFFICIENT_DATA,
    OBSERVATION_WINDOW_OPEN: GateOutcomeStatus.MEASUREMENT_WINDOW_OPEN,
    INSUFFICIENT_EVIDENCE: GateOutcomeStatus.INSUFFICIENT_DATA,
  };

  const mappedOutcomeStatus = outcomeStatusMap[verificationClassification];
  if (!mappedOutcomeStatus) return null;

  const eligibility = determineLearningEligibility({
    proofStatus: ProofGateStatus.ACCEPTED,
    proofRequired: false,
    implementationQuality: ImplementationQualityStatus.ACCEPTABLE,
    outcomeStatus: mappedOutcomeStatus,
    attributionStatus: AttributionStatus.LIKELY,
    profitImpactRequired: false,
    profitImpactConfidence: ProfitImpactConfidence.ESTIMATED_FROM_OWNER_INPUT,
    ownerLearningApproval: OwnerLearningApproval.NOT_REQUIRED,
    aiMutationAttempt: AiMutationAttemptStatus.NONE,
  });

  if (!isLearningEligible(eligibility)) return null;

  // Mark the outcome with the candidate reference (use outcomeId as the candidate reference)
  const candidateId = outcomeId;
  await db.ownerActionOutcome.updateMany({
    where: { id: outcomeId, workspaceId, learningCandidateId: null },
    data: { learningCandidateId: candidateId, updatedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_LEARNING_CANDIDATE_CREATED,
    actorId,
    entityType: "owner_action_outcome",
    entityId: outcomeId,
    workspaceId,
    payload: { eligibility, verificationClassification, candidateId },
    visibility: "internal",
  });

  return candidateId;
}

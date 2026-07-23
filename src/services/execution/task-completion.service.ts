/**
 * Jarvis 360 gap-closure (G11,G12,G13,G14) — task completion routing (DI).
 *
 * Strict re-audit finding: the proof-to-completion gate lived in planTaskTransition but
 * applyTaskTransition had ZERO runtime callers, so completion was never gated on proof.
 *
 * This is the runtime path. It loads the delegated task + its latest proof from the DB,
 * derives proofRequired/proofCleared (accepted, not duplicate, fresh), and drives the
 * task to APPROVED_COMPLETE through applyTaskTransition — so:
 *   - a proof-required task CANNOT complete without an accepted, non-duplicate, fresh proof,
 *   - the performer cannot approve their own completion (SoD, enforced by the FSM),
 *   - a blocked completion emits an owner-visible OWNER_TASK_COMPLETION_BLOCKED event
 *     (counted as proofBlocked in the control center).
 *
 * Reuses applyTaskTransition + the proof clearance rules (no duplicate FSM).
 */

import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ProofStatus, evaluateProofClearance } from "@/domain/execution/proof";
import {
  DelegatedTaskStatus,
  TaskActor,
  type DelegatedTask,
} from "@/domain/execution/delegated-task";
import {
  applyTaskTransition,
  TaskTransitionNotAllowedError,
} from "@/services/execution/delegated-task.service";

interface TaskRow {
  id: string;
  workspaceId: string;
  assignedUserId: string | null;
  assignedRole: string | null;
  status: string;
  workOrderId: string | null;
  approvedBoundaryId: string | null;
  approvedBoundaryVersion: number | null;
  boundaryContentHash: string | null;
  proofRequirementId: string | null;
}

interface ProofRow {
  status: string;
  duplicateFlagged: boolean;
  reviewedAt: Date | null;
}

interface CompletionTx {
  delegatedTask: { updateMany(args: { where: Record<string, unknown>; data?: Record<string, unknown> }): Promise<{ count: number }> };
  auditEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

interface CompletionDb extends CompletionTx {
  delegatedTask: {
    updateMany(args: { where: Record<string, unknown>; data?: Record<string, unknown> }): Promise<{ count: number }>;
    findFirst(args: { where: { id: string; workspaceId: string } }): Promise<TaskRow | null>;
  };
  proof: {
    findFirst(args: {
      where: { taskId: string; workspaceId: string };
      orderBy: { createdAt: "desc" };
      select: { status: true; duplicateFlagged: true; reviewedAt: true };
    }): Promise<ProofRow | null>;
  };
  $transaction<T>(fn: (tx: CompletionTx) => Promise<T>): Promise<T>;
}

export interface TaskCompletionDeps {
  db: CompletionDb;
  now?: () => Date;
}

async function resolveDefaultDeps(): Promise<TaskCompletionDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as CompletionDb };
}

export class TaskNotFoundError extends Error {
  readonly code = "TASK_NOT_FOUND";
  constructor(taskId: string) {
    super(`Task ${taskId} not found in workspace.`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskCompletionBlockedError extends Error {
  readonly code = "TASK_COMPLETION_BLOCKED";
  constructor(
    readonly taskId: string,
    readonly reason: "proof_not_accepted" | "duplicate_proof" | "proof_stale" | "separation_of_duty" | "transition_denied"
  ) {
    super(`Task ${taskId} cannot complete: ${reason}.`);
    this.name = "TaskCompletionBlockedError";
  }
}

export interface CompleteTaskCommand {
  taskId: string;
  workspaceId: string;
  actor: TaskActor;
  actorId: string;
  /** Audited owner emergency override of the proof/SoD gates. */
  ownerOverride?: boolean;
  /** Freshness window for an accepted proof (days); null = no limit. Default 30. */
  maxProofAgeDays?: number | null;
}

const DEFAULT_MAX_PROOF_AGE_DAYS = 30;

/**
 * GAME-01: resolve the server-governed proof freshness window from an (untrusted)
 * client-supplied value. The client may only TIGHTEN the window — a positive value no
 * larger than the server default. null / undefined / non-positive / out-of-range all
 * fall back to the default, so the client can neither DISABLE the staleness gate (the
 * previous `null` loophole) nor loosen it beyond the server ceiling.
 */
export function resolveEffectiveProofAgeDays(requested: number | null | undefined): number {
  return typeof requested === "number" && requested > 0 && requested <= DEFAULT_MAX_PROOF_AGE_DAYS
    ? requested
    : DEFAULT_MAX_PROOF_AGE_DAYS;
}

async function recordCompletionBlocked(
  workspaceId: string,
  taskId: string,
  reason: string,
  actorId: string
): Promise<void> {
  await emitAuditEvent({
    workspaceId,
    eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED,
    actorId,
    actorType: "user",
    entityType: "delegated_task",
    entityId: taskId,
    payload: { reason },
  });
}

/**
 * Drive a delegated task to APPROVED_COMPLETE, gated on cleared proof + separation of
 * duty. Throws TaskCompletionBlockedError (audited) when proof is missing/stale/duplicate
 * or the performer tries to self-approve.
 */
export async function completeTask(command: CompleteTaskCommand, injected?: TaskCompletionDeps): Promise<DelegatedTaskStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();

  const row = await deps.db.delegatedTask.findFirst({
    where: { id: command.taskId, workspaceId: command.workspaceId },
  });
  if (!row) throw new TaskNotFoundError(command.taskId);

  const proofRequired = row.proofRequirementId != null;

  // Derive proof clearance from the latest proof on the task.
  let proofCleared = true;
  if (proofRequired && !command.ownerOverride) {
    const proof = await deps.db.proof.findFirst({
      where: { taskId: command.taskId, workspaceId: command.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { status: true, duplicateFlagged: true, reviewedAt: true },
    });
    // GAME-01: the freshness window is server-governed (see resolveEffectiveProofAgeDays).
    const clearance = evaluateProofClearance((proof?.status as ProofStatus) ?? ProofStatus.REQUIRED, {
      acceptedAt: proof?.reviewedAt ?? null,
      duplicateFlagged: proof?.duplicateFlagged ?? false,
      now,
      maxAgeDays: resolveEffectiveProofAgeDays(command.maxProofAgeDays),
    });
    proofCleared = clearance.cleared;
    if (!clearance.cleared && clearance.reason) {
      await recordCompletionBlocked(command.workspaceId, command.taskId, clearance.reason, command.actorId);
      throw new TaskCompletionBlockedError(command.taskId, clearance.reason);
    }
  }

  const task: DelegatedTask = {
    taskId: row.id,
    workspaceId: row.workspaceId,
    workOrderId: row.workOrderId,
    assignedUserId: row.assignedUserId,
    assignedRole: row.assignedRole,
    status: row.status as DelegatedTaskStatus,
    approvedBoundaryId: row.approvedBoundaryId,
    approvedBoundaryVersion: row.approvedBoundaryVersion,
    boundaryContentHash: row.boundaryContentHash,
  };

  try {
    // EH-28 — completion + override markers are written atomically with the state change.
    const extraAuditEvents: NonNullable<Parameters<typeof applyTaskTransition>[0]["extraAuditEvents"]> = [
      { eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETED, payload: { proofRequired, ownerOverride: command.ownerOverride ?? false } },
    ];
    // EH-30 — a proof-gate bypass is recorded as a distinct, client-visible override event.
    if (command.ownerOverride && proofRequired) {
      extraAuditEvents.push({ eventName: AUDIT_EVENTS.OWNER_TASK_OVERRIDE_USED, visibility: "client_visible", payload: { bypassed: "proof_gate" } });
    }
    const result = await applyTaskTransition(
      {
        task,
        to: DelegatedTaskStatus.APPROVED_COMPLETE,
        actor: command.actor,
        actorId: command.actorId,
        proofRequired,
        proofCleared,
        ownerOverride: command.ownerOverride,
        extraAuditEvents,
      },
      { db: deps.db, now: () => now }
    );
    return result;
  } catch (err) {
    if (err instanceof TaskTransitionNotAllowedError) {
      // The FSM denied it — most commonly separation-of-duty (performer self-approval)
      // or the proof gate. Surface as an owner-visible completion block.
      const reason = /separation|performer|self/i.test(err.message) ? "separation_of_duty" : "transition_denied";
      await recordCompletionBlocked(command.workspaceId, command.taskId, reason, command.actorId);
      throw new TaskCompletionBlockedError(command.taskId, reason as "separation_of_duty" | "transition_denied");
    }
    throw err;
  }
}

/**
 * EH-14 — single authorised call-site for applyTaskTransition outside of completeTask.
 * Non-completion state changes (e.g. ASSIGNED → IN_PROGRESS, → BLOCKED) must go through
 * this wrapper so that applyTaskTransition(…) is never reached outside this file.
 */
export async function runTaskTransition(
  task: DelegatedTask,
  to: DelegatedTaskStatus,
  actor: TaskActor,
  actorId: string,
): Promise<DelegatedTaskStatus> {
  return applyTaskTransition({ task, to, actor, actorId });
}

/**
 * Delegated task transition service (Slice 7, IO).
 *
 * Applies a backend-enforced, authorized status transition atomically: the status
 * write and its audit event are written in ONE transaction, so a failed audit
 * write rolls back the state change (no silent state mutation). The update is
 * guarded on the expected current status + workspaceId (concurrency safety +
 * workspace isolation). Authorization is the pure FSM
 * `@/domain/execution/delegated-task`.
 *
 * The Prisma `DelegatedTask` table is MIGRATION_LANE_PENDING; this service uses an
 * injected task/audit store and is unit-proven via DI fakes. The future table +
 * route must call this service (no transition logic in routes/UI).
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { v4 as uuid } from "uuid";
import {
  DelegatedTask,
  DelegatedTaskStatus,
  TaskActor,
  planTaskTransition,
} from "@/domain/execution/delegated-task";

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
}
interface TaskDelegate {
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}
interface AuditCreateDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}
export interface TaskTx {
  delegatedTask: TaskDelegate;
  auditEvent: AuditCreateDelegate;
}
export interface TaskDb extends TaskTx {
  $transaction<T>(fn: (tx: TaskTx) => Promise<T>): Promise<T>;
}
export interface TaskDeps {
  db: TaskDb;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<TaskDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as TaskDb, now: () => new Date() };
}

export class TaskTransitionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskTransitionNotAllowedError";
  }
}
export class TaskTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskTransitionConflictError";
  }
}

export interface TaskTransitionCommand {
  task: DelegatedTask;
  to: DelegatedTaskStatus;
  actor: TaskActor;
  /** The acting user id (for audit + Slice 3 separation-of-duty). */
  actorId: string;
  /** Slice 3 — proof-to-completion gate inputs (supplied when known). */
  proofRequired?: boolean;
  proofCleared?: boolean;
  /** Explicit, audited owner emergency override of the Slice 3 anti-gaming gates. */
  ownerOverride?: boolean;
  /**
   * Additional audit events to write INSIDE the same transaction as the state change
   * (EH-28). Lets callers record completion/override markers atomically so a completion
   * can never be left un-audited if the process dies after commit.
   */
  extraAuditEvents?: Array<{
    eventName: string;
    payload?: Record<string, unknown>;
    visibility?: string;
  }>;
}

/**
 * Authorize + apply a task status transition atomically.
 * @throws TaskTransitionNotAllowedError when the FSM denies the transition
 * @throws TaskTransitionConflictError when the guarded update matched 0 rows
 *         (concurrent change, wrong workspace, or stale status) — fail closed.
 */
export async function applyTaskTransition(
  command: TaskTransitionCommand,
  injected?: TaskDeps
): Promise<DelegatedTaskStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { task, to, actor, actorId } = command;

  const decision = planTaskTransition(task.status, to, actor, {
    actorUserId: actorId,
    performerUserId: task.assignedUserId,
    proofRequired: command.proofRequired,
    proofCleared: command.proofCleared,
    ownerOverride: command.ownerOverride,
  });
  if (!decision.allowed) {
    throw new TaskTransitionNotAllowedError(decision.reason);
  }

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    const updated = await tx.delegatedTask.updateMany({
      // guard on id + workspace (isolation) + expected status (concurrency)
      where: {
        id: task.taskId,
        workspaceId: task.workspaceId,
        status: task.status,
      },
      data: { status: to, updatedAt: now },
    });
    if (updated.count !== 1) {
      throw new TaskTransitionConflictError(
        `Task ${task.taskId} was not in expected state ${task.status} (workspace ${task.workspaceId}); no transition applied.`
      );
    }
    // Audit INSIDE the transaction: a failed audit write rolls back the status
    // change, so state never mutates without its audit record (Slice 7 rule 4).
    await tx.auditEvent.create({
      data: {
        id: uuid(),
        workspaceId: task.workspaceId,
        eventName: AUDIT_EVENTS.TASK_STATUS_CHANGED,
        actorId,
        actorType: "user",
        entityType: "delegated_task",
        entityId: task.taskId,
        payload: {
          fromStatus: task.status,
          toStatus: to,
          actorRole: actor.role,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });
    // EH-28 — caller-supplied completion/override markers, atomic with the state change.
    for (const ev of command.extraAuditEvents ?? []) {
      await tx.auditEvent.create({
        data: {
          id: uuid(),
          workspaceId: task.workspaceId,
          eventName: ev.eventName,
          actorId,
          actorType: "user",
          entityType: "delegated_task",
          entityId: task.taskId,
          payload: ev.payload ?? {},
          visibility: ev.visibility ?? "internal",
          occurredAt: now,
        },
      });
    }
  });

  return to;
}

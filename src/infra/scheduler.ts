import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { v4 as uuidv4 } from "uuid";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_partial_failure"
  | "failed"
  | "dead_letter";

/**
 * A handler's own truthful account of its domain-level outcome, distinct
 * from whether its Promise merely resolved. `processDue()` uses this to
 * decide the ScheduledTask's final status — a resolved Promise alone is NOT
 * sufficient evidence of business success (the false-success defect this
 * type closes): a handler whose downstream domain call reports its own
 * per-item failures (e.g. ReconcileResult.errors[], DueScanResult's
 * per-business ok:false) must surface that as PARTIAL_FAILURE, not let it
 * disappear into an undifferentiated "completed".
 */
export type HandlerOutcomeStatus = "SUCCESS" | "NO_WORK" | "PARTIAL_FAILURE";

export interface HandlerResult {
  status: HandlerOutcomeStatus;
  /** Owner-visible summary. Required whenever status !== "SUCCESS" so the
   *  automation-status surface has something truthful to show. */
  summary?: string;
  /** Machine-readable counts (e.g. { succeeded: 4, failed: 1 }) for callers
   *  that want more than the summary string. */
  counts?: Record<string, number>;
}

export interface ScheduleTaskInput {
  taskName: string;
  payload?: Record<string, unknown>;
  scheduledFor: Date;
  maxAttempts?: number;
  workspaceId?: string;
  idempotencyKey?: string;
}

/**
 * Structural context handed to every task handler alongside its payload.
 * `workspaceId` is sourced ONLY from the claimed task row itself (never from
 * payload, which a producer could get wrong) — handlers MUST use this value,
 * not a workspaceId embedded in payload, to satisfy workspace isolation.
 */
export interface TaskContext {
  taskId: string;
  taskName: string;
  workspaceId: string | null;
  attempt: number;
}

export interface TaskHandler {
  (payload: Record<string, unknown> | null, context: TaskContext): Promise<HandlerResult | void>;
}

export interface SchedulerProvider {
  schedule(input: ScheduleTaskInput): Promise<string>;
  cancel(taskId: string): Promise<void>;
  processDue(handlers: Map<string, TaskHandler>): Promise<number>;
}

/** Exponential backoff delay (seconds) for retry attempt N. */
function retryDelaySeconds(attempt: number): number {
  // attempt=1 → 60s, attempt=2 → 300s, attempt=3 → 900s
  return Math.min(60 * Math.pow(5, attempt - 1), 3600);
}

const LEASE_MS = 5 * 60 * 1000; // 5-minute processing lease

/**
 * Best-effort audit emission for scheduler lifecycle transitions. Audit
 * writes must never abort or mask the scheduler's own outcome — a failure
 * here is logged, not thrown. `emitAuditEvent` itself already fails safe
 * (logs + skips) when workspaceId is absent, matching every other audit
 * call site in this codebase; workspace-less task types simply do not
 * produce audit history, which is an existing, established constraint of
 * the audit subsystem, not something invented here.
 *
 * `actorId` is deliberately omitted (left undefined, persisted as NULL):
 * `AuditEvent.actorId` has a `NOT DEFERRABLE` FK to `users.id` that Postgres
 * only skips for NULL — a fabricated placeholder UUID (e.g. the well-known
 * "00000000-…-0001" used elsewhere in this codebase as CRON_ACTOR_ID) is not
 * a real user row and raises P2003 on write; see
 * src/__tests__/stage8/private-owner-seed-audit-actor.db.test.ts, which uses
 * that exact UUID as its canonical known-nonexistent fixture. `actorType:
 * "system"` alone correctly conveys that no human initiated this event.
 */
async function auditTaskEvent(
  eventName: (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS],
  task: { id: string; taskName: string; workspaceId: string | null; attempts?: number },
  payload: Record<string, unknown>
): Promise<void> {
  if (!task.workspaceId) return;
  try {
    await emitAuditEvent({
      eventName,
      actorType: "system",
      workspaceId: task.workspaceId,
      entityType: "ScheduledTask",
      entityId: task.id,
      payload: { taskName: task.taskName, attempt: task.attempts, ...payload },
      visibility: "internal",
    });
  } catch (err) {
    logger.error("Failed to emit scheduled-task audit event (non-fatal)", err, {
      eventName,
      taskId: task.id,
    });
  }
}

export class DatabaseSchedulerProvider implements SchedulerProvider {
  async schedule(input: ScheduleTaskInput): Promise<string> {
    // Idempotent upsert when idempotencyKey provided.
    if (input.idempotencyKey) {
      const existing = await db.scheduledTask.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        logger.info("Task already scheduled (idempotent skip)", {
          taskName: input.taskName,
          idempotencyKey: input.idempotencyKey,
          existingId: existing.id,
        });
        return existing.id;
      }
    }

    const task = await db.scheduledTask.create({
      data: {
        id: uuidv4(),
        taskName: input.taskName,
        payload: input.payload
          ? (input.payload as Prisma.InputJsonValue)
          : Prisma.DbNull,
        scheduledFor: input.scheduledFor,
        maxAttempts: input.maxAttempts ?? 3,
        status: "pending",
        workspaceId: input.workspaceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    logger.info("Task scheduled", {
      taskId: task.id,
      taskName: input.taskName,
      scheduledFor: input.scheduledFor.toISOString(),
      workspaceId: input.workspaceId,
    });

    await auditTaskEvent(
      AUDIT_EVENTS.SCHEDULED_TASK_ENQUEUED,
      { id: task.id, taskName: input.taskName, workspaceId: input.workspaceId ?? null },
      { scheduledFor: input.scheduledFor.toISOString(), idempotencyKey: input.idempotencyKey ?? null }
    );

    return task.id;
  }

  async cancel(taskId: string): Promise<void> {
    await db.scheduledTask.update({
      where: { id: taskId },
      data: { status: "completed", completedAt: new Date() },
    });
    logger.info("Task cancelled", { taskId });
  }

  async processDue(handlers: Map<string, TaskHandler>): Promise<number> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + LEASE_MS);

    // Atomic claim: select the batch under FOR UPDATE SKIP LOCKED, capturing
    // each row's PRE-claim status, then update exactly those rows. Capturing
    // previous_status per row (not just for logging, unlike the CTE in
    // claimStartup()) is what lets processDue distinguish a fresh pending
    // pickup from a stale-lease crash-recovery reclaim for audit purposes.
    const claimed = await db.$queryRaw<Array<{
      id: string;
      task_name: string;
      payload: unknown;
      attempts: number;
      max_attempts: number;
      workspace_id: string | null;
      previous_status: string;
    }>>`
      WITH "to_claim" AS (
        SELECT "id", "status" AS "previous_status"
        FROM "scheduled_tasks"
        WHERE (
          ("status" = 'pending'  AND "scheduled_for" <= ${now})
          OR
          ("status" = 'running'  AND "lease_expires_at" < ${now})
        )
        ORDER BY "scheduled_for" ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "scheduled_tasks" t
      SET "status"           = 'running',
          "started_at"       = ${now},
          "lease_expires_at" = ${leaseExpiry},
          "attempts"         = t."attempts" + 1
      FROM "to_claim"
      WHERE t."id" = "to_claim"."id"
      RETURNING
        t."id", t."task_name", t."payload", t."attempts", t."max_attempts",
        t."workspace_id", "to_claim"."previous_status"
    `;

    if (claimed.length === 0) return 0;

    let processed = 0;

    for (const task of claimed) {
      const wasReclaimed = task.previous_status === "running";
      await auditTaskEvent(
        wasReclaimed ? AUDIT_EVENTS.SCHEDULED_TASK_LEASE_RECLAIMED : AUDIT_EVENTS.SCHEDULED_TASK_CLAIMED,
        { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
        {}
      );

      const handler = handlers.get(task.task_name);
      const context: TaskContext = {
        taskId: task.id,
        taskName: task.task_name,
        workspaceId: task.workspace_id,
        attempt: task.attempts,
      };

      if (!handler) {
        // Unknown task type MUST fail closed — not cycle pending forever.
        // Routed through the exact same retry/backoff/dead-letter path as a
        // thrown handler error below, so a persistently-unknown task type
        // becomes an owner-visible dead letter within maxAttempts, and a
        // task enqueued moments before its handler is registered (rolling
        // deploy) still gets a bounded number of retries first.
        logger.warn("No handler registered for task", {
          taskName: task.task_name,
          taskId: task.id,
        });
        await this.recordFailure(
          task,
          new Error(`No handler registered for task type "${task.task_name}"`)
        );
        continue;
      }

      await auditTaskEvent(
        AUDIT_EVENTS.SCHEDULED_TASK_STARTED,
        { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
        {}
      );

      try {
        const outcome = await handler(task.payload as Record<string, unknown> | null, context);
        const result: HandlerResult = outcome ?? { status: "SUCCESS" };
        const isPartialFailure = result.status === "PARTIAL_FAILURE";

        await db.scheduledTask.update({
          where: { id: task.id },
          data: {
            status: isPartialFailure ? "completed_partial_failure" : "completed",
            completedAt: new Date(),
            leaseExpiresAt: null,
            // `lastError` is repurposed here (not just for the dead-letter
            // path) as "most recent owner-visible note on this task" — NULL
            // for a clean SUCCESS/NO_WORK so it never falsely echoes a prior
            // attempt's failure text once the task is genuinely clean.
            lastError: isPartialFailure
              ? result.summary ?? "Partial failure: handler reported PARTIAL_FAILURE with no summary"
              : null,
          },
        });
        await auditTaskEvent(
          isPartialFailure
            ? AUDIT_EVENTS.SCHEDULED_TASK_PARTIAL_FAILURE
            : AUDIT_EVENTS.SCHEDULED_TASK_SUCCEEDED,
          { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
          { outcomeStatus: result.status, summary: result.summary, counts: result.counts }
        );
        processed++;
      } catch (err) {
        await this.recordFailure(task, err);
      }
    }

    return processed;
  }

  /**
   * Shared failure path for both a thrown handler error and an unknown
   * task type. Decides retry-with-backoff vs dead-letter from
   * attempts/maxAttempts (attempts was already incremented by the claim
   * UPDATE), persists the transition, and emits the matching audit event.
   */
  private async recordFailure(
    task: { id: string; task_name: string; workspace_id: string | null; attempts: number; max_attempts: number },
    err: unknown
  ): Promise<void> {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    const errorMessage = governed.operatorMessage;
    const attemptsDone = task.attempts;
    const isDeadLetter = attemptsDone >= task.max_attempts;

    if (isDeadLetter) {
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: "dead_letter",
          lastError: errorMessage,
          leaseExpiresAt: null,
        },
      });
      await auditTaskEvent(
        AUDIT_EVENTS.SCHEDULED_TASK_DEAD_LETTERED,
        { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
        { error: errorMessage, maxAttempts: task.max_attempts }
      );
    } else {
      const nextRun = new Date(Date.now() + retryDelaySeconds(attemptsDone) * 1000);
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: "pending",
          lastError: errorMessage,
          scheduledFor: nextRun,
          startedAt: null,
          leaseExpiresAt: null,
        },
      });
      await auditTaskEvent(
        AUDIT_EVENTS.SCHEDULED_TASK_RETRY_SCHEDULED,
        { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
        { error: errorMessage, nextRun: nextRun.toISOString() }
      );
    }

    await auditTaskEvent(
      AUDIT_EVENTS.SCHEDULED_TASK_FAILED,
      { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
      { error: errorMessage, isDeadLetter }
    );

    logger.error("Task execution failed", {
      taskId: task.id,
      taskName: task.task_name,
      attempts: attemptsDone,
      maxAttempts: task.max_attempts,
      isDeadLetter,
      error: errorMessage,
    });
  }
}

export class InMemorySchedulerProvider implements SchedulerProvider {
  private tasks: Map<
    string,
    ScheduleTaskInput & { id: string; status: TaskStatus; attempts: number }
  > = new Map();

  async schedule(input: ScheduleTaskInput): Promise<string> {
    if (input.idempotencyKey) {
      for (const task of this.tasks.values()) {
        if (task.idempotencyKey === input.idempotencyKey) return task.id;
      }
    }
    const id = uuidv4();
    this.tasks.set(id, { ...input, id, status: "pending", attempts: 0 });
    logger.info("Task scheduled (in-memory)", { taskId: id, taskName: input.taskName });
    return id;
  }

  async cancel(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }

  async processDue(handlers: Map<string, TaskHandler>): Promise<number> {
    const now = new Date();
    let processed = 0;

    for (const [id, task] of this.tasks) {
      if (task.status !== "pending" || task.scheduledFor > now) continue;

      const handler = handlers.get(task.taskName);
      if (!handler) continue;

      task.status = "running";
      task.attempts++;

      const context: TaskContext = {
        taskId: id,
        taskName: task.taskName,
        workspaceId: task.workspaceId ?? null,
        attempt: task.attempts,
      };

      try {
        const outcome = await handler(task.payload ?? null, context);
        const result: HandlerResult = outcome ?? { status: "SUCCESS" };
        task.status = result.status === "PARTIAL_FAILURE" ? "completed_partial_failure" : "completed";
        processed++;
      } catch (err) {
        const maxAttempts = task.maxAttempts ?? 3;
        task.status = task.attempts >= maxAttempts ? "dead_letter" : "pending";
        if (task.status === "pending") {
          task.scheduledFor = new Date(
            Date.now() + retryDelaySeconds(task.attempts) * 1000
          );
        }
        const governed = classifyOperatorError(
          err instanceof Error ? err : new Error(String(err)),
          { context: "load" }
        );
        logger.error("Task failed (in-memory)", { taskId: id, error: governed.operatorMessage });
      }
    }

    return processed;
  }
}

let _scheduler: SchedulerProvider | null = null;

export function getScheduler(): SchedulerProvider {
  if (_scheduler) return _scheduler;

  const provider = process.env.SCHEDULER_PROVIDER ?? "in-memory";

  switch (provider) {
    case "in-memory":
      _scheduler = new InMemorySchedulerProvider();
      break;
    case "database":
      _scheduler = new DatabaseSchedulerProvider();
      break;
    default:
      throw new Error(`Unknown scheduler provider: ${provider}`);
  }

  return _scheduler;
}

/** Reset singleton (tests only). */
export function _resetSchedulerForTest(): void {
  _scheduler = null;
}

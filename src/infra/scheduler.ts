import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError } from "@/infra/errors";
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
 *
 * RETRY CONTRACT — what each execution outcome does to the ScheduledTask:
 *
 *   SUCCESS / NO_WORK       -> "completed"                 never retried
 *   PARTIAL_FAILURE         -> "completed_partial_failure" never retried (the handler
 *                              already did what it could and reported what it could not)
 *   FAILED                  -> "failed"                    TERMINAL, never retried. The
 *                              handler has classified the failure as one that retrying cannot
 *                              change (e.g. a request rejected as invalid) and has recorded
 *                              the domain consequence itself. `summary` is persisted as
 *                              `lastError` and must be owner-safe.
 *   thrown error            -> attempts < maxAttempts: "pending" again with exponential
 *                              backoff (60s, 300s, 900s, ... capped at 3600s);
 *                              attempts >= maxAttempts: "dead_letter".
 *   no handler registered   -> treated exactly like a thrown error (bounded retry, then
 *                              dead_letter) so a rolling deploy cannot lose or loop a task.
 *   lease expired mid-run   -> another worker may reclaim the task ("running" with an expired
 *                              lease is claimable); the reclaim consumes an attempt. Handlers
 *                              MUST be idempotent: a lease is not renewed while a handler runs.
 *
 * "failed" and "dead_letter" are deliberately different states: dead_letter means retries were
 * exhausted, failed means no retry was ever warranted. Neither is claimable again.
 */
export type HandlerOutcomeStatus = "SUCCESS" | "NO_WORK" | "PARTIAL_FAILURE" | "FAILED";

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

export interface ScheduleIdempotentResult {
  id: string;
  /** True only for the one caller whose call actually created the task. */
  created: boolean;
}

export interface SchedulerProvider {
  schedule(input: ScheduleTaskInput): Promise<string>;
  /**
   * Schedule by a stable idempotency key and report whether THIS call created the task.
   * IDEMPOTENCY CONTRACT: a key identifies one logical task for the lifetime of its row,
   * whatever that row's status (pending, completed, failed or dead_letter) — replaying a key
   * returns the existing task and never creates a second one; producers that need a new
   * generation of the same work must embed a generation marker in the key. A key already held
   * by a task with a different taskName or workspaceId is a ConflictError: a caller is never
   * handed another logical task's (or another workspace's) id.
   */
  scheduleIdempotent(input: ScheduleTaskInput): Promise<ScheduleIdempotentResult>;
  cancel(taskId: string): Promise<void>;
  processDue(handlers: Map<string, TaskHandler>): Promise<number>;
  /**
   * Claim and run ONE specific task through exactly processDue's claim/lease/handler/retry path.
   * Returns true only when this call claimed the task and its handler completed it (SUCCESS,
   * NO_WORK or PARTIAL_FAILURE). Returns false when the task does not exist, is not due, is
   * already finished (completed/failed/dead_letter), is held under a live lease, was claimed by
   * a concurrent caller, or its handler failed.
   */
  processTaskById(taskId: string, handlers: Map<string, TaskHandler>): Promise<boolean>;
}

/** Exponential backoff delay (seconds) for retry attempt N. */
function retryDelaySeconds(attempt: number): number {
  // attempt=1 → 60s, attempt=2 → 300s, attempt=3 → 900s
  return Math.min(60 * Math.pow(5, attempt - 1), 3600);
}

const LEASE_MS = 5 * 60 * 1000; // 5-minute processing lease

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClaimedTaskRow {
  id: string;
  task_name: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  workspace_id: string | null;
  previous_status: string;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** A key may only ever be replayed by the same logical task: same taskName, same workspace. */
function assertSameLogicalTask(
  existing: { taskName: string; workspaceId: string | null },
  input: ScheduleTaskInput
): void {
  if (existing.taskName !== input.taskName || (existing.workspaceId ?? null) !== (input.workspaceId ?? null)) {
    // Deliberately names neither the other task nor its workspace.
    throw new ConflictError("This idempotency key already identifies a different scheduled task.");
  }
}

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
 * "00000000-…-0001" sentinel, formerly used as scheduler-handlers.ts's
 * CRON_ACTOR_ID before F-AUDIT-CRON-ACTOR removed it) is not a real user row
 * and raises P2003 on write; see
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
    return (await this.scheduleIdempotent(input)).id;
  }

  /**
   * Race-safe: the idempotencyKey UNIQUE constraint is the only arbiter. The read below is
   * a fast path, never a guard — two callers can both miss it, both attempt the insert, and
   * exactly one wins; the loser's P2002 is not an application failure, it resolves to the
   * winner's row. Without an idempotencyKey every call creates a distinct task.
   */
  async scheduleIdempotent(input: ScheduleTaskInput): Promise<ScheduleIdempotentResult> {
    if (input.idempotencyKey) {
      const existing = await db.scheduledTask.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, taskName: true, workspaceId: true },
      });
      if (existing) {
        assertSameLogicalTask(existing, input);
        logger.info("Task already scheduled (idempotent skip)", {
          taskName: input.taskName,
          idempotencyKey: input.idempotencyKey,
          existingId: existing.id,
        });
        return { id: existing.id, created: false };
      }
    }

    let task: { id: string };
    try {
      task = await db.scheduledTask.create({
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
        select: { id: true },
      });
    } catch (err) {
      if (!input.idempotencyKey || !isUniqueViolation(err)) throw err;
      const winner = await db.scheduledTask.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, taskName: true, workspaceId: true },
      });
      // The winning row can only be missing if it was deleted between the failed insert and
      // this read; surface the original error rather than invent a result.
      if (!winner) throw err;
      assertSameLogicalTask(winner, input);
      logger.info("Task already scheduled (concurrent idempotent skip)", {
        taskName: input.taskName,
        idempotencyKey: input.idempotencyKey,
        existingId: winner.id,
      });
      return { id: winner.id, created: false };
    }

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

    return { id: task.id, created: true };
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
    const claimed = await db.$queryRaw<ClaimedTaskRow[]>`
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

    let processed = 0;
    for (const task of claimed) {
      if (await this.executeClaimedTask(task, handlers)) processed++;
    }
    return processed;
  }

  /**
   * Claim and execute ONE task through the same claim / lease / handler / retry / dead-letter
   * path as processDue(). The claim is the same atomic UPDATE under FOR UPDATE SKIP LOCKED with
   * the same eligibility predicate (pending and due, or running with an expired lease), so this
   * can never run a task a concurrent drain or a concurrent processTaskById already holds, and
   * can never run a finished (completed / failed / dead_letter) task.
   */
  async processTaskById(taskId: string, handlers: Map<string, TaskHandler>): Promise<boolean> {
    // A malformed id can never match a row; answering here keeps ::uuid from raising.
    if (!UUID_PATTERN.test(taskId)) return false;
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + LEASE_MS);
    const claimed = await db.$queryRaw<ClaimedTaskRow[]>`
      WITH "to_claim" AS (
        SELECT "id", "status" AS "previous_status"
        FROM "scheduled_tasks"
        WHERE "id" = ${taskId}::uuid AND (
          ("status" = 'pending'  AND "scheduled_for" <= ${now})
          OR
          ("status" = 'running'  AND "lease_expires_at" < ${now})
        )
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
    if (claimed.length === 0) return false;
    return this.executeClaimedTask(claimed[0], handlers);
  }

  /**
   * Fenced finalization. A task is only ever finalized by the claim that is still its current
   * claim: the row must still be "running" at the attempt this worker was given. If the lease
   * expired and another worker reclaimed the task (which consumed an attempt) or a retry state
   * was already written, this worker's late result is discarded instead of overwriting the
   * newer state — the status never reports an outcome that is not the latest attempt's.
   */
  private async finalizeFenced(
    task: { id: string; attempts: number },
    data: Prisma.ScheduledTaskUpdateManyMutationInput
  ): Promise<boolean> {
    const result = await db.scheduledTask.updateMany({
      where: { id: task.id, status: "running", attempts: task.attempts },
      data,
    });
    if (result.count !== 1) {
      logger.warn("Scheduled task finalization skipped: claim is no longer current (lease reclaimed or already finalized)", {
        taskId: task.id,
        attempt: task.attempts,
      });
      return false;
    }
    return true;
  }

  /** Execute one already-claimed task. Returns true when its handler completed it. */
  private async executeClaimedTask(task: ClaimedTaskRow, handlers: Map<string, TaskHandler>): Promise<boolean> {
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
      return false;
    }

    await auditTaskEvent(
      AUDIT_EVENTS.SCHEDULED_TASK_STARTED,
      { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
      {}
    );

    let result: HandlerResult;
    try {
      const outcome = await handler(task.payload as Record<string, unknown> | null, context);
      result = outcome ?? { status: "SUCCESS" };
    } catch (err) {
      await this.recordFailure(task, err);
      return false;
    }

    if (result.status === "FAILED") {
      await this.recordTerminalFailure(task, result);
      return false;
    }

    const isPartialFailure = result.status === "PARTIAL_FAILURE";
    try {
      const finalized = await this.finalizeFenced(task, {
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
      });
      if (!finalized) return false;
    } catch (err) {
      // The handler already ran; failing to record its result is a scheduler failure and takes
      // the retry path (handlers are required to be idempotent).
      await this.recordFailure(task, err);
      return false;
    }
    await auditTaskEvent(
      isPartialFailure
        ? AUDIT_EVENTS.SCHEDULED_TASK_PARTIAL_FAILURE
        : AUDIT_EVENTS.SCHEDULED_TASK_SUCCEEDED,
      { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
      { outcomeStatus: result.status, summary: result.summary, counts: result.counts }
    );
    return true;
  }

  /**
   * Terminal, handler-classified failure (HandlerResult status FAILED): finalize as "failed",
   * no retry, no next run. The summary is the handler's own owner-safe text.
   */
  private async recordTerminalFailure(
    task: { id: string; task_name: string; workspace_id: string | null; attempts: number; max_attempts: number },
    result: HandlerResult
  ): Promise<void> {
    const summary = result.summary ?? "Task failed: handler reported FAILED with no summary";
    const finalized = await this.finalizeFenced(task, {
      status: "failed",
      completedAt: new Date(),
      leaseExpiresAt: null,
      lastError: summary,
    });
    if (!finalized) return;
    await auditTaskEvent(
      AUDIT_EVENTS.SCHEDULED_TASK_FAILED,
      { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
      { error: summary, terminal: true, isDeadLetter: false, counts: result.counts }
    );
    logger.warn("Task finished with a terminal (non-retryable) failure", {
      taskId: task.id,
      taskName: task.task_name,
      attempts: task.attempts,
    });
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
      const finalized = await this.finalizeFenced(task, {
        status: "dead_letter",
        lastError: errorMessage,
        leaseExpiresAt: null,
      });
      if (!finalized) return;
      await auditTaskEvent(
        AUDIT_EVENTS.SCHEDULED_TASK_DEAD_LETTERED,
        { id: task.id, taskName: task.task_name, workspaceId: task.workspace_id, attempts: task.attempts },
        { error: errorMessage, maxAttempts: task.max_attempts }
      );
    } else {
      const nextRun = new Date(Date.now() + retryDelaySeconds(attemptsDone) * 1000);
      const finalized = await this.finalizeFenced(task, {
        status: "pending",
        lastError: errorMessage,
        scheduledFor: nextRun,
        startedAt: null,
        leaseExpiresAt: null,
      });
      if (!finalized) return;
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
    ScheduleTaskInput & { id: string; status: TaskStatus; attempts: number; lastError?: string }
  > = new Map();

  async schedule(input: ScheduleTaskInput): Promise<string> {
    return (await this.scheduleIdempotent(input)).id;
  }

  async scheduleIdempotent(input: ScheduleTaskInput): Promise<ScheduleIdempotentResult> {
    // Single-threaded: the find and the insert below cannot interleave with another caller.
    if (input.idempotencyKey) {
      for (const task of this.tasks.values()) {
        if (task.idempotencyKey === input.idempotencyKey) {
          assertSameLogicalTask({ taskName: task.taskName, workspaceId: task.workspaceId ?? null }, input);
          return { id: task.id, created: false };
        }
      }
    }
    const id = uuidv4();
    this.tasks.set(id, { ...input, id, status: "pending", attempts: 0 });
    logger.info("Task scheduled (in-memory)", { taskId: id, taskName: input.taskName });
    return { id, created: true };
  }

  async cancel(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }

  async processDue(handlers: Map<string, TaskHandler>): Promise<number> {
    const now = new Date();
    let processed = 0;

    for (const [id, task] of [...this.tasks]) {
      if (task.status !== "pending" || task.scheduledFor > now) continue;
      if (!handlers.has(task.taskName)) continue;
      if (await this.run(id, handlers)) processed++;
    }

    return processed;
  }

  async processTaskById(taskId: string, handlers: Map<string, TaskHandler>): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "pending" || task.scheduledFor > new Date()) return false;
    if (!handlers.has(task.taskName)) return false;
    return this.run(taskId, handlers);
  }

  private async run(id: string, handlers: Map<string, TaskHandler>): Promise<boolean> {
    const task = this.tasks.get(id)!;
    const handler = handlers.get(task.taskName)!;

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
      if (result.status === "FAILED") {
        task.status = "failed";
        task.lastError = result.summary ?? "Task failed: handler reported FAILED with no summary";
        return false;
      }
      task.status = result.status === "PARTIAL_FAILURE" ? "completed_partial_failure" : "completed";
      return true;
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
      task.lastError = governed.operatorMessage;
      logger.error("Task failed (in-memory)", { taskId: id, error: governed.operatorMessage });
      return false;
    }
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

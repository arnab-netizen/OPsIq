import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { v4 as uuidv4 } from "uuid";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "dead_letter";

export interface ScheduleTaskInput {
  taskName: string;
  payload?: Record<string, unknown>;
  scheduledFor: Date;
  maxAttempts?: number;
  workspaceId?: string;
  idempotencyKey?: string;
}

export interface TaskHandler {
  (payload: Record<string, unknown> | null): Promise<void>;
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

    // Atomic claim via raw SQL UPDATE … RETURNING.
    // Only claim rows that are either:
    //   (a) pending + scheduledFor <= now, OR
    //   (b) running + lease expired (crash recovery)
    const claimed = await db.$queryRaw<Array<{
      id: string;
      task_name: string;
      payload: unknown;
      attempts: number;
      max_attempts: number;
    }>>`
      UPDATE "scheduled_tasks"
      SET "status"           = 'running',
          "started_at"       = ${now},
          "lease_expires_at" = ${leaseExpiry},
          "attempts"         = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "scheduled_tasks"
        WHERE (
          ("status" = 'pending'  AND "scheduled_for" <= ${now})
          OR
          ("status" = 'running'  AND "lease_expires_at" < ${now})
        )
        ORDER BY "scheduled_for" ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "task_name", "payload", "attempts", "max_attempts"
    `;

    if (claimed.length === 0) return 0;

    let processed = 0;

    for (const task of claimed) {
      const handler = handlers.get(task.task_name);
      if (!handler) {
        logger.warn("No handler registered for task", {
          taskName: task.task_name,
          taskId: task.id,
        });
        // Release back to pending so it can be retried after a handler is registered.
        await db.scheduledTask.update({
          where: { id: task.id },
          data: { status: "pending", startedAt: null, leaseExpiresAt: null },
        }).catch(() => {});
        continue;
      }

      try {
        await handler(task.payload as Record<string, unknown> | null);
        await db.scheduledTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            leaseExpiresAt: null,
          },
        });
        processed++;
      } catch (err) {
        const governed = classifyOperatorError(
          err instanceof Error ? err : new Error(String(err)),
          { context: "load" }
        );
        const errorMessage = governed.operatorMessage;
        // attempts was already incremented by the UPDATE above.
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
        } else {
          // Exponential backoff: schedule next attempt in the future.
          const nextRun = new Date(
            Date.now() + retryDelaySeconds(attemptsDone) * 1000
          );
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
        }

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

    return processed;
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

      try {
        await handler(task.payload ?? null);
        task.status = "completed";
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

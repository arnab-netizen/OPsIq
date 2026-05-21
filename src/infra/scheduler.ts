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
}

export interface TaskHandler {
  (payload: Record<string, unknown> | null): Promise<void>;
}

export interface SchedulerProvider {
  schedule(input: ScheduleTaskInput): Promise<string>;
  cancel(taskId: string): Promise<void>;
  processDue(handlers: Map<string, TaskHandler>): Promise<number>;
}

export class DatabaseSchedulerProvider implements SchedulerProvider {
  async schedule(input: ScheduleTaskInput): Promise<string> {
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
      },
    });

    logger.info("Task scheduled", {
      taskId: task.id,
      taskName: input.taskName,
      scheduledFor: input.scheduledFor.toISOString(),
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
    const dueTasks = await db.scheduledTask.findMany({
      where: {
        status: "pending",
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: "asc" },
      take: 50,
    });

    let processed = 0;

    for (const task of dueTasks) {
      const handler = handlers.get(task.taskName);
      if (!handler) {
        logger.warn("No handler registered for task", {
          taskName: task.taskName,
          taskId: task.id,
        });
        continue;
      }

      await db.scheduledTask.update({
        where: { id: task.id },
        data: { status: "running", startedAt: now, attempts: task.attempts + 1 },
      });

      try {
        await handler(task.payload as Record<string, unknown> | null);
        await db.scheduledTask.update({
          where: { id: task.id },
          data: { status: "completed", completedAt: new Date() },
        });
        processed++;
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
        const errorMessage = governed.operatorMessage;
        const newAttempts = task.attempts + 1;
        const isDeadLetter = newAttempts >= task.maxAttempts;

        await db.scheduledTask.update({
          where: { id: task.id },
          data: {
            status: isDeadLetter ? "dead_letter" : "failed",
            lastError: errorMessage,
          },
        });

        logger.error("Task execution failed", {
          taskId: task.id,
          taskName: task.taskName,
          attempt: newAttempts,
          maxAttempts: task.maxAttempts,
          isDeadLetter,
          error: errorMessage,
        });

        if (!isDeadLetter) {
          await db.scheduledTask.update({
            where: { id: task.id },
            data: { status: "pending" },
          });
        }
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
    const id = uuidv4();
    this.tasks.set(id, {
      ...input,
      id,
      status: "pending",
      attempts: 0,
    });
    logger.info("Task scheduled (in-memory)", {
      taskId: id,
      taskName: input.taskName,
    });
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
        logger.error("Task failed (in-memory)", {
          taskId: id,
          error: err instanceof Error ? err.message : "Unknown",
        });
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

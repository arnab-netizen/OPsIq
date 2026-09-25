/**
 * QuickBooks Online — immediate dispatch of already-enqueued sync tasks.
 *
 * Sync work is ALWAYS a durable ScheduledTask (claim/lease/retry/dead-letter
 * via DatabaseSchedulerProvider). The platform cron drains the queue only once
 * a day, so an owner's "Sync Now", the post-connect initial sync and signed
 * webhook notifications additionally drain their own task right after the
 * response is sent (Next.js `after()`), through the exact same scheduler path.
 *
 * A long initial sync is split by the sync service into continuation tasks;
 * this drains those continuations for the SAME workspace + connector while the
 * wall-clock budget allows. Anything left stays pending for the next drain
 * (next dispatch or cron) — work is never dropped.
 *
 * Never throws: it runs after the response, so failures are logged and remain
 * visible on the ScheduledTask row / connector sync state.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { logger } from "@/infra/logger";
import { TASK_NAME_QUICKBOOKS_SYNC } from "@/domain/quickbooks/qbo-contracts";

/** Kept below the route maxDuration (60s) so the function always ends normally. */
const DISPATCH_BUDGET_MS = 45_000;
const MAX_TASKS_PER_DISPATCH = 10;

export async function drainQuickBooksSyncTask(taskId: string, budgetMs: number = DISPATCH_BUDGET_MS): Promise<number> {
  const deadline = Date.now() + budgetMs;
  const scheduler = new DatabaseSchedulerProvider();
  const handlers = getProductionTaskHandlers();
  let processed = 0;

  try {
    const first = await db.scheduledTask.findUnique({
      where: { id: taskId },
      select: { id: true, taskName: true, workspaceId: true, payload: true },
    });
    if (!first || first.taskName !== TASK_NAME_QUICKBOOKS_SYNC || !first.workspaceId) return 0;
    const connectorId = (first.payload as { connectorId?: unknown } | null)?.connectorId;
    if (typeof connectorId !== "string") return 0;

    let nextId: string | null = first.id;
    while (nextId && processed < MAX_TASKS_PER_DISPATCH && Date.now() < deadline) {
      await scheduler.processTaskById(nextId, handlers);
      processed++;
      const next: { id: string } | null = await db.scheduledTask.findFirst({
        where: {
          taskName: TASK_NAME_QUICKBOOKS_SYNC,
          workspaceId: first.workspaceId,
          status: "pending",
          scheduledFor: { lte: new Date() },
          payload: { path: ["connectorId"], equals: connectorId },
        },
        orderBy: { scheduledFor: "asc" },
        select: { id: true },
      });
      nextId = next?.id ?? null;
    }
  } catch (err) {
    logger.error("QuickBooks sync dispatch failed (task remains queued for the next drain)", err, { taskId });
  }
  return processed;
}

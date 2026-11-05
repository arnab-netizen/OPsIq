/**
 * QuickBooks Online V1 — "start now" support for the owner-facing triggers (post-connect, Refresh now).
 *
 * The daily cron is the safety net, but an owner who just connected must not wait until tomorrow for their first figures.
 * The routes enqueue a normal `qbo-sync` task (so retries, dead-lettering, the task lease and audit all apply) and then ask the
 * SAME scheduler to run that one task immediately after the HTTP response (processTaskById). Multi-run passes (the 12-month
 * baseline) chain through their idempotent continuation tasks until the time budget is spent; whatever remains is picked up by
 * the next cron drain — correctness never depends on this function finishing.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { logger } from "@/infra/logger";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { toIsoDate } from "@/domain/quickbooks/qbo-report-model";
import { enqueueQboSync, qboSyncKey } from "./qbo-sync-scheduling";
import { TASK_NAME_FIRST_DIAGNOSIS } from "@/services/owner-first-run/first-diagnosis-scheduling";

export const QBO_BACKGROUND_BUDGET_MS = 50_000;
/** A further pass is started only if the slowest pass seen so far, times this factor, still fits inside the remaining budget. */
export const QBO_PASS_SAFETY_FACTOR = 1.5;

/** Enqueue (idempotently, 5-minute bucket) an owner/post-connect sync for one connection. */
export function requestQboSyncNow(input: { workspaceId: string; connectionId: string }, now: Date = new Date()) {
  return enqueueQboSync({ workspaceId: input.workspaceId, connectionId: input.connectionId, trigger: "OWNER", key: qboSyncKey(input.connectionId, "owner", now) });
}

export async function processQboSyncChain(
  input: { workspaceId: string; connectionId: string; taskId: string },
  opts: { budgetMs?: number; now?: () => Date; clock?: () => number } = {},
): Promise<{ ran: number }> {
  const scheduler = new DatabaseSchedulerProvider();
  const handlers = getProductionTaskHandlers();
  const clock = opts.clock ?? Date.now;
  const deadline = clock() + (opts.budgetMs ?? QBO_BACKGROUND_BUDGET_MS);
  let slowestPassMs = 0;
  let taskId = input.taskId;
  let ran = 0;
  try {
    for (let i = 0; i < 8 && clock() < deadline; i++) {
      const passStarted = clock();
      if (await scheduler.processTaskById(taskId, handlers)) ran++;
      slowestPassMs = Math.max(slowestPassMs, clock() - passStarted);
      const st = await db.qboSyncState.findFirst({
        where: { connectionId: input.connectionId, workspaceId: input.workspaceId },
        select: { baselineCursor: true, baselineCompletedAt: true },
      });
      if (!st?.baselineCursor) break;
      // The function is killed at maxDuration and a killed pass strands its task lease until the next cron drain. The handler has
      // already enqueued the durable continuation, so stopping here loses nothing: never START a pass that could not finish.
      if (clock() + slowestPassMs * QBO_PASS_SAFETY_FACTOR >= deadline) break;
      const kind = st.baselineCompletedAt === null ? "BASELINE" : "RECONCILE";
      const next = await enqueueQboSync({
        workspaceId: input.workspaceId, connectionId: input.connectionId, trigger: "CONTINUATION",
        key: qboSyncKey(input.connectionId, "cont", (opts.now ?? (() => new Date()))(), `${kind}:${toIsoDate(st.baselineCursor)}`),
      }, scheduler);
      if (next.taskId === taskId) break; // the same task cannot be re-run (it already finished or is held)
      taskId = next.taskId;
    }
    // The first read that those passes made possible. The daily cron would run it, but an owner who has closed the page must not wait
    // until tomorrow: ask the SAME scheduler to run the (already enqueued, keyed) first-read tasks of THIS connection's business now,
    // through exactly the claim/lease/retry path - never inline in the callback, and only while the time budget allows. Whatever is
    // left (or fails) is picked up by the next drain; correctness never depends on this.
    if (clock() < deadline) {
      const conn = await db.qboConnection.findFirst({ where: { id: input.connectionId, workspaceId: input.workspaceId }, select: { businessId: true } });
      if (conn) {
        const pending = await db.scheduledTask.findMany({
          where: { workspaceId: input.workspaceId, taskName: TASK_NAME_FIRST_DIAGNOSIS, status: "pending", idempotencyKey: { startsWith: `first-diagnosis:${conn.businessId}:` } },
          orderBy: { createdAt: "asc" },
          take: 3,
          select: { id: true },
        });
        for (const t of pending) {
          if (clock() >= deadline) break;
          await scheduler.processTaskById(t.id, handlers);
        }
      }
    }
  } catch (e) {
    // Best-effort accelerator only; the scheduler's retry and the daily cron own correctness. Never leak details.
    logger.warn("QuickBooks background sync chain stopped", { connectionId: input.connectionId, reason: e instanceof Error ? e.name : "unknown" });
  }
  return { ran };
}

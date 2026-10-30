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
  } catch (e) {
    // Best-effort accelerator only; the scheduler's retry and the daily cron own correctness. Never leak details.
    logger.warn("QuickBooks background sync chain stopped", { connectionId: input.connectionId, reason: e instanceof Error ? e.name : "unknown" });
  }
  return { ran };
}

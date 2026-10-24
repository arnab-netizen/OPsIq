/**
 * QuickBooks Online V1 — scheduler integration (reuses the ONE existing scheduler; no second scheduler).
 *
 *   producer   enqueueDueQboSyncTasks()   one idempotent task per ACTIVE connection per UTC day (+ any with a pending webhook)
 *   handler    qboSyncTaskHandler          runs ONE bounded sync chunk for the claimed task's workspace + connection
 *   triggers   enqueueQboSync()            webhook / owner / callback / continuation use the same task type and handler
 *
 * Two independent protections (each tested on its own): the scheduler's fenced task lease protects the TASK; the
 * per-connection advisory lock inside runQboSync protects the PROVIDER RESOURCE. Idempotency keys:
 *   daily          qbo-sync:<connection>:daily:<UTC day>
 *   webhook        qbo-sync:<connection>:wh:<arming instant>          (every event that arrives while the pending marker is armed
 *                  shares ONE task; an event arriving after a run claimed the marker re-arms it and gets its own task)
 *   wh follow-up   qbo-sync:<connection>:whc:<arming instant>         (a run finished and found the marker re-armed mid-run)
 *   owner / connect qbo-sync:<connection>:owner:<5-minute bucket>
 *   continuation   qbo-sync:<connection>:cont:<kind>:<UTC day>:<cursor>
 * A key identifies one logical task for the life of its row, so every generation embeds its own marker.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type HandlerResult, type TaskHandler } from "@/infra/scheduler";
import type { QboSyncTrigger } from "./qbo-sync.service";
import { runQboSync, type QboSyncDeps } from "./qbo-sync.service";

export const TASK_NAME_QBO_SYNC = "qbo-sync";

/** Connections read per page, and pages per producer invocation (5,000 connections). Beyond that the next invocation continues. */
export const QBO_PRODUCER_PAGE_SIZE = 200;
export const QBO_PRODUCER_MAX_PAGES = 25;

const MAX_ATTEMPTS = 3;

export type QboTaskKeyKind = "daily" | "wh" | "whc" | "owner" | "cont";

export function qboSyncKey(connectionId: string, kind: QboTaskKeyKind, now: Date, extra = ""): string {
  const day = now.toISOString().slice(0, 10);
  switch (kind) {
    case "daily": return `qbo-sync:${connectionId}:daily:${day}`;
    // `now` is the instant the pending marker was armed (not the wall clock): one arming <-> one task.
    case "wh": return `qbo-sync:${connectionId}:wh:${now.getTime()}`;
    case "whc": return `qbo-sync:${connectionId}:whc:${now.getTime()}`;
    case "owner": return `qbo-sync:${connectionId}:owner:${Math.floor(now.getTime() / 300_000)}`;
    case "cont": return `qbo-sync:${connectionId}:cont:${extra}:${day}`;
  }
}

export async function enqueueQboSync(
  input: { workspaceId: string; connectionId: string; trigger: QboSyncTrigger; key: string },
  scheduler: Pick<DatabaseSchedulerProvider, "scheduleIdempotent"> = new DatabaseSchedulerProvider(),
): Promise<{ taskId: string; created: boolean }> {
  const r = await scheduler.scheduleIdempotent({
    taskName: TASK_NAME_QBO_SYNC,
    payload: { connectionId: input.connectionId, trigger: input.trigger },
    scheduledFor: new Date(),
    maxAttempts: MAX_ATTEMPTS,
    workspaceId: input.workspaceId,
    idempotencyKey: input.key,
  });
  return { taskId: r.id, created: r.created };
}

export interface QboProducerResult {
  candidatesFound: number;
  enqueued: number;
  /** Connections whose daily task this invocation created (ids only). */
  enqueuedConnectionIds: string[];
}

export interface QboProducerLimits {
  pageSize?: number;
  maxPages?: number;
  /** Restrict the scan to these workspaces (operational / test scoping). Omitted in production: every active connection is considered. */
  workspaceIds?: string[];
}

/**
 * Enqueue today's daily task (and any pending-webhook task) for ACTIVE connections that do not have one yet.
 *
 * Termination and fairness: every page selects only connections whose task for this day / this marker does NOT yet exist, in id
 * order after the page cursor. A connection enqueued on an earlier invocation is therefore never selected again, so a day's
 * invocations make progress through ALL connections even when one invocation's page budget (pageSize x maxPages, 5,000 by
 * default) is smaller than the number of connections; nothing is starved behind a fixed window. The cursor strictly advances
 * within an invocation, so no connection repeats and the loop ends after at most `maxPages` selects plus one idempotent insert
 * per candidate. Each connection is its own task with its own retry / dead-letter, so one failing connection cannot block others.
 */
export async function enqueueDueQboSyncTasks(now: Date = new Date(), limits: QboProducerLimits = {}): Promise<QboProducerResult> {
  const pageSize = limits.pageSize ?? QBO_PRODUCER_PAGE_SIZE;
  const maxPages = limits.maxPages ?? QBO_PRODUCER_MAX_PAGES;
  const scheduler = new DatabaseSchedulerProvider();
  const scoped = limits.workspaceIds !== undefined;
  const scopeIds = limits.workspaceIds ?? [];
  const dailyKeyPrefix = (id: string) => qboSyncKey(id, "daily", now);
  const day = now.toISOString().slice(0, 10);
  let enqueued = 0;
  let found = 0;
  const enqueuedConnectionIds: string[] = [];

  let cursor = "00000000-0000-0000-0000-000000000000";
  for (let page = 0; page < maxPages; page++) {
    const batch = await db.$queryRaw<Array<{ id: string; workspace_id: string }>>`
      SELECT c.id, c.workspace_id
      FROM qbo_connections c
      WHERE c.status = 'ACTIVE' AND c.id > ${cursor}::uuid
        AND (${!scoped} OR c.workspace_id = ANY(${scopeIds}::uuid[]))
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_tasks t
          WHERE t.idempotency_key = 'qbo-sync:' || c.id::text || ':daily:' || ${day}
        )
      ORDER BY c.id
      LIMIT ${pageSize}
    `;
    if (batch.length === 0) break;
    for (const c of batch) {
      found++;
      const r = await enqueueQboSync({ workspaceId: c.workspace_id, connectionId: c.id, trigger: "SCHEDULED", key: dailyKeyPrefix(c.id) }, scheduler);
      if (r.created) {
        enqueued++;
        enqueuedConnectionIds.push(c.id);
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < pageSize) break;
  }

  // A webhook that armed the marker but whose task was never created (a crash between the two writes) is repaired here, with the
  // same progress guarantee: connections whose marker already has its task are not selected again.
  cursor = "00000000-0000-0000-0000-000000000000";
  for (let page = 0; page < maxPages; page++) {
    const batch = await db.$queryRaw<Array<{ id: string; workspace_id: string; armed: Date }>>`
      SELECT c.id, c.workspace_id, s.webhook_pending_at AS armed
      FROM qbo_connections c
      JOIN qbo_sync_state s ON s.connection_id = c.id
      WHERE c.status = 'ACTIVE' AND s.webhook_pending_at IS NOT NULL AND c.id > ${cursor}::uuid
        AND (${!scoped} OR c.workspace_id = ANY(${scopeIds}::uuid[]))
      ORDER BY c.id
      LIMIT ${pageSize}
    `;
    if (batch.length === 0) break;
    for (const c of batch) {
      const w = await enqueueQboSync({ workspaceId: c.workspace_id, connectionId: c.id, trigger: "WEBHOOK", key: qboSyncKey(c.id, "wh", c.armed) }, scheduler);
      if (w.created) enqueued++;
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < pageSize) break;
  }
  return { candidatesFound: found, enqueued, enqueuedConnectionIds };
}

/** Build the handler. Deps are injectable for tests; production passes process.env. */
/** Scheduler counters are flat numbers; per-reason detail stays in the sync state summary. */
function numericCounts(c: object): Record<string, number> {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === "number")) as Record<string, number>;
}

export function createQboSyncTaskHandler(makeDeps: () => QboSyncDeps): TaskHandler {
  return async (payload, context): Promise<HandlerResult> => {
    if (!context.workspaceId) throw new Error("qbo-sync task missing workspaceId — cannot enforce workspace isolation");
    const connectionId = payload?.connectionId;
    if (typeof connectionId !== "string" || !connectionId) throw new Error("qbo-sync task payload missing connectionId");
    const trigger = (["SCHEDULED", "WEBHOOK", "OWNER", "CONTINUATION"] as const).find((t) => t === payload?.trigger) ?? "SCHEDULED";

    const outcome = await runQboSync({ workspaceId: context.workspaceId, connectionId, trigger }, { ...makeDeps(), signal: context.signal });

    switch (outcome.status) {
      case "SYNCED": {
        const c = outcome.counts;
        if (outcome.moreWork && outcome.nextCursor) {
          await enqueueQboSync({
            workspaceId: context.workspaceId, connectionId, trigger: "CONTINUATION",
            key: qboSyncKey(connectionId, "cont", new Date(), `${outcome.kind}:${outcome.nextCursor}`),
          });
        }
        // A webhook that arrived DURING this run re-armed the pending marker after the run claimed it: its own task may have been
        // skipped (this run held the lock) or may never be created. Now that the lock is released, request one follow-up run.
        const pending = await db.qboSyncState.findFirst({
          where: { connectionId, workspaceId: context.workspaceId },
          select: { webhookPendingAt: true },
        });
        if (pending?.webhookPendingAt) {
          await enqueueQboSync({
            workspaceId: context.workspaceId, connectionId, trigger: "WEBHOOK",
            key: qboSyncKey(connectionId, "whc", pending.webhookPendingAt),
          });
        }
        return {
          status: "SUCCESS",
          summary: `${outcome.kind}: ${c.monthsCompleted}/${c.monthsPlanned} month(s); ${c.canonicalCreated + c.canonicalAmended + c.canonicalUpdated} canonical write(s); ${c.ownerControlled} owner-controlled; ${c.refused} refused.`,
          counts: numericCounts(c),
        };
      }
      case "SKIPPED":
        return { status: "NO_WORK", summary: `QuickBooks sync skipped: ${outcome.reason}.` };
      case "CANCELLED":
        return { status: "NO_WORK", summary: "QuickBooks sync stopped: task lease no longer held." };
      case "REAUTH_REQUIRED":
        // Terminal: retrying cannot help; the connection is REAUTH_REQUIRED and the owner is told on /owner/data.
        return { status: "FAILED", summary: "QuickBooks connection needs re-authorization." };
      case "FAILED":
        return { status: "FAILED", summary: `QuickBooks sync failed: ${outcome.code}.`, counts: numericCounts(outcome.counts) };
    }
  };
}

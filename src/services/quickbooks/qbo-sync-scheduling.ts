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
 *   webhook        qbo-sync:<connection>:wh:<10-minute bucket>        (a burst of events coalesces into one task)
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

export type QboTaskKeyKind = "daily" | "wh" | "owner" | "cont";

export function qboSyncKey(connectionId: string, kind: QboTaskKeyKind, now: Date, extra = ""): string {
  const day = now.toISOString().slice(0, 10);
  switch (kind) {
    case "daily": return `qbo-sync:${connectionId}:daily:${day}`;
    case "wh": return `qbo-sync:${connectionId}:wh:${Math.floor(now.getTime() / 600_000)}`;
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
}

/**
 * One task per ACTIVE connection per day. The scan pages through ALL active connections by id (keyset), so no connection can be
 * starved behind a fixed window (an earlier fixed-size scan ordered by an unchanging column would never reach connection #201).
 * Enqueueing is one idempotent insert, so re-scanning costs nothing; each connection is its own task with its own retry /
 * dead-letter, so one failing connection cannot starve or block the rest.
 */
export async function enqueueDueQboSyncTasks(now: Date = new Date()): Promise<QboProducerResult> {
  const scheduler = new DatabaseSchedulerProvider();
  let enqueued = 0;
  let found = 0;
  let cursor: string | undefined;
  for (let page = 0; page < QBO_PRODUCER_MAX_PAGES; page++) {
    const batch = (await db.qboConnection.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, workspaceId: true, syncState: { select: { webhookPendingAt: true } } },
      orderBy: { id: "asc" },
      take: QBO_PRODUCER_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })) as Array<{ id: string; workspaceId: string; syncState: { webhookPendingAt: Date | null } | null }>;
    if (batch.length === 0) break;
    for (const c of batch) {
      found++;
      const r = await enqueueQboSync({ workspaceId: c.workspaceId, connectionId: c.id, trigger: "SCHEDULED", key: qboSyncKey(c.id, "daily", now) }, scheduler);
      if (r.created) enqueued++;
      // A webhook that arrived but whose own task has not run (lost enqueue / earlier failure) is picked up here as well.
      if (c.syncState?.webhookPendingAt) {
        const w = await enqueueQboSync({ workspaceId: c.workspaceId, connectionId: c.id, trigger: "WEBHOOK", key: qboSyncKey(c.id, "wh", now) }, scheduler);
        if (w.created) enqueued++;
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < QBO_PRODUCER_PAGE_SIZE) break;
  }
  return { candidatesFound: found, enqueued };
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

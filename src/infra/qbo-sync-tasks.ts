/**
 * QuickBooks sync task identity and continuation enqueue (leaf module: imports only the scheduler provider, so the public webhook
 * route, the manual sync route and the producers can use it without pulling in the whole handler registry).
 */
import { DatabaseSchedulerProvider } from "@/infra/scheduler";

export const TASK_NAME_QBO_READ_SYNC = "qbo-read-sync";

/**
 * Enqueue the next bounded execution of an unfinished QuickBooks sync. One task per (connection, checkpoint sequence): the key is
 * idempotent, so repeated requests for the same key never create a second task. The producer's safety net adds a day suffix (a different key)
 * on purpose, so a spent or dead-lettered task cannot strand a checkpoint; the rare duplicate it can cause ends as BUSY/NOT_DUE. The task carries only the connection id (workspace comes from the task row).
 */
export async function enqueueQboSyncContinuation(input: { workspaceId: string; connectionId: string; continuationKey: string; dayBucket?: string }): Promise<boolean> {
  const r = await new DatabaseSchedulerProvider().scheduleIdempotent({
    taskName: TASK_NAME_QBO_READ_SYNC,
    payload: { connectionId: input.connectionId, trigger: "SCHEDULED" },
    scheduledFor: new Date(),
    maxAttempts: 2,
    workspaceId: input.workspaceId,
    idempotencyKey: `${TASK_NAME_QBO_READ_SYNC}:cont:${input.connectionId}:${input.continuationKey}${input.dayBucket ? `:${input.dayBucket}` : ""}`,
  });
  return r.created;
}

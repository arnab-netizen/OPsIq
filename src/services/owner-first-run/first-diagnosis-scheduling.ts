/**
 * Unattended first read through the ONE existing scheduler (no second scheduler, no engine).
 *
 *   producer  a successful canonical write (today: the QuickBooks sync task handler) calls enqueueFirstDiagnosis()
 *   handler   firstDiagnosisTaskHandler runs runFirstDiagnosisIfPending() under the scheduler's fenced lease, retries and dead-letter
 *
 * Nothing heavy runs in the OAuth callback or the webhook: they only start the sync task, exactly as before.
 *
 * Idempotency key: first-diagnosis:<business>:<instant of the pass that wrote the evidence>. A later pass gets its own task, so an
 * early "not enough evidence yet" task can never swallow the pass that finally makes it sufficient; and a task is cheap and
 * harmless when it finds nothing to do. The actor is never taken from the payload: it is re-read from the connection row.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type HandlerResult, type TaskHandler } from "@/infra/scheduler";
import { runFirstDiagnosisIfPending } from "./first-diagnosis.service";

export const TASK_NAME_FIRST_DIAGNOSIS = "owner-first-diagnosis";
const MAX_ATTEMPTS = 3;

export function firstDiagnosisKey(businessId: string, evidenceWrittenAt: Date): string {
  return `first-diagnosis:${businessId}:${evidenceWrittenAt.getTime()}`;
}

export async function enqueueFirstDiagnosis(
  input: { workspaceId: string; businessId: string; connectionId: string; evidenceWrittenAt: Date },
  scheduler: Pick<DatabaseSchedulerProvider, "scheduleIdempotent"> = new DatabaseSchedulerProvider(),
): Promise<{ taskId: string; created: boolean }> {
  const r = await scheduler.scheduleIdempotent({
    taskName: TASK_NAME_FIRST_DIAGNOSIS,
    payload: { connectionId: input.connectionId, businessId: input.businessId },
    scheduledFor: new Date(),
    maxAttempts: MAX_ATTEMPTS,
    workspaceId: input.workspaceId,
    idempotencyKey: firstDiagnosisKey(input.businessId, input.evidenceWrittenAt),
  });
  return { taskId: r.id, created: r.created };
}

export const firstDiagnosisTaskHandler: TaskHandler = async (payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) throw new Error("owner-first-diagnosis task missing workspaceId — cannot enforce workspace isolation");
  const connectionId = payload?.connectionId;
  const businessId = payload?.businessId;
  if (typeof connectionId !== "string" || typeof businessId !== "string") throw new Error("owner-first-diagnosis task payload incomplete");
  // The acting owner is the person who connected this business's books, verified against the stored connection (workspace +
  // business bound) - a payload can neither name another actor nor another tenant's business.
  const conn = await db.qboConnection.findFirst({ where: { id: connectionId, workspaceId: context.workspaceId, businessId }, select: { connectedById: true } });
  if (!conn) return { status: "NO_WORK", summary: "First read skipped: no matching connection for this business." };
  if (context.signal.aborted) return { status: "NO_WORK", summary: "First read stopped: task lease no longer held." };

  const out = await runFirstDiagnosisIfPending({ workspaceId: context.workspaceId, businessId, actorId: conn.connectedById });
  switch (out.status) {
    case "DIAGNOSED": return { status: "SUCCESS", summary: "First read created from the imported figures.", counts: { diagnosed: 1 } };
    case "NOT_PENDING": return { status: "NO_WORK", summary: `No first read needed (${out.state}).` };
    case "EVIDENCE_MOVED": return { status: "NO_WORK", summary: "Figures changed after an earlier read; the owner is asked to update it." };
  }
};

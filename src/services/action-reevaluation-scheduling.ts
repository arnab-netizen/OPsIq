/**
 * Deferred governed re-evaluation for a newly blocked action, through the ONE existing scheduler
 * (no second queue): idempotent task, fenced lease, bounded retry with backoff, dead-letter.
 *
 *   producer  updateAction / updateActionStatus, AFTER their write committed, when
 *             triggerReEvaluation refused with ReEvaluationInProgressError (another re-evaluation
 *             of the same engagement is running and may already have read the pre-block state)
 *   handler   actionBlockerReEvaluationHandler re-runs triggerReEvaluation for that action; if a
 *             re-evaluation is STILL in progress it throws, so the scheduler retries it later
 *
 * Idempotency key: action-blocker-reevaluation:<actionId>:<committed version> — one task per
 * committed block. The engagement is re-read from the action row in the CLAIMED task's workspace,
 * never taken from the payload.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider, type HandlerResult, type TaskHandler } from "@/infra/scheduler";
import { triggerReEvaluation, type SignificantChangeEvent } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";

export const TASK_NAME_ACTION_BLOCKER_REEVALUATION = "action-blocker-reevaluation";
const MAX_ATTEMPTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function actionBlockerReEvaluationKey(actionId: string, version: number): string {
  return `action-blocker-reevaluation:${actionId}:${version}`;
}

export function blockerReEvaluationEvent(args: {
  actionId: string;
  engagementId: string;
  workspaceId: string;
  actorId: string;
  title: string;
}): SignificantChangeEvent {
  return {
    changeType: "unresolved_critical_blocker",
    entityType: "action",
    entityId: args.actionId,
    engagementId: args.engagementId,
    workspaceId: args.workspaceId,
    severity: "high",
    description: `Action blocked: ${args.title || "action"}`,
    triggeredBy: args.actorId,
  };
}

export async function enqueueActionBlockerReEvaluation(
  input: { actionId: string; workspaceId: string; actorId: string; version: number },
  scheduler: Pick<DatabaseSchedulerProvider, "scheduleIdempotent"> = new DatabaseSchedulerProvider(),
): Promise<{ taskId: string; created: boolean }> {
  const r = await scheduler.scheduleIdempotent({
    taskName: TASK_NAME_ACTION_BLOCKER_REEVALUATION,
    payload: { actionId: input.actionId, actorId: input.actorId },
    scheduledFor: new Date(),
    maxAttempts: MAX_ATTEMPTS,
    workspaceId: input.workspaceId,
    idempotencyKey: actionBlockerReEvaluationKey(input.actionId, input.version),
  });
  logger.warn("Re-evaluation for a blocked action deferred (engagement re-evaluation already in progress)", {
    actionId: input.actionId,
    taskId: r.id,
    created: r.created,
  });
  return { taskId: r.id, created: r.created };
}

export const actionBlockerReEvaluationHandler: TaskHandler = async (payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) {
    throw new Error("action-blocker-reevaluation task missing workspaceId — cannot enforce workspace isolation");
  }
  const actionId = payload?.actionId;
  const actorId = payload?.actorId;
  if (typeof actionId !== "string" || !UUID.test(actionId) || typeof actorId !== "string" || !UUID.test(actorId)) {
    throw new Error("action-blocker-reevaluation task payload incomplete");
  }
  const action = await db.action.findFirst({
    where: { id: actionId, engagement: { workspaceId: context.workspaceId } },
    select: { id: true, engagementId: true, title: true, status: true },
  });
  if (!action) return { status: "NO_WORK", summary: "Re-evaluation skipped: the action no longer exists in this workspace." };
  if (context.signal.aborted) return { status: "NO_WORK", summary: "Re-evaluation stopped: task lease no longer held." };

  // A ReEvaluationInProgressError propagates: the scheduler retries with backoff, then dead-letters
  // (owner-visible) — the re-evaluation is never silently dropped.
  await triggerReEvaluation(
    blockerReEvaluationEvent({ actionId: action.id, engagementId: action.engagementId, workspaceId: context.workspaceId, actorId, title: action.title })
  );
  return { status: "SUCCESS", summary: "Engagement re-evaluated for a blocked action.", counts: { reEvaluated: 1 } };
};

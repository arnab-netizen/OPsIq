/**
 * P0-08 — Canonical production task-handler registry.
 *
 * Every taskName a producer can enqueue MUST have exactly one entry here.
 * processDue() (src/infra/scheduler.ts) fails an unclaimed-handler task
 * closed (bounded retry, then dead-letter — never silent infinite pending),
 * so an entry missing from this map is a real, owner-visible defect, not a
 * silent no-op.
 *
 * Handlers receive `context.workspaceId` from the CLAIMED task row itself
 * (never from payload) and must use it — not any workspaceId that might
 * appear inside payload — for workspace isolation.
 */
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { reconcileMissingFinanceLearningSignals } from "@/services/owner-finance/learning-bridge.service";
import { scanDueReassessments } from "@/services/owner-budget/due-reassessment.service";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";
import { scanOverdueRiskAlertsForWorkspace } from "@/services/owner-mode/business-risk.service";
import { runScheduledQboSync } from "@/services/quickbooks/qbo-sync.service";
import { DatabaseSchedulerProvider, type TaskHandler, type HandlerResult } from "@/infra/scheduler";

export const TASK_NAME_ALERT_EMAIL_RETRY = "alert-email-retry";
export const TASK_NAME_FINANCE_LEARNING_BRIDGE = "finance-learning-bridge";
export const TASK_NAME_REASSESSMENT_SCAN = "reassessment-scan";
export const TASK_NAME_RISK_REVIEW_SCAN = "risk-review-scan";
export const TASK_NAME_QBO_READ_SYNC = "qbo-read-sync";
/** A scheduled QuickBooks execution stops at its checkpoint after this long (the follow-up continues it), well inside the cron function ceiling. */
export const QBO_SCHEDULED_EXECUTION_DEADLINE_MS = 120_000;

/**
 * retryEmailAlert() never throws for a normal delivery outcome (it returns
 * SENT/FAILED/SKIPPED/ALREADY_TERMINAL and owns its own attempt-count/audit
 * trail on the Alert row). A thrown NotFoundError/ConflictError here means
 * the producer enqueued a stale/invalid alertId, a genuine task-level defect
 * the scheduler's own retry/dead-letter path should govern.
 *
 * F-SCHED-FALSE-SUCCESS fix: a resolved Promise is not evidence of business
 * success. FAILED is returned as PARTIAL_FAILURE — not lost (the Alert row's
 * own emailDeliveryStatus/emailError durably records it independent of this
 * ScheduledTask), but now also owner-visible on /owner/automation rather than
 * only discoverable by reading the Alert record directly.
 *
 * F-AUDIT-CRON-ACTOR fix: previously passed the now-removed CRON_ACTOR_ID
 * sentinel ("00000000-…-0001"), which never corresponded to a real `users`
 * row and defaulted emitAuditEvent's actorType to "user", raising
 * audit_events_actor_id_fkey on every call. Now passes SCHEDULER_SYSTEM_ACTOR
 * (the same canonical sentinel reassessment-scan already uses), and
 * retryEmailAlert()'s own emitAuditEvent calls route it through
 * toAuditActor() to the correct {actorType:"system"}/NULL-actorId
 * representation.
 */
const alertEmailRetryHandler: TaskHandler = async (payload, context): Promise<HandlerResult> => {
  const alertId = payload?.alertId;
  if (typeof alertId !== "string" || !alertId) {
    throw new Error("alert-email-retry task payload missing alertId");
  }
  if (!context.workspaceId) {
    throw new Error("alert-email-retry task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await retryEmailAlert(alertId, context.workspaceId, SCHEDULER_SYSTEM_ACTOR);
  if (result.status === "FAILED") {
    return {
      status: "PARTIAL_FAILURE",
      summary: `Alert ${alertId} email delivery failed (attempt ${result.attemptCount}): ${result.message ?? "no message"}`,
      counts: { failed: 1 },
    };
  }
  return { status: "SUCCESS" };
};

/**
 * reconcileMissingFinanceLearningSignals() never throws — it collects
 * per-verification errors internally and returns them in `errors[]`,
 * exactly mirroring the previous inline cron-route sweep's behavior (a
 * partial per-workspace failure does not abort the tick; any verification
 * still gapped after this run is naturally picked up by the next day's
 * producer scan, since the gap query is state-driven, not queue-driven).
 *
 * F-SCHED-FALSE-SUCCESS fix: errors[] is now read, not discarded. A
 * non-empty errors[] means the SEC-005-governed finance learning pipeline
 * has an item that did not bridge — this must be visible, not silently
 * absorbed into an undifferentiated "completed".
 *
 * F-AUDIT-CRON-ACTOR fix: see alertEmailRetryHandler's doc comment above —
 * identical fix, now passes SCHEDULER_SYSTEM_ACTOR instead of the removed
 * CRON_ACTOR_ID sentinel.
 */
const financeLearningBridgeHandler: TaskHandler = async (_payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) {
    throw new Error("finance-learning-bridge task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await reconcileMissingFinanceLearningSignals(context.workspaceId, SCHEDULER_SYSTEM_ACTOR);
  if (result.errors.length > 0) {
    return {
      status: "PARTIAL_FAILURE",
      summary: `${result.errors.length} of ${result.gapsFound} finance-learning-bridge gap(s) failed to bridge: ${result.errors.slice(0, 3).join("; ")}${result.errors.length > 3 ? ` (+${result.errors.length - 3} more)` : ""}`,
      counts: { gapsFound: result.gapsFound, gapsBridged: result.gapsBridged, gapsSkipped: result.gapsSkipped, errors: result.errors.length },
    };
  }
  if (result.gapsFound === 0) return { status: "NO_WORK" };
  return { status: "SUCCESS", counts: { gapsFound: result.gapsFound, gapsBridged: result.gapsBridged } };
};

/**
 * P0-09 — governed re-evaluation: overdue, still-open budget actions.
 *
 * Uses SCHEDULER_SYSTEM_ACTOR, correctly represented as a NULL/"system"
 * audit actor by toAuditActor() (src/domain/owner-budget/system-actor.ts)
 * throughout the reassessBudget call graph — the same canonical system-actor
 * sentinel the other two handlers above now also use (F-AUDIT-CRON-ACTOR).
 * scanDueReassessments never throws for a business-level failure — it
 * isolates and reports each business's outcome in its own result array.
 *
 * F-SCHED-FALSE-SUCCESS fix: a per-business ok:false is now read, not
 * discarded. Without this, a business whose reassessment deterministically
 * fails would be silently re-attempted every day forever with the
 * ScheduledTask reporting "completed" each time — exactly the false-success
 * pattern this fix closes. A thrown error here (the scan's own DB read
 * failing) is still a task-level defect the scheduler's retry/dead-letter
 * path should govern, unchanged.
 */
const reassessmentScanHandler: TaskHandler = async (_payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) {
    throw new Error("reassessment-scan task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await scanDueReassessments(new Date(), { actorId: SCHEDULER_SYSTEM_ACTOR, workspaceId: context.workspaceId });
  if (result.skipped > 0) {
    const failedBusinessIds = result.businesses.filter((b) => !b.ok).map((b) => b.businessId);
    return {
      status: "PARTIAL_FAILURE",
      summary: `${result.skipped} of ${result.scanned} due business reassessment(s) failed: ${failedBusinessIds.slice(0, 5).join(", ")}${failedBusinessIds.length > 5 ? ` (+${failedBusinessIds.length - 5} more)` : ""}`,
      counts: { scanned: result.scanned, reassessed: result.reassessed, skipped: result.skipped },
    };
  }
  if (result.scanned === 0) return { status: "NO_WORK" };
  return { status: "SUCCESS", counts: { scanned: result.scanned, reassessed: result.reassessed } };
};

/**
 * Overdue risk reviews: raise/resolve "Risk review overdue" alerts for one workspace. A risk becomes
 * overdue by time passing, so this is the explicit process for it (never a read path — the owner Now
 * View GET writes nothing). Alerts go to the workspace's active owner; resolutions are system events.
 */
function scanCounts(r: { attempted: number; created: number; reactivated: number; alreadyActive: number; resolved: number }): string {
  return `${r.attempted} overdue risk(s) checked: ${r.created} alert(s) created, ${r.reactivated} reactivated, ${r.alreadyActive} already active; ${r.resolved} resolved`;
}

const riskReviewScanHandler: TaskHandler = async (_payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) {
    throw new Error("risk-review-scan task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await scanOverdueRiskAlertsForWorkspace(context.workspaceId, new Date());
  if (!result.recipientFound) {
    return { status: "PARTIAL_FAILURE", summary: "No active workspace owner to receive overdue risk review alerts." };
  }
  // A failed alert is never reported as a successful scan.
  if (result.failed > 0) {
    return {
      status: "PARTIAL_FAILURE",
      summary: `${result.failed} risk alert(s) could not be raised or resolved (${scanCounts(result)}).`,
    };
  }
  return { status: "SUCCESS", summary: scanCounts(result) };
};

/**
 * Enqueue the next bounded execution of an unfinished QuickBooks sync. One task per (connection, checkpoint sequence): the key is
 * idempotent, so the handler, the manual route and the producer safety net can all request it without ever creating a second
 * task for the same checkpoint. The task carries only the connection id (workspace comes from the task row).
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

/** The one production handler registry — pass to processDue() unmodified. */
/**
 * qbo-read-sync — READ-ONLY QuickBooks synchronization for one connection.
 *
 * The workspace comes from the claimed task row (context.workspaceId); the payload carries only the connection id and
 * the business is recovered from the connection row. The sync owns its own lease, idempotency and back-off, so every
 * outcome — including failures — completes the task: returning FAILED here would add a SECOND retry loop on top of the
 * sync's bounded back-off (and a terminal failure such as REAUTH_REQUIRED must never be retried at all). A failed sync is
 * reported as PARTIAL_FAILURE so it stays owner-visible on /owner/automation without being re-run.
 */
const qboReadSyncHandler: TaskHandler = async (payload, context): Promise<HandlerResult> => {
  const connectionId = payload?.connectionId;
  const trigger = payload?.trigger === "WEBHOOK" ? "WEBHOOK" : "SCHEDULED";
  if (typeof connectionId !== "string" || !connectionId) {
    throw new Error("qbo-read-sync task payload missing connectionId");
  }
  if (!context.workspaceId) {
    throw new Error("qbo-read-sync task missing workspaceId — cannot enforce workspace isolation");
  }
  const outcome = await runScheduledQboSync({ workspaceId: context.workspaceId, connectionId, trigger }, { env: process.env, signal: context.signal, deadlineMs: QBO_SCHEDULED_EXECUTION_DEADLINE_MS });
  switch (outcome.status) {
    case "SUCCEEDED":
      return { status: "SUCCESS", counts: { inserted: outcome.counts.inserted, updated: outcome.counts.updated, unchanged: outcome.counts.unchanged, reportsStored: outcome.counts.reportsStored } };
    case "CONTINUING":
      // A bounded execution reached its checkpoint: the sync is healthy and unfinished. Queue the next execution (idempotent per checkpoint).
      await enqueueQboSyncContinuation({ workspaceId: context.workspaceId, connectionId, continuationKey: outcome.continuationKey });
      return { status: "SUCCESS", summary: "QuickBooks sync continues in a follow-up run.", counts: { inserted: outcome.counts.inserted, updated: outcome.counts.updated, unchanged: outcome.counts.unchanged } };
    case "FAILED":
      return { status: "PARTIAL_FAILURE", summary: `QuickBooks sync did not complete (${outcome.code}).`, counts: { failed: 1 } };
    default:
      return { status: "NO_WORK", summary: `QuickBooks sync skipped (${outcome.status}).` };
  }
};

export function getProductionTaskHandlers(): Map<string, TaskHandler> {
  return new Map<string, TaskHandler>([
    [TASK_NAME_ALERT_EMAIL_RETRY, alertEmailRetryHandler],
    [TASK_NAME_FINANCE_LEARNING_BRIDGE, financeLearningBridgeHandler],
    [TASK_NAME_REASSESSMENT_SCAN, reassessmentScanHandler],
    [TASK_NAME_RISK_REVIEW_SCAN, riskReviewScanHandler],
    [TASK_NAME_QBO_READ_SYNC, qboReadSyncHandler],
  ]);
}

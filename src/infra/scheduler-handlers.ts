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
import type { TaskHandler, HandlerResult } from "@/infra/scheduler";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { reconcileMissingFinanceLearningSignals } from "@/services/owner-finance/learning-bridge.service";
import { scanDueReassessments } from "@/services/owner-budget/due-reassessment.service";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";

/**
 * System actor identity for domain calls made from a scheduled-task handler.
 * Preserves EXACT parity with the actorId the previous inline cron-route
 * sweeps already passed to these same functions (route.ts's CRON_ACTOR_ID) —
 * "existing semantics preserved" per the P0-08 migration requirement.
 *
 * Known pre-existing gap (NOT introduced or fixed here — out of this PR's
 * root-cause scope): this UUID has never corresponded to a real `users` row
 * (see src/__tests__/stage8/private-owner-seed-audit-actor.db.test.ts, which
 * uses this exact value as its canonical known-nonexistent fixture for
 * proving the audit_events_actor_id_fkey FK constraint). retryEmailAlert()'s
 * and bridgeVerificationToLearning()'s own emitAuditEvent() calls using this
 * actorId may therefore already be failing their FK check silently (several
 * are wrapped in `.catch(() => {})`, one is not and is caught one level up
 * by reconcileMissingFinanceLearningSignals()'s per-item try/catch) — this
 * predates and is independent of the scheduler migration; the underlying
 * domain writes (Alert/OwnerFinanceOutcomeSignal) are unaffected either way.
 */
const CRON_ACTOR_ID = "00000000-0000-0000-0000-000000000001";

export const TASK_NAME_ALERT_EMAIL_RETRY = "alert-email-retry";
export const TASK_NAME_FINANCE_LEARNING_BRIDGE = "finance-learning-bridge";
export const TASK_NAME_REASSESSMENT_SCAN = "reassessment-scan";

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
 */
const alertEmailRetryHandler: TaskHandler = async (payload, context): Promise<HandlerResult> => {
  const alertId = payload?.alertId;
  if (typeof alertId !== "string" || !alertId) {
    throw new Error("alert-email-retry task payload missing alertId");
  }
  if (!context.workspaceId) {
    throw new Error("alert-email-retry task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await retryEmailAlert(alertId, context.workspaceId, CRON_ACTOR_ID);
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
 */
const financeLearningBridgeHandler: TaskHandler = async (_payload, context): Promise<HandlerResult> => {
  if (!context.workspaceId) {
    throw new Error("finance-learning-bridge task missing workspaceId — cannot enforce workspace isolation");
  }
  const result = await reconcileMissingFinanceLearningSignals(context.workspaceId, CRON_ACTOR_ID);
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
 * Uses SCHEDULER_SYSTEM_ACTOR (not CRON_ACTOR_ID): scanDueReassessments's own
 * default actor, correctly represented as a NULL/"system" audit actor by
 * toAuditActor() (src/domain/owner-budget/system-actor.ts) throughout the
 * reassessBudget call graph — the valid system/null actor model, not the
 * pre-existing known-invalid CRON_ACTOR_ID sentinel (see that constant's own
 * doc comment above). scanDueReassessments never throws for a business-level
 * failure — it isolates and reports each business's outcome in its own
 * result array.
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

/** The one production handler registry — pass to processDue() unmodified. */
export function getProductionTaskHandlers(): Map<string, TaskHandler> {
  return new Map<string, TaskHandler>([
    [TASK_NAME_ALERT_EMAIL_RETRY, alertEmailRetryHandler],
    [TASK_NAME_FINANCE_LEARNING_BRIDGE, financeLearningBridgeHandler],
    [TASK_NAME_REASSESSMENT_SCAN, reassessmentScanHandler],
  ]);
}

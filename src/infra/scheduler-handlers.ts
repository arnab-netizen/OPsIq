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
import type { TaskHandler } from "@/infra/scheduler";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { reconcileMissingFinanceLearningSignals } from "@/services/owner-finance/learning-bridge.service";

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

/**
 * retryEmailAlert() never throws for a normal delivery outcome (it returns
 * SENT/FAILED/SKIPPED/ALREADY_TERMINAL and owns its own attempt-count/audit
 * trail on the Alert row) — so this handler completes the ScheduledTask
 * regardless of email outcome. A thrown NotFoundError/ConflictError here
 * means the producer enqueued a stale/invalid alertId, a genuine task-level
 * defect the scheduler's own retry/dead-letter path should govern.
 */
const alertEmailRetryHandler: TaskHandler = async (payload, context) => {
  const alertId = payload?.alertId;
  if (typeof alertId !== "string" || !alertId) {
    throw new Error("alert-email-retry task payload missing alertId");
  }
  if (!context.workspaceId) {
    throw new Error("alert-email-retry task missing workspaceId — cannot enforce workspace isolation");
  }
  await retryEmailAlert(alertId, context.workspaceId, CRON_ACTOR_ID);
};

/**
 * reconcileMissingFinanceLearningSignals() never throws — it collects
 * per-verification errors internally and returns them in `errors[]`,
 * exactly mirroring the previous inline cron-route sweep's behavior (a
 * partial per-workspace failure does not abort the tick; any verification
 * still gapped after this run is naturally picked up by the next day's
 * producer scan, since the gap query is state-driven, not queue-driven).
 */
const financeLearningBridgeHandler: TaskHandler = async (_payload, context) => {
  if (!context.workspaceId) {
    throw new Error("finance-learning-bridge task missing workspaceId — cannot enforce workspace isolation");
  }
  await reconcileMissingFinanceLearningSignals(context.workspaceId, CRON_ACTOR_ID);
};

/** The one production handler registry — pass to processDue() unmodified. */
export function getProductionTaskHandlers(): Map<string, TaskHandler> {
  return new Map<string, TaskHandler>([
    [TASK_NAME_ALERT_EMAIL_RETRY, alertEmailRetryHandler],
    [TASK_NAME_FINANCE_LEARNING_BRIDGE, financeLearningBridgeHandler],
  ]);
}

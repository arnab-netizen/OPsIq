/**
 * P0-08 — Canonical production task producers.
 *
 * A scheduler with no producers dispatches nothing (the defect P0-08
 * closes). Each producer here scans the domain state that already defines
 * "there is outstanding work" (Alert.emailDeliveryStatus,
 * OwnerFinanceVerification.outcomeSignal) and enqueues a canonical
 * ScheduledTask for each gap found, so processDue() — with the real handler
 * registry (src/infra/scheduler-handlers.ts) — is the single execution path
 * for both jobs, replacing the two previously-inline, independently-retried
 * cron-route sweeps.
 *
 * Idempotency-key design note: ScheduledTask.idempotencyKey carries a HARD
 * database unique constraint, so a key must never be reused across two
 * logically-different pieces of work — including the SAME entity's next
 * legitimate attempt after a prior task for it has already reached a
 * terminal state. Both keys below embed a value that changes between
 * logically-distinct attempts (the alert's own attempt counter; a
 * day-bucket for the workspace-level finance sweep), so a fresh attempt
 * always gets a fresh key instead of being silently blocked forever by an
 * already-completed row occupying the same key.
 *
 * Uses DatabaseSchedulerProvider directly, NOT getScheduler(): the latter is
 * an env-configurable singleton (SCHEDULER_PROVIDER, defaulting to
 * "in-memory" per src/lib/config.ts and .env.example, set explicitly nowhere
 * in this repo's CI workflows or vercel.json) whose in-memory implementation
 * stores tasks in a process-local Map that vanishes with the process — a
 * durable producer enqueuing into it would silently produce nothing durable
 * at all. The cron route's own drain side already avoids this exact trap by
 * instantiating DatabaseSchedulerProvider explicitly; producers must match.
 */
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { TASK_NAME_ALERT_EMAIL_RETRY, TASK_NAME_FINANCE_LEARNING_BRIDGE, TASK_NAME_REASSESSMENT_SCAN, TASK_NAME_RISK_REVIEW_SCAN } from "@/infra/scheduler-handlers";
import { TASK_NAME_QBO_READ_SYNC, enqueueQboSyncContinuation } from "@/infra/qbo-sync-tasks";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import { scheduleBucket } from "@/domain/quickbooks/qbo-sync-model";
import { listSchedulableConnections } from "@/services/quickbooks/qbo-sync-store.service";
import { OPEN_BUDGET_ACTION_STATUSES } from "@/domain/owner-budget/action-mapping";

const EMAIL_MAX_ATTEMPTS = 3;
const BRIDGEABLE_STATUSES = ["verified_improved", "verified_not_improved", "disputed"] as const;

/** Bound on how many gaps one producer scan enqueues per invocation. */
const MAX_ENQUEUE_PER_SCAN = 200;
/** QuickBooks producer: pages of MAX_ENQUEUE_PER_SCAN scanned per invocation. */
const QBO_MAX_PRODUCER_PAGES = 10;

export interface ProducerScanResult {
  candidatesFound: number;
  enqueued: number;
}

/**
 * Enqueue one alert-email-retry ScheduledTask per currently-retriable alert
 * that does not already have an outstanding (pending/running) task for its
 * current attempt generation.
 */
export async function enqueueDueEmailRetryTasks(): Promise<ProducerScanResult> {
  const scheduler = new DatabaseSchedulerProvider();

  const retriable = await db.alert.findMany({
    where: {
      emailDeliveryStatus: "FAILED",
      emailAttemptCount: { lt: EMAIL_MAX_ATTEMPTS },
    },
    select: { id: true, workspaceId: true, emailAttemptCount: true },
    take: MAX_ENQUEUE_PER_SCAN,
    orderBy: { emailLastAttemptAt: "asc" },
  });

  let enqueued = 0;
  for (const alert of retriable) {
    await scheduler.schedule({
      taskName: TASK_NAME_ALERT_EMAIL_RETRY,
      payload: { alertId: alert.id },
      scheduledFor: new Date(),
      maxAttempts: 3,
      workspaceId: alert.workspaceId,
      idempotencyKey: `${TASK_NAME_ALERT_EMAIL_RETRY}:${alert.id}:${alert.emailAttemptCount}`,
    });
    enqueued++;
  }

  return { candidatesFound: retriable.length, enqueued };
}

/**
 * Enqueue one finance-learning-bridge ScheduledTask per workspace that
 * currently has at least one un-bridged OwnerFinanceVerification, scoped to
 * today (UTC) so a bridge attempt exhausting itself does not permanently
 * occupy the idempotency key — a fresh gap tomorrow gets a fresh key.
 */
export async function enqueueDueFinanceLearningBridgeTasks(): Promise<ProducerScanResult> {
  const scheduler = new DatabaseSchedulerProvider();

  const gapWorkspaces = await db.ownerFinanceVerification.findMany({
    where: {
      status: { in: [...BRIDGEABLE_STATUSES] },
      outcomeSignal: null,
    },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    take: MAX_ENQUEUE_PER_SCAN,
  });

  const dayBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  let enqueued = 0;
  for (const { workspaceId } of gapWorkspaces) {
    await scheduler.schedule({
      taskName: TASK_NAME_FINANCE_LEARNING_BRIDGE,
      scheduledFor: new Date(),
      maxAttempts: 3,
      workspaceId,
      idempotencyKey: `${TASK_NAME_FINANCE_LEARNING_BRIDGE}:${workspaceId}:${dayBucket}`,
    });
    enqueued++;
  }

  return { candidatesFound: gapWorkspaces.length, enqueued };
}

/**
 * P0-09 — enqueue one reassessment-scan ScheduledTask per workspace that
 * currently has at least one overdue, still-open OwnerBudgetAction. Scoped
 * to the day bucket for the same reason as the finance-bridge producer above:
 * a fresh gap tomorrow gets a fresh idempotency key rather than being
 * permanently blocked by a terminal row from today's attempt. The handler
 * (src/infra/scheduler-handlers.ts) re-scopes scanDueReassessments to this
 * one workspace via the task's own claimed workspaceId — never from payload.
 */
export async function enqueueDueReassessmentScanTasks(): Promise<ProducerScanResult> {
  const scheduler = new DatabaseSchedulerProvider();
  const now = new Date();

  const dueWorkspaces = await db.ownerBudgetAction.findMany({
    where: { dueAt: { not: null, lte: now }, status: { in: Array.from(OPEN_BUDGET_ACTION_STATUSES) } },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    take: MAX_ENQUEUE_PER_SCAN,
  });

  const dayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  let enqueued = 0;
  for (const { workspaceId } of dueWorkspaces) {
    await scheduler.schedule({
      taskName: TASK_NAME_REASSESSMENT_SCAN,
      scheduledFor: now,
      maxAttempts: 3,
      workspaceId,
      idempotencyKey: `${TASK_NAME_REASSESSMENT_SCAN}:${workspaceId}:${dayBucket}`,
    });
    enqueued++;
  }

  return { candidatesFound: dueWorkspaces.length, enqueued };
}

/**
 * Enqueue one risk-review-scan per workspace that has an open, overdue, non-fixture risk, or an
 * unresolved "Risk review overdue" alert (whose risk may since have been resolved). Day-bucketed
 * idempotency key, as above. The handler re-scopes to the task's own claimed workspaceId.
 */
export async function enqueueDueRiskReviewScanTasks(): Promise<ProducerScanResult> {
  const scheduler = new DatabaseSchedulerProvider();
  const now = new Date();

  const [overdue, openAlerts] = await Promise.all([
    db.businessRiskEntry.findMany({
      where: { reviewDueDate: { lt: now }, status: { notIn: ["RESOLVED", "CLOSED"] }, isFixtureRecord: false },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
      take: MAX_ENQUEUE_PER_SCAN,
    }),
    db.alert.findMany({
      where: { idempotencyKey: { startsWith: "risk_overdue_" }, resolvedAt: null },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
      take: MAX_ENQUEUE_PER_SCAN,
    }),
  ]);
  const workspaceIds = [...new Set([...overdue, ...openAlerts].map((r: { workspaceId: string }) => r.workspaceId))].slice(0, MAX_ENQUEUE_PER_SCAN);

  const dayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  let enqueued = 0;
  for (const workspaceId of workspaceIds) {
    await scheduler.schedule({
      taskName: TASK_NAME_RISK_REVIEW_SCAN,
      scheduledFor: now,
      maxAttempts: 3,
      workspaceId,
      idempotencyKey: `${TASK_NAME_RISK_REVIEW_SCAN}:${workspaceId}:${dayBucket}`,
    });
    enqueued++;
  }

  return { candidatesFound: workspaceIds.length, enqueued };
}

/**
 * Enqueue one qbo-read-sync task per ACTIVE QuickBooks connection that is eligible now: configured environment only, no
 * live sync lease, and outside any back-off window (reauth-required / disconnected connections are not ACTIVE and never
 * listed, so a dead grant is not hammered). Cadence: ONE task per connection per UTC day — the key embeds the day bucket,
 * matching the daily scheduler cron — and registration is idempotent (scheduleIdempotent replays the key). The task
 * carries only the connection id; the handler recovers workspace from the claimed row and business from the connection.
 */
export async function enqueueDueQboReadSyncTasks(env: Record<string, string | undefined> = process.env): Promise<ProducerScanResult> {
  const resolved = resolveQboConfig(env);
  if (!resolved.available) return { candidatesFound: 0, enqueued: 0 };
  const scheduler = new DatabaseSchedulerProvider();
  const now = new Date();
  const bucket = scheduleBucket(now);
  // Page through ALL eligible connections (bounded: 10 pages x 200). A single fixed "first 200" would starve every connection
  // beyond it, because enqueued connections stay eligible until their sync actually runs.
  let candidatesFound = 0;
  let enqueued = 0;
  for (let page = 0; page < QBO_MAX_PRODUCER_PAGES; page++) {
    const candidates = await listSchedulableConnections({ environment: resolved.config.environment, limit: MAX_ENQUEUE_PER_SCAN, offset: page * MAX_ENQUEUE_PER_SCAN });
    candidatesFound += candidates.length;
    for (const c of candidates) {
      // An unfinished sync (durable checkpoint) is continued under a key tied to its checkpoint, not to the day: the safety net for
      // a continuation task that was lost, without ever stacking a second task on the same checkpoint.
      const created = c.continuationKey !== null
        ? await enqueueQboSyncContinuation({ workspaceId: c.workspaceId, connectionId: c.connectionId, continuationKey: c.continuationKey, dayBucket: bucket })
        : (await scheduler.scheduleIdempotent({
            taskName: TASK_NAME_QBO_READ_SYNC,
            payload: { connectionId: c.connectionId, trigger: "SCHEDULED" },
            scheduledFor: now,
            maxAttempts: 2,
            workspaceId: c.workspaceId,
            idempotencyKey: `${TASK_NAME_QBO_READ_SYNC}:${c.connectionId}:${bucket}`,
          })).created;
      if (created) enqueued++;
    }
    if (candidates.length < MAX_ENQUEUE_PER_SCAN) break;
  }
  return { candidatesFound, enqueued };
}

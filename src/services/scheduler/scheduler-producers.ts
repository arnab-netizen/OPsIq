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
import { TASK_NAME_ALERT_EMAIL_RETRY, TASK_NAME_FINANCE_LEARNING_BRIDGE } from "@/infra/scheduler-handlers";

const EMAIL_MAX_ATTEMPTS = 3;
const BRIDGEABLE_STATUSES = ["verified_improved", "verified_not_improved", "disputed"] as const;

/** Bound on how many gaps one producer scan enqueues per invocation. */
const MAX_ENQUEUE_PER_SCAN = 200;

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

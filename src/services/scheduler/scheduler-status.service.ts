/**
 * P0-08 — Owner-facing scheduler health.
 *
 * Read-only: reports this workspace's own ScheduledTask state so an owner
 * can see automation health (pending/running/retrying/dead-letter/last
 * success) without needing Vercel logs. Workspace-scoped by construction —
 * every query below is filtered on the caller-verified workspaceId, so one
 * workspace can never see another's task rows.
 */
import { db } from "@/lib/db";

export interface SchedulerStatusSummary {
  pending: number;
  running: number;
  deadLetter: number;
  /** Tasks a handler explicitly finalized as terminally failed (never retried) — distinct from
   *  dead_letter, which means retries were exhausted. */
  terminalFailure: number;
  /** F-SCHED-FALSE-SUCCESS: count of tasks whose handler resolved but
   *  reported its own domain-level work as partially failed — distinct from
   *  a full "completed" so the owner can tell the two apart. */
  partialFailure: number;
  lastSuccess: { taskName: string; completedAt: string } | null;
  recentDeadLetters: Array<{
    id: string;
    taskName: string;
    lastError: string | null;
    attempts: number;
    maxAttempts: number;
    updatedAt: string;
  }>;
  recentTerminalFailures: Array<{
    id: string;
    taskName: string;
    lastError: string | null;
    updatedAt: string;
  }>;
  /** Most recent tasks that completed with a truthfully-reported partial
   *  failure — `lastError` here carries the handler's own summary, not a
   *  scheduler-level error (the task did not throw). */
  recentPartialFailures: Array<{
    id: string;
    taskName: string;
    lastError: string | null;
    updatedAt: string;
  }>;
  nextScheduled: { taskName: string; scheduledFor: string } | null;
}

/**
 * Explicit row shape for the dead-letter select below. `db` (src/lib/db.ts)
 * is exported as an untyped Proxy, so a query result's map() callback
 * parameter would otherwise be implicitly `any` under strict TypeScript.
 */
interface DeadLetterRow {
  id: string;
  taskName: string;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  updatedAt: Date;
}

interface PartialFailureRow {
  id: string;
  taskName: string;
  lastError: string | null;
  updatedAt: Date;
}

const RECENT_DEAD_LETTER_LIMIT = 10;
const RECENT_PARTIAL_FAILURE_LIMIT = 10;
const RECENT_TERMINAL_FAILURE_LIMIT = 10;

export async function getSchedulerStatusForWorkspace(
  workspaceId: string
): Promise<SchedulerStatusSummary> {
  const [pending, running, deadLetter, terminalFailure, partialFailure, lastSuccess, recentDeadLetters, recentTerminalFailures, recentPartialFailures, nextScheduled] =
    await Promise.all([
      db.scheduledTask.count({ where: { workspaceId, status: "pending" } }),
      db.scheduledTask.count({ where: { workspaceId, status: "running" } }),
      db.scheduledTask.count({ where: { workspaceId, status: "dead_letter" } }),
      db.scheduledTask.count({ where: { workspaceId, status: "failed" } }),
      db.scheduledTask.count({ where: { workspaceId, status: "completed_partial_failure" } }),
      db.scheduledTask.findFirst({
        where: { workspaceId, status: "completed" },
        orderBy: { completedAt: "desc" },
        select: { taskName: true, completedAt: true },
      }),
      db.scheduledTask.findMany({
        where: { workspaceId, status: "dead_letter" },
        orderBy: { updatedAt: "desc" },
        take: RECENT_DEAD_LETTER_LIMIT,
        select: { id: true, taskName: true, lastError: true, attempts: true, maxAttempts: true, updatedAt: true },
      }),
      db.scheduledTask.findMany({
        where: { workspaceId, status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: RECENT_TERMINAL_FAILURE_LIMIT,
        select: { id: true, taskName: true, lastError: true, updatedAt: true },
      }),
      db.scheduledTask.findMany({
        where: { workspaceId, status: "completed_partial_failure" },
        orderBy: { updatedAt: "desc" },
        take: RECENT_PARTIAL_FAILURE_LIMIT,
        select: { id: true, taskName: true, lastError: true, updatedAt: true },
      }),
      db.scheduledTask.findFirst({
        where: { workspaceId, status: "pending" },
        orderBy: { scheduledFor: "asc" },
        select: { taskName: true, scheduledFor: true },
      }),
    ]);

  return {
    pending,
    running,
    deadLetter,
    terminalFailure,
    partialFailure,
    lastSuccess: lastSuccess && lastSuccess.completedAt
      ? { taskName: lastSuccess.taskName, completedAt: lastSuccess.completedAt.toISOString() }
      : null,
    recentDeadLetters: recentDeadLetters.map((t: DeadLetterRow) => ({
      id: t.id,
      taskName: t.taskName,
      lastError: t.lastError,
      attempts: t.attempts,
      maxAttempts: t.maxAttempts,
      updatedAt: t.updatedAt.toISOString(),
    })),
    recentTerminalFailures: recentTerminalFailures.map((t: PartialFailureRow) => ({
      id: t.id,
      taskName: t.taskName,
      lastError: t.lastError,
      updatedAt: t.updatedAt.toISOString(),
    })),
    recentPartialFailures: recentPartialFailures.map((t: PartialFailureRow) => ({
      id: t.id,
      taskName: t.taskName,
      lastError: t.lastError,
      updatedAt: t.updatedAt.toISOString(),
    })),
    nextScheduled: nextScheduled
      ? { taskName: nextScheduled.taskName, scheduledFor: nextScheduled.scheduledFor.toISOString() }
      : null,
  };
}

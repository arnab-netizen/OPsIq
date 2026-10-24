/**
 * QuickBooks Online V1 — what ONE sync run should read (pure; no DB, no network, no clock).
 *
 * Three kinds of run, all over CLOSED calendar months only (the in-progress month never produces canonical evidence, so there
 * is no daily version churn):
 *   BASELINE   first import: the last QBO_BASELINE_MONTHS closed months, newest first, QBO_MONTHS_PER_RUN per run.
 *   RECONCILE  a periodic full re-read of the same window (every QBO_FULL_RECONCILE_INTERVAL_DAYS) — this is what makes a
 *              missed webhook, or a backdated change to an old month, impossible to leave OpsIQ permanently stale.
 *   REFRESH    the QBO_REFRESH_RECENT_MONTHS most recent closed months (picks up backdated edits to recent books).
 *
 * `baselineCursor` is the START date of the newest month in the window still to be read by a multi-run pass; it moves older
 * only after a month has been fully persisted, so an interrupted run resumes exactly where it stopped.
 */
import {
  QBO_BASELINE_MONTHS,
  QBO_FULL_RECONCILE_INTERVAL_DAYS,
  QBO_MONTHS_PER_RUN,
  QBO_REFRESH_RECENT_MONTHS,
  closedMonths,
  type IsoDate,
  type MonthPeriod,
} from "./qbo-report-model";

export type QboRunKind = "BASELINE" | "RECONCILE" | "REFRESH";

export interface QboSyncPlanInput {
  now: Date;
  baselineCompletedAt: Date | null;
  baselineCursor: IsoDate | null;
  lastFullReconcileAt: Date | null;
}

export interface QboSyncPlan {
  kind: QboRunKind;
  /** Months to read this run, newest first. */
  months: MonthPeriod[];
  /** Cursor to persist after the LAST month of this run completes; null = the multi-run pass is finished. */
  cursorAfter: IsoDate | null;
  /** True when finishing this run finishes a baseline / reconcile pass (the caller records completion). */
  completesPass: boolean;
}

export function planSyncRun(input: QboSyncPlanInput): QboSyncPlan {
  const window = closedMonths(input.now, QBO_BASELINE_MONTHS); // newest first
  const reconcileDue =
    input.baselineCompletedAt !== null &&
    (input.lastFullReconcileAt === null ||
      input.now.getTime() - input.lastFullReconcileAt.getTime() > QBO_FULL_RECONCILE_INTERVAL_DAYS * 86_400_000);

  const inPass = input.baselineCursor !== null || input.baselineCompletedAt === null || reconcileDue;
  if (!inPass) {
    return { kind: "REFRESH", months: closedMonths(input.now, QBO_REFRESH_RECENT_MONTHS), cursorAfter: null, completesPass: false };
  }

  // Months of the window not yet read by this pass: those whose start is on or before the cursor (newest-first window).
  const cursor = input.baselineCursor ?? window[0].start;
  const remaining = window.filter((m) => m.start <= cursor);
  const chunk = remaining.slice(0, QBO_MONTHS_PER_RUN);
  const rest = remaining.slice(QBO_MONTHS_PER_RUN);
  return {
    kind: input.baselineCompletedAt === null ? "BASELINE" : "RECONCILE",
    months: chunk,
    cursorAfter: rest.length > 0 ? rest[0].start : null,
    completesPass: rest.length === 0,
  };
}

/** Cursor to persist after finishing month index `i` (0-based) of a plan: the next unread month, or null when the pass is done. */
export function cursorAfterMonth(plan: QboSyncPlan, i: number): IsoDate | null {
  if (i + 1 < plan.months.length) return nextOlderStart(plan.months[i]);
  return plan.cursorAfter;
}

/** Start date of the month immediately before `m` (the window is contiguous calendar months). */
function nextOlderStart(m: MonthPeriod): IsoDate {
  const d = new Date(`${m.start}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

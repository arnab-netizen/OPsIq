/**
 * Cron — persistent scheduler driver.
 *
 * Invoked by Vercel Cron (vercel.json) and/or any external scheduler that can
 * send the shared secret. Authenticated via Authorization: Bearer $CRON_SECRET,
 * compared in constant time; when CRON_SECRET is unset the request is rejected
 * (fail-closed). Vercel does NOT generate this value — the owner configures it.
 *
 * P0-08: this route previously ran two independent, hand-rolled sweeps
 * (email retry, finance-learning gap) inline, with their own bespoke retry
 * semantics, bypassing the durable ScheduledTask claim/lease/backoff/
 * dead-letter machinery and its handler registry entirely (which was passed
 * an empty Map — dispatching nothing). Both are now canonical producers
 * (src/services/scheduler/scheduler-producers.ts) that enqueue ScheduledTask
 * rows for outstanding work, executed through the SAME processDue() drain as
 * every other task type, via the real production handler registry
 * (src/infra/scheduler-handlers.ts). One execution path, one retry/backoff/
 * dead-letter contract, one audit trail.
 *
 * P0-09: added the governed-reassessment producer/handler on the same path —
 * an overdue, still-open OwnerBudgetAction now drives a durable, retried,
 * audited, owner-visible scheduled reassessment per workspace, closing the
 * loop the old standalone /api/internal/reassessment-scan route (still
 * present, unattended-invocation gap now closed by this cron) never did on
 * its own.
 *
 * CADENCE INDEPENDENCE
 * All jobs are catch-up by construction, so a missed or infrequent invocation
 * delays work but never drops it:
 *   - producers re-scan domain state (Alert.emailDeliveryStatus,
 *     OwnerFinanceVerification.outcomeSignal, OwnerBudgetAction.dueAt) every
 *     invocation and enqueue idempotently, so a missed tick just means more
 *     candidates next time;
 *   - task claim selects `scheduled_for <= now` (not exact-time matching), and
 *     also reclaims `running` rows whose lease has expired.
 * Each producer scan and each drain pass is intentionally bounded to keep a
 * single database statement small. At a low cron cadence one bounded pass
 * could leave a backlog until the next invocation, so this route drains in
 * repeated bounded passes under an explicit wall-clock budget. Per-pass
 * semantics — FOR UPDATE SKIP LOCKED, idempotency keys, exponential backoff,
 * lease expiry — make concurrent invocations safe.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { TASK_NAME_QBO_READ_SYNC } from "@/infra/qbo-sync-tasks";
import {
  enqueueDueEmailRetryTasks,
  enqueueDueFinanceLearningBridgeTasks,
  enqueueDueReassessmentScanTasks,
  enqueueDueRiskReviewScanTasks,
  enqueueDueQboReadSyncTasks,
} from "@/services/scheduler/scheduler-producers";
import { captureError } from "@/infra/observability";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/**
 * Wall-clock budget for draining backlog in one invocation. Kept well under the
 * platform function timeout so the response is always returned normally; work
 * still outstanding when the budget is spent stays `pending`/`dead_letter` and is
 * picked up by the next invocation.
 */
const DRAIN_BUDGET_MS = 80_000;

/** Hard cap on drain passes, so a pathological state cannot spin. */
const MAX_DRAIN_PASSES = 200;

/** Tasks claimed per drain pass (see the call site). */
const DRAIN_CLAIM_PER_PASS = 2;

/**
 * Absolute ceiling for the WHOLE invocation, measured from its start: 15 s under `maxDuration`. Every QuickBooks execution is told
 * to finish (soft deadline + hard-abort grace + finalisation allowance) before it, whatever pass it runs in.
 */
const INVOCATION_DEADLINE_MS = 285_000;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Explicit function ceiling. A QuickBooks execution is bounded by QBO_EXECUTION_WORST_CASE_MS (soft deadline + hard-abort grace + finalisation) and then continues in a follow-up. */
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  const invocationStartedAt = Date.now();
  const deadline = invocationStartedAt + DRAIN_BUDGET_MS;

  // ─── 1. Producers: enqueue canonical ScheduledTask rows for outstanding work ──
  try {
    const [emailScan, financeScan, reassessmentScan, riskReviewScan, qboReadSyncScan] = await Promise.all([
      enqueueDueEmailRetryTasks(),
      enqueueDueFinanceLearningBridgeTasks(),
      enqueueDueReassessmentScanTasks(),
      enqueueDueRiskReviewScanTasks(),
      enqueueDueQboReadSyncTasks(),
    ]);
    results.producers = {
      emailRetry: emailScan,
      financeLearningBridge: financeScan,
      reassessmentScan,
      riskReviewScan,
      qboReadSync: qboReadSyncScan,
    };
    logger.info("Cron: producer scans complete", results.producers as Record<string, unknown>);
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    errors.push(`producers: ${governed.operatorMessage}`);
    captureError(err, { category: "UNEXPECTED_ERROR", route: "/api/internal/cron/scheduler" });
  }

  // ─── 2. Drain scheduled tasks through the real handler registry ────────────
  try {
    const scheduler = new DatabaseSchedulerProvider();
    const handlers = getProductionTaskHandlers();

    let tasksProcessed = 0;
    let schedulerPasses = 0;

    // Repeat the bounded claim until a pass claims nothing. A failing task (including an unknown task type, which fails closed:
    // bounded retry, then dead-letter) is rescheduled, so it cannot spin the loop; MAX_DRAIN_PASSES and the time budget bound it anyway.
    for (; schedulerPasses < MAX_DRAIN_PASSES; schedulerPasses++) {
      if (Date.now() >= deadline) break;
      // Few tasks per pass. A pass is only started inside the 80 s budget, and each QuickBooks execution in it is bounded by
      // QBO_EXECUTION_WORST_CASE_MS from ITS OWN start (token acquisition included) and is additionally told the invocation's absolute
      // deadline, so a pass of 2 ends well inside maxDuration (300 s); a platform kill can strand at most 2 claimed rows (not a batch of 50).
      // QuickBooks tasks are claimed AFTER every other due task (oldest first within each class): a large QuickBooks backlog cannot starve
      // the email-retry, reassessment, risk-review and finance scans.
      const passProcessed = await scheduler.processDue(handlers, {
        maxClaim: DRAIN_CLAIM_PER_PASS,
        deprioritize: [TASK_NAME_QBO_READ_SYNC],
        invocationDeadlineAt: invocationStartedAt + INVOCATION_DEADLINE_MS,
      });
      tasksProcessed += passProcessed;
      // Stop when nothing was CLAIMED (no due work). A pass whose tasks all failed claimed rows and moved them to retry/dead-letter, so the
      // next pass sees different rows; the pass cap and time budget already bound the loop.
      if (passProcessed === 0 && (scheduler.lastClaimedCount ?? 0) === 0) break;
    }

    results.schedulerTasksProcessed = tasksProcessed;
    results.schedulerPasses = schedulerPasses;
    results.handlerRegistrySize = handlers.size;
    logger.info("Cron: scheduler tick complete", { tasksProcessed, schedulerPasses });
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    errors.push(`scheduler: ${governed.operatorMessage}`);
    captureError(err, { category: "UNEXPECTED_ERROR", route: "/api/internal/cron/scheduler" });
  }

  // Cron must return 2xx for Vercel to consider the job succeeded.
  // Non-fatal per-task errors are surfaced in the body but do not 500.
  const status = errors.length > 0 ? 207 : 200;
  return NextResponse.json({ ok: errors.length === 0, results, errors }, { status });
}

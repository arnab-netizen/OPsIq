/**
 * Cron — persistent scheduler driver + email retry sweep.
 *
 * Invoked by Vercel Cron (vercel.json) and/or any external scheduler that can
 * send the shared secret. Authenticated via Authorization: Bearer $CRON_SECRET,
 * compared in constant time; when CRON_SECRET is unset the request is rejected
 * (fail-closed). Vercel does NOT generate this value — the owner configures it.
 *
 * Two jobs per invocation:
 *   1. DatabaseSchedulerProvider.processDue()  — drains due scheduled tasks
 *   2. Alert email retry sweep                 — retries FAILED alerts below max attempts
 *
 * CADENCE INDEPENDENCE
 * Both jobs are catch-up by construction, so a missed or infrequent invocation
 * delays work but never drops it:
 *   - task claim selects `scheduled_for <= now` (not exact-time matching), and
 *     also reclaims `running` rows whose lease has expired;
 *   - the email sweep selects every FAILED alert below max attempts, oldest first.
 * Each underlying pass is intentionally bounded (50 tasks / 20 emails) to keep a
 * single database statement small. At a low cron cadence one bounded pass could
 * leave a backlog until the next invocation, so this route drains in repeated
 * bounded passes under an explicit wall-clock budget. Per-pass semantics —
 * FOR UPDATE SKIP LOCKED, idempotency keys, exponential backoff, lease
 * expiry — are unchanged and still make concurrent invocations safe.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { captureError } from "@/infra/observability";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const MAX_EMAIL_RETRIES_PER_TICK = 20;
const CRON_ACTOR_ID = "00000000-0000-0000-0000-000000000001"; // system actor for audit events

/**
 * Wall-clock budget for draining backlog in one invocation. Kept well under the
 * platform function timeout so the response is always returned normally; work
 * still outstanding when the budget is spent stays `pending`/`FAILED` and is
 * picked up by the next invocation.
 */
const DRAIN_BUDGET_MS = 45_000;

/** Hard cap on drain passes, so a pathological state cannot spin. */
const MAX_DRAIN_PASSES = 25;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  const deadline = Date.now() + DRAIN_BUDGET_MS;

  // ─── 1. Drain scheduled tasks ────────────────────────────────────────────
  try {
    const scheduler = new DatabaseSchedulerProvider();
    // No application task handlers registered yet — pass empty map.
    // Tasks enqueued by future services will add handlers here.
    const handlers = new Map();

    let tasksProcessed = 0;
    let schedulerPasses = 0;

    // Repeat the bounded claim until a pass completes no work. A pass that
    // completes nothing — including the current no-handler configuration, where
    // claimed tasks are released back to `pending` — returns 0 and ends the
    // loop, so this can never spin on undeliverable work.
    for (; schedulerPasses < MAX_DRAIN_PASSES; schedulerPasses++) {
      if (Date.now() >= deadline) break;
      const passProcessed = await scheduler.processDue(handlers);
      tasksProcessed += passProcessed;
      if (passProcessed === 0) break;
    }

    results.schedulerTasksProcessed = tasksProcessed;
    results.schedulerPasses = schedulerPasses;
    logger.info("Cron: scheduler tick complete", { tasksProcessed, schedulerPasses });
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    errors.push(`scheduler: ${governed.operatorMessage}`);
    captureError(err, { category: "UNEXPECTED_ERROR", route: "/api/internal/cron/scheduler" });
  }

  // ─── 2. Email retry sweep ─────────────────────────────────────────────────
  try {
    const EMAIL_MAX_ATTEMPTS = 3;

    let attempted = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    let emailsSkipped = 0;
    let emailPasses = 0;

    // Each pass claims one bounded page of retriable alerts. Every attempt is a
    // state transition (SENT / SKIPPED, or FAILED with an incremented attempt
    // count), so the retriable set strictly shrinks and the loop terminates.
    for (; emailPasses < MAX_DRAIN_PASSES; emailPasses++) {
      if (Date.now() >= deadline) break;

      const retriable = await db.alert.findMany({
        where: {
          emailDeliveryStatus: "FAILED",
          emailAttemptCount: { lt: EMAIL_MAX_ATTEMPTS },
        },
        select: { id: true, workspaceId: true },
        take: MAX_EMAIL_RETRIES_PER_TICK,
        orderBy: { emailLastAttemptAt: "asc" },
      });

      if (retriable.length === 0) break;
      attempted += retriable.length;

      for (const alert of retriable) {
        try {
          const result = await retryEmailAlert(alert.id, alert.workspaceId, CRON_ACTOR_ID);
          if (result.status === "SENT") emailsSent++;
          else if (result.status === "FAILED") emailsFailed++;
          else emailsSkipped++;
        } catch (alertErr) {
          emailsFailed++;
          captureError(alertErr, {
            category: "UNEXPECTED_ERROR",
            route: "/api/internal/cron/scheduler",
          });
        }
      }

      // A partial page means the backlog is exhausted for this invocation.
      if (retriable.length < MAX_EMAIL_RETRIES_PER_TICK) break;
    }

    results.emailRetry = {
      attempted,
      sent: emailsSent,
      failed: emailsFailed,
      skipped: emailsSkipped,
      passes: emailPasses,
    };
    logger.info("Cron: email retry sweep complete", results.emailRetry as Record<string, unknown>);
  } catch (err) {
    const governed = classifyOperatorError(
      err instanceof Error ? err : new Error(String(err)),
      { context: "load" }
    );
    errors.push(`emailRetry: ${governed.operatorMessage}`);
    captureError(err, { category: "UNEXPECTED_ERROR", route: "/api/internal/cron/scheduler" });
  }

  // Cron must return 2xx for Vercel to consider the job succeeded.
  // Non-fatal per-task errors are surfaced in the body but do not 500.
  const status = errors.length > 0 ? 207 : 200;
  return NextResponse.json({ ok: errors.length === 0, results, errors }, { status });
}

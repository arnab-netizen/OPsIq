/**
 * Vercel Cron — persistent scheduler driver + email retry sweep.
 *
 * Called every minute by Vercel Cron (vercel.json cron config).
 * Authenticated via Authorization: Bearer $CRON_SECRET header, which Vercel
 * injects automatically for cron invocations. In production this must be set.
 * In development CRON_SECRET may be absent and the request is rejected.
 *
 * Two jobs per tick:
 *   1. DatabaseSchedulerProvider.processDue()  — drains due scheduled tasks
 *   2. Alert email retry sweep                 — retries FAILED alerts below max attempts
 *
 * Safe to call multiple times concurrently: the scheduler uses FOR UPDATE SKIP LOCKED
 * and the email claim uses an atomic UPDATE WHERE status='FAILED'. No double-execution.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { captureError } from "@/infra/observability";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const MAX_EMAIL_RETRIES_PER_TICK = 20;
const CRON_ACTOR_ID = "00000000-0000-0000-0000-000000000001"; // system actor for audit events

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // ─── 1. Drain scheduled tasks ────────────────────────────────────────────
  try {
    const scheduler = new DatabaseSchedulerProvider();
    // No application task handlers registered yet — pass empty map.
    // Tasks enqueued by future services will add handlers here.
    const tasksProcessed = await scheduler.processDue(new Map());
    results.schedulerTasksProcessed = tasksProcessed;
    logger.info("Cron: scheduler tick complete", { tasksProcessed });
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
    const retriable = await db.alert.findMany({
      where: {
        emailDeliveryStatus: "FAILED",
        emailAttemptCount: { lt: EMAIL_MAX_ATTEMPTS },
      },
      select: { id: true, workspaceId: true },
      take: MAX_EMAIL_RETRIES_PER_TICK,
      orderBy: { emailLastAttemptAt: "asc" },
    });

    let emailsSent = 0;
    let emailsFailed = 0;
    let emailsSkipped = 0;

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

    results.emailRetry = { attempted: retriable.length, sent: emailsSent, failed: emailsFailed, skipped: emailsSkipped };
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

/**
 * Scheduled-reassessment due-scanner (M8 runtime-readiness).
 *
 * Time-based reassessment was dead: an overdue action (`OwnerBudgetAction.dueAt` / `reviewInDays`) never triggered a
 * governed reassessment — only event mutations did. This scanner finds businesses with an OVERDUE, still-open budget
 * action and re-runs the EXISTING, proven `reassessBudget` path for each (a `scheduled_review_due` trigger). It does
 * NOT build a new scheduler engine and does NOT depend on external cron: an authenticated internal route invokes it.
 *
 * Idempotent per business per day: the trigger id embeds the UTC date, and `reassessBudget` is idempotent per
 * (workspace, business, triggerEventId), so re-invoking the scan the same day returns the existing plan without
 * creating a duplicate snapshot.
 */
import { db } from "@/lib/db";
import { OPEN_BUDGET_ACTION_STATUSES } from "@/domain/owner-budget/action-mapping";
import { reassessBudget } from "./budget.service";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

/** Deterministic system actor for scheduler-initiated reassessments (not a user). */
export const SCHEDULER_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface DueScanResult {
  scanned: number;
  reassessed: number;
  skipped: number;
  businesses: Array<{ workspaceId: string; businessId: string; ok: boolean }>;
}

/** One scheduled reassessment per business per UTC day. */
function dueBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Scan for overdue, still-open budget actions and run a governed reassessment for each distinct business.
 * Workspace/business-scoped per target; system-actor attributed; failures are isolated (one bad business does not
 * abort the sweep). Returns a summary for the caller/route.
 */
export async function scanDueReassessments(now: Date, opts: { limit?: number; actorId?: string } = {}): Promise<DueScanResult> {
  const limit = opts.limit ?? 100;
  const actorId = opts.actorId ?? SCHEDULER_SYSTEM_ACTOR;

  const overdue = await db.ownerBudgetAction.findMany({
    where: { dueAt: { not: null, lte: now }, status: { in: Array.from(OPEN_BUDGET_ACTION_STATUSES) } },
    select: { workspaceId: true, businessId: true },
    orderBy: { dueAt: "asc" },
    take: 2000,
  });

  const seen = new Set<string>();
  const targets: Array<{ workspaceId: string; businessId: string }> = [];
  for (const r of overdue) {
    const key = `${r.workspaceId}:${r.businessId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ workspaceId: r.workspaceId, businessId: r.businessId });
    if (targets.length >= limit) break;
  }

  const bucket = dueBucket(now);
  const businesses: DueScanResult["businesses"] = [];
  let reassessed = 0;
  let skipped = 0;
  for (const t of targets) {
    const triggerEventId = `scheduled_review_due:${t.businessId}:${bucket}`;
    try {
      await reassessBudget(t.businessId, t.workspaceId, { actorId, kind: "scheduled_review_due", triggerEventId });
      reassessed++;
      businesses.push({ ...t, ok: true });
    } catch (err) {
      skipped++;
      businesses.push({ ...t, ok: false });
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: "load" });
      logger.warn("Scheduled reassessment failed for a business", {
        workspaceId: t.workspaceId,
        businessId: t.businessId,
        error: governed.operatorMessage,
      });
    }
  }

  return { scanned: targets.length, reassessed, skipped, businesses };
}

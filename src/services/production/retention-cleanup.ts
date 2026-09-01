// Retention policy enforcement - cleanup old records
// Triggered on startup and periodically
//
// P0-04 (production trust/governance closure): this function used to also
// delete AuditEvent rows older than a TTL. That path was reachable from a
// plain, unauthenticated GET /api/health (see src/app/api/health/route.ts)
// and violated CLAUDE.md's governed-record rule ("Modifying audit_log rows
// in any way" requires explicit owner authority — audit history is
// append-only). The delete call also referenced a `createdAt` field that
// does not exist on AuditEvent (only `occurredAt` does), so it silently
// no-op'd via `.catch(() => ({ count: 0 }))` in every build to date — but it
// was one correct field-name away from actually deleting governed audit
// history on a schedule nobody authorized. It has been removed outright,
// not "fixed", because audit records must not be deleted by this or any
// other automatic process. If a genuinely governed audit-retention/archival
// policy is ever needed, it must be its own explicitly authorized mechanism
// (owner-approved policy, admin-triggered, itself audited) — never a side
// effect of a health check. See src/infra/audit.ts's
// `getAuditEventReadOnlyClient()` for a compile-time-safe way to read audit
// history that cannot be used to delete or update it.

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { PRODUCTION_CONFIG } from "./safety-config";
import { createEventLogger } from "@/lib/observability/log";

const logger = createEventLogger("retention_cleanup", "system");

export async function cleanupOldRecords(): Promise<void> {
  try {
    // Fetch all workspaces for scoped cleanup
    const workspaces = await db.workspace.findMany({
      select: { id: true },
    }).catch(() => []);

    const now = new Date();
    let totalDeletedOperatorItems = 0;

    // Delete operator items older than TTL (per workspace)
    const operatorCutoff = new Date(now);
    operatorCutoff.setDate(operatorCutoff.getDate() - PRODUCTION_CONFIG.retention.operatorItemTtlDays);

    for (const workspace of workspaces) {
      const deletedOperatorItems = await db.operatorItem.deleteMany({
        where: {
          workspaceId: workspace.id,
          createdAt: { lt: operatorCutoff },
          status: { in: ["done", "failed", "blocked"] }, // Don't delete in-progress items
        },
      }).catch(() => ({ count: 0 }));
      totalDeletedOperatorItems += deletedOperatorItems.count;
    }

    if (totalDeletedOperatorItems > 0) {
      logger.success({ message: `Deleted ${totalDeletedOperatorItems} expired operator items` });
    }

    // Prune stale PG-backed rate-limit buckets (not a governed record -- pure
    // infrastructure state, safe to delete). Global, not workspace-scoped: these
    // rows are keyed by raw client IP/email for the public identity endpoints
    // (see src/infra/rate-limit.ts), which have no workspace association.
    const rateLimitCutoff = new Date(now);
    rateLimitCutoff.setDate(rateLimitCutoff.getDate() - PRODUCTION_CONFIG.retention.rateLimitBucketTtlDays);
    const deletedBuckets = await db.rateLimitBucket.deleteMany({
      where: { updatedAt: { lt: rateLimitCutoff } },
    }).catch(() => ({ count: 0 }));
    if (deletedBuckets.count > 0) {
      logger.success({ message: `Deleted ${deletedBuckets.count} stale rate-limit buckets` });
    }
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error(`Retention cleanup failed: ${governed.operatorMessage}`);
  }
}

// Run cleanup on startup
cleanupOldRecords().catch(console.error);

// Run cleanup daily at 2 AM UTC
const scheduleCleanup = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(2, 0, 0, 0);

  const delay = tomorrow.getTime() - now.getTime();
  setTimeout(() => {
    cleanupOldRecords().catch(console.error);
    setInterval(() => cleanupOldRecords().catch(console.error), 24 * 60 * 60 * 1000);
  }, delay);
};

scheduleCleanup();

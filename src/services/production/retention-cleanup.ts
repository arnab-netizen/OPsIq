// Retention policy enforcement - cleanup old records
// Triggered on startup and periodically

import { db } from "@/lib/db";
import { PRODUCTION_CONFIG } from "./safety-config";
import { createEventLogger } from "@/lib/observability/log";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

const logger = createEventLogger("retention_cleanup", "system");

export async function cleanupOldRecords(): Promise<void> {
  try {
    // Fetch all workspaces for scoped cleanup
    const workspaces = await db.workspace.findMany({
      select: { id: true },
    }).catch(() => []);

    const now = new Date();
    let totalDeletedOperatorItems = 0;
    let totalDeletedAuditEvents = 0;

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

    // Delete audit events older than TTL (per workspace)
    const auditCutoff = new Date(now);
    auditCutoff.setDate(auditCutoff.getDate() - PRODUCTION_CONFIG.retention.auditEventTtlDays);

    for (const workspace of workspaces) {
      const deletedAuditEvents = await db.auditEvent.deleteMany({
        where: {
          workspaceId: workspace.id,
          createdAt: { lt: auditCutoff },
        },
      }).catch(() => ({ count: 0 }));
      totalDeletedAuditEvents += deletedAuditEvents.count;
    }

    if (totalDeletedAuditEvents > 0) {
      logger.success({ message: `Deleted ${totalDeletedAuditEvents} expired audit events` });
    }
  } catch (error) {
    logger.error(`Retention cleanup failed: ${getSafeErrorMessage(error)}`);
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

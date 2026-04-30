// Retention policy enforcement - cleanup old records
// Triggered on startup and periodically

import { db } from "@/lib/db";
import { PRODUCTION_CONFIG } from "./safety-config";
import { createEventLogger } from "@/lib/observability/log";

const logger = createEventLogger("retention_cleanup", "system");

export async function cleanupOldRecords(): Promise<void> {
  try {
    const now = new Date();

    // Delete operator items older than TTL
    const operatorCutoff = new Date(now);
    operatorCutoff.setDate(operatorCutoff.getDate() - PRODUCTION_CONFIG.retention.operatorItemTtlDays);

    const deletedOperatorItems = await db.operatorItem.deleteMany({
      where: {
        createdAt: { lt: operatorCutoff },
        status: { in: ["done", "failed", "blocked"] }, // Don't delete in-progress items
      },
    }).catch(() => ({ count: 0 }));

    if (deletedOperatorItems.count > 0) {
      logger.success({ message: `Deleted ${deletedOperatorItems.count} expired operator items` });
    }

    // Delete audit events older than TTL
    const auditCutoff = new Date(now);
    auditCutoff.setDate(auditCutoff.getDate() - PRODUCTION_CONFIG.retention.auditEventTtlDays);

    const deletedAuditEvents = await db.auditLog.deleteMany({
      where: {
        createdAt: { lt: auditCutoff },
      },
    }).catch(() => ({ count: 0 }));

    if (deletedAuditEvents.count > 0) {
      logger.success({ message: `Deleted ${deletedAuditEvents.count} expired audit events` });
    }

    // Delete decision lifecycle events older than TTL
    const lifecycleCutoff = new Date(now);
    lifecycleCutoff.setDate(lifecycleCutoff.getDate() - PRODUCTION_CONFIG.retention.decisionLifecycleTtlDays);

    const deletedLifecycleEvents = await db.decisionLifecycle.deleteMany({
      where: {
        occurredAt: { lt: lifecycleCutoff },
      },
    }).catch(() => ({ count: 0 }));

    if (deletedLifecycleEvents.count > 0) {
      logger.success({ message: `Deleted ${deletedLifecycleEvents.count} expired lifecycle events` });
    }
  } catch (error) {
    logger.error(`Retention cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
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

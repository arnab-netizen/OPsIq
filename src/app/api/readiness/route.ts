import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { ensureStartupComplete } from "@/infra/startup-orchestrator";
import { getStartupStatus } from "@/services/startup-status";
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  // Trigger startup sequence (but don't block on failure)
  try {
    await ensureStartupComplete();
  } catch (error) {
    logger.error("Startup checks failed", error);
    // Fall through - readiness will report startup as failed
  }

  // Check runtime health via monitoring service
  const monitoringService = getMonitoringServiceInstance();
  const monitoringCheck = await monitoringService.checkReadiness();

  // Get durable startup status
  const startupStatus = await getStartupStatus();
  const startupComplete = startupStatus.status === "READY";
  const startupFailed = startupStatus.status === "FAILED";

  // Migration currency — checked independently from startup_status because the
  // startup sequence's checkDatabaseSchema() trusts Prisma initialization rather
  // than verifying the migration table. A READY startup row alone does NOT prove
  // that all committed migrations have been applied. Checking here ensures the
  // readiness probe never fail-opens on a pending-migration gap.
  const migration = await checkMigrationReadiness();
  const migrationHistoryCurrent = migration.ready;

  // Readiness requires: startup complete AND migrations current AND DB healthy AND queue healthy.
  // None of these invariants collapses into another.
  const is_ready =
    startupComplete &&
    !startupFailed &&
    migrationHistoryCurrent &&
    monitoringCheck.database_healthy &&
    monitoringCheck.queue_healthy;
  const statusCode = is_ready ? 200 : 503;

  logger.debug("Readiness probe executed", {
    startup_status: startupStatus.status,
    migration_history_current: migrationHistoryCurrent,
    pending_migrations: migration.pending,
    database_healthy: monitoringCheck.database_healthy,
    queue_healthy: monitoringCheck.queue_healthy,
    is_ready,
  });

  return new Response(
    JSON.stringify({
      startup_complete: startupComplete,
      startup_status: startupStatus.status,
      migration_history_current: migrationHistoryCurrent,
      migration_pending: migration.pending,
      migration_failed: migration.failed,
      database_healthy: monitoringCheck.database_healthy,
      database_latency_ms: monitoringCheck.database_latency_ms,
      queue_healthy: monitoringCheck.queue_healthy,
      queue_depth: monitoringCheck.queue_depth,
      cache_healthy: monitoringCheck.cache_healthy,
      external_services: monitoringCheck.external_services,
      is_ready,
      status: statusCode,
    }),
    {
      status: statusCode,
      headers: { "content-type": "application/json" },
    }
  );
};

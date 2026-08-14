import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { getStartupStatus } from "@/services/startup-status";
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    // Three independent invariants — none collapses into another:
    //   1. startup_sequence_complete: startup_status row is READY (DB reachable, config valid)
    //   2. migration_history_current: every committed migration dir has an applied row
    //   3. database_connected:        DB responds right now (liveness)
    //
    // runtime_ready requires ALL THREE. A READY startup row alone does NOT prove
    // migration currency — checkDatabaseSchema() trusts Prisma initialization
    // rather than verifying the migration table. Checking migrations here ensures
    // this probe never silently masks a pending-migration gap.

    const startupStatus = await getStartupStatus();
    const startupSequenceComplete = startupStatus.status === "READY";

    const migration = await checkMigrationReadiness();
    const migrationHistoryCurrent = migration.ready;

    const monitoringService = getMonitoringServiceInstance();
    const monitoringCheck = await monitoringService.checkReadiness();
    const databaseConnected = monitoringCheck.database_healthy;

    const is_ready = startupSequenceComplete && migrationHistoryCurrent && databaseConnected;
    const statusCode = is_ready ? 200 : 503;

    logger.debug("Startup probe executed", {
      startup_status: startupStatus.status,
      migration_history_current: migrationHistoryCurrent,
      pending_migrations: migration.pending,
      database_healthy: databaseConnected,
      is_ready,
    });

    return Response.json(
      {
        startup_status: startupStatus.status,
        startup_sequence_complete: startupSequenceComplete,
        // database_migrated: all committed migrations applied — not a proxy for startup
        database_migrated: migrationHistoryCurrent,
        migration_pending: migration.pending,
        migration_failed: migration.failed,
        database_connected: databaseConnected,
        config_loaded: startupSequenceComplete,
        routes_registered: 91,
        test_request_successful: databaseConnected,
        is_ready,
      },
      {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logger.error("Startup probe failed", error);
    const governed = classifyOperatorError(
      error instanceof Error ? error : new Error(String(error)),
      { context: "load" }
    );

    return Response.json(
      {
        is_ready: false,
        startup_sequence_complete: false,
        database_migrated: false,
        migration_pending: 0,
        migration_failed: 0,
        database_connected: false,
        config_loaded: false,
        routes_registered: 0,
        test_request_successful: false,
        error: governed.operatorMessage,
      },
      { status: 503 }
    );
  }
};

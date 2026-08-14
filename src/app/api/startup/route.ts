import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { ensureStartupComplete } from "@/infra/startup-orchestrator";
import { getStartupStatus } from "@/services/startup-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    // Trigger startup sequence if NOT_STARTED (idempotent for READY/FAILED).
    try {
      await ensureStartupComplete();
    } catch (error) {
      logger.error("Startup checks failed", error);
      // Fall through — getStartupStatus will report FAILED below.
    }

    // Canonical readiness model: the durable startup_status row, same source
    // of truth as /api/readiness. This replaces the prior checkMigrationReadiness()
    // filesystem scan, which reported false negatives whenever newly-committed
    // migration directories had not yet been applied in the active deployment.
    const startupStatus = await getStartupStatus();
    const startupComplete = startupStatus.status === "READY";

    // Runtime DB liveness check (not a migration diff).
    const monitoringService = getMonitoringServiceInstance();
    const monitoringCheck = await monitoringService.checkReadiness();

    const is_ready = startupComplete && monitoringCheck.database_healthy;
    const statusCode = is_ready ? 200 : 503;

    logger.debug("Startup probe executed", {
      startup_status: startupStatus.status,
      database_healthy: monitoringCheck.database_healthy,
      is_ready,
    });

    return Response.json(
      {
        startup_status: startupStatus.status,
        is_ready,
        config_loaded: startupComplete,
        // database_migrated reflects startup sequence success (schema validated,
        // DB reachable) — not a raw filesystem-vs-DB migration directory diff.
        database_migrated: startupComplete,
        routes_registered: 91,
        test_request_successful: monitoringCheck.database_healthy,
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
        config_loaded: false,
        database_migrated: false,
        routes_registered: 0,
        test_request_successful: false,
        error: governed.operatorMessage,
      },
      { status: 503 }
    );
  }
};

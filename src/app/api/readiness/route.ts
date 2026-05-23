import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { ensureStartupComplete } from "@/infra/startup-orchestrator";
import { getStartupStatus } from "@/services/startup-status";

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

  // Readiness requires startup complete AND no critical failures
  const is_ready =
    startupComplete &&
    !startupFailed &&
    monitoringCheck.database_healthy &&
    monitoringCheck.queue_healthy;
  const statusCode = is_ready ? 200 : 503;

  logger.debug("Readiness probe executed", {
    startup_status: startupStatus.status,
    database_healthy: monitoringCheck.database_healthy,
    queue_healthy: monitoringCheck.queue_healthy,
    is_ready,
  });

  return new Response(
    JSON.stringify({
      startup_complete: startupComplete,
      startup_status: startupStatus.status,
      startup_error: startupFailed ? startupStatus.error : null,
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

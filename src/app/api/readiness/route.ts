import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    const monitoringService = getMonitoringServiceInstance();
    const readinessCheck = await monitoringService.checkReadiness();

    const statusCode = readinessCheck.is_ready ? 200 : 503;

    logger.debug("Readiness probe executed", {
      is_ready: readinessCheck.is_ready,
      database_healthy: readinessCheck.database_healthy,
      queue_healthy: readinessCheck.queue_healthy,
    });

    return Response.json(readinessCheck, {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logger.error("Readiness probe failed", { error });

    return Response.json(
      {
        is_ready: false,
        database_healthy: false,
        database_latency_ms: 0,
        queue_healthy: false,
        queue_depth: 0,
        cache_healthy: false,
        external_services: [],
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 503,
      }
    );
  }
};

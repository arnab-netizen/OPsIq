import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  const monitoringService = getMonitoringServiceInstance();
  const readinessCheck = await monitoringService.checkReadiness();

  const statusCode = readinessCheck.is_ready ? 200 : 503;

  logger.debug("Readiness probe executed", {
    is_ready: readinessCheck.is_ready,
    database_healthy: readinessCheck.database_healthy,
    queue_healthy: readinessCheck.queue_healthy,
  });

  return new Response(JSON.stringify({ ...readinessCheck, status: statusCode }), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
};

import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    const monitoringService = getMonitoringServiceInstance();
    const livenessCheck = await monitoringService.checkLiveness();

    const statusCode = livenessCheck.is_alive ? 200 : 503;

    logger.debug("Liveness probe executed", {
      is_alive: livenessCheck.is_alive,
      memory_ok: livenessCheck.memory_ok,
      cpu_ok: livenessCheck.cpu_ok,
    });

    return Response.json(livenessCheck, {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logger.error("Liveness probe failed", { error });

    return Response.json(
      {
        is_alive: false,
        http_responding: false,
        memory_usage_percent: 0,
        memory_ok: false,
        cpu_usage_percent: 0,
        cpu_ok: false,
        uptime_minutes: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 503,
      }
    );
  }
};

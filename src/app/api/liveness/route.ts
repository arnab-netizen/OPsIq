import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { getDbInstance } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    // Ensure database is initialized for monitoring checks
    await getDbInstance();
  } catch (error) {
    logger.debug("Database initialization pending in liveness check", { error });
  }

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
        error: getSafeErrorMessage(error),
      },
      {
        status: 503,
      }
    );
  }
};

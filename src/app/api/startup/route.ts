import { getMonitoringServiceInstance } from "@/middleware/monitoring.middleware";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  try {
    const monitoringService = getMonitoringServiceInstance();
    const startupCheck = await monitoringService.checkStartup();

    const statusCode = startupCheck.is_ready ? 200 : 503;

    logger.debug("Startup probe executed", {
      is_ready: startupCheck.is_ready,
      config_loaded: startupCheck.config_loaded,
      database_migrated: startupCheck.database_migrated,
      routes_registered: startupCheck.routes_registered,
    });

    return Response.json(startupCheck, {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logger.error("Startup probe failed", { error });
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });

    return Response.json(
      {
        is_ready: false,
        config_loaded: false,
        database_migrated: false,
        routes_registered: 0,
        test_request_successful: false,
        error: governed.operatorMessage,
      },
      {
        status: 503,
      }
    );
  }
};

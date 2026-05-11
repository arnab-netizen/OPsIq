import { withRequestContext } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { classifyError, reportError } from "@/infra/error-tracking";
import { cleanupOldRecords } from "@/services/production/retention-cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let lastCleanupTime = 0;
let applicationStartTime = Date.now();

export const GET = withRequestContext(async () => {
  // Trigger retention cleanup periodically (every 6 hours)
  const now = Date.now();
  if (now - lastCleanupTime > 6 * 60 * 60 * 1000) {
    lastCleanupTime = now;
    cleanupOldRecords().catch((err) => {
      const classified = classifyError(err, { operation: "retention-cleanup" });
      reportError(classified);
      logger.error("Retention cleanup failed", { error: err });
    });
  }

  const checks: Record<string, Record<string, string | number | boolean>> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
  } catch (error) {
    const classified = classifyError(error, { check: "database" });
    reportError(classified);
    checks.database = {
      status: "unhealthy",
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  checks.memory = {
    status: heapUsagePercent < 90 ? "healthy" : "unhealthy",
    usage: `${Math.round(heapUsagePercent)}%`,
  };
  if (heapUsagePercent >= 90) {
    const classified = classifyError(
      new Error(`High memory usage: ${heapUsagePercent.toFixed(2)}%`),
      { check: "memory", heapUsagePercent }
    );
    reportError(classified);
  }

  // Uptime check
  const uptimeMs = now - applicationStartTime;
  checks.uptime = {
    status: "healthy",
    uptimeSeconds: Math.floor(uptimeMs / 1000),
  };

  // Runtime check
  checks.runtime = {
    status: "healthy",
    nodeVersion: process.version,
    environment: process.env.NODE_ENV ?? "unknown",
  };

  const allHealthy = Object.values(checks).every(
    (c) => c.status === "healthy"
  );
  const overallStatus = allHealthy ? "healthy" : "degraded";

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: process.env.NODE_ENV ?? "unknown",
    checks,
  };

  logger.debug("Health check executed", { status: overallStatus });

  return Response.json(response, {
    status: allHealthy ? 200 : 503,
  });
});

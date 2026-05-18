import { withEnforcement } from "@/lib/enforced-route";
import { db, getDbInstance } from "@/lib/db";
import { logger } from "@/infra/logger";
import { classifyError, reportError } from "@/infra/error-tracking";
import { cleanupOldRecords } from "@/services/production/retention-cleanup";
import { isStartupComplete } from "@/infra/startup-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let lastCleanupTime = 0;
let applicationStartTime = Date.now();

export const GET = withEnforcement(async (ctx) => {
  // Ensure database is initialized before any operations
  try {
    await getDbInstance();
  } catch (error) {
    logger.error("Failed to initialize database on health check", { error });
  }

  // Trigger retention cleanup periodically (every 6 hours) - ONLY after startup complete
  const now = Date.now();
  const startup_complete = isStartupComplete();
  if (startup_complete && now - lastCleanupTime > 6 * 60 * 60 * 1000) {
    lastCleanupTime = now;
    cleanupOldRecords().catch((err) => {
      const classified = classifyError(err, { operation: "retention-cleanup" });
      reportError(classified);
      logger.error("Retention cleanup failed", { error: err });
    });
  }

  const checks: Record<string, Record<string, string | number | boolean>> = {};

  // Database check (graceful fallback if DB unavailable)
  const dbStart = Date.now();
  if (process.env.DATABASE_URL) {
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
  } else {
    // Database not configured
    checks.database = {
      status: "degraded",
      latencyMs: Date.now() - dbStart,
      note: "DATABASE_URL not configured - database checks skipped",
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

  logger.debug("Health check executed", { status: overallStatus });

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: process.env.NODE_ENV ?? "unknown",
    checks,
  };
}, { bypass_health_check: true });

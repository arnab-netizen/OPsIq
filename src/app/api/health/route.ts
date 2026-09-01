import { NextResponse } from "next/server";
import { db, getDbInstance } from "@/lib/db";
import { logger } from "@/infra/logger";
import { captureError } from "@/infra/observability";
import { cleanupOldRecords } from "@/services/production/retention-cleanup";
import { isStartupComplete } from "@/infra/startup-state";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  bytesToMb,
  getMemoryPressure,
  isMemoryExhausted,
  isMemoryWarning,
} from "@/infra/memory-pressure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let lastCleanupTime = 0;
let applicationStartTime = Date.now();

export async function GET(): Promise<NextResponse> {
  // Ensure database is initialized before any operations
  try {
    await getDbInstance();
  } catch (error) {
    logger.error("Failed to initialize database on health check", error);
  }

  // Trigger retention cleanup periodically (every 6 hours) - ONLY after startup complete
  const now = Date.now();
  const startup_complete = isStartupComplete();
  if (startup_complete && now - lastCleanupTime > 6 * 60 * 60 * 1000) {
    lastCleanupTime = now;
    cleanupOldRecords().catch((err) => {
      captureError(err, { route: "/api/health" });
      logger.error("Retention cleanup failed", err);
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
      captureError(error, { route: "/api/health" });
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
      checks.database = {
        status: "unhealthy",
        latencyMs: Date.now() - dbStart,
        error: governed.operatorMessage,
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

  // Memory check.
  //
  // Saturation is measured as heapUsed against V8's reported heap_size_limit.
  // The legacy heapUsed/heapTotal ratio is kept as a diagnostic field only: it
  // measures how tightly the *committed* heap is packed, is bounded at 100% by
  // construction, and routinely reads 90%+ on a perfectly healthy process.
  //
  // Only CRITICAL pressure (imminent heap exhaustion) is treated as blocking.
  // HIGH pressure surfaces as a warning without changing the HTTP status, and
  // an unmeasurable snapshot never marks the service unavailable.
  const memory = getMemoryPressure();
  checks.memory = {
    status: !memory.available
      ? "unknown"
      : isMemoryExhausted(memory)
        ? "unhealthy"
        : isMemoryWarning(memory)
          ? "warning"
          : "healthy",
    // Retained for backward compatibility with existing operator tooling.
    usage: `${Math.round(memory.heapUtilizationPercent)}%`,
    heapUsedPercentOfLimit: Math.round(memory.heapHeadroomUsedPercent * 100) / 100,
    heapUtilizationPercent: Math.round(memory.heapUtilizationPercent * 100) / 100,
    heapUsedMb: bytesToMb(memory.heapUsedBytes),
    heapTotalMb: bytesToMb(memory.heapTotalBytes),
    heapLimitMb: bytesToMb(memory.heapLimitBytes),
    rssMb: bytesToMb(memory.rssBytes),
    externalMb: bytesToMb(memory.externalBytes),
    arrayBuffersMb: bytesToMb(memory.arrayBuffersBytes),
    level: memory.level,
  };
  if (isMemoryExhausted(memory) || isMemoryWarning(memory)) {
    captureError(
      new Error(
        `Memory pressure ${memory.level}: heapUsed is ` +
          `${memory.heapHeadroomUsedPercent.toFixed(2)}% of the V8 heap limit`
      ),
      { route: "/api/health" }
    );
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

  // Availability is decided by blocking checks only. A check is blocking when
  // its failure means the service cannot serve traffic correctly: the database
  // probe, and memory only at CRITICAL pressure. Warning-level and
  // informational checks change the reported status but never the HTTP code.
  const blockingFailure =
    checks.database.status === "unhealthy" || checks.memory.status === "unhealthy";
  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");
  const overallStatus = allHealthy ? "healthy" : "degraded";

  logger.debug("Health check executed", { status: overallStatus });

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      environment: process.env.NODE_ENV ?? "unknown",
      checks,
    },
    { status: blockingFailure ? 503 : 200 }
  );
}

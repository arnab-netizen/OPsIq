import { withRequestContext } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withRequestContext(async () => {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "unhealthy",
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }

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

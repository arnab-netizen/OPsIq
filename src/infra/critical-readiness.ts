/**
 * CRITICAL READINESS ASSESSMENT
 *
 * Evaluates whether the application can serve requests.
 * Differs from startup-orchestrator which runs once at init.
 * This runs per-request and re-evaluates current conditions.
 *
 * Key principle: A prior FAILED state from an obsolete check should not
 * permanently block requests if current critical conditions are healthy.
 */

import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export type CriticalReadinessStatus = "READY" | "DEGRADED_NON_BLOCKING" | "FAILED_CRITICAL";

export interface CriticalReadinessResult {
  status: CriticalReadinessStatus;
  checks: {
    database_reachable: boolean;
    configuration_valid: boolean;
  };
  timestamp: Date;
  errors: string[];
}

/**
 * Perform critical readiness assessment.
 * This is the per-request evaluation of whether we can serve.
 *
 * Returns:
 * - READY: All critical checks pass
 * - DEGRADED_NON_BLOCKING: Non-critical issue, can still serve
 * - FAILED_CRITICAL: Critical dependency unavailable, cannot serve
 *
 * This function is safe to call multiple times per request.
 */
export async function ensureCriticalReadiness(): Promise<CriticalReadinessResult> {
  const result: CriticalReadinessResult = {
    status: "READY",
    checks: {
      database_reachable: false,
      configuration_valid: false,
    },
    timestamp: new Date(),
    errors: [],
  };

  try {
    // CRITICAL CHECK 1: Database connectivity (required for all operations)
    try {
      const { getDbInstance } = await import("@/lib/db");
      const dbInstance = await getDbInstance();
      const dbReachable = await checkDatabaseConnectivity(dbInstance);

      result.checks.database_reachable = dbReachable;

      if (!dbReachable) {
        result.status = "FAILED_CRITICAL";
        result.errors.push("Database is not reachable");
      }
    } catch (error) {
      result.status = "FAILED_CRITICAL";
      result.checks.database_reachable = false;
      const msg =
        error instanceof Error ? error.message : String(error);
      result.errors.push(`Database connectivity check failed: ${msg}`);
    }

    // CRITICAL CHECK 2: Configuration validity (required to start)
    try {
      const configValid = validateCriticalConfiguration();
      result.checks.configuration_valid = configValid;

      if (!configValid) {
        result.status = "FAILED_CRITICAL";
        result.errors.push("Critical configuration is missing or invalid");
      }
    } catch (error) {
      result.status = "FAILED_CRITICAL";
      result.checks.configuration_valid = false;
      const msg =
        error instanceof Error ? error.message : String(error);
      result.errors.push(`Configuration validation failed: ${msg}`);
    }

    // Summary: If any critical check failed, overall status is FAILED_CRITICAL
    if (result.errors.length === 0) {
      result.status = "READY";
    }
  } catch (error) {
    result.status = "DEGRADED_NON_BLOCKING";
    const msg =
      error instanceof Error ? error.message : String(error);
    result.errors.push(`Unexpected error in readiness assessment: ${msg}`);
  }

  return result;
}

async function checkDatabaseConnectivity(dbInstance: any): Promise<boolean> {
  try {
    // Use the same proven path as production: Prisma query
    await Promise.race([
      dbInstance.$queryRawUnsafe("SELECT 1"),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("Database connectivity check timed out")),
          5000
        )
      ),
    ]);
    return true;
  } catch (error) {
    logger.error("Database connectivity check failed", {
      error:
        error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function validateCriticalConfiguration(): boolean {
  // Only check truly critical environment variables
  // that are needed to start the application
  const criticalEnvVars = ["DATABASE_URL"];

  for (const envVar of criticalEnvVars) {
    if (!process.env[envVar]) {
      logger.error(
        `Critical configuration missing: ${envVar}`
      );
      return false;
    }
  }

  return true;
}

/**
 * NODE-RUNTIME STARTUP ORCHESTRATOR
 *
 * This module ONLY runs in Node.js runtime (not Edge).
 * It performs actual startup checks and updates the global startup state.
 * Middleware imports startup-state, not this module.
 */

import { setStartupComplete, setStartupError } from "@/infra/startup-state";

let startupPromise: Promise<boolean> | null = null;

/**
 * Orchestrate startup checks (runs ONCE, in Node context)
 */
export async function ensureStartupComplete(): Promise<void> {
  // Return existing promise if already running
  if (startupPromise) {
    await startupPromise;
    return;
  }

  // Prevent concurrent startup
  startupPromise = performStartupChecks();
  await startupPromise;
}

async function performStartupChecks(): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Dynamic imports - only loaded in Node context
    const { getDbInstance } = await import("@/lib/db");
    const { logger } = await import("@/infra/logger");

    logger.info("Starting application startup checks...");

    // Check 1: Database connectivity
    logger.debug("Checking database connectivity...");
    const dbInstance = await getDbInstance();
    const dbReachable = await checkDatabase(dbInstance, logger);
    if (!dbReachable) {
      throw new Error("Database is not reachable");
    }
    logger.debug("✓ Database connectivity verified");

    // Check 2: Schema validation
    logger.debug("Checking database schema...");
    const schemaValid = await checkDatabaseSchema(dbInstance, logger);
    if (!schemaValid) {
      throw new Error("Database schema is invalid or migrations not applied");
    }
    logger.debug("✓ Database schema verified");

    // Check 3: Configuration validation
    logger.debug("Checking configuration...");
    const configValid = checkConfiguration(logger);
    if (!configValid) {
      throw new Error("Configuration is invalid");
    }
    logger.debug("✓ Configuration verified");

    const duration = Date.now() - startTime;
    logger.info("✓ Application startup checks passed", { duration_ms: duration });

    setStartupComplete(true);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorObj = error instanceof Error ? error : new Error(errorMsg);

    try {
      const { logger } = await import("@/infra/logger");
      logger.error("✗ Application startup checks FAILED", {
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      });
    } catch {
      console.error("✗ Application startup checks FAILED", {
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      });
    }

    setStartupError(errorObj);
    throw errorObj;
  }
}

async function checkDatabase(dbInstance: any, logger: any): Promise<boolean> {
  try {
    await dbInstance.$queryRawUnsafe("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Database connectivity check failed", { error });
    return false;
  }
}

async function checkDatabaseSchema(dbInstance: any, logger: any): Promise<boolean> {
  try {
    const requiredTables = ["workspace", "user", "decision", "action", "auditEvent", "webhookEvent"];

    for (const table of requiredTables) {
      const result = await dbInstance.$queryRawUnsafe(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
      );

      if (!result || !result[0]?.exists) {
        logger.error(`Required table missing: ${table}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error("Database schema check failed", { error });
    return false;
  }
}

function checkConfiguration(logger: any): boolean {
  const requiredEnvVars = ["DATABASE_URL", "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET"];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      return false;
    }
  }

  return true;
}

/**
 * NODE-RUNTIME STARTUP ORCHESTRATOR
 *
 * This module ONLY runs in Node.js runtime (not Edge).
 * It performs actual startup checks and updates the global startup state.
 * Middleware imports startup-state, not this module.
 */

import { setStartupComplete, setStartupError } from "@/infra/startup-state";

let startupPromise: Promise<boolean> | null = null;
let startupResult: { success: boolean; error?: Error } | null = null;
const STARTUP_TIMEOUT_MS = 30000;

/**
 * Orchestrate startup checks (runs ONCE, in Node context)
 */
export async function ensureStartupComplete(): Promise<void> {
  // Return cached result if already completed
  if (startupResult) {
    if (startupResult.success) return;
    throw startupResult.error || new Error("Startup checks failed");
  }

  // Return existing promise if already running
  if (startupPromise) {
    await Promise.race([
      startupPromise,
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    return;
  }

  // Prevent concurrent startup - start new orchestration
  startupPromise = performStartupChecks();
  try {
    await Promise.race([
      startupPromise,
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    // Success - cache it
    startupResult = { success: true };
  } catch (error) {
    // Cache failure but allow retry on next call after timeout
    const errorObj = error instanceof Error ? error : new Error(String(error));
    startupResult = { success: false, error: errorObj };
    startupPromise = null;
    throw errorObj;
  }
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
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorObj = error instanceof Error ? error : new Error(errorMsg);

    try {
      const { logger } = await import("@/infra/logger");
      logger.error("✗ Application startup checks FAILED", {
        error_message: errorMsg,
        error_stack: errorStack,
        duration_ms: Date.now() - startTime,
      });
    } catch {
      console.error("✗ Application startup checks FAILED", JSON.stringify({
        error_message: errorMsg,
        error_stack: errorStack,
        duration_ms: Date.now() - startTime,
      }, null, 2));
    }

    setStartupError(errorObj);
    throw errorObj;
  }
}

async function checkDatabase(dbInstance: any, logger: any): Promise<boolean> {
  try {
    await Promise.race([
      dbInstance.$queryRawUnsafe("SELECT 1"),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Database connectivity check timed out after 5s")), 5000)
      ),
    ]);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Database connectivity check failed", { error: msg });
    return false;
  }
}

async function checkDatabaseSchema(dbInstance: any, logger: any): Promise<boolean> {
  try {
    const requiredTables = ["workspaces", "users", "actions", "audit_events", "webhook_events"];

    for (const table of requiredTables) {
      const result = await Promise.race([
        dbInstance.$queryRawUnsafe(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
        ),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error(`Schema check for ${table} timed out after 5s`)), 5000)
        ),
      ]);

      if (!result || !result[0]?.exists) {
        logger.error(`Required table missing: ${table}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Database schema check failed", { error: msg });
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

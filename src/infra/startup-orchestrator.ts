/**
 * NODE-RUNTIME STARTUP ORCHESTRATOR
 *
 * SINGLE SOURCE OF TRUTH for startup state.
 * This module ONLY runs in Node.js runtime (not Edge).
 * It EXCLUSIVELY mutates startup-state.ts.
 * No other module mutates startup state.
 * Middleware imports startup-state (read-only).
 */

import { setStartupState, setStartupError, StartupState, getStartupState } from "@/infra/startup-state";

let startupPromise: Promise<void> | null = null;
const STARTUP_TIMEOUT_MS = 30000;

/**
 * Orchestrate startup checks (runs ONCE, in Node context).
 * This is the ONLY code that mutates startup state.
 *
 * State transitions:
 * NOT_STARTED → STARTING → READY (success)
 *            → STARTING → FAILED (error)
 */
export async function ensureStartupComplete(): Promise<void> {
  const state = getStartupState();

  // Terminal states - no retry
  if (state === StartupState.READY) {
    return; // Already ready
  }

  if (state === StartupState.FAILED) {
    throw new Error("Startup previously failed - cannot retry");
  }

  // Already starting - wait for in-flight promise
  if (startupPromise) {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    return; // startupPromise completed, now check state
  }

  // Not started yet - initiate startup
  setStartupState(StartupState.STARTING);

  startupPromise = performStartupChecks();
  try {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    // Success
    setStartupState(StartupState.READY);
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    setStartupError(errorObj);
    throw errorObj;
  }
}

async function performStartupChecks(): Promise<void> {
  const startTime = Date.now();

  try {
    // Dynamic imports - only loaded in Node context
    const { getDbInstance } = await import("@/lib/db");
    const { logger } = await import("@/infra/logger");

    logger.info("✓ STARTUP: Starting application startup checks...");

    // Check 1: Database connectivity
    logger.debug("STARTUP: Checking database connectivity...");
    const dbInstance = await getDbInstance();
    const dbReachable = await checkDatabase(dbInstance, logger);
    if (!dbReachable) {
      throw new Error("Database is not reachable");
    }
    logger.debug("✓ STARTUP: Database connectivity verified");

    // Check 2: Schema validation
    logger.debug("STARTUP: Checking database schema...");
    const schemaValid = await checkDatabaseSchema(dbInstance, logger);
    if (!schemaValid) {
      throw new Error("Database schema is invalid or migrations not applied");
    }
    logger.debug("✓ STARTUP: Database schema verified");

    // Check 3: Configuration validation
    logger.debug("STARTUP: Checking configuration...");
    const configValid = checkConfiguration(logger);
    if (!configValid) {
      throw new Error("Configuration is invalid");
    }
    logger.debug("✓ STARTUP: Configuration verified");

    const duration = Date.now() - startTime;
    logger.info("✓ STARTUP: All checks passed", { duration_ms: duration });
    // NOTE: setStartupState(READY) is called in ensureStartupComplete(), not here
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorObj = error instanceof Error ? error : new Error(errorMsg);

    try {
      const { logger } = await import("@/infra/logger");
      logger.error("✗ STARTUP: Checks FAILED", {
        error_message: errorMsg,
        error_stack: errorStack,
        duration_ms: Date.now() - startTime,
      });
    } catch {
      console.error("✗ STARTUP: Checks FAILED", JSON.stringify({
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

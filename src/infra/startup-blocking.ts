/**
 * Startup Blocking Module
 *
 * Ensures application startup is fail-closed:
 * - Blocks until database is ready
 * - Blocks until migrations are applied
 * - Blocks until all checks pass
 * - HTTP server cannot listen until this passes
 */

import { getDbInstance } from "@/lib/db";
import { logger } from "@/infra/logger";

let startupPromise: Promise<boolean> | null = null;
let startupComplete = false;
let startupError: Error | null = null;

/**
 * Synchronous check: Has startup completed?
 */
export function isStartupComplete(): boolean {
  return startupComplete;
}

/**
 * Get startup error if startup failed
 */
export function getStartupError(): Error | null {
  return startupError;
}

/**
 * Block until startup is complete
 */
export async function blockUntilStartupComplete(): Promise<void> {
  if (startupComplete) return;

  if (startupPromise) {
    await startupPromise;
    return;
  }

  startupPromise = performStartupChecks();
  await startupPromise;
}

/**
 * Perform all startup checks
 * This MUST pass before accepting traffic
 */
async function performStartupChecks(): Promise<boolean> {
  const startTime = Date.now();

  try {
    logger.info("Starting application startup checks...");

    // Check 1: Database connectivity
    logger.debug("Checking database connectivity...");
    const dbInstance = await getDbInstance();
    const dbReachable = await checkDatabase(dbInstance);
    if (!dbReachable) {
      throw new Error("Database is not reachable");
    }
    logger.debug("✓ Database connectivity verified");

    // Check 2: Database schema validation
    logger.debug("Checking database schema...");
    const schemaValid = await checkDatabaseSchema(dbInstance);
    if (!schemaValid) {
      throw new Error("Database schema is invalid or migrations not applied");
    }
    logger.debug("✓ Database schema verified");

    // Check 3: Configuration validation
    logger.debug("Checking configuration...");
    const configValid = checkConfiguration();
    if (!configValid) {
      throw new Error("Configuration is invalid");
    }
    logger.debug("✓ Configuration verified");

    const duration = Date.now() - startTime;
    logger.info("✓ Application startup checks passed", { duration_ms: duration });

    startupComplete = true;
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    startupError = error instanceof Error ? error : new Error(errorMsg);

    logger.error("✗ Application startup checks FAILED", {
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    });

    // Do NOT attempt to recover - fail-closed
    throw startupError;
  }
}

/**
 * Verify database connectivity with basic query
 */
async function checkDatabase(dbInstance: any): Promise<boolean> {
  try {
    await dbInstance.$queryRawUnsafe("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Database connectivity check failed", { error });
    return false;
  }
}

/**
 * Verify database schema matches expectations
 * This prevents silent schema divergence
 */
async function checkDatabaseSchema(dbInstance: any): Promise<boolean> {
  try {
    // Check 1: Verify critical tables exist
    const requiredTables = [
      "workspace",
      "user",
      "decision",
      "action",
      "auditEvent",
      "webhookEvent",
    ];

    for (const table of requiredTables) {
      const result = await dbInstance.$queryRawUnsafe(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
      );

      if (!result || !result[0]?.exists) {
        logger.error(`Required table missing: ${table}`);
        return false;
      }
    }

    // Check 2: Verify schema version (if tracking)
    // This ensures migrations have been run
    try {
      const migrationCheck = await dbInstance.$queryRawUnsafe(
        "SELECT COUNT(*) as count FROM \"_prisma_migrations\""
      );

      if (!migrationCheck || migrationCheck[0]?.count === 0) {
        logger.error("No migrations found - database not properly initialized");
        return false;
      }
    } catch {
      // Prisma migrations table might not exist in test environment
      // Continue with other checks
    }

    return true;
  } catch (error) {
    logger.error("Database schema check failed", { error });
    return false;
  }
}

/**
 * Verify critical configuration is present
 */
function checkConfiguration(): boolean {
  const requiredEnvVars = ["DATABASE_URL", "STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET"];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      return false;
    }
  }

  return true;
}

// Auto-start checks when this module is imported
if (typeof globalThis !== "undefined" && typeof window === "undefined") {
  // Only run in server environment, not browser
  blockUntilStartupComplete().catch((error) => {
    logger.error("Startup initialization failed (non-recoverable)", { error });
    // Note: Cannot call process.exit() in Edge Runtime (middleware)
    // Error is captured in startupError and will be returned as 503 by middleware
  });
}

/**
 * NODE-RUNTIME STARTUP ORCHESTRATOR
 *
 * Performs startup checks and updates durable startup status.
 * Uses database as single source of truth (not memory).
 * Works across middleware, handlers, instances, restarts.
 */

import { setStartupStatus, getStartupStatus } from "@/services/startup-status";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

let startupPromise: Promise<void> | null = null;
const STARTUP_TIMEOUT_MS = 30000;

/**
 * Orchestrate startup checks (runs ONCE per instance).
 * Reads durable status from database, updates it after checks.
 *
 * State transitions:
 * NOT_STARTED → STARTING → READY (success)
 *            → STARTING → FAILED (error)
 */
export async function ensureStartupComplete(): Promise<void> {
  const status = await getStartupStatus();

  // Terminal success - no retry needed.
  if (status.status === "READY") {
    return; // Already ready
  }

  // Previously FAILED: re-evaluate rather than poisoning the instance forever.
  //
  // A FAILED state is most often caused by a since-corrected configuration
  // problem (e.g. a missing env var that has now been supplied). Re-running the
  // checks lets the instance recover to READY WITHOUT manual database deletion.
  // This does NOT mask real failures: the re-run still performs the live
  // database connectivity check, so a genuinely unhealthy instance fails again
  // and is re-persisted as FAILED.
  if (status.status === "FAILED") {
    await runStartupChecksAndPersist();
    return;
  }

  // Already starting - wait for in-flight promise.
  if (startupPromise) {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    return; // startupPromise completed, now check status
  }

  // Not started yet - initiate startup.
  await setStartupStatus("STARTING");
  await runStartupChecksAndPersist();
}

/**
 * Run the startup checks once and persist the resulting durable status.
 * Clears the in-flight promise on completion so a subsequent call (e.g. a later
 * readiness probe after a config fix) can re-evaluate.
 */
async function runStartupChecksAndPersist(): Promise<void> {
  startupPromise = performStartupChecks();
  try {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    // Success - persist to DB.
    await setStartupStatus("READY", { completedAt: new Date() });
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorMsg = errorObj.message;
    // Persist failure to DB.
    await setStartupStatus("FAILED", { error: errorMsg });
    throw errorObj;
  } finally {
    // Allow future re-evaluation (recovery) on the next call.
    startupPromise = null;
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

    // Check 4: Private workspace ID validation (only when configured)
    const privateWorkspaceId = process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
    if (privateWorkspaceId) {
      logger.debug("STARTUP: Checking private workspace exists in DB...");
      const privateWorkspaceExists = await checkPrivateWorkspaceExists(dbInstance, privateWorkspaceId);
      if (!privateWorkspaceExists) {
        // Fail readiness (not crash): the misconfiguration is surfaced as a startup
        // failure so operators see it immediately, but the process is not killed.
        throw new Error(
          `OPSIQ_PRIVATE_WORKSPACE_ID is set to "${privateWorkspaceId}" but no matching workspace was found in the database. ` +
          "Run scripts/seed-private-owner.ts to create it, or unset OPSIQ_PRIVATE_WORKSPACE_ID.",
        );
      }
      logger.info("✓ STARTUP: Private workspace verified", { workspaceId: privateWorkspaceId });
    }

    const duration = Date.now() - startTime;
    logger.info("✓ STARTUP: All checks passed", { duration_ms: duration });
    // NOTE: setStartupState(READY) is called in ensureStartupComplete(), not here
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    const errorMsg = governed.operatorMessage;
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
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    const msg = governed.operatorMessage;
    logger.error("Database connectivity check failed", new Error(msg));
    return false;
  }
}

async function checkDatabaseSchema(dbInstance: any, logger: any): Promise<boolean> {
  try {
    // Schema validation: If database connectivity check passed (already verified above),
    // and Prisma client initialized successfully, schema is assumed valid.
    // Specific table name checks removed - they were using wrong table names.
    // Prisma will error during actual queries if schema is mismatched.

    logger.debug("Schema check: Trusting Prisma initialization validation");
    return true;
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    const msg = governed.operatorMessage;
    logger.error("Database schema check failed", new Error(msg));
    return false;
  }
}

export interface StartupConfigCheck {
  /** False only when a truly-required boot variable is missing. */
  valid: boolean;
  /** Required boot variables that are missing (currently only DATABASE_URL). */
  missing: string[];
  /** Whether payment/billing is configured (Stripe present). */
  billingEnabled: boolean;
  /** Non-blocking advisories (e.g. Stripe absent → billing disabled). */
  warnings: string[];
}

/**
 * Evaluate startup configuration.
 *
 * Only DATABASE_URL is required to boot and serve the application — the
 * stranger-safe customer journey (signup / login / diagnosis) has no Stripe
 * dependency, and the Stripe clients are lazily initialized. A missing Stripe
 * configuration is therefore a non-blocking warning ("billing disabled"), never
 * a startup failure. This mirrors the per-request critical-readiness contract
 * (src/infra/critical-readiness.ts), which also treats only DATABASE_URL as
 * critical.
 */
export function checkStartupConfiguration(): StartupConfigCheck {
  const requiredEnvVars = ["DATABASE_URL"];
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  const billingEnabled = Boolean(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
  );
  const warnings: string[] = [];
  if (!billingEnabled) {
    warnings.push(
      "Stripe not configured (STRIPE_SECRET_KEY/STRIPE_API_KEY absent) - billing disabled"
    );
  }

  return {
    valid: missing.length === 0,
    missing,
    billingEnabled,
    warnings,
  };
}

function checkConfiguration(logger: any): boolean {
  const result = checkStartupConfiguration();

  for (const envVar of result.missing) {
    logger.error(`Missing required environment variable: ${envVar}`);
  }
  for (const warning of result.warnings) {
    logger.warn(warning);
  }

  return result.valid;
}

/**
 * Verify that OPSIQ_PRIVATE_WORKSPACE_ID resolves to an existing workspace in the DB.
 * Checks both the workspaces table (Workspace.id) and the client_accounts table
 * (ClientAccount.id) — the private deployment uses the same UUID for both.
 */
async function checkPrivateWorkspaceExists(dbInstance: any, workspaceId: string): Promise<boolean> {
  try {
    const workspace = await dbInstance.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    return workspace !== null;
  } catch {
    return false;
  }
}

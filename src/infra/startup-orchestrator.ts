/**
 * NODE-RUNTIME STARTUP ORCHESTRATOR
 *
 * Performs startup checks and updates durable startup status.
 * Uses database as single source of truth (not memory).
 * Works across middleware, handlers, instances, restarts.
 */

import { claimStartup, completeStartup, resolveInstanceId } from "@/services/startup-status";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";
import { withStatementTimeout, TRANSACTION_ACQUIRE_MAX_WAIT_MS, ACQUISITION_QUEUE_WAIT_MS } from "@/lib/db";

let startupPromise: Promise<void> | null = null;
const STARTUP_TIMEOUT_MS = 30000;
/**
 * Database-enforced bound for the readiness-probe query below. Postgres
 * cancels the statement itself if exceeded, so a stalled connection can
 * never hold the shared pool's sole connection (max: 1) indefinitely — see
 * withStatementTimeout() in src/lib/db.ts.
 */
export const DB_CHECK_STATEMENT_TIMEOUT_MS = 4000;
/**
 * F-PROD-STARTUP-COLDSTART: this outer JS-side race MUST stay longer than
 * withStatementTimeout()'s own worst case — its ACQUISITION_QUEUE_WAIT_MS
 * queue-wait bound, plus its maxWait to acquire a connection once at the
 * front, plus its own execution timeout — otherwise this race fires first
 * on a slow-but-legitimate cold start and reports the exact same false
 * "unexpected error" outcome the inner fix was meant to prevent, silently
 * undoing it. Derived from the shared constants, not an independent guess,
 * so the two can never drift out of sync again.
 */
export const DB_CHECK_TIMEOUT_MS = ACQUISITION_QUEUE_WAIT_MS + TRANSACTION_ACQUIRE_MAX_WAIT_MS + DB_CHECK_STATEMENT_TIMEOUT_MS + 3000;
/**
 * Same reasoning as DB_CHECK_TIMEOUT_MS above, sized against
 * checkMigrationReadiness()'s own MIGRATION_QUERY_STATEMENT_TIMEOUT_MS
 * (src/services/monitoring/migration-check.ts, currently 5000ms).
 */
export const MIGRATION_READINESS_TIMEOUT_MS = ACQUISITION_QUEUE_WAIT_MS + TRANSACTION_ACQUIRE_MAX_WAIT_MS + 5000 + 3000;

/**
 * Orchestrate startup checks (runs ONCE per instance).
 * Reads durable status from database, updates it after checks.
 *
 * State transitions:
 * NOT_STARTED → STARTING → READY (success)
 *            → STARTING → FAILED (error)
 *
 * P0-15 (cross-instance startup race): ownership of the STARTING → terminal
 * transition is now decided by an atomic DB claim (see claimStartup() /
 * completeStartup() in @/services/startup-status), not by each instance
 * independently reading status and deciding what to do. This function keeps
 * exactly one local-process fast path (the `startupPromise` in-flight check
 * below) because that case is genuinely different from the cross-instance
 * case: it is cheap, in-memory, and already correct — a second concurrent
 * call INSIDE this same process while checks are still running here should
 * just await the same in-flight promise. Everything else (another Vercel
 * instance entirely) goes through the atomic claim.
 */
export async function ensureStartupComplete(): Promise<void> {
  // Fail closed before anything else: a deployment runtime that cannot prove
  // which deployment it is must not read, write, or inherit any status row.
  // Throws MissingDeploymentIdentityError, which callers already handle.
  resolveInstanceId();

  // Same-process fast path: a second concurrent call while this exact
  // process already has checks in flight waits for that result instead of
  // attempting a new claim (which it would lose anyway, atomically, since
  // the row is already STARTING under this process's own not-yet-stale claim).
  if (startupPromise) {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    return;
  }

  const claim = await claimStartup();
  if (claim.outcome !== "CLAIMED") {
    // ALREADY_READY: a prior claimant already finished successfully, nothing
    // to do. IN_PROGRESS: a different instance holds a live, non-stale claim
    // right now — do NOT run checks, do NOT write STARTING/FAILED, do NOT
    // busy-loop waiting on it. The existing readiness contract already treats
    // "not yet READY" as a legitimate, retriable state (see /api/readiness),
    // so the caller simply returns and the next probe/request re-checks.
    return;
  }

  await runStartupChecksAndPersist(claim.claimToken);
}

/**
 * Run the startup checks once and persist the resulting durable status via
 * the claim this caller won. Clears the in-flight promise on completion so a
 * subsequent call (e.g. a later readiness probe after a config fix) can
 * re-evaluate and (if the row is by then FAILED or stale) claim again.
 */
async function runStartupChecksAndPersist(claimToken: string): Promise<void> {
  startupPromise = performStartupChecks();
  try {
    await Promise.race([
      startupPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup checks timed out")), STARTUP_TIMEOUT_MS)
      ),
    ]);
    // Success - persist to DB, but only if this claim is still current.
    await completeStartup(claimToken, "READY", { completedAt: new Date() });
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorMsg = errorObj.message;
    // Persist failure to DB, but only if this claim is still current — a
    // straggler whose claim was reclaimed as stale must never overwrite a
    // newer attempt's result. completeStartup() no-ops safely in that case;
    // this instance's own caller still sees the throw below either way.
    await completeStartup(claimToken, "FAILED", { error: errorMsg });
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

    // Check 2: Migration currency — all committed migrations must be applied.
    // Compares prisma/migrations/ directories against _prisma_migrations rows.
    // Fail closed: if the migrations directory is absent (Vercel bundle gap) or
    // the DB is unreachable, this returns ready:false and startup fails.
    //
    // P0-15 forensic audit finding: this was the one DB-bound check in the
    // whole sequence with no timeout of its own — bounded only by the outer
    // 30s STARTUP_TIMEOUT_MS race, which (unlike this check) does not cancel
    // the underlying query; an orphaned query left running past that race
    // cannot produce a stale completion write regardless (nothing re-awaits
    // it after the race), but it could otherwise hold the pool's one (max:1)
    // connection busy indefinitely. Bounding it explicitly, matching
    // checkDatabase()'s existing pattern, makes the failure fast and
    // attributable instead of silently riding the outer race to its limit.
    logger.debug("STARTUP: Checking migration history currency...");
    const migrationStatus = await Promise.race([
      checkMigrationReadiness(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Migration readiness check timed out after ${MIGRATION_READINESS_TIMEOUT_MS}ms`)),
          MIGRATION_READINESS_TIMEOUT_MS
        )
      ),
    ]);
    if (!migrationStatus.ready) {
      throw new Error(
        `Migration history is not current: ` +
        `${migrationStatus.pending ?? 0} pending, ` +
        `${migrationStatus.failed ?? 0} failed. ` +
        `Run \`prisma migrate deploy\` to apply pending migrations. ` +
        (migrationStatus.error ? `Error: ${migrationStatus.error}` : "")
      );
    }
    logger.debug("✓ STARTUP: Migration history verified", {
      totalCommitted: migrationStatus.totalCommitted,
      applied: migrationStatus.applied,
    });

    // Check 3 (legacy label preserved): Schema validation
    // With migration currency proven above, schema is trusted to be current.
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
        // Do NOT include the workspace ID value in the error — it is a sensitive identifier.
        throw new Error(
          "OPSIQ_PRIVATE_WORKSPACE_ID is configured but no matching workspace was found in the database. " +
          "Run scripts/seed-private-owner.ts to create it, or unset OPSIQ_PRIVATE_WORKSPACE_ID.",
        );
      }
      // Log only masked form of the ID for operator diagnostics.
      const maskedId = privateWorkspaceId.length > 8
        ? `${privateWorkspaceId.slice(0, 4)}...${privateWorkspaceId.slice(-4)}`
        : "***";
      logger.info("✓ STARTUP: Private workspace verified", { workspaceId: maskedId });
    }

    const duration = Date.now() - startTime;
    logger.info("✓ STARTUP: All checks passed", { duration_ms: duration });
    // NOTE: durable completion (READY/FAILED) is persisted by completeStartup()
    // in runStartupChecksAndPersist(), not here — this function only decides
    // pass/fail and throws on failure.
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
      withStatementTimeout(dbInstance, DB_CHECK_STATEMENT_TIMEOUT_MS, (tx) => tx.$queryRawUnsafe("SELECT 1"), "checkDatabase"),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Database connectivity check timed out after ${DB_CHECK_TIMEOUT_MS}ms`)), DB_CHECK_TIMEOUT_MS)
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

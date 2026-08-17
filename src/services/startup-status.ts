/**
 * Durable Startup Status Service
 *
 * Provides persistent, distributed startup status.
 * - Single source of truth: database
 * - Works across middleware, handlers, instances
 * - Survives restart
 * - Auditable
 */

import { createHash, randomUUID } from "crypto";

import { Prisma } from "@/generated/prisma/client";
import { db, getDbInstance, withStatementTimeout } from "@/lib/db";
import { logger } from "@/infra/logger";

/**
 * Database-enforced bound for the atomic claim query below. Matches the
 * existing 5s budget every other DB-backed startup probe already uses for a
 * single round trip on a possibly-cold connection. Postgres cancels the
 * statement itself if exceeded, so a stalled Neon connection can never hold
 * the shared pool's sole connection (max: 1) indefinitely — see
 * withStatementTimeout() in src/lib/db.ts.
 */
const CLAIM_STATEMENT_TIMEOUT_MS = 5000;

/**
 * True when a Prisma error indicates the startup_status table does not exist.
 * Covers P2021 ("table does not exist") and the message pattern Prisma uses
 * when it cannot find the table in the catalogue.
 * Logged at WARN rather than ERROR so CI is not polluted with noise before
 * the startup_status migration has been applied.
 */
function isMissingTableError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2021") return true;
  // Fallback: catch the message pattern Prisma emits for a missing relation.
  // Prisma uses camelCase "startupStatus" in invocation traces, not "startup_status".
  const msg = err.message ?? "";
  return (
    (msg.includes("startup_status") || msg.includes("startupStatus")) &&
    (msg.includes("does not exist") || msg.includes("Invalid"))
  );
}

/**
 * True when a Prisma/Postgres error indicates a referenced column does not
 * exist yet — specifically the case where application code that knows about
 * claimStartup()/completeStartup() runs against a database the additive
 * "claim_token" migration has not reached (deploy-before-migrate ordering
 * mistake). Covers Prisma's P2022 ("column does not exist") and raw
 * Postgres's 42703 ("undefined_column"), which surfaces through $queryRaw.
 */
function isMissingColumnError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2022") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42703") || msg.includes("does not exist") && msg.includes("claim_token");
}

/**
 * True when an error is a transient connection failure (e.g. Neon cold-start timeout).
 * These are downgraded to WARN because startup_status writes are non-critical and
 * the connection will succeed once the serverless endpoint finishes waking up.
 *
 * "Authentication timed out" (Prisma's pg driver adapter) and "timeout exceeded
 * when trying to connect" (node-postgres's pg-pool, on connection-acquisition
 * timeout) are both confirmed production signatures for this same Neon
 * cold-start class, not just the four original TCP-level patterns.
 */
function isTransientConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Connection terminated due to connection timeout") ||
    msg.includes("Connection terminated unexpectedly") ||
    msg.includes("connect ECONNREFUSED") ||
    msg.includes("connect ETIMEDOUT") ||
    msg.includes("Authentication timed out") ||
    msg.includes("timeout exceeded when trying to connect")
  );
}

export type StartupStatusType = "NOT_STARTED" | "STARTING" | "READY" | "FAILED";

/**
 * Instance key used when the process is NOT running as a deployment (local
 * development, unit tests). Documented and local-only: `resolveInstanceId`
 * never returns it inside a deployment runtime.
 */
export const LOCAL_INSTANCE_ID = "local-development";

/** Reported instance key when deployment identity could not be resolved. */
const UNRESOLVED_INSTANCE_ID = "unresolved";

/**
 * Upper bound for any instance key we persist.
 *
 * `startup_status.instance_id` is TEXT (no declared limit), but it carries a
 * UNIQUE btree index, and btree rejects entries beyond roughly 2704 bytes. A
 * generous cap well below that keeps every accepted input indexable. Derived
 * keys are always 36 chars (`dpl-`/`loc-` + 32 hex); only an explicit
 * OPSIQ_INSTANCE_ID could exceed it, and that is normalised rather than stored.
 */
export const MAX_INSTANCE_ID_LENGTH = 128;

/** Characters permitted verbatim in an explicit OPSIQ_INSTANCE_ID. */
const SAFE_INSTANCE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * How long a claimed "STARTING" row is honored before another instance may
 * reclaim it as abandoned (crashed/frozen claimant that never completed).
 *
 * Derived from this codebase's own startup budget, not chosen blindly:
 * src/infra/startup-orchestrator.ts's STARTUP_TIMEOUT_MS (30_000ms) is the
 * outer Promise.race a legitimate claimant is already bound by before it
 * even attempts its terminal completeStartup() write. That write itself is a
 * single, already-connected query (the DB connectivity check earlier in the
 * same run establishes the pool's one connection first) so it normally lands
 * in well under a second — but production evidence for this exact incident
 * (P0-15) shows Neon-side auth/connection failures on the order of several
 * seconds, not the full 90s pg.Pool connectionTimeoutMillis ceiling. 60_000ms
 * (2x STARTUP_TIMEOUT_MS) comfortably covers "outer race gives up" + "the
 * FAILED-path completion write itself lands" with margin, while staying far
 * short of the 90s pool ceiling (so a legitimate-but-slow claimant is not
 * prematurely reclaimed) and short enough that a genuinely abandoned claim
 * (process killed before it could write anything) is recoverable within one
 * normal cold-start cadence, not stuck indefinitely.
 */
export const STARTUP_CLAIM_LEASE_MS = 60_000;

/** Discriminated result of an attempted startup claim. See claimStartup(). */
export type StartupClaimResult =
  | { outcome: "CLAIMED"; claimToken: string; instanceId: string }
  | { outcome: "ALREADY_READY"; instanceId: string }
  | { outcome: "IN_PROGRESS"; instanceId: string };

/** Stable 32-hex digest used to derive bounded, non-reversible instance keys. */
function digest(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32);
}

/**
 * Operator-safe, fixed message for a missing deployment identity. Authored
 * here (never derived from a caught error), so it is safe to surface directly
 * in the readiness contract without leaking runtime detail.
 */
export const MISSING_DEPLOYMENT_IDENTITY_MESSAGE =
  "Startup aborted: no trustworthy deployment identity is available. " +
  "Expected VERCEL_DEPLOYMENT_ID or VERCEL_GIT_COMMIT_SHA in a deployment " +
  "runtime. Enable 'Automatically expose System Environment Variables' for " +
  "the project.";

/**
 * Thrown when a deployment runtime cannot prove which deployment it is.
 * Startup fails closed rather than sharing one status row across deployments.
 */
export class MissingDeploymentIdentityError extends Error {
  constructor() {
    super(MISSING_DEPLOYMENT_IDENTITY_MESSAGE);
    this.name = "MissingDeploymentIdentityError";
  }
}

/** Read an env var, treating empty/whitespace as absent. */
function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when this process is serving as a deployment (Vercel, or any
 * NODE_ENV=production runtime) rather than local development or tests.
 */
export function isDeploymentRuntime(): boolean {
  return readEnv("VERCEL") === "1" || process.env.NODE_ENV === "production";
}

/**
 * Resolve the startup-status key for THIS deployment.
 *
 * Deployment runtime: derived from a deployment-scoped Vercel system variable
 * (both are documented as available at runtime). The raw identifier is hashed,
 * so no deployment identifier is ever persisted or logged verbatim, and the
 * result always fits the `startup_status.instance_id` text column.
 *
 * Neither HOSTNAME nor npm_package_version is a Vercel system variable — both
 * resolve to undefined on the Node.js serverless runtime, which is why the
 * previous `HOSTNAME || "unknown"` collapsed every deployment onto one row.
 *
 * @throws MissingDeploymentIdentityError in a deployment runtime with no
 *         trustworthy identifier. There is deliberately no shared fallback.
 */
export function resolveInstanceId(): string {
  if (isDeploymentRuntime()) {
    // Precedence: deployment id first — it is unique per deployment, so a
    // redeploy of the SAME commit still gets its own key. Commit SHA is the
    // documented fallback.
    const raw = readEnv("VERCEL_DEPLOYMENT_ID") ?? readEnv("VERCEL_GIT_COMMIT_SHA");
    if (!raw) throw new MissingDeploymentIdentityError();
    return `dpl-${digest(raw)}`;
  }

  const explicit = readEnv("OPSIQ_INSTANCE_ID");
  if (!explicit) return LOCAL_INSTANCE_ID;

  // Accept a well-formed short override verbatim; otherwise normalise it to a
  // bounded derived key so an overlong or exotic value can never overflow the
  // unique index or produce an unusable row.
  return explicit.length <= MAX_INSTANCE_ID_LENGTH && SAFE_INSTANCE_ID_PATTERN.test(explicit)
    ? explicit
    : `loc-${digest(explicit)}`;
}

/**
 * Resolve the application version recorded alongside the status.
 *
 * Prefers the verified commit SHA, then the deployment identifier, and only
 * then npm_package_version — which is absent on Vercel. In a deployment
 * runtime this can never be "unknown", because `resolveInstanceId` has already
 * failed closed when neither Vercel identifier exists.
 */
export function resolveAppVersion(): string {
  const commitSha = readEnv("VERCEL_GIT_COMMIT_SHA");
  if (commitSha) return commitSha.slice(0, 12);

  const deploymentId = readEnv("VERCEL_DEPLOYMENT_ID");
  if (deploymentId) return `dpl-${digest(deploymentId).slice(0, 12)}`;

  return readEnv("npm_package_version") ?? "unknown";
}

/**
 * Get current startup status from database
 * Used by middleware, handlers, and readiness probes
 */
export async function getStartupStatus(): Promise<{
  status: StartupStatusType;
  started_at: Date;
  completed_at?: Date | null;
  error?: string | null;
  version: string;
  instance_id: string;
}> {
  let instanceId: string;
  try {
    instanceId = resolveInstanceId();
  } catch (error) {
    // Fail closed: without a deployment identity we cannot know this
    // deployment's status, so we must never report READY.
    logger.error("Cannot resolve deployment identity for startup status", error);
    return {
      status: "FAILED",
      started_at: new Date(),
      // Fixed operator-safe constant, not the caught error's message.
      error: MISSING_DEPLOYMENT_IDENTITY_MESSAGE,
      version: resolveAppVersion(),
      instance_id: UNRESOLVED_INSTANCE_ID,
    };
  }

  try {
    const result = await db.startupStatus.findUnique({
      where: { instanceId },
    });

    if (!result) {
      return {
        status: "NOT_STARTED",
        started_at: new Date(),
        version: resolveAppVersion(),
        instance_id: instanceId,
      };
    }

    return {
      status: result.status as StartupStatusType,
      started_at: result.startedAt,
      completed_at: result.completedAt,
      error: result.error ?? undefined,
      version: result.version,
      instance_id: result.instanceId,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn("startup_status table not found during read — migration not yet applied");
    } else {
      logger.error("Failed to read startup status from DB", error);
    }
    // Fail open on transient DB read errors: assume not started so the checks
    // re-run. (Identity failures are handled above and fail CLOSED.)
    return {
      status: "NOT_STARTED",
      started_at: new Date(),
      version: resolveAppVersion(),
      instance_id: instanceId,
    };
  }
}

/**
 * Update startup status in database
 * Only startup-orchestrator should call this
 */
export async function setStartupStatus(
  status: StartupStatusType,
  options?: { error?: string; completedAt?: Date }
): Promise<void> {
  // Resolved OUTSIDE the try: a missing deployment identity must propagate so
  // startup fails closed, not be swallowed like a transient write error.
  const instanceId = resolveInstanceId();

  try {
    await db.startupStatus.upsert({
      where: { instanceId },
      create: {
        status,
        version: resolveAppVersion(),
        instanceId,
        error: options?.error || null,
        completedAt: options?.completedAt,
        startedAt: new Date(),
      },
      update: {
        status,
        error: options?.error || null,
        completedAt: options?.completedAt,
        updatedAt: new Date(),
      },
    });

    logger.info(`[STARTUP-STATUS] Status updated to ${status}`, {
      instance: instanceId,
      error: options?.error,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn(
        "startup_status table not found — run `prisma migrate deploy` to create it",
        { status },
      );
    } else if (isTransientConnectionError(error)) {
      logger.warn("startup_status write skipped — transient connection error (serverless cold-start)", { status });
    } else {
      logger.error("Failed to write startup status to DB", error, { status });
    }
    // Non-fatal: startup continues regardless. DB write failures do not block app startup.
  }
}

/**
 * Atomically claim ownership of a startup attempt for this deployment.
 *
 * P0-15 (cross-instance startup race): the old setStartupStatus()-based flow
 * let every concurrently cold-starting Vercel instance of one deployment
 * independently write "STARTING" and race to finish — including a straggler
 * silently overwriting a sibling's already-committed "READY" with "FAILED"
 * (no lock, no version check, plain last-write-wins upsert). This function
 * replaces that unconditional write with a single atomic
 * `INSERT ... ON CONFLICT (instance_id) DO UPDATE ... WHERE ...` statement:
 * exactly one caller can ever win the row for a given claim window, and every
 * other concurrent caller gets zero affected rows back — they must NOT run
 * startup checks or write anything.
 *
 * Deliberately not a Postgres advisory lock: Neon's pooled endpoint runs
 * PgBouncer in transaction mode, which does not support session-level
 * advisory locks (Neon's own connection-pooling documentation lists this
 * explicitly). A single conditional UPSERT has no such incompatibility.
 *
 * Returns (or throws — see below):
 *   CLAIMED       — caller now owns this startup attempt; pass claimToken to
 *                    completeStartup() exactly once when checks finish.
 *   ALREADY_READY — a prior claimant already finished successfully; treat
 *                    startup as complete, do not run checks.
 *   IN_PROGRESS   — reserved for genuine claim contention: either another
 *                    instance holds a live (non-stale) claim right now, or
 *                    the durable claim table/column is a known, temporary
 *                    rollout-compatibility gap (see isMissingTableError /
 *                    isMissingColumnError below). Callers must not run
 *                    checks, must not write anything, must not busy-loop —
 *                    the existing readiness contract already treats "not
 *                    yet READY" as a legitimate, retriable state (see
 *                    /api/readiness), so the caller simply returns and lets
 *                    the next probe/request re-check.
 *
 * Throws on any other failure (a transient DB/connection error, or a
 * genuinely unexpected error such as a client method failing to resolve).
 * IN_PROGRESS is a specific, governance-relevant assertion — "a live
 * claimant exists elsewhere" — and neither case has evidence of that;
 * returning it anyway would make ensureStartupComplete() silently skip
 * every real startup check while instrumentation logs a false success (see
 * the P0-15 cold-start $queryRaw incident this replaced). Callers already
 * handle a thrown ensureStartupComplete()/claimStartup() the same way they
 * handle any other startup failure (instrumentation logs "Startup failed";
 * /api/readiness and /api/internal/startup report not-ready).
 */
export async function claimStartup(): Promise<StartupClaimResult> {
  // Fail closed before anything else, same as setStartupStatus(): a missing
  // deployment identity must propagate, never be swallowed into a claim
  // attempt against a shared/ambiguous key.
  const instanceId = resolveInstanceId();
  const claimToken = randomUUID();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STARTUP_CLAIM_LEASE_MS);
  const version = resolveAppVersion();

  try {
    // Resolve the initialized client explicitly via getDbInstance() rather
    // than the lazy `db` proxy export. That proxy only correctly defers
    // two-level access (db.<model>.<method>()) on a cold instance; a
    // one-level top-level method access like db.$queryRaw instead returns
    // an inner deferred-model proxy — not a callable function — and throws
    // when invoked. getDbInstance() is the canonical initialization path
    // used everywhere else this ordering matters (see
    // checkMigrationReadiness()) and is safe to call unconditionally: it
    // dedupes against any initialization already in flight and every caller
    // resolves to the same singleton client.
    const prisma = await getDbInstance();

    // The `previous` CTE captures the pre-existing row's status in the SAME
    // statement/snapshot as the INSERT..ON CONFLICT below, purely so the log
    // line can distinguish a fresh claim from a stale-claim reclaim — it is
    // not part of the ownership decision itself (that is fully decided by
    // the WHERE clause + affected-row count, atomically, independent of what
    // this CTE reports).
    const claimed = await withStatementTimeout(
      prisma,
      CLAIM_STATEMENT_TIMEOUT_MS,
      (tx) => tx.$queryRaw<
        Array<{ id: string; claim_token: string; started_at: Date; previous_status: string | null }>
      >`
      WITH "previous" AS (
        SELECT "status" FROM "startup_status" WHERE "instance_id" = ${instanceId}
      )
      INSERT INTO "startup_status"
        ("id", "status", "started_at", "completed_at", "error", "version", "instance_id", "claim_token", "updated_at")
      VALUES
        (gen_random_uuid(), 'STARTING', ${now}, NULL, NULL, ${version}, ${instanceId}, ${claimToken}, ${now})
      ON CONFLICT ("instance_id") DO UPDATE SET
        "status"       = 'STARTING',
        "started_at"   = ${now},
        "completed_at" = NULL,
        "error"        = NULL,
        "version"      = EXCLUDED."version",
        "claim_token"  = EXCLUDED."claim_token",
        "updated_at"   = ${now}
      WHERE
        "startup_status"."status" = 'NOT_STARTED'
        OR "startup_status"."status" = 'FAILED'
        OR ("startup_status"."status" = 'STARTING' AND "startup_status"."started_at" < ${staleThreshold})
      RETURNING "id", "claim_token", "started_at", (SELECT "status" FROM "previous") AS "previous_status"
    `
    );

    if (claimed.length > 0) {
      const won = claimed[0]!;
      const label = won.previous_status === "STARTING" ? "STALE_CLAIM_RECLAIMED" : "CLAIMED";
      logger.info(`[STARTUP-STATUS] ${label}`, {
        instance: instanceId,
        claimToken: won.claim_token,
        previousStatus: won.previous_status,
      });
      return { outcome: "CLAIMED", claimToken: won.claim_token, instanceId };
    }

    // Lost the claim — classify why, purely for observability. This read is
    // NOT part of the ownership decision (already made atomically above); a
    // status change between the statements above only affects which log
    // label is printed, never whether checks run or anything is written.
    const current = await getStartupStatus();
    if (current.status === "READY") {
      logger.info("[STARTUP-STATUS] ALREADY_READY", { instance: instanceId });
      return { outcome: "ALREADY_READY", instanceId };
    }
    logger.info("[STARTUP-STATUS] WAITING_ON_OTHER_INSTANCE", {
      instance: instanceId,
      currentStatus: current.status,
    });
    return { outcome: "IN_PROGRESS", instanceId };
  } catch (error) {
    if (isMissingTableError(error)) {
      // Known, temporary rollout-compatibility gap: this instance's view of
      // the DB predates the startup_status migration entirely. The durable
      // claim mechanism itself is unavailable, so there is nothing to
      // atomically own here (or anywhere else) yet — every instance is in
      // the same position until the migration lands. Reported as
      // IN_PROGRESS (not thrown): this is an explicitly anticipated
      // rollout state, never a claim-mechanism defect.
      logger.warn("startup_status table not found during claim — migration not yet applied");
      return { outcome: "IN_PROGRESS", instanceId };
    }
    if (isMissingColumnError(error)) {
      // Same rollout-compatibility class as above, narrower: only the
      // additive claim_token column is missing (deploy-before-migrate
      // ordering). Also an explicitly anticipated, temporary state.
      logger.warn(
        "startup_status.claim_token column not found during claim — " +
          "additive migration 20260816000001_startup_status_claim_token not yet applied; " +
          "run `prisma migrate deploy`."
      );
      return { outcome: "IN_PROGRESS", instanceId };
    }

    // Everything else must fail closed, not fail open as IN_PROGRESS. Unlike
    // the two rollout-compatibility cases above, neither a transient
    // connection failure nor a genuinely unexpected error is evidence that
    // "a live claimant exists elsewhere" — which is exactly what IN_PROGRESS
    // asserts to the caller. Silently returning it here would make
    // ensureStartupComplete() skip real checks while looking like a normal
    // hand-off to another instance. Propagate instead: instrumentation.ts,
    // /api/readiness, and /api/internal/startup already treat a thrown
    // ensureStartupComplete()/claimStartup() as the startup failure it is.
    if (isTransientConnectionError(error)) {
      logger.warn(
        "startup claim failed — transient connection error (serverless cold-start); failing closed",
        { instance: instanceId, error: error instanceof Error ? error.message : String(error) }
      );
    } else {
      logger.error("Failed to claim startup ownership — unexpected error; failing closed", error, {
        instance: instanceId,
      });
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Complete a startup attempt this instance previously won via claimStartup().
 *
 * The transition to READY/FAILED only takes effect when the row is still
 * exactly the claim this caller made (instanceId + status='STARTING' +
 * matching claimToken). If a newer claimant has since reclaimed the row
 * (this claim went stale and was reclaimed — see STARTUP_CLAIM_LEASE_MS),
 * the WHERE clause matches zero rows and this call is a silent, safe no-op:
 * a superseded straggler can never overwrite a newer owner's result, in
 * either direction (a late FAILED cannot clobber a newer READY, and a late
 * READY cannot clobber a newer attempt either).
 */
export async function completeStartup(
  claimToken: string,
  status: "READY" | "FAILED",
  options?: { error?: string; completedAt?: Date }
): Promise<void> {
  const instanceId = resolveInstanceId();

  try {
    const result = await db.startupStatus.updateMany({
      where: { instanceId, status: "STARTING", claimToken },
      data: {
        status,
        error: options?.error || null,
        completedAt: options?.completedAt ?? null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      // Not a failure: this claim was superseded (reclaimed as stale) before
      // this instance finished. Log and return — never throw merely because
      // ownership moved on; the instance's OWN caller still sees and handles
      // its own real check failure/success, this only guards the shared row.
      logger.warn("[STARTUP-STATUS] STALE_COMPLETION_IGNORED", {
        instance: instanceId,
        attemptedStatus: status,
      });
      return;
    }

    logger.info(`[STARTUP-STATUS] ${status}`, {
      instance: instanceId,
      error: options?.error,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn("startup_status table not found — run `prisma migrate deploy` to create it", { status });
    } else if (isTransientConnectionError(error)) {
      logger.warn("startup completion write skipped — transient connection error (serverless cold-start)", { status });
    } else {
      logger.error("Failed to write startup completion to DB", error, { status });
    }
    // Non-fatal, matching setStartupStatus(): a completion write failure
    // does not block the app from serving requests.
  }
}

/**
 * Check if startup is complete
 * Convenient helper for common check
 */
export async function isStartupComplete(): Promise<boolean> {
  const status = await getStartupStatus();
  return status.status === "READY";
}

/**
 * Reset startup status (for testing/debugging only)
 */
export async function resetStartupStatus(): Promise<void> {
  try {
    await db.startupStatus.deleteMany({
      where: { instanceId: resolveInstanceId() },
    });
    logger.info("[STARTUP-STATUS] Status reset");
  } catch (error) {
    if (isMissingTableError(error)) {
      logger.warn("startup_status table not found during reset — migration not yet applied");
    } else if (isTransientConnectionError(error)) {
      logger.warn("startup_status reset skipped — transient connection error (serverless cold-start)");
    } else {
      logger.error("Failed to reset startup status", error);
    }
  }
}

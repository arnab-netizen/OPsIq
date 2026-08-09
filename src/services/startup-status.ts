/**
 * Durable Startup Status Service
 *
 * Provides persistent, distributed startup status.
 * - Single source of truth: database
 * - Works across middleware, handlers, instances
 * - Survives restart
 * - Auditable
 */

import { createHash } from "crypto";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

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
    } else {
      logger.error("Failed to write startup status to DB", error, { status });
    }
    // Non-fatal: startup continues regardless. DB write failures do not block app startup.
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
    } else {
      logger.error("Failed to reset startup status", error);
    }
  }
}

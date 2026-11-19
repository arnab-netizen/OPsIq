import { randomUUID } from "crypto";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { AppError, NotFoundError, ValidationError, ForbiddenError, PlanLimitError, ConflictError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { logger } from "@/infra/logger";
import { resolveAccess } from "@/domain/billing/paddle";

/**
 * The reads entitlement resolution needs. Satisfied by the global `db` and by an interactive
 * transaction client, so the same resolution runs inside the quota lock (see consumeCapabilityUsage).
 */
type EntitlementReader = Pick<Prisma.TransactionClient, "subscription" | "usageEvent">;

export interface WorkspacePlan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
}

export interface PlanCapability {
  key: string;
  limit: number | null; // null = unlimited
}

export interface WorkspaceUsage {
  key: string;
  value: number;
}

export interface ResolvedEntitlements {
  plan: WorkspacePlan;
  capabilities: PlanCapability[];
  usage: WorkspaceUsage[];
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface CapabilityCheck {
  allowed: boolean;
  reason?: string;
  /** True when the denial is because the entitlement could not be read (retryable), not a verified denial. */
  unverifiable?: boolean;
  usage?: number;
  limit?: number | null;
}

/**
 * Get the workspace's current plan
 * Fails closed: throws NotFoundError if no subscription or plan
 */
export async function getWorkspacePlan(
  workspaceId: string
): Promise<WorkspacePlan> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  // Fetch subscription with plan
  const subscription = await db.subscription.findFirst({
    where: {
      billingAccount: {
        workspaceId,
      },
    },
    select: {
      plan: {
        select: {
          id: true,
          name: true,
          priceMonthly: true,
          priceYearly: true,
        },
      },
      status: true,
      currentPeriodEnd: true,
    },
  });

  if (!subscription) {
    throw new NotFoundError(
      "Subscription",
      `No subscription found for workspace ${workspaceId}`
    );
  }

  if (!subscription.plan) {
    throw new NotFoundError(
      "Plan",
      `No plan associated with workspace subscription`
    );
  }

  // Paid ("active") or in the bounded past-due grace window (resolveAccess); everything else denied.
  if (!resolveAccess(subscription).entitled) {
    throw new ForbiddenError(
      `Workspace subscription is ${subscription.status}, not active`
    );
  }

  return subscription.plan;
}

/**
 * BILL-01: resolve a workspace's rate-limit/entitlement tier SERVER-SIDE from its
 * active subscription plan. Never trust a client-supplied `x-tier` header.
 *
 * Fails SAFE: any workspace without an active subscription (or an unrecognized plan)
 * resolves to the most restrictive tier ("free"). A client cannot elevate its tier.
 */
export async function resolveWorkspaceTier(
  workspaceId: string
): Promise<"free" | "pro" | "enterprise"> {
  try {
    const plan = await getWorkspacePlan(workspaceId); // throws unless an ACTIVE subscription exists
    const name = (plan.name || "").toLowerCase();
    if (name.includes("enterprise") || name.includes("scale")) return "enterprise";
    if (name.includes("pro") || name.includes("growth") || name.includes("business") || name.includes("team")) {
      return "pro";
    }
    return "free";
  } catch {
    // No active subscription / lookup error → least privilege.
    return "free";
  }
}

/**
 * Get current usage metrics for workspace
 * Returns all usage events from the current billing period
 */
export async function getUsage(
  workspaceId: string,
  currentPeriodStart?: Date,
  client: EntitlementReader = db
): Promise<WorkspaceUsage[]> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  // If period not provided, fetch from subscription
  let periodStart = currentPeriodStart;
  if (!periodStart) {
    const subscription = await client.subscription.findFirst({
      where: {
        billingAccount: {
          workspaceId,
        },
      },
      select: {
        currentPeriodStart: true,
      },
    });

    if (!subscription) {
      throw new NotFoundError(
        "Subscription",
        `No subscription found for workspace ${workspaceId}`
      );
    }

    periodStart = subscription.currentPeriodStart;
  }

  // Aggregate usage by key for current period
  const usageEvents = await client.usageEvent.findMany({
    where: {
      workspaceId,
      timestamp: {
        gte: periodStart,
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  // Sum usage by key
  const usageMap = new Map<string, number>();
  for (const event of usageEvents) {
    const current = usageMap.get(event.key) || 0;
    usageMap.set(event.key, current + event.value);
  }

  // Convert to array format
  const usage: WorkspaceUsage[] = Array.from(usageMap.entries()).map(
    ([key, value]) => ({
      key,
      value,
    })
  );

  return usage;
}

/**
 * Resolve all entitlements for a workspace
 * Combines plan, capabilities, and current usage
 * Fails closed: throws if subscription or plan missing
 */
export async function resolveEntitlements(
  workspaceId: string,
  client: EntitlementReader = db
): Promise<ResolvedEntitlements> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  // Fetch subscription, plan, and capabilities
  const subscription = await client.subscription.findFirst({
    where: {
      billingAccount: {
        workspaceId,
      },
    },
    select: {
      plan: {
        select: {
          id: true,
          name: true,
          priceMonthly: true,
          priceYearly: true,
          planCapabilities: {
            select: {
              key: true,
              limit: true,
            },
          },
        },
      },
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  if (!subscription) {
    throw new NotFoundError(
      "Subscription",
      `No subscription found for workspace ${workspaceId}`
    );
  }

  if (!subscription.plan) {
    throw new NotFoundError(
      "Plan",
      `No plan associated with workspace subscription`
    );
  }

  // Get current usage
  const usage = await getUsage(
    workspaceId,
    subscription.currentPeriodStart,
    client
  );

  return {
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      priceMonthly: subscription.plan.priceMonthly,
      priceYearly: subscription.plan.priceYearly,
    },
    capabilities: subscription.plan.planCapabilities,
    usage,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}

/**
 * Assert that workspace has capability and is within limits
 * Fails closed: returns { allowed: false } if:
 * - subscription missing
 * - plan missing
 * - capability not in plan
 * - usage exceeds limit
 *
 * Read-only: it records nothing, so it is a gate, never a quota consumer. An operation that consumes a
 * limited capability must go through withCapabilityQuota / consumeCapabilityUsage, which check and
 * record atomically; a separate assertCapability-then-record sequence lets concurrent callers overrun
 * the limit.
 */
export async function assertCapability(
  workspaceId: string,
  key: string
): Promise<CapabilityCheck> {
  if (!workspaceId) {
    return {
      allowed: false,
      reason: "workspaceId is required",
    };
  }

  if (!key) {
    return {
      allowed: false,
      reason: "capability key is required",
    };
  }

  try {
    return evaluateCapability(await resolveEntitlements(workspaceId), key, 1);
  } catch (error) {
    // Fail closed: any error means deny
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    return {
      allowed: false,
      reason: `Entitlement check failed: ${governed.operatorMessage}`,
      unverifiable: isInfrastructureFailure(error),
    };
  }
}

/**
 * True when an entitlement read failed for an infrastructure reason (a database or driver error, a lock-wait
 * or statement timeout) rather than a determinate state such as a missing subscription or plan (an AppError,
 * e.g. NotFoundError). Only the former may clear on a plain retry, so only it is a retryable refusal.
 */
function isInfrastructureFailure(error: unknown): boolean {
  return !(error instanceof AppError);
}

/**
 * The single limit decision shared by the read-only gate (assertCapability) and the atomic consumer
 * (consumeCapabilityUsage): would consuming `amount` more units of `key` stay within the plan limit?
 * Fails closed when the subscription is not active or the plan does not carry the capability.
 */
function evaluateCapability(
  entitlements: ResolvedEntitlements,
  key: string,
  amount: number
): CapabilityCheck {
  if (entitlements.status !== "active") {
    return {
      allowed: false,
      reason: `Subscription is ${entitlements.status}, not active`,
    };
  }

  const capability = entitlements.capabilities.find((c) => c.key === key);
  if (!capability) {
    return {
      allowed: false,
      reason: `Capability '${key}' not found in plan`,
    };
  }

  const currentUsage = entitlements.usage.find((u) => u.key === key)?.value || 0;

  // null limit = unlimited
  if (capability.limit === null) {
    return { allowed: true, usage: currentUsage, limit: null };
  }

  if (currentUsage + amount > capability.limit) {
    return {
      allowed: false,
      reason: `Usage ${currentUsage} exceeds limit ${capability.limit}`,
      usage: currentUsage,
      limit: capability.limit,
    };
  }

  return { allowed: true, usage: currentUsage, limit: capability.limit };
}

/** Statement timeout of the short quota transactions run by withCapabilityQuota. */
const CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS = 10_000;

/**
 * Per-(workspace, capability) transaction-scoped advisory lock key. Every consumer of the same
 * capability in the same workspace serializes on it, across processes and instances; it is released
 * automatically on commit or rollback.
 */
function capabilityQuotaLockKey(workspaceId: string, key: string): string {
  return `capability_quota:${workspaceId}:${key}`;
}

/**
 * Atomically check a plan limit and record the usage, inside the caller's transaction.
 *
 * Takes the per-(workspace, capability) advisory lock, resolves entitlements and current-period usage
 * through `tx` (so every concurrent consumer sees all previously committed consumption), and inserts the
 * usage event only when `amount` more units stay within the limit. Concurrent consumers can therefore
 * never jointly exceed the limit: the read, the decision and the write happen under one lock.
 *
 * Throws PlanLimitError (HTTP 402, PLAN_LIMIT_EXCEEDED) when the limit would be exceeded or the
 * entitlement cannot be verified (fail closed, the same contract as assertCapability). When the caller's
 * business write runs in the same transaction, a failed write rolls the usage back with it.
 *
 * With `{ enforce: false }` (record-only) the same lock is taken and the same usage row is written, but no
 * plan limit or entitlement is evaluated, so it never throws PlanLimitError. A database failure still
 * propagates, so a business write in the same transaction never commits without its usage row.
 */
export async function consumeCapabilityUsage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  key: string,
  amount: number = 1,
  options: CapabilityUsageMode = {}
): Promise<CapabilityCheck> {
  return recordCapabilityUsageWithinLimit(tx, workspaceId, key, amount, null, options.enforce ?? true);
}

/**
 * Whether a quota-recorded operation is also LIMITED by the plan. `enforce: true` (the default) refuses
 * with PlanLimitError (402) at the limit, and is used only where the released code already gated the
 * operation on the plan capability. `enforce: false` records usage exactly (same ledger rows, same
 * reservation recovery) but never refuses: for operations that were never plan-gated, so recording usage
 * cannot newly produce a 402.
 */
export interface CapabilityUsageMode {
  enforce?: boolean;
}

/** UsageEvent.reservationEntry values written by a quota reservation (see the UsageEvent model). */
const RESERVATION_ENTRY = { RESERVE: "reserve", SETTLE: "settle", RELEASE: "release" } as const;

/**
 * Age after which a reservation with no release row is treated as abandoned (its process died between
 * reserving and finalizing) and returned by reconcileExpiredCapabilityReservations. Far longer than any
 * quota-limited operation can run (every one is bounded by the platform request timeout), and a business
 * write that still arrives after its reservation was returned is rejected by settle (see below), so a
 * returned unit can never be kept by a late write.
 */
export const CAPABILITY_RESERVATION_TTL_MS = 30 * 60_000;

/**
 * Oldest reservation the sweep still examines. Usage only counts against a limit within its billing
 * period; this bound keeps every sweep an index range scan instead of a scan of the whole ledger.
 */
const CAPABILITY_RESERVATION_RECOVERY_HORIZON_MS = 35 * 86_400_000;

/** Upper bound on reservations one sweep call finalizes; the rest are taken by the next call. */
const CAPABILITY_RESERVATION_SWEEP_BATCH = 200;

async function recordCapabilityUsageWithinLimit(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  key: string,
  amount: number,
  reservationId: string | null,
  enforce: boolean
): Promise<CapabilityCheck> {
  if (!workspaceId || !key) {
    throw new ValidationError("workspaceId and key are required");
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ValidationError(`Capability usage amount must be a positive integer, got ${amount}`);
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${capabilityQuotaLockKey(workspaceId, key)}, 0))`;

  let check: CapabilityCheck = { allowed: true };
  if (enforce) {
    try {
      check = evaluateCapability(await resolveEntitlements(workspaceId, tx), key, amount);
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      throw new PlanLimitError(key, `Entitlement check failed: ${governed.operatorMessage}`, undefined, { entitlementUnverifiable: isInfrastructureFailure(error) });
    }
    if (!check.allowed) {
      throw new PlanLimitError(key, check.reason || "Plan limit exceeded");
    }
  }

  await tx.usageEvent.create({
    data: {
      id: reservationId ?? randomUUID(),
      workspaceId,
      key,
      value: amount,
      timestamp: new Date(),
      ...(reservationId ? { reservationId, reservationEntry: RESERVATION_ENTRY.RESERVE } : {}),
    },
  });

  return enforce ? { ...check, usage: (check.usage ?? 0) + amount } : check;
}

/**
 * Handle on the units withCapabilityQuota reserved for one operation. The operation keeps a unit by
 * calling `settle(tx)` with the transaction client of the business write that consumes it, as the LAST
 * statement of that transaction: the unit is then kept exactly when the business write commits. Units
 * the operation does not settle are returned when it finishes, or by the expiry sweep if the process
 * dies first.
 */
export interface CapabilityReservation {
  readonly id: string;
  readonly workspaceId: string;
  readonly key: string;
  readonly amount: number;
  /**
   * Keep one reserved unit, atomically with the business write running in `tx`. Throws ConflictError
   * (rolling that write back) when the reservation was already finalized, e.g. returned by the expiry
   * sweep, and an Error when every reserved unit is already settled.
   */
  settle(tx: Prisma.TransactionClient): Promise<void>;
}

export interface CapabilityQuotaOptions<T> extends CapabilityUsageMode {
  /** Units reserved before the operation runs (default 1). */
  amount?: number;
  /**
   * Units kept from the operation's RESULT, for an operation whose business outcome spans several
   * transactions and so cannot settle inside one (0..amount, default 0). Added to the units settled
   * in-transaction, capped at `amount`. Units kept this way are recorded when the operation returns, so a
   * crash between the business writes and that moment returns them: prefer `reservation.settle(tx)`.
   */
  keptFromResult?: (result: T) => number;
}

/**
 * Lock the reservation's own row: serializes settle, completion and sweep of ONE reservation. Returns the
 * reserve row's timestamp (the billing moment of the reservation), or null when there is no such row.
 */
async function lockReservation(tx: Prisma.TransactionClient, reservationId: string, workspaceId: string): Promise<Date | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; timestamp: Date }>>`
    SELECT id, timestamp FROM usage_events
    WHERE id = ${reservationId}::uuid AND workspace_id = ${workspaceId}::uuid AND reservation_entry = 'reserve'
    FOR UPDATE`;
  return rows.length === 1 ? rows[0].timestamp : null;
}

async function isReservationFinalized(tx: Prisma.TransactionClient, reservationId: string): Promise<boolean> {
  const released = await tx.usageEvent.count({
    where: { reservationId, reservationEntry: RESERVATION_ENTRY.RELEASE },
  });
  return released > 0;
}

async function countSettledUnits(tx: Prisma.TransactionClient, reservationId: string): Promise<number> {
  return tx.usageEvent.count({ where: { reservationId, reservationEntry: RESERVATION_ENTRY.SETTLE } });
}

function createReservation(id: string, workspaceId: string, key: string, amount: number): CapabilityReservation {
  return {
    id,
    workspaceId,
    key,
    amount,
    async settle(tx: Prisma.TransactionClient): Promise<void> {
      if (!(await lockReservation(tx, id, workspaceId))) {
        throw new ConflictError("The plan usage reserved for this operation no longer exists. Nothing was saved; please try again.", undefined, undefined, { retryable: true });
      }
      if (await isReservationFinalized(tx, id)) {
        throw new ConflictError("The plan usage reserved for this operation has expired. Nothing was saved; please try again.", undefined, undefined, { retryable: true });
      }
      if ((await countSettledUnits(tx, id)) >= amount) {
        throw new Error(`Capability reservation ${id} has no unsettled unit left (${amount} reserved)`);
      }
      await tx.usageEvent.create({
        data: {
          id: randomUUID(),
          workspaceId,
          key,
          value: 0,
          timestamp: new Date(),
          reservationId: id,
          reservationEntry: RESERVATION_ENTRY.SETTLE,
        },
      });
    },
  };
}

export interface ReservationFinalization {
  /** Units returned to the plan (0 when every reserved unit was kept). */
  returned: number;
  kept: number;
}

/**
 * Finalize one reservation inside `tx`: return every unit that was not settled (plus `extraKept` kept
 * from a result) with ONE compensating release row. Returns null when the reservation was already
 * finalized, so completion and the expiry sweep can race without returning a unit twice (row lock, then
 * re-check; the partial unique index usage_events_one_release_per_reservation enforces it in the database).
 */
async function finalizeReservationInTransaction(
  tx: Prisma.TransactionClient,
  reservation: { id: string; workspaceId: string; key: string; amount: number },
  extraKept: number
): Promise<ReservationFinalization | null> {
  const reservedAt = await lockReservation(tx, reservation.id, reservation.workspaceId);
  if (!reservedAt) return null;
  if (await isReservationFinalized(tx, reservation.id)) return null;
  const settled = await countSettledUnits(tx, reservation.id);
  const kept = Math.min(reservation.amount, settled + Math.max(0, Math.trunc(extraKept)));
  const returned = reservation.amount - kept;
  await tx.usageEvent.create({
    data: {
      id: randomUUID(),
      workspaceId: reservation.workspaceId,
      key: reservation.key,
      value: -returned,
      // Stamped with the RESERVE row's time, not now: usage is summed per billing period
      // (timestamp >= currentPeriodStart), so a unit reserved in one period and returned after the period
      // boundary (expiry sweep, or a slow completion) must be returned in the period it was counted in.
      timestamp: reservedAt,
      reservationId: reservation.id,
      reservationEntry: RESERVATION_ENTRY.RELEASE,
    },
  });
  return { returned, kept };
}

/**
 * Run a quota-limited operation whose business writes span several services (and so cannot join one
 * transaction: the per-process pool has a single connection, so a write through the global `db` inside
 * an open interactive transaction would wait on that transaction's own connection).
 *
 * 1. Reserve: the limit check and a durable reservation row are written atomically in their own short
 *    transaction under the capability lock. Throws PlanLimitError (402) here, before the operation runs,
 *    when the limit would be exceeded. With `enforce: false` (record-only) the reservation is written
 *    without any limit check and never refused; a database failure still fails before the operation.
 * 2. Run: the operation receives the reservation and keeps each unit it consumes with
 *    `reservation.settle(tx)` inside the transaction of the business write consuming it.
 * 3. Finalize: when the operation returns or throws, every unit not settled is returned with one
 *    compensating release row. Usage is append-only: no usage row is ever updated or deleted.
 *
 * If the process dies between 1 and 3, or finalization fails, the reservation stays open and
 * reconcileExpiredCapabilityReservations returns its unsettled units once it is older than
 * CAPABILITY_RESERVATION_TTL_MS; settled units are never returned.
 */
export async function withCapabilityQuota<T>(
  workspaceId: string,
  key: string,
  operation: (reservation: CapabilityReservation) => Promise<T>,
  options: CapabilityQuotaOptions<T> = {}
): Promise<T> {
  const amount = options.amount ?? 1;
  const enforce = options.enforce ?? true;
  const reservationId = randomUUID();

  try {
    await withStatementTimeout(
      db,
      CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS,
      (tx) => recordCapabilityUsageWithinLimit(tx, workspaceId, key, amount, reservationId, enforce),
      `capability_quota.reserve:${key}`
    );
  } catch (error) {
    // Record-only: never a 402; a failed reservation write fails the operation before it runs.
    if (!enforce || error instanceof PlanLimitError || error instanceof ValidationError) throw error;
    // Enforced: fail closed, as assertCapability does: an unverifiable entitlement is a denial.
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new PlanLimitError(key, `Entitlement check failed: ${governed.operatorMessage}`, undefined, { entitlementUnverifiable: isInfrastructureFailure(error) });
  }

  const reservation = createReservation(reservationId, workspaceId, key, amount);
  let result: T;
  try {
    result = await operation(reservation);
  } catch (error) {
    await finalizeCapabilityReservation(reservation, 0, "operation_failed");
    throw error;
  }

  await finalizeCapabilityReservation(reservation, options.keptFromResult ? options.keptFromResult(result) : 0, "completed");
  return result;
}

/**
 * Finalize a reservation after its operation. Never throws: a failed finalization leaves the
 * reservation open, and the expiry sweep returns its unsettled units later (logged here).
 */
async function finalizeCapabilityReservation(
  reservation: CapabilityReservation,
  extraKept: number,
  reason: "operation_failed" | "completed"
): Promise<void> {
  try {
    await withStatementTimeout(
      db,
      CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS,
      (tx) => finalizeReservationInTransaction(tx, reservation, extraKept),
      `capability_quota.finalize:${reservation.key}`
    );
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to finalize a capability reservation; the expiry sweep will return its unsettled units", {
      workspaceId: reservation.workspaceId,
      key: reservation.key,
      reservationId: reservation.id,
      reason,
      error: governed.operatorMessage,
    });
  }
}

export interface CapabilityReservationSweepResult {
  /** Expired, still-open reservations found for the workspace (at most one batch). */
  examined: number;
  /** Reservations this call finalized (a reservation finalized concurrently by another caller is not counted). */
  finalized: number;
  /** Units returned to the plan across those reservations. */
  unitsReturned: number;
}

/**
 * Reconcile one workspace's abandoned quota reservations: every reservation older than `ttlMs` (default
 * CAPABILITY_RESERVATION_TTL_MS) that was never finalized gets its UNSETTLED units returned with one
 * release row and an audit event, in one transaction per reservation. Settled units (business writes
 * that committed) are kept; a reservation younger than the TTL (possibly still in flight) is untouched.
 *
 * Idempotent and concurrency-safe: each reservation is finalized under its own row lock with a re-check,
 * and the database admits one release row per reservation, so concurrent or repeated sweeps (and a late
 * normal completion) return each unit at most once. Workspace-scoped: it only reads and writes rows of
 * `workspaceId`.
 */
export async function reconcileExpiredCapabilityReservations(
  workspaceId: string,
  now: Date = new Date(),
  ttlMs: number = CAPABILITY_RESERVATION_TTL_MS
): Promise<CapabilityReservationSweepResult> {
  if (!workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new ValidationError("workspaceId must be a UUID");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ValidationError("now must be a valid date");
  }
  if (!Number.isFinite(ttlMs) || ttlMs < CAPABILITY_RESERVATION_TTL_MS) {
    throw new ValidationError(`ttlMs must be at least ${CAPABILITY_RESERVATION_TTL_MS}ms`);
  }
  const cutoff = new Date(now.getTime() - ttlMs);
  const horizon = new Date(now.getTime() - CAPABILITY_RESERVATION_RECOVERY_HORIZON_MS);

  const open = await findOpenReservations({ workspaceId, before: cutoff, notBefore: horizon });

  let finalized = 0;
  let unitsReturned = 0;
  for (const reservation of open) {
    const outcome = await withStatementTimeout(
      db,
      CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS,
      async (tx) => {
        const done = await finalizeReservationInTransaction(tx, reservation, 0);
        if (!done) return null;
        await emitAuditEvent(
          {
            eventName: AUDIT_EVENTS.BILLING_USAGE_RESERVATION_RECOVERED,
            workspaceId,
            actorType: "system",
            entityType: "usage_reservation",
            entityId: reservation.id,
            payload: {
              capability: reservation.key,
              reserved: reservation.amount,
              kept: done.kept,
              returned: done.returned,
              reservedAt: reservation.timestamp.toISOString(),
              ttlMs,
            },
            visibility: "internal",
          },
          tx
        );
        return done;
      },
      `capability_quota.sweep:${reservation.key}`
    );
    if (outcome) {
      finalized += 1;
      unitsReturned += outcome.returned;
    }
  }

  if (finalized > 0) {
    logger.warn("Returned the unsettled units of abandoned capability reservations", { workspaceId, finalized, unitsReturned });
  }
  return { examined: open.length, finalized, unitsReturned };
}

interface OpenReservationRow {
  id: string;
  workspaceId: string;
  key: string;
  amount: number;
  timestamp: Date;
}

interface OpenReservationDbRow {
  id: string;
  workspace_id: string;
  key: string;
  value: number;
  timestamp: Date;
}

async function findOpenReservations(scope: { workspaceId: string | null; before: Date; notBefore: Date }): Promise<OpenReservationRow[]> {
  const rows: OpenReservationDbRow[] = await db.$queryRaw<OpenReservationDbRow[]>`
    SELECT r.id, r.workspace_id, r.key, r.value, r.timestamp
    FROM usage_events r
    WHERE r.reservation_entry = 'reserve'
      AND r.timestamp < ${scope.before}
      AND r.timestamp >= ${scope.notBefore}
      AND (${scope.workspaceId}::uuid IS NULL OR r.workspace_id = ${scope.workspaceId}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM usage_events x WHERE x.reservation_id = r.id AND x.reservation_entry = 'release'
      )
    ORDER BY r.timestamp ASC
    LIMIT ${CAPABILITY_RESERVATION_SWEEP_BATCH}`;
  return rows.map((r) => ({ id: r.id, workspaceId: r.workspace_id, key: r.key, amount: r.value, timestamp: r.timestamp }));
}

/**
 * Workspaces holding at least one abandoned (expired, never finalized) quota reservation: the producer
 * scan for the scheduled reservation sweep. Bounded to one batch; the rest are found on the next scan.
 */
export async function findWorkspacesWithExpiredCapabilityReservations(now: Date = new Date()): Promise<string[]> {
  const open = await findOpenReservations({
    workspaceId: null,
    before: new Date(now.getTime() - CAPABILITY_RESERVATION_TTL_MS),
    notBefore: new Date(now.getTime() - CAPABILITY_RESERVATION_RECOVERY_HORIZON_MS),
  });
  return [...new Set(open.map((r) => r.workspaceId))];
}

/**
 * Track usage event for workspace capability
 * Creates audit trail of usage
 */
export async function trackUsage(
  workspaceId: string,
  key: string,
  value: number = 1
): Promise<void> {
  if (!workspaceId || !key) {
    throw new ValidationError("workspaceId and key are required");
  }

  await db.usageEvent.create({
    data: {
      id: randomUUID(),
      workspaceId,
      key,
      value,
      timestamp: new Date(),
    },
  });
}

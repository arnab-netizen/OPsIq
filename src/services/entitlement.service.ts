import { randomUUID } from "crypto";
import { db, withStatementTimeout } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError, ForbiddenError, PlanLimitError } from "@/infra/errors";
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
    };
  }
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
 */
export async function consumeCapabilityUsage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  key: string,
  amount: number = 1
): Promise<CapabilityCheck> {
  if (!workspaceId || !key) {
    throw new ValidationError("workspaceId and key are required");
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ValidationError(`Capability usage amount must be a positive integer, got ${amount}`);
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${capabilityQuotaLockKey(workspaceId, key)}, 0))`;

  let check: CapabilityCheck;
  try {
    check = evaluateCapability(await resolveEntitlements(workspaceId, tx), key, amount);
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new PlanLimitError(key, `Entitlement check failed: ${governed.operatorMessage}`);
  }
  if (!check.allowed) {
    throw new PlanLimitError(key, check.reason || "Plan limit exceeded");
  }

  await tx.usageEvent.create({
    data: {
      id: randomUUID(),
      workspaceId,
      key,
      value: amount,
      timestamp: new Date(),
    },
  });

  return { ...check, usage: (check.usage ?? 0) + amount };
}

export interface CapabilityQuotaOptions<T> {
  /** Units reserved before the operation runs (default 1). */
  amount?: number;
  /**
   * Units the operation actually consumed (0..amount), derived from its result. Defaults to `amount`.
   * Return 0 for an idempotent replay or a run that produced nothing, so it does not consume quota.
   */
  consumedAmount?: (result: T) => number;
}

/**
 * Run a quota-limited operation whose business writes span several services (and so cannot join one
 * transaction: the per-process pool has a single connection, so a write through the global `db` inside
 * an open interactive transaction would wait on that transaction's own connection).
 *
 * The limit check and the usage record are made atomic by reserving the units FIRST, in their own short
 * transaction under the capability lock (consumeCapabilityUsage). The operation then runs; if it throws,
 * or reports consuming fewer units than reserved, the unused units are returned with a compensating
 * (negative) usage event. Usage is append-only: no usage row is ever updated or deleted.
 *
 * Throws PlanLimitError (402) before the operation runs when the limit would be exceeded.
 */
export async function withCapabilityQuota<T>(
  workspaceId: string,
  key: string,
  operation: () => Promise<T>,
  options: CapabilityQuotaOptions<T> = {}
): Promise<T> {
  const amount = options.amount ?? 1;

  try {
    await withStatementTimeout(
      db,
      CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS,
      (tx) => consumeCapabilityUsage(tx, workspaceId, key, amount),
      `capability_quota.reserve:${key}`
    );
  } catch (error) {
    // Fail closed, as assertCapability does: an unverifiable entitlement is a denial.
    if (error instanceof PlanLimitError) throw error;
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    throw new PlanLimitError(key, `Entitlement check failed: ${governed.operatorMessage}`);
  }

  let result: T;
  try {
    result = await operation();
  } catch (error) {
    await releaseCapabilityUsage(workspaceId, key, amount, "operation_failed");
    throw error;
  }

  const consumed = options.consumedAmount ? options.consumedAmount(result) : amount;
  const unused = amount - Math.min(Math.max(Math.trunc(consumed), 0), amount);
  if (unused > 0) {
    await releaseCapabilityUsage(workspaceId, key, unused, "not_consumed");
  }
  return result;
}

/**
 * Return reserved-but-unused units with a compensating negative usage event, under the same capability
 * lock. Never throws: a failed release leaves the units counted (fail safe — the limit can only be
 * under-used, never overrun), and is logged for reconciliation.
 */
async function releaseCapabilityUsage(
  workspaceId: string,
  key: string,
  amount: number,
  reason: "operation_failed" | "not_consumed"
): Promise<void> {
  try {
    await withStatementTimeout(
      db,
      CAPABILITY_QUOTA_TRANSACTION_TIMEOUT_MS,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${capabilityQuotaLockKey(workspaceId, key)}, 0))`;
        await tx.usageEvent.create({
          data: {
            id: randomUUID(),
            workspaceId,
            key,
            value: -amount,
            timestamp: new Date(),
          },
        });
      },
      `capability_quota.release:${key}`
    );
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    logger.error("Failed to release reserved capability usage; units stay counted", {
      workspaceId,
      key,
      amount,
      reason,
      error: governed.operatorMessage,
    });
  }
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

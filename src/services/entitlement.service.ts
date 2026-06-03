import { db } from "@/lib/db";
import { NotFoundError, ValidationError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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

  if (subscription.status !== "active") {
    throw new ForbiddenError(
      `Workspace subscription is ${subscription.status}, not active`
    );
  }

  return subscription.plan;
}

/**
 * Get current usage metrics for workspace
 * Returns all usage events from the current billing period
 */
export async function getUsage(
  workspaceId: string,
  currentPeriodStart?: Date
): Promise<WorkspaceUsage[]> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  // If period not provided, fetch from subscription
  let periodStart = currentPeriodStart;
  if (!periodStart) {
    const subscription = await db.subscription.findFirst({
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
  const usageEvents = await db.usageEvent.findMany({
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
  workspaceId: string
): Promise<ResolvedEntitlements> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  // Fetch subscription, plan, and capabilities
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
    subscription.currentPeriodStart
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
    // Get entitlements
    const entitlements = await resolveEntitlements(workspaceId);

    // Check subscription status
    if (entitlements.status !== "active") {
      return {
        allowed: false,
        reason: `Subscription is ${entitlements.status}, not active`,
      };
    }

    // Find capability in plan
    const capability = entitlements.capabilities.find((c) => c.key === key);
    if (!capability) {
      return {
        allowed: false,
        reason: `Capability '${key}' not found in plan`,
      };
    }

    // Check usage against limit
    const usage = entitlements.usage.find((u) => u.key === key);
    const currentUsage = usage?.value || 0;

    // null limit = unlimited
    if (capability.limit === null) {
      return {
        allowed: true,
        usage: currentUsage,
        limit: null,
      };
    }

    // Check if usage exceeds limit
    if (currentUsage >= capability.limit) {
      return {
        allowed: false,
        reason: `Usage ${currentUsage} exceeds limit ${capability.limit}`,
        usage: currentUsage,
        limit: capability.limit,
      };
    }

    return {
      allowed: true,
      usage: currentUsage,
      limit: capability.limit,
    };
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
      workspaceId,
      key,
      value,
      timestamp: new Date(),
    },
  });
}

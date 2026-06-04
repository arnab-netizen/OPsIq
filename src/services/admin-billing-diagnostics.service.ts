/**
 * Admin Billing Diagnostics Service
 *
 * Provides comprehensive, admin-safe billing and entitlement diagnostics.
 * Workspace-scoped, fails closed on missing auth/scope, no secrets exposed.
 */

import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import {
  BillingDiagnosticDTO,
  BillingExportPacketDTO,
  BillingAccountSummaryDTO,
  SubscriptionStatusDTO,
  PlanDTO,
  EntitlementDecisionDTO,
  UsageSummaryDTO,
  BILLING_STATES,
} from "@/lib/billing/admin-billing-diagnostics.dto";

/**
 * Get billing diagnostic for a workspace
 * Fails closed: throws if workspace scope not verified
 */
export async function getBillingDiagnostic(
  workspaceId: string
): Promise<BillingDiagnosticDTO> {
  if (!workspaceId) {
    throw new ValidationError("workspaceId is required");
  }

  const warnings: string[] = [];
  const missingData: string[] = [];

  try {
    // Load billing account
    const billingAccount = await db.billingAccount.findUnique({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        stripeCustomerId: true,
        status: true,
        createdAt: true,
      },
    });

    if (!billingAccount) {
      missingData.push(BILLING_STATES.NO_BILLING_ACCOUNT);
      return createEmptyDiagnostic(workspaceId, warnings, missingData);
    }

    const accountSummary: BillingAccountSummaryDTO = {
      workspaceId: billingAccount.workspaceId,
      billingAccountId: billingAccount.id,
      status: billingAccount.status || "unknown",
      stripeCustomerId: billingAccount.stripeCustomerId || undefined,
      createdAt: billingAccount.createdAt.toISOString(),
    };

    // Load subscription
    const subscription = await db.subscription.findFirst({
      where: { billingAccountId: billingAccount.id },
      select: {
        id: true,
        status: true,
        planId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        stripeSubscriptionId: true,
        plan: {
          select: {
            id: true,
            name: true,
            priceMonthly: true,
            priceYearly: true,
            description: true,
            // Prisma relation on Plan is `planCapabilities` (see schema).
            planCapabilities: {
              select: {
                key: true,
                limit: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!subscription) {
      missingData.push(BILLING_STATES.NO_ACTIVE_SUBSCRIPTION);
      return createEmptyDiagnostic(
        workspaceId,
        warnings,
        missingData,
        accountSummary
      );
    }

    const subscriptionStatus: SubscriptionStatusDTO = {
      subscriptionId: subscription.id,
      status: subscription.status || "unknown",
      planId: subscription.planId || undefined,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
      stripeSubscriptionId: subscription.stripeSubscriptionId || undefined,
    };

    if (!subscription.plan) {
      missingData.push(BILLING_STATES.PLAN_NOT_FOUND);
      return createEmptyDiagnostic(
        workspaceId,
        warnings,
        missingData,
        accountSummary,
        subscriptionStatus
      );
    }

    const planDTO: PlanDTO = {
      planId: subscription.plan.id,
      name: subscription.plan.name,
      priceMonthly: subscription.plan.priceMonthly,
      priceYearly: subscription.plan.priceYearly,
      description: subscription.plan.description || undefined,
      // Public DTO field stays `capabilities`; source relation is `planCapabilities`.
      capabilities: subscription.plan.planCapabilities.map((cap: { key: string; limit: number | null; description: string | null }) => ({
        key: cap.key,
        limit: cap.limit,
        description: cap.description || undefined,
      })),
    };

    // Load usage for current period
    const usage = await getWorkspaceUsage(
      workspaceId,
      subscription.currentPeriodStart
    );

    // Build entitlement decisions
    const entitlementDecisions = buildEntitlementDecisions(
      planDTO.capabilities,
      usage
    );

    // Check if data is complete
    const statusCode =
      missingData.length === 0
        ? "complete"
        : missingData.length < 2
          ? "partial"
          : "none";

    if (subscription.status !== "active") {
      warnings.push(`Subscription status is ${subscription.status}`);
    }

    return {
      timestamp: new Date().toISOString(),
      workspaceId,
      account: accountSummary,
      subscription: subscriptionStatus,
      plan: planDTO,
      entitlementDecisions,
      usage,
      diagnostics: {
        status: statusCode as "complete" | "partial" | "none",
        warnings,
        missingData,
      },
    };
  } catch (error) {
    logger.error("Failed to get billing diagnostic", {
      workspaceId,
      errorType: error instanceof Error ? error.constructor.name : "unknown",
    });
    throw error;
  }
}

/**
 * Get billing export packet (support/admin export)
 */
export async function getBillingExportPacket(
  workspaceId: string
): Promise<BillingExportPacketDTO> {
  const startTime = Date.now();
  const diagnostic = await getBillingDiagnostic(workspaceId);

  return {
    timestamp: diagnostic.timestamp,
    workspaceId,
    generatedAt: new Date().toISOString(),
    account: diagnostic.account,
    subscription: diagnostic.subscription,
    plan: diagnostic.plan,
    entitlementDecisions: diagnostic.entitlementDecisions,
    usage: diagnostic.usage,
    supportMetadata: {
      databaseQueryTimeMs: Date.now() - startTime,
      diagnosticStatus: diagnostic.diagnostics.status,
      missingData: diagnostic.diagnostics.missingData,
    },
  };
}

/**
 * Get workspace usage for a period
 */
async function getWorkspaceUsage(
  workspaceId: string,
  periodStart: Date | null
): Promise<UsageSummaryDTO[]> {
  if (!periodStart) {
    return [];
  }

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

  // Aggregate by key
  const usageMap = new Map<string, number>();
  for (const event of usageEvents) {
    const current = usageMap.get(event.key) || 0;
    usageMap.set(event.key, current + event.value);
  }

  return Array.from(usageMap.entries()).map(([key, value]) => ({
    key,
    value,
  }));
}

/**
 * Build entitlement decisions from plan capabilities and current usage
 */
function buildEntitlementDecisions(
  capabilities: Array<{ key: string; limit: number | null }>,
  usage: UsageSummaryDTO[]
): EntitlementDecisionDTO[] {
  const usageMap = new Map(usage.map((u) => [u.key, u.value]));

  return capabilities.map((cap) => {
    const currentUsage = usageMap.get(cap.key) || 0;
    const isAllowed =
      cap.limit === null || currentUsage < cap.limit;
    const percentageUsed =
      cap.limit === null
        ? undefined
        : Math.round((currentUsage / cap.limit) * 100);

    return {
      capability: cap.key,
      allowed: isAllowed,
      reason: buildEntitlementReason(cap.key, isAllowed, currentUsage, cap.limit),
      usage: currentUsage,
      limit: cap.limit,
      percentageUsed,
    };
  });
}

/**
 * Build human-readable entitlement reason
 */
function buildEntitlementReason(
  capability: string,
  allowed: boolean,
  usage: number,
  limit: number | null
): string {
  if (!allowed && limit !== null) {
    return `Usage ${usage} exceeds limit ${limit}`;
  }
  if (allowed && limit === null) {
    return `Capability is unlimited`;
  }
  if (allowed && limit !== null) {
    return `Usage ${usage} within limit ${limit}`;
  }
  return "Status unknown";
}

/**
 * Create empty diagnostic for missing data states
 */
function createEmptyDiagnostic(
  workspaceId: string,
  warnings: string[],
  missingData: string[],
  account?: BillingAccountSummaryDTO,
  subscription?: SubscriptionStatusDTO
): BillingDiagnosticDTO {
  return {
    timestamp: new Date().toISOString(),
    workspaceId,
    account: account || {
      workspaceId,
      billingAccountId: "unknown",
      status: "unknown",
      createdAt: new Date().toISOString(),
    },
    subscription: subscription || {
      status: "unknown",
    },
    entitlementDecisions: [],
    usage: [],
    diagnostics: {
      status: "none",
      warnings,
      missingData,
    },
  };
}

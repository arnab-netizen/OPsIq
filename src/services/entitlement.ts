/**
 * Entitlement Service
 *
 * Manages subscription tiers, capabilities, and quota enforcement.
 * Determines what features are available based on workspace tier.
 * Mock-backed for non-DB environments.
 */


export enum SubscriptionTier {
  FREE = "free",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

export enum Capability {
  // Action operations
  ACTION_CREATE = "action_create",
  ACTION_UPDATE = "action_update",
  ACTION_DELETE = "action_delete",

  // Decision operations
  DECISION_CREATE = "decision_create",
  DECISION_UPDATE = "decision_update",

  // Experiment operations
  EXPERIMENT_CREATE = "experiment_create",
  EXPERIMENT_UPDATE = "experiment_update",

  // Workspace operations
  WORKSPACE_CREATE = "workspace_create",
  WORKSPACE_INVITE = "workspace_invite",

  // Audit operations
  AUDIT_VIEW = "audit_view",
  AUDIT_EXPORT = "audit_export",

  // Admin operations
  ADMIN_SETTINGS = "admin_settings",
  ADMIN_TEAM = "admin_team",
}

export interface SubscriptionTierConfig {
  tier: SubscriptionTier;
  name: string;
  description: string;
  workspaceLimit: number;
  actionsPerMonth: number;
  decisionsPerMonth: number;
  experimentsPerMonth: number;
  capabilities: Capability[];
  features: {
    customNotifications: boolean;
    advancedAnalytics: boolean;
    sso: boolean;
    auditLog: boolean;
    exportData: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    teamCollaboration: boolean;
    prioritySupport: boolean;
  };
}

export interface QuotaUsage {
  workspaceId: string;
  userId: string;
  period: string; // YYYY-MM
  actionsCreated: number;
  decisionsCreated: number;
  experimentsCreated: number;
  exportCount: number;
}

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  tier?: SubscriptionTier;
  usage?: QuotaUsage;
  limit?: number;
  remaining?: number;
}

// Tier configurations
export const TIER_CONFIGS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  [SubscriptionTier.FREE]: {
    tier: SubscriptionTier.FREE,
    name: "Free",
    description: "Get started with Rebilix",
    workspaceLimit: 1,
    actionsPerMonth: 5,
    decisionsPerMonth: 10,
    experimentsPerMonth: 2,
    capabilities: [
      Capability.ACTION_CREATE,
      Capability.ACTION_UPDATE,
      Capability.DECISION_CREATE,
      Capability.EXPERIMENT_CREATE,
      Capability.AUDIT_VIEW,
    ],
    features: {
      customNotifications: false,
      advancedAnalytics: false,
      sso: false,
      auditLog: true,
      exportData: false,
      apiAccess: false,
      webhooks: false,
      teamCollaboration: false,
      prioritySupport: false,
    },
  },
  [SubscriptionTier.PRO]: {
    tier: SubscriptionTier.PRO,
    name: "Professional",
    description: "For growing teams",
    workspaceLimit: 5,
    actionsPerMonth: 500,
    decisionsPerMonth: 500,
    experimentsPerMonth: 100,
    capabilities: [
      Capability.ACTION_CREATE,
      Capability.ACTION_UPDATE,
      Capability.ACTION_DELETE,
      Capability.DECISION_CREATE,
      Capability.DECISION_UPDATE,
      Capability.EXPERIMENT_CREATE,
      Capability.EXPERIMENT_UPDATE,
      Capability.WORKSPACE_INVITE,
      Capability.AUDIT_VIEW,
      Capability.AUDIT_EXPORT,
      Capability.ADMIN_SETTINGS,
    ],
    features: {
      customNotifications: true,
      advancedAnalytics: true,
      sso: false,
      auditLog: true,
      exportData: true,
      apiAccess: true,
      webhooks: true,
      teamCollaboration: true,
      prioritySupport: false,
    },
  },
  [SubscriptionTier.ENTERPRISE]: {
    tier: SubscriptionTier.ENTERPRISE,
    name: "Enterprise",
    description: "For large organizations",
    workspaceLimit: 999999,
    actionsPerMonth: 999999,
    decisionsPerMonth: 999999,
    experimentsPerMonth: 999999,
    capabilities: [
      Capability.ACTION_CREATE,
      Capability.ACTION_UPDATE,
      Capability.ACTION_DELETE,
      Capability.DECISION_CREATE,
      Capability.DECISION_UPDATE,
      Capability.EXPERIMENT_CREATE,
      Capability.EXPERIMENT_UPDATE,
      Capability.WORKSPACE_CREATE,
      Capability.WORKSPACE_INVITE,
      Capability.AUDIT_VIEW,
      Capability.AUDIT_EXPORT,
      Capability.ADMIN_SETTINGS,
      Capability.ADMIN_TEAM,
    ],
    features: {
      customNotifications: true,
      advancedAnalytics: true,
      sso: true,
      auditLog: true,
      exportData: true,
      apiAccess: true,
      webhooks: true,
      teamCollaboration: true,
      prioritySupport: true,
    },
  },
};

// In-memory stores for subscriptions and quota
const subscriptionStore = new Map<string, SubscriptionTier>();
const quotaStore = new Map<string, QuotaUsage>();

// Once-per-process guard for the PRIVATE_MODE_ENTITLEMENT_ACTIVE audit event.
// Prevents one event per request across serverless invocations that share the module.
let _privateModeEntitlementEmitted = false;

function emitPrivateModeEntitlementEvent(workspaceId: string): void {
  if (_privateModeEntitlementEmitted) return;
  _privateModeEntitlementEmitted = true;
  // Fire-and-forget: non-blocking, best-effort. Audit failure must never block
  // entitlement resolution. Dynamic import avoids circular-dependency at module load.
  void (async () => {
    try {
      const { emitAuditEvent } = await import("@/infra/audit");
      const { AUDIT_EVENTS } = await import("@/domain/constants/audit-events");
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.PRIVATE_MODE_ENTITLEMENT_ACTIVE,
        workspaceId,
        actorId: "system",
        actorType: "system",
        entityType: "workspace",
        entityId: workspaceId,
        payload: { tier: SubscriptionTier.ENTERPRISE, reason: "OPSIQ_PRIVATE_WORKSPACE_ID_MATCH" },
        visibility: "internal",
      });
    } catch {
      // Best-effort: do not let audit failure surface to callers
    }
  })();
}

/**
 * Get subscription tier for workspace.
 *
 * Private deployment override: when OPSIQ_PRIVATE_WORKSPACE_ID is set and the
 * requested workspaceId matches exactly, returns ENTERPRISE. Scoped to the ONE
 * configured workspace — all other workspaces are unaffected. Never set this env
 * var in multi-tenant production.
 */
export function getSubscriptionTier(workspaceId: string): SubscriptionTier {
  const privateWorkspaceId = process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
  if (privateWorkspaceId && workspaceId === privateWorkspaceId) {
    emitPrivateModeEntitlementEvent(privateWorkspaceId);
    return SubscriptionTier.ENTERPRISE;
  }
  return subscriptionStore.get(workspaceId) || SubscriptionTier.FREE;
}

/**
 * Set subscription tier for workspace
 */
export function setSubscriptionTier(workspaceId: string, tier: SubscriptionTier): void {
  subscriptionStore.set(workspaceId, tier);
}

/**
 * Get tier configuration
 */
export function getTierConfig(tier: SubscriptionTier): SubscriptionTierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Check if workspace has capability
 */
export function hasCapability(workspaceId: string, capability: Capability): boolean {
  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);
  return config.capabilities.includes(capability);
}

/**
 * Check if workspace has feature
 */
export function hasFeature(
  workspaceId: string,
  feature: keyof SubscriptionTierConfig["features"]
): boolean {
  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);
  return config.features[feature];
}

/**
 * Get current quota usage for workspace
 */
export function getQuotaUsage(workspaceId: string, userId: string): QuotaUsage {
  const period = getPeriod();
  const key = `${workspaceId}:${userId}:${period}`;

  let usage = quotaStore.get(key);
  if (!usage) {
    usage = {
      workspaceId,
      userId,
      period,
      actionsCreated: 0,
      decisionsCreated: 0,
      experimentsCreated: 0,
      exportCount: 0,
    };
    quotaStore.set(key, usage);
  }

  return usage;
}

/**
 * Increment quota usage
 */
export function incrementQuotaUsage(
  workspaceId: string,
  userId: string,
  operation: "action" | "decision" | "experiment" | "export"
): void {
  const usage = getQuotaUsage(workspaceId, userId);

  switch (operation) {
    case "action":
      usage.actionsCreated++;
      break;
    case "decision":
      usage.decisionsCreated++;
      break;
    case "experiment":
      usage.experimentsCreated++;
      break;
    case "export":
      usage.exportCount++;
      break;
  }
}

/**
 * Check if action creation is allowed
 */
export function canCreateAction(
  workspaceId: string,
  userId: string
): EntitlementCheckResult {
  if (!hasCapability(workspaceId, Capability.ACTION_CREATE)) {
    return {
      allowed: false,
      reason: "ACTION_CREATE capability not available in current tier",
    };
  }

  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);
  const usage = getQuotaUsage(workspaceId, userId);

  if (usage.actionsCreated >= config.actionsPerMonth) {
    return {
      allowed: false,
      reason: "Monthly action limit exceeded",
      tier,
      usage,
      limit: config.actionsPerMonth,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    tier,
    usage,
    limit: config.actionsPerMonth,
    remaining: config.actionsPerMonth - usage.actionsCreated,
  };
}

/**
 * Check if decision creation is allowed
 */
export function canCreateDecision(
  workspaceId: string,
  userId: string
): EntitlementCheckResult {
  if (!hasCapability(workspaceId, Capability.DECISION_CREATE)) {
    return {
      allowed: false,
      reason: "DECISION_CREATE capability not available in current tier",
    };
  }

  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);
  const usage = getQuotaUsage(workspaceId, userId);

  if (usage.decisionsCreated >= config.decisionsPerMonth) {
    return {
      allowed: false,
      reason: "Monthly decision limit exceeded",
      tier,
      usage,
      limit: config.decisionsPerMonth,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    tier,
    usage,
    limit: config.decisionsPerMonth,
    remaining: config.decisionsPerMonth - usage.decisionsCreated,
  };
}

/**
 * Check if experiment creation is allowed
 */
export function canCreateExperiment(
  workspaceId: string,
  userId: string
): EntitlementCheckResult {
  if (!hasCapability(workspaceId, Capability.EXPERIMENT_CREATE)) {
    return {
      allowed: false,
      reason: "EXPERIMENT_CREATE capability not available in current tier",
    };
  }

  const tier = getSubscriptionTier(workspaceId);
  const config = getTierConfig(tier);
  const usage = getQuotaUsage(workspaceId, userId);

  if (usage.experimentsCreated >= config.experimentsPerMonth) {
    return {
      allowed: false,
      reason: "Monthly experiment limit exceeded",
      tier,
      usage,
      limit: config.experimentsPerMonth,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    tier,
    usage,
    limit: config.experimentsPerMonth,
    remaining: config.experimentsPerMonth - usage.experimentsCreated,
  };
}

/**
 * Check if export is allowed
 */
export function canExportData(workspaceId: string): EntitlementCheckResult {
  if (!hasFeature(workspaceId, "exportData")) {
    return {
      allowed: false,
      reason: "Data export not available in current tier",
    };
  }

  const tier = getSubscriptionTier(workspaceId);
  return {
    allowed: true,
    tier,
  };
}

/**
 * Check if API access is allowed
 */
export function hasApiAccess(workspaceId: string): EntitlementCheckResult {
  if (!hasFeature(workspaceId, "apiAccess")) {
    return {
      allowed: false,
      reason: "API access not available in current tier",
    };
  }

  const tier = getSubscriptionTier(workspaceId);
  return {
    allowed: true,
    tier,
  };
}

/**
 * Get current period (YYYY-MM)
 */
function getPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Reset quota for testing
 */
export function resetQuota(workspaceId?: string): void {
  if (workspaceId) {
    const keysToDelete: string[] = [];
    quotaStore.forEach((_, key) => {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => quotaStore.delete(key));
  } else {
    quotaStore.clear();
  }
}

/**
 * Reset subscriptions for testing
 */
export function resetSubscriptions(): void {
  subscriptionStore.clear();
}

/**
 * Clear all entitlement data
 */
export function clearAllEntitlementData(): void {
  quotaStore.clear();
  subscriptionStore.clear();
}

/**
 * Subscription tier configuration and capability mapping.
 * Defines free/pro/enterprise tiers with associated limits and capabilities.
 */

export type SubscriptionTier = "free" | "pro" | "enterprise";

export interface TierLimits {
  workspacesPerAccount: number;
  actionsPerMonth: number;
  requestsPerHour: number;
  ipRequestsPerHour: number;
  collaboratorsPerWorkspace: number;
  storageGbPerMonth: number;
}

export interface TierConfig {
  tier: SubscriptionTier;
  capabilities: string[];
  limits: TierLimits;
  costUsdMonth: number;
}

/**
 * Tier definitions. Free tier is default.
 */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    tier: "free",
    capabilities: [
      "ENGAGEMENT_VIEW",
      "ACTION_VIEW",
      "ACTION_CREATE",
      "DECISION_VIEW",
      "EXPERIMENT_VIEW",
      "FINDING_VIEW",
    ],
    limits: {
      workspacesPerAccount: 1,
      actionsPerMonth: 10,
      requestsPerHour: 1000,
      ipRequestsPerHour: 100,
      collaboratorsPerWorkspace: 2,
      storageGbPerMonth: 1,
    },
    costUsdMonth: 0,
  },
  pro: {
    tier: "pro",
    capabilities: [
      "ENGAGEMENT_VIEW",
      "ENGAGEMENT_MANAGE",
      "ACTION_VIEW",
      "ACTION_CREATE",
      "ACTION_MANAGE",
      "DECISION_VIEW",
      "DECISION_CREATE",
      "DECISION_APPROVE",
      "EXPERIMENT_VIEW",
      "EXPERIMENT_CREATE",
      "FINDING_VIEW",
      "RECOMMENDATION_CREATE",
      "OWNER_VIEW",
      "OWNER_MANAGE",
    ],
    limits: {
      workspacesPerAccount: 10,
      actionsPerMonth: 1000,
      requestsPerHour: 10000,
      ipRequestsPerHour: 500,
      collaboratorsPerWorkspace: 50,
      storageGbPerMonth: 100,
    },
    costUsdMonth: 99,
  },
  enterprise: {
    tier: "enterprise",
    capabilities: [
      // All capabilities available
      "ENGAGEMENT_VIEW",
      "ENGAGEMENT_MANAGE",
      "ACTION_VIEW",
      "ACTION_CREATE",
      "ACTION_MANAGE",
      "DECISION_VIEW",
      "DECISION_CREATE",
      "DECISION_APPROVE",
      "EXPERIMENT_VIEW",
      "EXPERIMENT_CREATE",
      "FINDING_VIEW",
      "RECOMMENDATION_CREATE",
      "OWNER_VIEW",
      "OWNER_MANAGE",
      "ADMIN_VIEW",
      "ADMIN_MANAGE",
      "SSO_MANAGE",
      "AUDIT_EXPORT",
    ],
    limits: {
      workspacesPerAccount: 1000,
      actionsPerMonth: 1000000,
      requestsPerHour: 100000,
      ipRequestsPerHour: 10000,
      collaboratorsPerWorkspace: 1000,
      storageGbPerMonth: 10000,
    },
    costUsdMonth: 999,
  },
};

/**
 * Get tier config by tier name.
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_CONFIGS[tier] || TIER_CONFIGS.free;
}

/**
 * Get default tier (free).
 */
export function getDefaultTier(): SubscriptionTier {
  return "free";
}

/**
 * Check if a capability is available in a tier.
 */
export function hasCapabilityInTier(
  capability: string,
  tier: SubscriptionTier
): boolean {
  const config = getTierConfig(tier);
  return config.capabilities.includes(capability);
}

/**
 * Check if capability is available. Defaults to free tier if not specified.
 */
export function canPerformAction(
  capability: string,
  tier?: SubscriptionTier
): boolean {
  const tierToCheck = tier || getDefaultTier();
  return hasCapabilityInTier(capability, tierToCheck);
}

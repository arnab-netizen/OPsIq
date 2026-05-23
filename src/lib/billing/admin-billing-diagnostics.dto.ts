/**
 * Admin-safe billing and entitlement proof DTOs
 *
 * These DTOs are designed for:
 * - Admin diagnostic purposes
 * - Support team troubleshooting
 * - Safe export without secrets
 * - Workspace-scoped access only
 */

export interface BillingAccountSummaryDTO {
  workspaceId: string;
  billingAccountId: string;
  status: "active" | "inactive" | "none" | string;
  stripeCustomerId?: string;
  createdAt: string;
}

export interface SubscriptionStatusDTO {
  subscriptionId?: string;
  status: "active" | "canceled" | "past_due" | "incomplete" | "none" | string;
  planId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  stripeSubscriptionId?: string;
}

export interface PlanCapabilityDTO {
  key: string;
  limit: number | null;
  description?: string;
}

export interface PlanDTO {
  planId: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  description?: string;
  capabilities: PlanCapabilityDTO[];
}

export interface EntitlementDecisionDTO {
  capability: string;
  allowed: boolean;
  reason: string;
  usage?: number;
  limit?: number | null;
  percentageUsed?: number;
}

export interface UsageSummaryDTO {
  key: string;
  value: number;
  limit?: number | null;
  percentageUsed?: number;
}

export interface BillingDiagnosticDTO {
  timestamp: string;
  workspaceId: string;
  account: BillingAccountSummaryDTO;
  subscription: SubscriptionStatusDTO;
  plan?: PlanDTO;
  entitlementDecisions: EntitlementDecisionDTO[];
  usage: UsageSummaryDTO[];
  diagnostics: {
    status: "complete" | "partial" | "none";
    warnings: string[];
    missingData: string[];
  };
}

export interface BillingExportPacketDTO {
  timestamp: string;
  workspaceId: string;
  generatedAt: string;
  account: BillingAccountSummaryDTO;
  subscription: SubscriptionStatusDTO;
  plan?: PlanDTO;
  entitlementDecisions: EntitlementDecisionDTO[];
  usage: UsageSummaryDTO[];
  supportMetadata: {
    databaseQueryTimeMs?: number;
    diagnosticStatus: string;
    missingData: string[];
  };
}

/**
 * State constants for missing data scenarios
 */
export const BILLING_STATES = {
  NO_BILLING_ACCOUNT: "NO_BILLING_ACCOUNT",
  NO_ACTIVE_SUBSCRIPTION: "NO_ACTIVE_SUBSCRIPTION",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  CAPABILITY_NOT_FOUND: "CAPABILITY_NOT_FOUND",
  USAGE_DATA_UNAVAILABLE: "USAGE_DATA_UNAVAILABLE",
} as const;

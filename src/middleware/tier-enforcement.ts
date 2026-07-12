/**
 * Tier-based entitlement enforcement middleware.
 * Checks quota and subscription tier before allowing POST/PATCH/DELETE operations.
 * Fails closed (returns 429 if quota exceeded).
 */

import { NextRequest, NextResponse } from "next/server";
import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";
import { type ClaimedWorkspaceId, claimWorkspaceId, claimedIdForLog } from "@/lib/workspace-identity";

/**
 * In-memory quota tracking: workspace → endpoint → usage count
 * Reset monthly (on calendar month change).
 */
const quotaStore: Map<
  string,
  {
    endpoint: string;
    count: number;
    resetAt: number; // unix timestamp of next reset
  }[]
> = new Map();

/**
 * Get month start timestamp (UTC).
 */
function getMonthStart(): number {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).getTime();
}

/**
 * Get next month start timestamp (UTC).
 */
function getNextMonthStart(): number {
  const now = new Date();
  const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return nextMonth.getTime();
}

/**
 * Get or create quota entry for workspace+endpoint.
 */
function getQuotaEntry(
  workspaceId: string,
  endpoint: string
): { count: number; resetAt: number } {
  const key = workspaceId;
  let entries = quotaStore.get(key);

  if (!entries) {
    entries = [];
    quotaStore.set(key, entries);
  }

  let entry = entries.find((e) => e.endpoint === endpoint);

  // Create or reset if month changed
  if (!entry) {
    entry = { endpoint, count: 0, resetAt: getNextMonthStart() };
    entries.push(entry);
  } else if (Date.now() >= entry.resetAt) {
    // Reset for new month
    entry.count = 0;
    entry.resetAt = getNextMonthStart();
  }

  return entry;
}

/**
 * Check quota. Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkQuota(
  workspaceId: string,
  tier: SubscriptionTier,
  endpoint: string
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = getTierConfig(tier);
  const entry = getQuotaEntry(workspaceId, endpoint);

  const allowed = entry.count < config.limits.actionsPerMonth;
  const remaining = Math.max(0, config.limits.actionsPerMonth - entry.count);

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Increment quota counter for workspace+endpoint.
 */
export function incrementQuota(
  workspaceId: string,
  endpoint: string
): { count: number; remaining: number } {
  const entry = getQuotaEntry(workspaceId, endpoint);
  entry.count += 1;

  // Estimate remaining (would need real tier lookup in production)
  const remaining = Math.max(0, 1000 - entry.count); // Default to 1000 for now

  return {
    count: entry.count,
    remaining,
  };
}

/**
 * Reset all quota for testing.
 */
export function resetAllQuota(): void {
  quotaStore.clear();
}

/**
 * Middleware function: Check tier-based entitlements.
 * Must be called after auth middleware (assumes x-workspace-id header exists).
 * Must be called after workspace enforcement (assumes x-workspace-id header exists).
 * Optional: Reads x-tier header for tier information, defaults to free tier.
 *
 * Returns 429 (Too Many Requests) if quota exceeded.
 */
export function tierEnforcement() {
  return async (request: NextRequest, response: NextResponse) => {
    // Only check POST, PATCH, DELETE operations
    if (!["POST", "PATCH", "DELETE"].includes(request.method)) {
      return response;
    }

    // DEAD MIDDLEWARE — not wired in production. Read is typed as ClaimedWorkspaceId (untrusted claim).
    // If this middleware is ever wired, caller MUST supply a VerifiedWorkspaceId via a safe channel,
    // not derive it from this header. The header read here is UNTRUSTED_DIAGNOSTIC_ONLY.
    const claimedId: ClaimedWorkspaceId | null = claimWorkspaceId(request.headers.get("x-workspace-id"));
    if (!claimedId) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
      });
    }

    // SECURITY GATE: This middleware is dead code. The block below would constitute
    // TIER_ENFORCEMENT_VIOLATION + CROSS_TENANT_RESOURCE_POISONING_RISK if wired, because
    // resolveWorkspaceTier would execute a DB query keyed on an unverified caller claim.
    // DO NOT wire tierEnforcement() without replacing claimedId with a VerifiedWorkspaceId
    // passed through a safe out-of-band channel (e.g., withCanonicalEnforcement context).
    // Wiring this middleware is permanently blocked. Any future wiring must:
    // 1. Remove this throw
    // 2. Accept VerifiedWorkspaceId from withCanonicalEnforcement context (not from header)
    // 3. Rewrite tier and quota checks against verified identity
    throw new Error(
      "tierEnforcement() is dead middleware and must not be wired. " +
      `Claimed workspace: ${claimedIdForLog(claimedId)}. ` +
      "Use withCanonicalEnforcement with VerifiedWorkspaceId for tier checks."
    );
  };
}

/**
 * Helper: Check tier enforcement rules (for use in services/routes).
 * Returns { allowed: boolean, error?: string }
 */
export function checkTierEnforcement(
  workspaceId: string,
  tier: SubscriptionTier,
  endpoint: string
): { allowed: boolean; error?: string } {
  const quota = checkQuota(workspaceId, tier, endpoint);

  if (!quota.allowed) {
    const config = getTierConfig(tier);
    return {
      allowed: false,
      error: `Quota exceeded: ${config.limits.actionsPerMonth} ${tier === "free" ? "(free tier)" : `(${tier} tier)`} actions per month`,
    };
  }

  return { allowed: true };
}

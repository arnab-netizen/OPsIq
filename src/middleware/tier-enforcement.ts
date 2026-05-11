/**
 * Tier-based entitlement enforcement middleware.
 * Checks quota and subscription tier before allowing POST/PATCH/DELETE operations.
 * Fails closed (returns 429 if quota exceeded).
 */

import { NextRequest, NextResponse } from "next/server";
import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";

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

    // Get workspace from x-workspace-id header (set by workspace-enforcement middleware)
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      // Missing workspace ID means workspace-enforcement middleware didn't run
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
      });
    }

    // Get tier from x-tier header (set by auth middleware) or default to free
    // In production, this would come from database subscription lookup
    const tier: SubscriptionTier = (request.headers.get("x-tier") as SubscriptionTier) || "free";

    // Get endpoint path for quota tracking
    const endpoint = new URL(request.url).pathname;

    // Check quota
    const quota = checkQuota(workspaceId, tier, endpoint);

    if (!quota.allowed) {
      // Quota exceeded: return 429 with retry-after header
      const retryAfter = Math.ceil((quota.resetAt - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: "Quota exceeded",
          tier,
          limit: getTierConfig(tier).limits.actionsPerMonth,
          resetAt: new Date(quota.resetAt).toISOString(),
          message: `Free tier limited to ${getTierConfig(tier).limits.actionsPerMonth} actions/month. Upgrade to Pro for unlimited.`,
        }),
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Reset": quota.resetAt.toString(),
          },
        }
      );
    }

    // Quota OK: increment counter and add headers to response
    const updated = incrementQuota(workspaceId, endpoint);

    // Set rate limit headers on response
    response.headers.set("X-RateLimit-Limit", getTierConfig(tier).limits.actionsPerMonth.toString());
    response.headers.set("X-RateLimit-Remaining", quota.remaining.toString());
    response.headers.set("X-RateLimit-Reset", quota.resetAt.toString());

    return response;
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

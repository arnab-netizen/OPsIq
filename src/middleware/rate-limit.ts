/**
 * Rate limiting middleware using token bucket algorithm.
 * Per-workspace and per-IP rate limiting.
 * In-memory sliding window implementation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitStore {
  workspace: Map<string, TokenBucket>;
  ip: Map<string, TokenBucket>;
}

const store: RateLimitStore = {
  workspace: new Map(),
  ip: new Map(),
};

/**
 * Calculate available tokens based on elapsed time.
 * Refill rate is determined by limits (tokens per second).
 */
function calculateTokens(
  lastBucket: TokenBucket,
  capacity: number,
  refillRate: number // tokens per second
): number {
  const now = Date.now();
  const elapsed = (now - lastBucket.lastRefill) / 1000; // seconds
  const tokensAdded = elapsed * refillRate;
  return Math.min(capacity, lastBucket.tokens + tokensAdded);
}

/**
 * Get or create token bucket for workspace.
 */
function getWorkspaceBucket(workspaceId: string): TokenBucket {
  let bucket = store.workspace.get(workspaceId);

  if (!bucket) {
    // Initialize with full capacity
    bucket = { tokens: 10000, lastRefill: Date.now() };
    store.workspace.set(workspaceId, bucket);
  }

  return bucket;
}

/**
 * Get or create token bucket for IP address.
 */
function getIpBucket(ip: string): TokenBucket {
  let bucket = store.ip.get(ip);

  if (!bucket) {
    // Initialize with full capacity
    bucket = { tokens: 1000, lastRefill: Date.now() };
    store.ip.set(ip, bucket);
  }

  return bucket;
}

/**
 * Check and consume tokens from workspace bucket.
 * Returns { allowed: boolean, remaining: number, retryAfter?: number }
 */
export function checkWorkspaceRateLimit(
  workspaceId: string,
  tier: SubscriptionTier,
  tokens: number = 1
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const config = getTierConfig(tier);
  const capacity = config.limits.requestsPerHour;
  const refillRate = capacity / 3600; // tokens per second

  const bucket = getWorkspaceBucket(workspaceId);
  const now = Date.now();

  // Refill based on elapsed time
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    capacity,
    bucket.tokens + elapsedSeconds * refillRate
  );
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= tokens;

  if (allowed) {
    bucket.tokens -= tokens;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
    };
  } else {
    // Deny: calculate when next token will be available
    const tokensNeeded = tokens - bucket.tokens;
    const retryAfter = Math.ceil(tokensNeeded / refillRate);
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }
}

/**
 * Check and consume tokens from IP bucket.
 * Returns { allowed: boolean, remaining: number, retryAfter?: number }
 */
export function checkIpRateLimit(
  ip: string,
  tokens: number = 1
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const capacity = 1000; // IP rate limit
  const refillRate = capacity / 3600; // tokens per second

  const bucket = getIpBucket(ip);
  const now = Date.now();

  // Refill based on elapsed time
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    capacity,
    bucket.tokens + elapsedSeconds * refillRate
  );
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= tokens;

  if (allowed) {
    bucket.tokens -= tokens;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
    };
  } else {
    // Deny: calculate when next token will be available
    const tokensNeeded = tokens - bucket.tokens;
    const retryAfter = Math.ceil(tokensNeeded / refillRate);
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }
}

/**
 * Middleware: Rate limit enforcement.
 * Checks both workspace and IP rate limits.
 * Returns 429 if either limit exceeded.
 * Reads x-workspace-id and x-tier headers for tier information.
 */
export function rateLimitEnforcement() {
  return async (request: NextRequest, response: NextResponse) => {
    // Get workspace ID from header
    const workspaceId = request.headers.get("x-workspace-id");
    const tier: SubscriptionTier = (request.headers.get("x-tier") as SubscriptionTier) || "free";

    // Get client IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    // Check workspace rate limit (only if workspace exists)
    if (workspaceId) {
      const wsLimit = checkWorkspaceRateLimit(workspaceId, tier);
      if (!wsLimit.allowed) {
        return new NextResponse(
          JSON.stringify({
            error: "Rate limit exceeded (workspace)",
            retryAfter: wsLimit.retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Retry-After": (wsLimit.retryAfter || 60).toString(),
              "X-RateLimit-Limit": getTierConfig(tier).limits.requestsPerHour.toString(),
              "X-RateLimit-Remaining": "0",
            },
          }
        );
      }

      // Add rate limit headers
      response.headers.set(
        "X-RateLimit-Limit-Workspace",
        getTierConfig(tier).limits.requestsPerHour.toString()
      );
      response.headers.set(
        "X-RateLimit-Remaining-Workspace",
        wsLimit.remaining.toString()
      );
    }

    // Check IP rate limit
    const ipLimit = checkIpRateLimit(ip);
    if (!ipLimit.allowed) {
      return new NextResponse(
        JSON.stringify({
          error: "Rate limit exceeded (IP)",
          retryAfter: ipLimit.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Retry-After": (ipLimit.retryAfter || 60).toString(),
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // Add IP rate limit headers
    response.headers.set("X-RateLimit-Limit-IP", "1000");
    response.headers.set("X-RateLimit-Remaining-IP", ipLimit.remaining.toString());

    return response;
  };
}

/**
 * Reset all rate limit buckets for testing.
 */
export function resetAllRateLimits(): void {
  store.workspace.clear();
  store.ip.clear();
}

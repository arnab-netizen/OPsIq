/**
 * Rate limiting middleware using token bucket algorithm.
 * Per-workspace and per-IP rate limiting.
 * In-memory sliding window implementation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";
import {
  type ClaimedWorkspaceId,
  type VerifiedWorkspaceId,
  claimWorkspaceId,
  claimedIdForLog,
} from "@/lib/workspace-identity";

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
 * Requires VerifiedWorkspaceId — caller must have proven DB membership before calling.
 * The one live caller (actions/route.ts) passes ctx.verifiedWorkspaceId (safe).
 * Returns { allowed: boolean, remaining: number, retryAfter?: number }
 */
export function checkWorkspaceRateLimit(
  workspaceId: VerifiedWorkspaceId,
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
    // DEAD MIDDLEWARE — not wired in production.
    // x-workspace-id read is typed as ClaimedWorkspaceId (untrusted claim).
    // If wired, this constitutes RATE_LIMIT_EVASION_RISK + TIER_ENFORCEMENT_VIOLATION:
    // resolveWorkspaceTier would DB-query keyed on an unverified caller claim.
    // Wire with VerifiedWorkspaceId from withCanonicalEnforcement context instead.
    const claimedId: ClaimedWorkspaceId | null = claimWorkspaceId(request.headers.get("x-workspace-id"));
    // BILL-01: tier must be resolved SERVER-SIDE from verified workspace; this path is dead.
    const tier: SubscriptionTier = claimedId
      ? await (await import("@/services/entitlement.service")).resolveWorkspaceTier(claimedId)  // WOULD BE UNSAFE
      : "free";

    // Get client IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    // Check workspace rate limit (only if workspace claim present — DEAD PATH)
    // checkWorkspaceRateLimit requires VerifiedWorkspaceId; dead middleware cannot call it safely
    if (claimedId) {
      // Intentional compile-time barrier: cannot pass ClaimedWorkspaceId to checkWorkspaceRateLimit.
      // Left as commented reference to document what would need to change if this were wired.
      // const wsLimit = checkWorkspaceRateLimit(claimedId, tier); // TYPE ERROR — ClaimedWorkspaceId ≠ VerifiedWorkspaceId
      const wsLimit = { allowed: false, remaining: 0, retryAfter: 60 }; // dead path stub
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

// --- Per-business diagnosis rate limiter (in-memory sliding window) ----------

interface DiagnosisEntry {
  timestamps: number[]; // epoch ms of each trigger
}

const diagnosisStore = new Map<string, DiagnosisEntry>();

const DIAGNOSIS_LIMIT_PER_HOUR = 10;
const DIAGNOSIS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check whether a diagnosis trigger is within the per-business rate limit.
 * Allows up to `DIAGNOSIS_LIMIT_PER_HOUR` triggers per businessId per hour.
 * Returns `{ allowed: boolean; remaining: number; retryAfterMs?: number }`.
 */
export function checkDiagnosisRateLimit(
  businessId: string
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - DIAGNOSIS_WINDOW_MS;

  let entry = diagnosisStore.get(businessId);
  if (!entry) {
    entry = { timestamps: [] };
    diagnosisStore.set(businessId, entry);
  }

  // Evict timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const count = entry.timestamps.length;
  if (count >= DIAGNOSIS_LIMIT_PER_HOUR) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + DIAGNOSIS_WINDOW_MS - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: DIAGNOSIS_LIMIT_PER_HOUR - count - 1 };
}

/** Reset diagnosis rate limit store (for testing). */
export function resetDiagnosisRateLimits(): void {
  diagnosisStore.clear();
}

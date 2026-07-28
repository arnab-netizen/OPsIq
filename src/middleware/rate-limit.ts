/**
 * Rate limiting middleware using token bucket algorithm.
 * Per-workspace and per-IP rate limiting.
 * In-memory sliding window implementation.
 */

import { getTierConfig, type SubscriptionTier } from "@/lib/tier-config";
import { type VerifiedWorkspaceId } from "@/lib/workspace-identity";

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

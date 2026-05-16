/**
 * Rate Limiter Infrastructure
 *
 * Provides per-workspace and per-IP rate limiting using sliding-window
 * token bucket algorithm. Supports configurable limits and exemptions.
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  exemptedIps?: string[];
  exemptedPaths?: string[];
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  limit: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

// In-memory store for token buckets (key format: type:identifier)
const buckets = new Map<string, BucketState>();

/**
 * Calculate available tokens based on elapsed time
 */
function refillTokens(bucket: BucketState, config: RateLimitConfig, now: number): number {
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / config.windowMs) * config.maxRequests;
  const newTokens = Math.min(bucket.tokens + tokensToAdd, config.maxRequests);
  return newTokens;
}

/**
 * Check if request should be allowed based on rate limit
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
  type: "workspace" | "ip" = "workspace"
): RateLimitStatus {
  const now = Date.now();
  const key = `${type}:${identifier}`;

  // Get or create bucket
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.maxRequests, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  bucket.tokens = refillTokens(bucket, config, now);
  bucket.lastRefill = now;

  // Check if request is allowed
  const allowed = bucket.tokens >= 1;
  if (allowed) {
    bucket.tokens -= 1;
  }

  // Calculate reset time (when bucket will be full again)
  const tokensNeeded = config.maxRequests - bucket.tokens;
  const resetTime = new Date(now + (tokensNeeded / config.maxRequests) * config.windowMs);

  return {
    allowed,
    remaining: Math.floor(bucket.tokens),
    resetTime,
    limit: config.maxRequests,
  };
}

/**
 * Check if identifier is exempted from rate limiting
 */
export function isExempted(identifier: string, config: RateLimitConfig): boolean {
  if (config.exemptedIps?.includes(identifier)) {
    return true;
  }
  return false;
}

/**
 * Check if path is exempted from rate limiting
 */
export function isPathExempted(path: string, config: RateLimitConfig): boolean {
  return config.exemptedPaths?.some((exemptedPath) => path.startsWith(exemptedPath)) ?? false;
}

/**
 * Reset rate limit for specific identifier (for testing or admin operations)
 */
export function resetRateLimit(identifier: string, type: "workspace" | "ip" = "workspace"): void {
  const key = `${type}:${identifier}`;
  buckets.delete(key);
}

/**
 * Get current bucket state for monitoring/debugging
 */
export function getBucketState(
  identifier: string,
  config: RateLimitConfig,
  type: "workspace" | "ip" = "workspace"
): BucketState | null {
  const key = `${type}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket) {
    return null;
  }

  const now = Date.now();
  const refilled = refillTokens(bucket, config, now);

  return {
    tokens: refilled,
    lastRefill: now,
  };
}

/**
 * Clear all buckets (for testing)
 */
export function clearAllBuckets(): void {
  buckets.clear();
}

/**
 * Get statistics about rate limit state
 */
export function getRateLimitStats(): {
  activeBuckets: number;
  totalIdentifiers: Set<string>;
} {
  return {
    activeBuckets: buckets.size,
    totalIdentifiers: new Set(buckets.keys()),
  };
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMIT_PRESETS = {
  STRICT: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 req/min
  NORMAL: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 req/min
  GENEROUS: { windowMs: 60 * 1000, maxRequests: 1000 }, // 1000 req/min
  PUBLIC_API: { windowMs: 60 * 60 * 1000, maxRequests: 10000 }, // 10k req/hour
  AUTH_ENDPOINT: { windowMs: 60 * 1000, maxRequests: 5 }, // 5 auth attempts/min
};

/**
 * STAGE 17 Slice 5: Rate Limiting Contracts
 *
 * Domain contracts for per-workspace and per-IP rate limiting.
 * Token bucket algorithm with sliding window semantics.
 * Mock-backed implementation until database available.
 *
 * Design principles:
 * 1. Fail-closed: Rate limit violations block requests immediately
 * 2. Tenant-scoped: Each workspace has independent quota
 * 3. IP-based: Also enforce per-source-IP limits for DDoS protection
 * 4. Configurable: Limits vary by workspace tier (free/pro/enterprise)
 * 5. Observable: Track quota usage for billing and monitoring
 */

import { z } from "zod";

/**
 * Rate limit tier configuration
 */
export enum RateLimitTier {
  FREE = "free",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

/**
 * Rate limit quota per tier
 */
export const RATE_LIMIT_QUOTAS = {
  [RateLimitTier.FREE]: {
    requestsPerHour: 100,
    requestsPerDay: 1000,
    requestsPerMonth: 10000,
  },
  [RateLimitTier.PRO]: {
    requestsPerHour: 10000,
    requestsPerDay: 100000,
    requestsPerMonth: 1000000,
  },
  [RateLimitTier.ENTERPRISE]: {
    requestsPerHour: 100000,
    requestsPerDay: 1000000,
    requestsPerMonth: 10000000,
  },
} as const;

/**
 * Per-IP DDoS protection limits (applies to all requests from an IP)
 */
export const IP_RATE_LIMITS = {
  requestsPerMinute: 60,
  requestsPerHour: 10000,
} as const;

/**
 * Rate limit state for a workspace
 */
export const RateLimitStateSchema = z.object({
  workspaceId: z.string().uuid().describe("Workspace being rate limited"),
  tier: z.nativeEnum(RateLimitTier).describe("Subscription tier"),
  tokensRemaining: z.number().int().min(0).describe("Tokens available this hour"),
  tokensRemainingDay: z.number().int().min(0).describe("Tokens available today"),
  tokensRemainingMonth: z.number().int().min(0).describe("Tokens available this month"),
  refillTime: z.date().describe("When hourly tokens refill"),
  refillTimeDay: z.date().describe("When daily tokens refill"),
  refillTimeMonth: z.date().describe("When monthly tokens refill"),
  requestCount: z.number().int().min(0).describe("Requests in current window"),
  lastRequestAt: z.date().optional().describe("Timestamp of last request"),
  blockedUntil: z.date().optional().describe("If rate limited, when limit expires"),
  quotaUsagePercent: z.number().min(0).max(100).describe("Percentage of monthly quota used"),
});

export type RateLimitState = z.infer<typeof RateLimitStateSchema>;

/**
 * Per-IP rate limit state for DDoS protection
 */
export const IPRateLimitStateSchema = z.object({
  ipAddress: z.string().describe("Source IP address"),
  requestsThisMinute: z.number().int().min(0),
  requestsThisHour: z.number().int().min(0),
  refillTimeMinute: z.date(),
  refillTimeHour: z.date(),
  blockedUntil: z.date().optional().describe("If rate limited, when limit expires"),
});

export type IPRateLimitState = z.infer<typeof IPRateLimitStateSchema>;

/**
 * Rate limit check result
 */
export const RateLimitCheckResultSchema = z.object({
  allowed: z.boolean().describe("Whether request is allowed"),
  workspaceId: z.string().uuid().optional(),
  ipAddress: z.string().optional(),
  tier: z.nativeEnum(RateLimitTier).optional(),
  tokensRemaining: z.number().int().min(0).optional(),
  quotaUsagePercent: z.number().min(0).max(100).optional(),
  retryAfterSeconds: z.number().int().min(0).optional().describe("Seconds to wait before retry"),
  remainingQuotaHour: z.number().int().min(0).optional(),
  remainingQuotaDay: z.number().int().min(0).optional(),
  remainingQuotaMonth: z.number().int().min(0).optional(),
  reason: z.string().optional().describe("If blocked, why"),
});

export type RateLimitCheckResult = z.infer<typeof RateLimitCheckResultSchema>;

/**
 * Rate limit configuration for middleware
 */
export const RateLimitConfigSchema = z.object({
  enableWorkspaceQuota: z.boolean().default(true).describe("Enforce per-workspace limits"),
  enableIPLimit: z.boolean().default(true).describe("Enforce per-IP DDoS protection"),
  bypassAdmins: z.boolean().default(true).describe("Admins bypass rate limits"),
  trackerType: z.enum(["memory", "redis", "database"]).default("memory").describe("Storage backend"),
  logLimitViolations: z.boolean().default(true).describe("Log rate limit hits"),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Rate limit event for observability
 */
export const RateLimitEventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.date(),
  type: z.enum(["quota_check", "quota_exceeded", "ip_limit_exceeded", "reset"]),
  workspaceId: z.string().uuid().optional(),
  ipAddress: z.string().optional(),
  tokensRemaining: z.number().int(),
  quotaUsagePercent: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RateLimitEvent = z.infer<typeof RateLimitEventSchema>;

/**
 * Calculate tokens needed for request
 * Most requests = 1 token
 * Expensive operations (bulk export, analysis) = 10+ tokens
 */
export function calculateTokensCost(
  endpoint: string,
  method: string,
  isBulk: boolean = false
): number {
  if (isBulk || endpoint.includes("export") || endpoint.includes("bulk")) {
    return 10;
  }
  if (method === "GET") {
    return 1;
  }
  if (method === "POST" || method === "PATCH") {
    return 2;
  }
  if (method === "DELETE") {
    return 5;
  }
  return 1;
}

/**
 * Check if quota window has expired
 */
export function isWindowExpired(refillTime: Date, now: Date): boolean {
  return now >= refillTime;
}

/**
 * Get next refill time for hourly quota
 */
export function getNextHourlyRefillTime(now: Date): Date {
  const next = new Date(now);
  next.setHours(next.getHours() + 1);
  next.setMinutes(0);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

/**
 * Get next refill time for daily quota
 */
export function getNextDailyRefillTime(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0);
  next.setMinutes(0);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

/**
 * Get next refill time for monthly quota
 */
export function getNextMonthlyRefillTime(now: Date): Date {
  const next = new Date(now);
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  next.setHours(0);
  next.setMinutes(0);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

/**
 * Get seconds until next refill
 */
export function secondsUntilRefill(refillTime: Date, now: Date): number {
  const diff = refillTime.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 1000));
}

/**
 * Calculate quota usage percentage
 */
export function calculateQuotaUsagePercent(
  tier: RateLimitTier,
  tokensRemaining: number
): number {
  const monthlyQuota = RATE_LIMIT_QUOTAS[tier].requestsPerMonth;
  const tokensUsed = monthlyQuota - tokensRemaining;
  return Math.round((tokensUsed / monthlyQuota) * 100);
}

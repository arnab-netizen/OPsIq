/**
 * STAGE 17 Slice 5: Rate Limiting Service
 *
 * Token bucket algorithm for workspace and IP-based rate limiting.
 * Mock-backed in-memory store (ready for Redis/database persistence).
 *
 * All rate limit checks are fail-closed: requests denied by default unless quota available.
 */

import {
  RateLimitTier,
  RATE_LIMIT_QUOTAS,
  IP_RATE_LIMITS,
  RateLimitState,
  IPRateLimitState,
  RateLimitCheckResult,
  isWindowExpired,
  getNextHourlyRefillTime,
  getNextDailyRefillTime,
  getNextMonthlyRefillTime,
  secondsUntilRefill,
  calculateQuotaUsagePercent,
} from "@/domain/rate-limit/rate-limit-contracts";

/**
 * In-memory rate limit store (mock-backed until database available)
 * In production, this would use Redis or database
 */
class MockRateLimitStore {
  private workspaceStates = new Map<string, RateLimitState>();
  private ipStates = new Map<string, IPRateLimitState>();

  setWorkspaceState(workspaceId: string, state: RateLimitState): void {
    this.workspaceStates.set(workspaceId, state);
  }

  getWorkspaceState(workspaceId: string): RateLimitState | undefined {
    return this.workspaceStates.get(workspaceId);
  }

  setIPState(ipAddress: string, state: IPRateLimitState): void {
    this.ipStates.set(ipAddress, state);
  }

  getIPState(ipAddress: string): IPRateLimitState | undefined {
    return this.ipStates.get(ipAddress);
  }

  clear(): void {
    this.workspaceStates.clear();
    this.ipStates.clear();
  }

  getAllWorkspaceStates(): RateLimitState[] {
    return Array.from(this.workspaceStates.values());
  }
}

const rateLimitStore = new MockRateLimitStore();

/**
 * Initialize rate limit state for a workspace
 */
function initializeWorkspaceState(workspaceId: string, tier: RateLimitTier): RateLimitState {
  const now = new Date();
  const quota = RATE_LIMIT_QUOTAS[tier];

  const state: RateLimitState = {
    workspaceId,
    tier,
    tokensRemaining: quota.requestsPerHour,
    tokensRemainingDay: quota.requestsPerDay,
    tokensRemainingMonth: quota.requestsPerMonth,
    refillTime: getNextHourlyRefillTime(now),
    refillTimeDay: getNextDailyRefillTime(now),
    refillTimeMonth: getNextMonthlyRefillTime(now),
    requestCount: 0,
    lastRequestAt: now,
    quotaUsagePercent: 0,
  };

  rateLimitStore.setWorkspaceState(workspaceId, state);
  return state;
}

/**
 * Initialize rate limit state for an IP address
 */
function initializeIPState(ipAddress: string): IPRateLimitState {
  const now = new Date();

  const state: IPRateLimitState = {
    ipAddress,
    requestsThisMinute: 0,
    requestsThisHour: 0,
    refillTimeMinute: new Date(now.getTime() + 60 * 1000),
    refillTimeHour: new Date(now.getTime() + 3600 * 1000),
  };

  rateLimitStore.setIPState(ipAddress, state);
  return state;
}

/**
 * Check workspace rate limit
 */
export function checkWorkspaceRateLimit(
  workspaceId: string,
  tier: RateLimitTier,
  tokensCost: number = 1
): RateLimitCheckResult {
  const now = new Date();
  let state = rateLimitStore.getWorkspaceState(workspaceId);

  if (!state) {
    state = initializeWorkspaceState(workspaceId, tier);
  }

  // Check if blocked
  if (state.blockedUntil && now < state.blockedUntil) {
    const retryAfter = secondsUntilRefill(state.blockedUntil, now);
    return {
      allowed: false,
      workspaceId,
      tier,
      tokensRemaining: 0,
      retryAfterSeconds: retryAfter,
      reason: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
    };
  }

  // Refill hourly quota if window expired
  if (isWindowExpired(state.refillTime, now)) {
    const quota = RATE_LIMIT_QUOTAS[tier];
    state.tokensRemaining = quota.requestsPerHour;
    state.refillTime = getNextHourlyRefillTime(now);
  }

  // Refill daily quota if window expired
  if (isWindowExpired(state.refillTimeDay, now)) {
    const quota = RATE_LIMIT_QUOTAS[tier];
    state.tokensRemainingDay = quota.requestsPerDay;
    state.refillTimeDay = getNextDailyRefillTime(now);
  }

  // Refill monthly quota if window expired
  if (isWindowExpired(state.refillTimeMonth, now)) {
    const quota = RATE_LIMIT_QUOTAS[tier];
    state.tokensRemainingMonth = quota.requestsPerMonth;
    state.refillTimeMonth = getNextMonthlyRefillTime(now);
  }

  // Check if sufficient tokens available
  const hasHourlyTokens = state.tokensRemaining >= tokensCost;
  const hasDailyTokens = state.tokensRemainingDay >= tokensCost;
  const hasMonthlyTokens = state.tokensRemainingMonth >= tokensCost;

  if (!hasHourlyTokens || !hasDailyTokens || !hasMonthlyTokens) {
    // Block until next refill
    const blockUntil = new Date(
      Math.min(
        state.refillTime.getTime(),
        state.refillTimeDay.getTime(),
        state.refillTimeMonth.getTime()
      )
    );
    state.blockedUntil = blockUntil;
    rateLimitStore.setWorkspaceState(workspaceId, state);

    const retryAfter = secondsUntilRefill(blockUntil, now);
    return {
      allowed: false,
      workspaceId,
      tier,
      tokensRemaining: state.tokensRemaining,
      retryAfterSeconds: retryAfter,
      reason: `Insufficient quota. Retry after ${retryAfter} seconds`,
    };
  }

  // Deduct tokens
  state.tokensRemaining -= tokensCost;
  state.tokensRemainingDay -= tokensCost;
  state.tokensRemainingMonth -= tokensCost;
  state.requestCount += 1;
  state.lastRequestAt = now;
  state.quotaUsagePercent = calculateQuotaUsagePercent(tier, state.tokensRemainingMonth);

  rateLimitStore.setWorkspaceState(workspaceId, state);

  return {
    allowed: true,
    workspaceId,
    tier,
    tokensRemaining: state.tokensRemaining,
    quotaUsagePercent: state.quotaUsagePercent,
    remainingQuotaHour: state.tokensRemaining,
    remainingQuotaDay: state.tokensRemainingDay,
    remainingQuotaMonth: state.tokensRemainingMonth,
  };
}

/**
 * Check IP-based DDoS protection limit
 */
export function checkIPRateLimit(ipAddress: string): RateLimitCheckResult {
  const now = new Date();
  let state = rateLimitStore.getIPState(ipAddress);

  if (!state) {
    state = initializeIPState(ipAddress);
  }

  // Check if blocked
  if (state.blockedUntil && now < state.blockedUntil) {
    const retryAfter = secondsUntilRefill(state.blockedUntil, now);
    return {
      allowed: false,
      ipAddress,
      retryAfterSeconds: retryAfter,
      reason: `IP rate limit exceeded. Retry after ${retryAfter} seconds`,
    };
  }

  // Refill minute quota if window expired
  if (isWindowExpired(state.refillTimeMinute, now)) {
    state.requestsThisMinute = 0;
    state.refillTimeMinute = new Date(now.getTime() + 60 * 1000);
  }

  // Refill hour quota if window expired
  if (isWindowExpired(state.refillTimeHour, now)) {
    state.requestsThisHour = 0;
    state.refillTimeHour = new Date(now.getTime() + 3600 * 1000);
  }

  // Check if exceeded
  const exceedsPerMinute = state.requestsThisMinute >= IP_RATE_LIMITS.requestsPerMinute;
  const exceedsPerHour = state.requestsThisHour >= IP_RATE_LIMITS.requestsPerHour;

  if (exceedsPerMinute || exceedsPerHour) {
    const blockUntil = exceedsPerMinute ? state.refillTimeMinute : state.refillTimeHour;
    state.blockedUntil = blockUntil;
    rateLimitStore.setIPState(ipAddress, state);

    const retryAfter = secondsUntilRefill(blockUntil, now);
    return {
      allowed: false,
      ipAddress,
      retryAfterSeconds: retryAfter,
      reason: `IP rate limit exceeded. Retry after ${retryAfter} seconds`,
    };
  }

  // Increment counters
  state.requestsThisMinute += 1;
  state.requestsThisHour += 1;
  rateLimitStore.setIPState(ipAddress, state);

  return {
    allowed: true,
    ipAddress,
  };
}

/**
 * Get current rate limit status for workspace
 */
export function getWorkspaceRateLimitStatus(workspaceId: string): RateLimitState | null {
  return rateLimitStore.getWorkspaceState(workspaceId) || null;
}

/**
 * Reset rate limit for workspace (admin operation)
 */
export function resetWorkspaceRateLimit(workspaceId: string, tier: RateLimitTier): RateLimitState {
  return initializeWorkspaceState(workspaceId, tier);
}

/**
 * Get all workspace rate limit states (admin/monitoring)
 */
export function getAllWorkspaceRateLimitStates(): RateLimitState[] {
  return rateLimitStore.getAllWorkspaceStates();
}

/**
 * Clear all rate limit states (test helper)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

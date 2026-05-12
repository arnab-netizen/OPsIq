import { describe, it, expect, beforeEach } from "vitest";
import {
  RateLimitTier,
  RATE_LIMIT_QUOTAS,
  IP_RATE_LIMITS,
  calculateTokensCost,
  isWindowExpired,
  secondsUntilRefill,
  calculateQuotaUsagePercent,
} from "@/domain/rate-limit/rate-limit-contracts";
import {
  checkWorkspaceRateLimit,
  checkIPRateLimit,
  getWorkspaceRateLimitStatus,
  resetWorkspaceRateLimit,
  getAllWorkspaceRateLimitStates,
  clearAllRateLimits,
} from "@/services/rate-limit";

describe("STAGE 17 Slice 5: Rate Limiting", () => {
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const ipAddress = "192.168.1.100";

  beforeEach(() => {
    clearAllRateLimits();
  });

  describe("Token Cost Calculation", () => {
    it("should calculate 1 token for GET requests", () => {
      expect(calculateTokensCost("/api/actions", "GET")).toBe(1);
    });

    it("should calculate 2 tokens for POST/PATCH requests", () => {
      expect(calculateTokensCost("/api/actions", "POST")).toBe(2);
      expect(calculateTokensCost("/api/actions", "PATCH")).toBe(2);
    });

    it("should calculate 5 tokens for DELETE requests", () => {
      expect(calculateTokensCost("/api/actions", "DELETE")).toBe(5);
    });

    it("should calculate 10 tokens for bulk/export operations", () => {
      expect(calculateTokensCost("/api/export", "POST", true)).toBe(10);
      expect(calculateTokensCost("/api/bulk-actions", "POST")).toBe(10);
    });
  });

  describe("Window Expiry", () => {
    it("should detect expired window", () => {
      const past = new Date(Date.now() - 1000);
      const now = new Date();
      expect(isWindowExpired(past, now)).toBe(true);
    });

    it("should detect non-expired window", () => {
      const future = new Date(Date.now() + 1000);
      const now = new Date();
      expect(isWindowExpired(future, now)).toBe(false);
    });
  });

  describe("Quota Usage", () => {
    it("should calculate 0% usage when no requests", () => {
      const percent = calculateQuotaUsagePercent(
        RateLimitTier.FREE,
        RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerMonth
      );
      expect(percent).toBe(0);
    });

    it("should calculate 50% usage when half quota used", () => {
      const quota = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerMonth;
      const remaining = Math.floor(quota / 2);
      const percent = calculateQuotaUsagePercent(RateLimitTier.FREE, remaining);
      expect(percent).toBeCloseTo(50, -1);
    });

    it("should calculate 100% usage when quota exhausted", () => {
      const percent = calculateQuotaUsagePercent(RateLimitTier.FREE, 0);
      expect(percent).toBe(100);
    });
  });

  describe("Workspace Rate Limiting", () => {
    it("should allow request within quota", () => {
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      expect(result.allowed).toBe(true);
      expect(result.tokensRemaining).toBeGreaterThan(0);
    });

    it("should deny request when quota exceeded", () => {
      const quota = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerHour;

      // Exhaust hourly quota
      for (let i = 0; i < quota; i++) {
        checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      }

      // Next request should be denied
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Insufficient quota");
    });

    it("should respect tier limits", () => {
      const freeQuota = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerHour;
      const proQuota = RATE_LIMIT_QUOTAS[RateLimitTier.PRO].requestsPerHour;

      expect(freeQuota).toBeLessThan(proQuota);
    });

    it("should include retry-after when rate limited", () => {
      const quota = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerHour;

      for (let i = 0; i < quota; i++) {
        checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      }

      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("should track quota usage percentage", () => {
      checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);

      expect(result.quotaUsagePercent).toBeGreaterThan(0);
      expect(result.quotaUsagePercent).toBeLessThanOrEqual(100);
    });

    it("should deduct multiple tokens for expensive operations", () => {
      const result1 = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 10);
      expect(result1.allowed).toBe(true);

      const result2 = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      expect(result2.tokensRemaining!).toBeLessThan(result1.tokensRemaining!);
    });

    it("should return current rate limit status", () => {
      checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      const status = getWorkspaceRateLimitStatus(workspaceId);

      expect(status).toBeDefined();
      expect(status?.workspaceId).toBe(workspaceId);
      expect(status?.tokensRemaining).toBeGreaterThan(0);
    });

    it("should reset rate limit for workspace", () => {
      checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 5);

      const reset = resetWorkspaceRateLimit(workspaceId, RateLimitTier.FREE);
      expect(reset.tokensRemaining).toBe(
        RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerHour
      );
    });
  });

  describe("IP Rate Limiting (DDoS Protection)", () => {
    it("should allow requests within IP limit", () => {
      const result = checkIPRateLimit(ipAddress);
      expect(result.allowed).toBe(true);
    });

    it("should deny requests exceeding minute limit", () => {
      const minuteLimit = IP_RATE_LIMITS.requestsPerMinute;

      for (let i = 0; i < minuteLimit; i++) {
        checkIPRateLimit(ipAddress);
      }

      const result = checkIPRateLimit(ipAddress);
      expect(result.allowed).toBe(false);
    });

    it("should return retry-after for IP limits", () => {
      const minuteLimit = IP_RATE_LIMITS.requestsPerMinute;

      for (let i = 0; i < minuteLimit; i++) {
        checkIPRateLimit(ipAddress);
      }

      const result = checkIPRateLimit(ipAddress);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("should track separate IPs independently", () => {
      const ip1 = "192.168.1.1";
      const ip2 = "192.168.1.2";

      const result1 = checkIPRateLimit(ip1);
      const result2 = checkIPRateLimit(ip2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("Multi-Tier Quotas", () => {
    it("FREE tier should have lowest quota", () => {
      const free = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerMonth;
      const pro = RATE_LIMIT_QUOTAS[RateLimitTier.PRO].requestsPerMonth;
      const enterprise = RATE_LIMIT_QUOTAS[RateLimitTier.ENTERPRISE].requestsPerMonth;

      expect(free).toBeLessThan(pro);
      expect(pro).toBeLessThan(enterprise);
    });

    it("should enforce different limits for different tiers", () => {
      const workspaceId1 = "550e8400-e29b-41d4-a716-446655440001";
      const workspaceId2 = "550e8400-e29b-41d4-a716-446655440002";

      checkWorkspaceRateLimit(workspaceId1, RateLimitTier.FREE, 1);
      checkWorkspaceRateLimit(workspaceId2, RateLimitTier.PRO, 1);

      const status1 = getWorkspaceRateLimitStatus(workspaceId1);
      const status2 = getWorkspaceRateLimitStatus(workspaceId2);

      expect(status1?.tier).toBe(RateLimitTier.FREE);
      expect(status2?.tier).toBe(RateLimitTier.PRO);
      expect(status1!.tokensRemaining).toBeLessThan(status2!.tokensRemaining);
    });
  });

  describe("Quota Recovery", () => {
    it("should maintain separate hourly, daily, monthly quotas", () => {
      const status1 = getWorkspaceRateLimitStatus(workspaceId);
      expect(status1).toBeNull(); // Not initialized yet

      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      const status2 = getWorkspaceRateLimitStatus(workspaceId);

      expect(status2?.tokensRemaining).toBeDefined();
      expect(status2?.tokensRemainingDay).toBeDefined();
      expect(status2?.tokensRemainingMonth).toBeDefined();
    });

    it("should track remaining quota at different windows", () => {
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 5);

      expect(result.remainingQuotaHour).toBeDefined();
      expect(result.remainingQuotaDay).toBeDefined();
      expect(result.remainingQuotaMonth).toBeDefined();
    });
  });

  describe("Admin Operations", () => {
    it("should list all workspace rate limit states", () => {
      const workspace1 = "550e8400-e29b-41d4-a716-446655440001";
      const workspace2 = "550e8400-e29b-41d4-a716-446655440002";

      checkWorkspaceRateLimit(workspace1, RateLimitTier.FREE, 1);
      checkWorkspaceRateLimit(workspace2, RateLimitTier.PRO, 1);

      const states = getAllWorkspaceRateLimitStates();
      expect(states.length).toBe(2);
      expect(states.map((s) => s.workspaceId)).toContain(workspace1);
      expect(states.map((s) => s.workspaceId)).toContain(workspace2);
    });

    it("should clear all rate limits", () => {
      checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      clearAllRateLimits();

      const status = getWorkspaceRateLimitStatus(workspaceId);
      expect(status).toBeNull();
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle burst of requests from single workspace", () => {
      for (let i = 0; i < 50; i++) {
        const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.PRO, 1);
        expect(result.allowed).toBe(true);
      }

      const status = getWorkspaceRateLimitStatus(workspaceId);
      expect(status?.requestCount).toBe(50);
    });

    it("should separate quotas between workspaces", () => {
      const ws1 = "550e8400-e29b-41d4-a716-446655440001";
      const ws2 = "550e8400-e29b-41d4-a716-446655440002";

      checkWorkspaceRateLimit(ws1, RateLimitTier.FREE, 10);
      checkWorkspaceRateLimit(ws2, RateLimitTier.FREE, 20);

      const status1 = getWorkspaceRateLimitStatus(ws1);
      const status2 = getWorkspaceRateLimitStatus(ws2);

      expect(status1!.tokensRemaining).toBeGreaterThan(
        status2!.tokensRemaining
      );
    });

    it("should handle DDoS attack pattern (many requests from single IP)", () => {
      const attackerIP = "192.168.1.99";
      const minuteLimit = IP_RATE_LIMITS.requestsPerMinute;

      for (let i = 0; i < minuteLimit; i++) {
        const result = checkIPRateLimit(attackerIP);
        expect(result.allowed).toBe(true);
      }

      // Attacker blocked
      const result = checkIPRateLimit(attackerIP);
      expect(result.allowed).toBe(false);
    });
  });

  describe("Compliance + Edge Cases", () => {
    it("should handle zero-token requests", () => {
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 0);
      expect(result.allowed).toBe(true);
    });

    it("should handle very large token requests", () => {
      const quota = RATE_LIMIT_QUOTAS[RateLimitTier.FREE].requestsPerMonth;
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, quota + 1);
      expect(result.allowed).toBe(false);
    });

    it("should not go negative on tokens", () => {
      const result = checkWorkspaceRateLimit(workspaceId, RateLimitTier.FREE, 1);
      expect(result.tokensRemaining).toBeGreaterThanOrEqual(0);
    });
  });
});

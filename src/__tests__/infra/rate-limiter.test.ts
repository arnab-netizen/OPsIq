/**
 * Tests: Rate Limiter Infrastructure
 *
 * Validates token bucket algorithm, limit enforcement, reset,
 * and configuration management.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  isExempted,
  isPathExempted,
  resetRateLimit,
  getBucketState,
  clearAllBuckets,
  getRateLimitStats,
  RATE_LIMIT_PRESETS,
  RateLimitConfig,
} from "@/infra/rate-limiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    clearAllBuckets();
  });

  describe("Token Bucket Algorithm", () => {
    it("should allow requests within limit", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit("workspace-1", config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it("should reject requests exceeding limit", () => {
      const config = { windowMs: 1000, maxRequests: 3 };

      // Use up the limit
      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);

      // Next request should fail
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should replenish tokens over time", async () => {
      const config = { windowMs: 100, maxRequests: 3 };

      // Use up initial tokens
      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);

      let result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);

      // Wait for tokens to replenish
      await new Promise((resolve) =>
        setTimeout(() => {
          result = checkRateLimit("workspace-1", config);
          // Should have some tokens replenished
          expect(result.allowed).toBe(true);
          resolve(null);
        }, 50)
      );
    });

    it("should cap tokens at maxRequests", () => {
      const config = { windowMs: 1000, maxRequests: 5 };
      const workspace = "workspace-1";

      // Use one token
      checkRateLimit(workspace, config);

      // Wait for significant replenishment
      setTimeout(() => {
        const state = getBucketState(workspace, config);
        expect(state?.tokens).toBeLessThanOrEqual(5);
        expect(state?.tokens).toBeGreaterThan(1);
      }, 200);
    });
  });

  describe("Rate Limit Status", () => {
    it("should include remaining count in status", () => {
      const config = { windowMs: 1000, maxRequests: 10 };

      checkRateLimit("workspace-1", config);
      const result = checkRateLimit("workspace-1", config);

      expect(result.remaining).toBe(8);
      expect(result.limit).toBe(10);
    });

    it("should provide reset time", () => {
      const config = { windowMs: 1000, maxRequests: 5 };
      const now = Date.now();

      const result = checkRateLimit("workspace-1", config);
      const resetTime = result.resetTime.getTime();

      expect(resetTime).toBeGreaterThan(now);
      expect(resetTime).toBeLessThanOrEqual(now + 1000);
    });

    it("should indicate when request is allowed", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      const result1 = checkRateLimit("workspace-1", config);
      expect(result1.allowed).toBe(true);

      checkRateLimit("workspace-1", config);
      const result2 = checkRateLimit("workspace-1", config);
      expect(result2.allowed).toBe(false);
    });
  });

  describe("Per-Workspace Limiting", () => {
    it("should isolate limits per workspace", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      checkRateLimit("workspace-1", config, "workspace");
      checkRateLimit("workspace-1", config, "workspace");

      // workspace-2 should not be affected
      const result = checkRateLimit("workspace-2", config, "workspace");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("should respect workspace-specific limits", () => {
      checkRateLimit("workspace-1", { windowMs: 1000, maxRequests: 3 });
      checkRateLimit("workspace-1", { windowMs: 1000, maxRequests: 3 });
      checkRateLimit("workspace-1", { windowMs: 1000, maxRequests: 3 });

      const result = checkRateLimit("workspace-1", { windowMs: 1000, maxRequests: 3 });
      expect(result.allowed).toBe(false);
    });
  });

  describe("Per-IP Limiting", () => {
    it("should isolate limits per IP", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      checkRateLimit("192.168.1.1", config, "ip");
      checkRateLimit("192.168.1.1", config, "ip");

      // Different IP should not be affected
      const result = checkRateLimit("192.168.1.2", config, "ip");
      expect(result.allowed).toBe(true);
    });

    it("should enforce separate IP limits", () => {
      const config = { windowMs: 1000, maxRequests: 1 };

      checkRateLimit("10.0.0.1", config, "ip");
      const result = checkRateLimit("10.0.0.1", config, "ip");
      expect(result.allowed).toBe(false);

      // Other IP can still make requests
      const result2 = checkRateLimit("10.0.0.2", config, "ip");
      expect(result2.allowed).toBe(true);
    });
  });

  describe("Exemptions", () => {
    it("should check if IP is exempted", () => {
      const config: RateLimitConfig = {
        windowMs: 1000,
        maxRequests: 1,
        exemptedIps: ["127.0.0.1", "localhost"],
      };

      expect(isExempted("127.0.0.1", config)).toBe(true);
      expect(isExempted("192.168.1.1", config)).toBe(false);
    });

    it("should check if path is exempted", () => {
      const config: RateLimitConfig = {
        windowMs: 1000,
        maxRequests: 1,
        exemptedPaths: ["/health", "/metrics"],
      };

      expect(isPathExempted("/health", config)).toBe(true);
      expect(isPathExempted("/health/check", config)).toBe(true);
      expect(isPathExempted("/api/data", config)).toBe(false);
    });

    it("should support empty exemption lists", () => {
      const config: RateLimitConfig = {
        windowMs: 1000,
        maxRequests: 1,
      };

      expect(isExempted("192.168.1.1", config)).toBe(false);
      expect(isPathExempted("/api/test", config)).toBe(false);
    });
  });

  describe("Rate Limit Reset", () => {
    it("should reset workspace rate limit", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);

      let result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);

      // Reset and try again
      resetRateLimit("workspace-1", "workspace");
      result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(true);
    });

    it("should reset IP rate limit", () => {
      const config = { windowMs: 1000, maxRequests: 1 };

      checkRateLimit("192.168.1.1", config, "ip");
      let result = checkRateLimit("192.168.1.1", config, "ip");
      expect(result.allowed).toBe(false);

      resetRateLimit("192.168.1.1", "ip");
      result = checkRateLimit("192.168.1.1", config, "ip");
      expect(result.allowed).toBe(true);
    });

    it("should not affect other identifiers after reset", () => {
      const config = { windowMs: 1000, maxRequests: 1 };

      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-2", config);

      resetRateLimit("workspace-1", "workspace");

      const result1 = checkRateLimit("workspace-1", config);
      expect(result1.allowed).toBe(true);

      const result2 = checkRateLimit("workspace-2", config);
      expect(result2.allowed).toBe(false);
    });
  });

  describe("Bucket State Query", () => {
    it("should return null for non-existent bucket", () => {
      const config = { windowMs: 1000, maxRequests: 5 };
      const state = getBucketState("workspace-999", config);
      expect(state).toBe(null);
    });

    it("should return bucket state with tokens and timestamp", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      // Freeze the clock: token buckets refill by wall-clock elapsed time, so any
      // real time passing between consume and read (parallel-load jitter) would
      // refill tokens and make the exact-count assertion flaky. With a frozen
      // clock, elapsed = 0 → no refill → the consumed count is exact.
      vi.useFakeTimers();
      try {
        checkRateLimit("workspace-1", config);
        const state = getBucketState("workspace-1", config);

        expect(state).not.toBe(null);
        expect(state?.tokens).toBeDefined();
        expect(state?.lastRefill).toBeDefined();
        expect(state?.tokens).toBeLessThan(5);
        expect(state?.tokens).toBeGreaterThanOrEqual(4);
        expect(state?.tokens).toBe(4); // exactly one token consumed under a frozen clock
      } finally {
        vi.useRealTimers();
      }
    });

    it("should reflect token consumption in state", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      // Frozen clock so wall-clock refill cannot inflate the count (see above).
      vi.useFakeTimers();
      try {
        checkRateLimit("workspace-1", config);
        checkRateLimit("workspace-1", config);
        checkRateLimit("workspace-1", config);

        const state = getBucketState("workspace-1", config);
        expect(state?.tokens).toBeLessThanOrEqual(2);
        expect(state?.tokens).toBe(2); // exactly three tokens consumed under a frozen clock
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("Statistics", () => {
    it("should count active buckets", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-2", config);
      checkRateLimit("192.168.1.1", config, "ip");

      const stats = getRateLimitStats();
      expect(stats.activeBuckets).toBe(3);
    });

    it("should track all identifiers", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-2", config);

      const stats = getRateLimitStats();
      expect(stats.totalIdentifiers.has("workspace:workspace-1")).toBe(true);
      expect(stats.totalIdentifiers.has("workspace:workspace-2")).toBe(true);
    });

    it("should return zero stats after clear", () => {
      const config = { windowMs: 1000, maxRequests: 5 };

      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-2", config);

      clearAllBuckets();
      const stats = getRateLimitStats();

      expect(stats.activeBuckets).toBe(0);
      expect(stats.totalIdentifiers.size).toBe(0);
    });
  });

  describe("Configuration Presets", () => {
    it("should provide STRICT preset", () => {
      const config = RATE_LIMIT_PRESETS.STRICT;
      expect(config.maxRequests).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should provide NORMAL preset", () => {
      const config = RATE_LIMIT_PRESETS.NORMAL;
      expect(config.maxRequests).toBe(100);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should provide GENEROUS preset", () => {
      const config = RATE_LIMIT_PRESETS.GENEROUS;
      expect(config.maxRequests).toBe(1000);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it("should provide PUBLIC_API preset", () => {
      const config = RATE_LIMIT_PRESETS.PUBLIC_API;
      expect(config.maxRequests).toBe(10000);
      expect(config.windowMs).toBe(60 * 60 * 1000);
    });

    it("should provide AUTH_ENDPOINT preset", () => {
      const config = RATE_LIMIT_PRESETS.AUTH_ENDPOINT;
      expect(config.maxRequests).toBe(5);
      expect(config.windowMs).toBe(60 * 1000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero maxRequests", () => {
      const config = { windowMs: 1000, maxRequests: 0 };
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);
    });

    it("should handle large maxRequests", () => {
      const config = { windowMs: 1000, maxRequests: 1000000 };
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(999990);
    });

    it("should handle very short window", () => {
      const config = { windowMs: 1, maxRequests: 1 };
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(true);
    });

    it("should handle long window", () => {
      const config = { windowMs: 24 * 60 * 60 * 1000, maxRequests: 1000 };
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(true);
      expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
    });

    it("should handle concurrent identifiers", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      for (let i = 0; i < 100; i++) {
        const workspaceId = `workspace-${i}`;
        const result = checkRateLimit(workspaceId, config);
        expect(result.allowed).toBe(true);
      }

      const stats = getRateLimitStats();
      expect(stats.activeBuckets).toBe(100);
    });

    it("should handle repeated reset", () => {
      const config = { windowMs: 1000, maxRequests: 2 };

      checkRateLimit("workspace-1", config);
      resetRateLimit("workspace-1", "workspace");
      resetRateLimit("workspace-1", "workspace");
      resetRateLimit("workspace-1", "workspace");

      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should enforce per-workspace API limits", () => {
      const config = { windowMs: 1000, maxRequests: 100 };

      // Simulate workspace-1 making requests
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit("workspace-1", config);
        expect(result.allowed).toBe(true);
      }

      // 101st request should fail
      const result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);
    });

    it("should prevent brute force on auth endpoint", () => {
      const config = RATE_LIMIT_PRESETS.AUTH_ENDPOINT;
      const clientIp = "192.168.1.100";

      // Try to make more than 5 auth attempts
      let successCount = 0;
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(clientIp, config, "ip");
        if (result.allowed) successCount++;
      }

      expect(successCount).toBe(5);
    });

    it("should allow exponential backoff recovery", async () => {
      const config = { windowMs: 100, maxRequests: 2 };

      // Hit the limit
      checkRateLimit("workspace-1", config);
      checkRateLimit("workspace-1", config);

      let result = checkRateLimit("workspace-1", config);
      expect(result.allowed).toBe(false);

      // Wait and retry
      await new Promise((resolve) =>
        setTimeout(() => {
          result = checkRateLimit("workspace-1", config);
          expect(result.allowed).toBe(true);
          resolve(null);
        }, 60)
      );
    });

    it("should support exempted infrastructure IPs", () => {
      const config: RateLimitConfig = {
        windowMs: 1000,
        maxRequests: 1,
        exemptedIps: ["127.0.0.1", "::1"], // localhost exempted
      };

      // Verify exemption logic
      expect(isExempted("127.0.0.1", config)).toBe(true);
      expect(isExempted("::1", config)).toBe(true);
      expect(isExempted("203.0.113.50", config)).toBe(false);
    });
  });
});

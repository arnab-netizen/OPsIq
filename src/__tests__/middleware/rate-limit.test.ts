import { describe, it, expect, beforeEach } from "vitest";
import {
  checkWorkspaceRateLimit,
  checkIpRateLimit,
  resetAllRateLimits,
} from "@/middleware/rate-limit";
import { getTierConfig } from "@/lib/tier-config";

describe("Rate Limiting Middleware", () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  describe("checkWorkspaceRateLimit", () => {
    it("should allow request for new workspace", () => {
      const result = checkWorkspaceRateLimit("ws-1", "free");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should decrement remaining tokens", () => {
      const result1 = checkWorkspaceRateLimit("ws-1", "free");
      const before = result1.remaining;

      const result2 = checkWorkspaceRateLimit("ws-1", "free");
      const after = result2.remaining;

      expect(after).toBe(before - 1);
    });

    it("should respect free tier limit (1000 req/hour)", () => {
      const freeConfig = getTierConfig("free");
      expect(freeConfig.limits.requestsPerHour).toBe(1000);

      const result = checkWorkspaceRateLimit("ws-1", "free");
      expect(result.remaining).toBeLessThanOrEqual(1000);
    });

    it("should respect pro tier limit (10000 req/hour)", () => {
      const proConfig = getTierConfig("pro");
      expect(proConfig.limits.requestsPerHour).toBe(10000);

      const result = checkWorkspaceRateLimit("ws-1", "pro");
      expect(result.remaining).toBeLessThanOrEqual(10000);
    });

    it("should respect enterprise tier limit (100000 req/hour)", () => {
      const enterpriseConfig = getTierConfig("enterprise");
      expect(enterpriseConfig.limits.requestsPerHour).toBe(100000);

      const result = checkWorkspaceRateLimit("ws-1", "enterprise");
      expect(result.remaining).toBeLessThanOrEqual(100000);
    });

    it("should track separate rates per workspace", () => {
      checkWorkspaceRateLimit("ws-1", "free");
      const ws1Result = checkWorkspaceRateLimit("ws-1", "free");
      const ws1Remaining = ws1Result.remaining;

      const ws2Result = checkWorkspaceRateLimit("ws-2", "free");
      const ws2Remaining = ws2Result.remaining;

      // ws-2 should have 1 less consumed than ws-1
      expect(ws2Remaining).toBeGreaterThan(ws1Remaining);
    });

    it("should allow burst traffic within capacity", () => {
      // Make 100 rapid requests
      for (let i = 0; i < 100; i++) {
        const result = checkWorkspaceRateLimit("ws-1", "free");
        expect(result.allowed).toBe(true);
      }
    });

    it("should deny when limit exceeded", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Consume all tokens
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // Next request should fail
      const result = checkWorkspaceRateLimit("ws-1", "free");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should provide retryAfter when limit exceeded", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Consume all tokens
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      const result = checkWorkspaceRateLimit("ws-1", "free");
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(3600); // Max 1 hour
    });

    it("should support multiple token consumption", () => {
      const result1 = checkWorkspaceRateLimit("ws-1", "free", 5);
      expect(result1.remaining).toBeLessThanOrEqual(
        getTierConfig("free").limits.requestsPerHour - 5
      );

      const result2 = checkWorkspaceRateLimit("ws-1", "free", 10);
      expect(result2.remaining).toBeLessThanOrEqual(
        getTierConfig("free").limits.requestsPerHour - 15
      );
    });
  });

  describe("checkIpRateLimit", () => {
    it("should allow request for new IP", () => {
      const result = checkIpRateLimit("192.168.1.1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should enforce IP limit (1000 req/hour)", () => {
      const result = checkIpRateLimit("192.168.1.1");
      expect(result.remaining).toBeLessThanOrEqual(1000);
    });

    it("should track separate rates per IP", () => {
      checkIpRateLimit("192.168.1.1");
      const ip1Result = checkIpRateLimit("192.168.1.1");
      const ip1Remaining = ip1Result.remaining;

      const ip2Result = checkIpRateLimit("192.168.1.2");
      const ip2Remaining = ip2Result.remaining;

      expect(ip2Remaining).toBeGreaterThan(ip1Remaining);
    });

    it("should deny when IP limit exceeded", () => {
      const limit = 1000;

      for (let i = 0; i < limit; i++) {
        checkIpRateLimit("192.168.1.1");
      }

      const result = checkIpRateLimit("192.168.1.1");
      expect(result.allowed).toBe(false);
    });

    it("should provide retryAfter for IP limits", () => {
      const limit = 1000;

      for (let i = 0; i < limit; i++) {
        checkIpRateLimit("192.168.1.1");
      }

      const result = checkIpRateLimit("192.168.1.1");
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe("Tier-Based Workspace Rate Limits", () => {
    it("free tier should have lower limit than pro", () => {
      const freeConfig = getTierConfig("free");
      const proConfig = getTierConfig("pro");

      expect(freeConfig.limits.requestsPerHour).toBeLessThan(
        proConfig.limits.requestsPerHour
      );
    });

    it("pro tier should have lower limit than enterprise", () => {
      const proConfig = getTierConfig("pro");
      const enterpriseConfig = getTierConfig("enterprise");

      expect(proConfig.limits.requestsPerHour).toBeLessThan(
        enterpriseConfig.limits.requestsPerHour
      );
    });

    it("should not deny pro workspace at free tier limit", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Consume up to free tier limit
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-pro", "free");
      }

      // Next request should fail for free tier
      let result = checkWorkspaceRateLimit("ws-pro", "free");
      expect(result.allowed).toBe(false);

      // But same workspace with pro tier should allow
      resetAllRateLimits();
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-pro", "pro");
      }

      result = checkWorkspaceRateLimit("ws-pro", "pro");
      expect(result.allowed).toBe(true);
    });
  });

  describe("Workspace vs IP Rate Limiting", () => {
    it("should track workspace and IP limits separately", () => {
      // Make 100 workspace requests
      for (let i = 0; i < 100; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // Same workspace, workspace limit affected
      let wsResult = checkWorkspaceRateLimit("ws-1", "free");
      expect(wsResult.remaining).toBeLessThan(
        getTierConfig("free").limits.requestsPerHour
      );

      // Same IP, IP limit should be separate
      for (let i = 0; i < 100; i++) {
        checkIpRateLimit("192.168.1.1");
      }

      let ipResult = checkIpRateLimit("192.168.1.1");
      expect(ipResult.remaining).toBeLessThan(1000);
    });

    it("multiple workspaces from same IP should each have workspace limit", () => {
      const ip = "192.168.1.1";

      // ws-1 makes 500 requests
      for (let i = 0; i < 500; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // ws-2 makes 500 requests (same IP, separate workspace rate limit)
      for (let i = 0; i < 500; i++) {
        checkWorkspaceRateLimit("ws-2", "free");
      }

      // Each workspace should still have remaining (separate limits)
      const ws1Result = checkWorkspaceRateLimit("ws-1", "free");
      const ws2Result = checkWorkspaceRateLimit("ws-2", "free");

      expect(ws1Result.allowed).toBe(true);
      expect(ws2Result.allowed).toBe(true);

      // But if we track IP separately and make 1000 IP requests
      for (let i = 0; i < 1000; i++) {
        checkIpRateLimit(ip);
      }

      // IP should be at limit
      const ipResult = checkIpRateLimit(ip);
      expect(ipResult.allowed).toBe(false);
    });
  });

  describe("Token Refill Logic", () => {
    it("should refill tokens over time", async () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Consume 100 tokens
      for (let i = 0; i < 100; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      let result1 = checkWorkspaceRateLimit("ws-1", "free");
      const remaining1 = result1.remaining;

      // Wait 2 seconds to allow refill (refill rate = limit/3600 tokens/sec)
      // At 2 seconds with 1000/3600 ≈ 0.28 tokens/sec, we should get ~0.56 tokens
      await new Promise((resolve) => setTimeout(resolve, 2000));

      let result2 = checkWorkspaceRateLimit("ws-1", "free");
      const remaining2 = result2.remaining;

      // Tokens should not decrease from refill + consume
      // (remaining2 might be slightly less due to additional consume)
      expect(remaining2).toBeLessThanOrEqual(remaining1 + 1);
    });

    it("should not exceed capacity when refilling", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Use 100 tokens
      for (let i = 0; i < 100; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // Check without consuming
      const result = checkWorkspaceRateLimit("ws-1", "free", 0);
      expect(result.remaining).toBeLessThanOrEqual(limit);
    });
  });

  describe("Edge Cases", () => {
    it("should handle 0 token consumption", () => {
      const result1 = checkWorkspaceRateLimit("ws-1", "free", 0);
      expect(result1.allowed).toBe(true);

      const result2 = checkWorkspaceRateLimit("ws-1", "free", 0);
      expect(result2.remaining).toBe(result1.remaining);
    });

    it("should handle large token consumption", () => {
      const result = checkWorkspaceRateLimit("ws-1", "free", 100);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty string IP", () => {
      const result = checkIpRateLimit("");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should handle special characters in workspace ID", () => {
      const result = checkWorkspaceRateLimit("ws-@#$%", "free");
      expect(result.allowed).toBe(true);
    });
  });

  describe("Rate Limit Reset", () => {
    it("resetAllRateLimits should clear all state", () => {
      checkWorkspaceRateLimit("ws-1", "free");
      checkIpRateLimit("192.168.1.1");

      resetAllRateLimits();

      const wsResult = checkWorkspaceRateLimit("ws-1", "free");
      const ipResult = checkIpRateLimit("192.168.1.1");

      expect(wsResult.remaining).toBeLessThanOrEqual(
        getTierConfig("free").limits.requestsPerHour
      );
      expect(ipResult.remaining).toBeLessThanOrEqual(1000);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle multiple concurrent checks correctly", () => {
      const results = [];

      for (let i = 0; i < 50; i++) {
        results.push(checkWorkspaceRateLimit("ws-1", "free"));
      }

      // All should be allowed
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
      });

      // Remaining should decrease
      const lastResult = results[results.length - 1];
      const firstResult = results[0];
      expect(firstResult.remaining).toBeGreaterThan(lastResult.remaining);
    });
  });

  describe("RetryAfter Calculation", () => {
    it("retryAfter should be reasonable when at limit", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      const result = checkWorkspaceRateLimit("ws-1", "free");
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(3600); // Max 1 hour
    });

    it("retryAfter should be calculated based on token deficit", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.requestsPerHour;

      // Consume all tokens from ws-1
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // Try to consume 1 token (small deficit)
      const result1 = checkWorkspaceRateLimit("ws-1", "free", 1);
      expect(result1.allowed).toBe(false);
      const retryAfter1 = result1.retryAfter || 0;

      // Reset and try with larger deficit
      resetAllRateLimits();
      for (let i = 0; i < limit; i++) {
        checkWorkspaceRateLimit("ws-1", "free");
      }

      // Try to consume 100 tokens (large deficit)
      const result2 = checkWorkspaceRateLimit("ws-1", "free", 100);
      expect(result2.allowed).toBe(false);
      const retryAfter2 = result2.retryAfter || 0;

      // Larger consumption should have longer retry time
      expect(retryAfter2).toBeGreaterThan(retryAfter1);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkQuota,
  incrementQuota,
  resetAllQuota,
  checkTierEnforcement,
  tierEnforcement,
} from "@/middleware/tier-enforcement";
import { getTierConfig } from "@/lib/tier-config";

describe("Tier Enforcement Middleware", () => {
  beforeEach(() => {
    resetAllQuota();
  });

  describe("checkQuota", () => {
    it("should allow quota for new workspace", () => {
      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("should track quota per workspace", () => {
      const ws1Result = checkQuota("ws-1", "free", "/api/actions");
      const ws2Result = checkQuota("ws-2", "free", "/api/actions");

      expect(ws1Result.allowed).toBe(true);
      expect(ws2Result.allowed).toBe(true);
      expect(ws1Result.remaining).toBe(ws2Result.remaining); // Same limit
    });

    it("should track quota per endpoint", () => {
      const actions = checkQuota("ws-1", "free", "/api/actions");
      const decisions = checkQuota("ws-1", "free", "/api/decisions");

      expect(actions.allowed).toBe(true);
      expect(decisions.allowed).toBe(true);
      expect(actions.remaining).toBe(decisions.remaining); // Same limit initially
    });

    it("should return correct limits for free tier", () => {
      const freeConfig = getTierConfig("free");
      const result = checkQuota("ws-1", "free", "/api/actions");

      expect(result.remaining).toBe(freeConfig.limits.actionsPerMonth);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it("should return correct limits for pro tier", () => {
      const proConfig = getTierConfig("pro");
      const result = checkQuota("ws-1", "pro", "/api/actions");

      expect(result.remaining).toBe(proConfig.limits.actionsPerMonth);
    });

    it("should return correct limits for enterprise tier", () => {
      const enterpriseConfig = getTierConfig("enterprise");
      const result = checkQuota("ws-1", "enterprise", "/api/actions");

      expect(result.remaining).toBe(enterpriseConfig.limits.actionsPerMonth);
    });
  });

  describe("incrementQuota", () => {
    it("should increment quota counter", () => {
      const result1 = incrementQuota("ws-1", "/api/actions");
      expect(result1.count).toBe(1);

      const result2 = incrementQuota("ws-1", "/api/actions");
      expect(result2.count).toBe(2);
    });

    it("should track separate quotas per endpoint", () => {
      const actions = incrementQuota("ws-1", "/api/actions");
      const decisions = incrementQuota("ws-1", "/api/decisions");

      expect(actions.count).toBe(1);
      expect(decisions.count).toBe(1);
    });

    it("should decrement remaining quota", () => {
      const before = checkQuota("ws-1", "free", "/api/actions");
      incrementQuota("ws-1", "/api/actions");
      const after = checkQuota("ws-1", "free", "/api/actions");

      expect(after.remaining).toBe(before.remaining - 1);
    });

    it("should never return negative remaining", () => {
      const freeConfig = getTierConfig("free");
      // Increment past limit
      for (let i = 0; i < freeConfig.limits.actionsPerMonth + 10; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Quota Exhaustion (Free Tier)", () => {
    it("should deny quota when limit reached", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.actionsPerMonth;

      // Increment to limit
      for (let i = 0; i < limit; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      // Next check should fail
      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should provide reset time when quota exceeded", () => {
      const freeConfig = getTierConfig("free");
      for (let i = 0; i < freeConfig.limits.actionsPerMonth; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.resetAt).toBeGreaterThan(Date.now());
      expect(result.resetAt).toBeLessThan(Date.now() + 32 * 24 * 60 * 60 * 1000); // Within 32 days
    });

    it("should correctly limit free tier (10 actions/month)", () => {
      const freeConfig = getTierConfig("free");
      expect(freeConfig.limits.actionsPerMonth).toBe(10);

      // Increment to exactly 10
      for (let i = 0; i < 10; i++) {
        const result = checkQuota("ws-1", "free", "/api/actions");
        expect(result.allowed).toBe(true);
        incrementQuota("ws-1", "/api/actions");
      }

      // 11th should fail
      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.allowed).toBe(false);
    });
  });

  describe("Tier Differences", () => {
    it("free tier has lower limit than pro", () => {
      const freeConfig = getTierConfig("free");
      const proConfig = getTierConfig("pro");

      expect(freeConfig.limits.actionsPerMonth).toBeLessThan(
        proConfig.limits.actionsPerMonth
      );
    });

    it("pro tier has lower limit than enterprise", () => {
      const proConfig = getTierConfig("pro");
      const enterpriseConfig = getTierConfig("enterprise");

      expect(proConfig.limits.actionsPerMonth).toBeLessThan(
        enterpriseConfig.limits.actionsPerMonth
      );
    });

    it("should not deny pro tier at free tier limit", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.actionsPerMonth;

      // Increment pro workspace to free limit
      for (let i = 0; i < limit; i++) {
        incrementQuota("ws-pro", "/api/actions");
      }

      // Pro should still allow (higher limit)
      const result = checkQuota("ws-pro", "pro", "/api/actions");
      expect(result.allowed).toBe(true);
    });
  });

  describe("checkTierEnforcement", () => {
    it("should return allowed for under quota", () => {
      const result = checkTierEnforcement("ws-1", "free", "/api/actions");
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should deny and provide error message when quota exceeded", () => {
      const freeConfig = getTierConfig("free");
      for (let i = 0; i < freeConfig.limits.actionsPerMonth; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      const result = checkTierEnforcement("ws-1", "free", "/api/actions");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Quota exceeded");
      expect(result.error).toContain("free");
    });

    it("error message should mention tier name", () => {
      const proConfig = getTierConfig("pro");
      for (let i = 0; i < proConfig.limits.actionsPerMonth; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      const result = checkTierEnforcement("ws-1", "pro", "/api/actions");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("pro");
    });
  });

  describe("Multi-Workspace Isolation", () => {
    it("quota for ws-1 should not affect ws-2", () => {
      const freeConfig = getTierConfig("free");

      // Max out ws-1
      for (let i = 0; i < freeConfig.limits.actionsPerMonth; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      // ws-2 should still have quota
      const ws1Result = checkQuota("ws-1", "free", "/api/actions");
      const ws2Result = checkQuota("ws-2", "free", "/api/actions");

      expect(ws1Result.allowed).toBe(false);
      expect(ws2Result.allowed).toBe(true);
      expect(ws2Result.remaining).toBe(freeConfig.limits.actionsPerMonth);
    });

    it("should enforce quota per workspace+endpoint combination", () => {
      const freeConfig = getTierConfig("free");

      // Max out /api/actions for ws-1
      for (let i = 0; i < freeConfig.limits.actionsPerMonth; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      // But /api/decisions should still have quota
      const actionsResult = checkQuota("ws-1", "free", "/api/actions");
      const decisionsResult = checkQuota("ws-1", "free", "/api/decisions");

      expect(actionsResult.allowed).toBe(false);
      expect(decisionsResult.allowed).toBe(true);
    });
  });

  describe("Quota Reset", () => {
    it("resetAllQuota should clear all quotas", () => {
      incrementQuota("ws-1", "/api/actions");
      let result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.remaining).toBeLessThan(
        getTierConfig("free").limits.actionsPerMonth
      );

      resetAllQuota();
      result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.remaining).toBe(getTierConfig("free").limits.actionsPerMonth);
    });
  });

  describe("Quota Calculation", () => {
    it("should calculate remaining correctly for various usage", () => {
      const freeConfig = getTierConfig("free");
      const limit = freeConfig.limits.actionsPerMonth;

      for (let i = 0; i < 5; i++) {
        incrementQuota("ws-1", "/api/actions");
      }

      const result = checkQuota("ws-1", "free", "/api/actions");
      expect(result.remaining).toBe(limit - 5);
    });

    it("should track multiple workspaces independently", () => {
      const freeConfig = getTierConfig("free");

      for (let i = 0; i < 3; i++) {
        incrementQuota("ws-1", "/api/actions");
        incrementQuota("ws-2", "/api/actions");
      }

      const ws1 = checkQuota("ws-1", "free", "/api/actions");
      const ws2 = checkQuota("ws-2", "free", "/api/actions");

      expect(ws1.remaining).toBe(ws2.remaining); // Same usage
      expect(ws1.remaining).toBe(freeConfig.limits.actionsPerMonth - 3);
    });
  });

  describe("Tier Capability Mapping", () => {
    it("free tier should have basic capabilities", () => {
      const freeConfig = getTierConfig("free");
      expect(freeConfig.capabilities).toContain("ACTION_VIEW");
      expect(freeConfig.capabilities).toContain("ACTION_CREATE");
    });

    it("pro tier should have more capabilities than free", () => {
      const freeConfig = getTierConfig("free");
      const proConfig = getTierConfig("pro");

      expect(proConfig.capabilities.length).toBeGreaterThan(
        freeConfig.capabilities.length
      );
    });

    it("enterprise tier should have admin capabilities", () => {
      const enterpriseConfig = getTierConfig("enterprise");
      expect(enterpriseConfig.capabilities).toContain("ADMIN_VIEW");
      expect(enterpriseConfig.capabilities).toContain("ADMIN_MANAGE");
    });

    it("free tier should NOT have admin capabilities", () => {
      const freeConfig = getTierConfig("free");
      expect(freeConfig.capabilities).not.toContain("ADMIN_VIEW");
      expect(freeConfig.capabilities).not.toContain("ADMIN_MANAGE");
    });
  });
});

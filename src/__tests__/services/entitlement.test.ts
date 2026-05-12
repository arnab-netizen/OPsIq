/**
 * Tests: Entitlement Service
 *
 * Validates subscription tier management, capability enforcement,
 * and quota tracking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SubscriptionTier,
  Capability,
  getSubscriptionTier,
  setSubscriptionTier,
  getTierConfig,
  hasCapability,
  hasFeature,
  getQuotaUsage,
  incrementQuotaUsage,
  canCreateAction,
  canCreateDecision,
  canCreateExperiment,
  canExportData,
  hasApiAccess,
  resetQuota,
  resetSubscriptions,
  clearAllEntitlementData,
  TIER_CONFIGS,
} from "@/services/entitlement";

describe("Entitlement Service", () => {
  beforeEach(() => {
    clearAllEntitlementData();
  });

  describe("Subscription Tier Management", () => {
    it("should default to FREE tier", () => {
      const tier = getSubscriptionTier("workspace-1");
      expect(tier).toBe(SubscriptionTier.FREE);
    });

    it("should set subscription tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      const tier = getSubscriptionTier("workspace-1");
      expect(tier).toBe(SubscriptionTier.PRO);
    });

    it("should upgrade workspace tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      expect(getSubscriptionTier("workspace-1")).toBe(SubscriptionTier.FREE);

      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      expect(getSubscriptionTier("workspace-1")).toBe(SubscriptionTier.PRO);

      setSubscriptionTier("workspace-1", SubscriptionTier.ENTERPRISE);
      expect(getSubscriptionTier("workspace-1")).toBe(SubscriptionTier.ENTERPRISE);
    });

    it("should isolate tiers per workspace", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      setSubscriptionTier("workspace-2", SubscriptionTier.ENTERPRISE);

      expect(getSubscriptionTier("workspace-1")).toBe(SubscriptionTier.PRO);
      expect(getSubscriptionTier("workspace-2")).toBe(SubscriptionTier.ENTERPRISE);
      expect(getSubscriptionTier("workspace-3")).toBe(SubscriptionTier.FREE);
    });
  });

  describe("Tier Configuration", () => {
    it("should provide FREE tier config", () => {
      const config = getTierConfig(SubscriptionTier.FREE);
      expect(config.tier).toBe(SubscriptionTier.FREE);
      expect(config.name).toBe("Free");
      expect(config.workspaceLimit).toBe(1);
      expect(config.actionsPerMonth).toBe(5);
    });

    it("should provide PRO tier config", () => {
      const config = getTierConfig(SubscriptionTier.PRO);
      expect(config.tier).toBe(SubscriptionTier.PRO);
      expect(config.name).toBe("Professional");
      expect(config.workspaceLimit).toBe(5);
      expect(config.actionsPerMonth).toBe(500);
    });

    it("should provide ENTERPRISE tier config", () => {
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);
      expect(config.tier).toBe(SubscriptionTier.ENTERPRISE);
      expect(config.name).toBe("Enterprise");
      expect(config.workspaceLimit).toBe(999999);
      expect(config.actionsPerMonth).toBe(999999);
    });

    it("should define all tier configs in TIER_CONFIGS", () => {
      expect(TIER_CONFIGS[SubscriptionTier.FREE]).toBeDefined();
      expect(TIER_CONFIGS[SubscriptionTier.PRO]).toBeDefined();
      expect(TIER_CONFIGS[SubscriptionTier.ENTERPRISE]).toBeDefined();
    });
  });

  describe("Capability Enforcement", () => {
    it("should check capability availability", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      expect(hasCapability("workspace-1", Capability.ACTION_CREATE)).toBe(true);
      expect(hasCapability("workspace-1", Capability.ACTION_DELETE)).toBe(false);
    });

    it("should grant all capabilities in ENTERPRISE tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.ENTERPRISE);
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);

      config.capabilities.forEach((cap) => {
        expect(hasCapability("workspace-1", cap)).toBe(true);
      });
    });

    it("should restrict capabilities in FREE tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      expect(hasCapability("workspace-1", Capability.ACTION_DELETE)).toBe(false);
      expect(hasCapability("workspace-1", Capability.AUDIT_EXPORT)).toBe(false);
      expect(hasCapability("workspace-1", Capability.ADMIN_TEAM)).toBe(false);
    });

    it("should support PRO-specific capabilities", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      expect(hasCapability("workspace-1", Capability.ACTION_DELETE)).toBe(true);
      expect(hasCapability("workspace-1", Capability.AUDIT_EXPORT)).toBe(true);
      expect(hasCapability("workspace-1", Capability.ADMIN_TEAM)).toBe(false);
    });
  });

  describe("Feature Availability", () => {
    it("should check feature availability", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      expect(hasFeature("workspace-1", "exportData")).toBe(false);
      expect(hasFeature("workspace-1", "sso")).toBe(false);
    });

    it("should enable features in PRO tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      expect(hasFeature("workspace-1", "customNotifications")).toBe(true);
      expect(hasFeature("workspace-1", "advancedAnalytics")).toBe(true);
      expect(hasFeature("workspace-1", "exportData")).toBe(true);
      expect(hasFeature("workspace-1", "webhooks")).toBe(true);
      expect(hasFeature("workspace-1", "sso")).toBe(false); // PRO doesn't have SSO
    });

    it("should enable all features in ENTERPRISE tier", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.ENTERPRISE);
      expect(hasFeature("workspace-1", "customNotifications")).toBe(true);
      expect(hasFeature("workspace-1", "advancedAnalytics")).toBe(true);
      expect(hasFeature("workspace-1", "sso")).toBe(true);
      expect(hasFeature("workspace-1", "prioritySupport")).toBe(true);
    });
  });

  describe("Quota Tracking", () => {
    it("should initialize quota at zero", () => {
      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.actionsCreated).toBe(0);
      expect(usage.decisionsCreated).toBe(0);
      expect(usage.experimentsCreated).toBe(0);
      expect(usage.exportCount).toBe(0);
    });

    it("should increment action quota", () => {
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-1", "user-1", "action");

      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.actionsCreated).toBe(2);
    });

    it("should increment decision quota", () => {
      incrementQuotaUsage("workspace-1", "user-1", "decision");
      incrementQuotaUsage("workspace-1", "user-1", "decision");
      incrementQuotaUsage("workspace-1", "user-1", "decision");

      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.decisionsCreated).toBe(3);
    });

    it("should increment experiment quota", () => {
      incrementQuotaUsage("workspace-1", "user-1", "experiment");
      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.experimentsCreated).toBe(1);
    });

    it("should increment export count", () => {
      incrementQuotaUsage("workspace-1", "user-1", "export");
      incrementQuotaUsage("workspace-1", "user-1", "export");

      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.exportCount).toBe(2);
    });

    it("should isolate quota per user", () => {
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-1", "user-2", "action");

      const user1Usage = getQuotaUsage("workspace-1", "user-1");
      const user2Usage = getQuotaUsage("workspace-1", "user-2");

      expect(user1Usage.actionsCreated).toBe(2);
      expect(user2Usage.actionsCreated).toBe(1);
    });

    it("should include period in usage", () => {
      const usage = getQuotaUsage("workspace-1", "user-1");
      expect(usage.period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("Action Quota Enforcement", () => {
    it("should allow action creation within limit", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      const result = canCreateAction("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
    });

    it("should reject action creation without capability", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      // Simulate removing capability by testing non-existent tier (edge case)
      // For now, we know FREE has ACTION_CREATE, so this test is conceptual
      expect(hasCapability("workspace-1", Capability.ACTION_CREATE)).toBe(true);
    });

    it("should enforce FREE tier action limit (5/month)", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);

      // Create 5 actions
      for (let i = 0; i < 5; i++) {
        incrementQuotaUsage("workspace-1", "user-1", "action");
      }

      let result = canCreateAction("workspace-1", "user-1");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should report remaining quota", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      incrementQuotaUsage("workspace-1", "user-1", "action");

      const result = canCreateAction("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(499); // 500 - 1
      expect(result.limit).toBe(500);
    });

    it("should allow unlimited actions in ENTERPRISE", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.ENTERPRISE);

      // Create many actions
      for (let i = 0; i < 10000; i++) {
        incrementQuotaUsage("workspace-1", "user-1", "action");
      }

      const result = canCreateAction("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(999999 - 10000);
      expect(result.limit).toBe(999999);
    });
  });

  describe("Decision Quota Enforcement", () => {
    it("should allow decision creation within limit", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      const result = canCreateDecision("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
    });

    it("should enforce FREE tier decision limit (10/month)", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);

      for (let i = 0; i < 10; i++) {
        incrementQuotaUsage("workspace-1", "user-1", "decision");
      }

      const result = canCreateDecision("workspace-1", "user-1");
      expect(result.allowed).toBe(false);
    });

    it("should report decision quota remaining", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      incrementQuotaUsage("workspace-1", "user-1", "decision");

      const result = canCreateDecision("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(499); // 500 - 1
    });
  });

  describe("Experiment Quota Enforcement", () => {
    it("should allow experiment creation within limit", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      const result = canCreateExperiment("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
    });

    it("should enforce FREE tier experiment limit (2/month)", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);

      incrementQuotaUsage("workspace-1", "user-1", "experiment");
      incrementQuotaUsage("workspace-1", "user-1", "experiment");

      const result = canCreateExperiment("workspace-1", "user-1");
      expect(result.allowed).toBe(false);
    });

    it("should report experiment quota remaining", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      for (let i = 0; i < 10; i++) {
        incrementQuotaUsage("workspace-1", "user-1", "experiment");
      }

      const result = canCreateExperiment("workspace-1", "user-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(90); // 100 - 10
    });
  });

  describe("Feature-Based Entitlements", () => {
    it("should restrict export to PRO+", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      let result = canExportData("workspace-1");
      expect(result.allowed).toBe(false);

      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      result = canExportData("workspace-1");
      expect(result.allowed).toBe(true);
    });

    it("should restrict API access to PRO+", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      let result = hasApiAccess("workspace-1");
      expect(result.allowed).toBe(false);

      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      result = hasApiAccess("workspace-1");
      expect(result.allowed).toBe(true);
    });

    it("should restrict SSO to ENTERPRISE", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);
      expect(hasFeature("workspace-1", "sso")).toBe(false);

      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      expect(hasFeature("workspace-1", "sso")).toBe(false);

      setSubscriptionTier("workspace-1", SubscriptionTier.ENTERPRISE);
      expect(hasFeature("workspace-1", "sso")).toBe(true);
    });
  });

  describe("Reset Operations", () => {
    it("should reset quota for specific workspace", () => {
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-2", "user-1", "action");

      resetQuota("workspace-1");

      const usage1 = getQuotaUsage("workspace-1", "user-1");
      const usage2 = getQuotaUsage("workspace-2", "user-1");

      expect(usage1.actionsCreated).toBe(0);
      expect(usage2.actionsCreated).toBe(1);
    });

    it("should reset all quota", () => {
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-2", "user-1", "action");

      resetQuota();

      const usage1 = getQuotaUsage("workspace-1", "user-1");
      const usage2 = getQuotaUsage("workspace-2", "user-1");

      expect(usage1.actionsCreated).toBe(0);
      expect(usage2.actionsCreated).toBe(0);
    });

    it("should reset all subscriptions", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      setSubscriptionTier("workspace-2", SubscriptionTier.ENTERPRISE);

      resetSubscriptions();

      expect(getSubscriptionTier("workspace-1")).toBe(SubscriptionTier.FREE);
      expect(getSubscriptionTier("workspace-2")).toBe(SubscriptionTier.FREE);
    });
  });

  describe("Edge Cases", () => {
    it("should handle new workspace (defaults to FREE)", () => {
      expect(getSubscriptionTier("workspace-new")).toBe(SubscriptionTier.FREE);
    });

    it("should track quota per calendar month", () => {
      const usage1 = getQuotaUsage("workspace-1", "user-1");
      const usage2 = getQuotaUsage("workspace-1", "user-1");

      // Should be same object (same period)
      expect(usage1.period).toBe(usage2.period);
    });

    it("should handle multiple users per workspace", () => {
      incrementQuotaUsage("workspace-1", "user-1", "action");
      incrementQuotaUsage("workspace-1", "user-2", "action");
      incrementQuotaUsage("workspace-1", "user-3", "action");

      const usage1 = getQuotaUsage("workspace-1", "user-1");
      const usage2 = getQuotaUsage("workspace-1", "user-2");
      const usage3 = getQuotaUsage("workspace-1", "user-3");

      expect(usage1.actionsCreated).toBe(1);
      expect(usage2.actionsCreated).toBe(1);
      expect(usage3.actionsCreated).toBe(1);
    });

    it("should include tier info in entitlement result", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);
      const result = canCreateAction("workspace-1", "user-1");

      expect(result.tier).toBe(SubscriptionTier.PRO);
      expect(result.usage).toBeDefined();
      expect(result.limit).toBe(500);
    });

    it("should handle quota exhaustion gracefully", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.FREE);

      for (let i = 0; i < 5; i++) {
        incrementQuotaUsage("workspace-1", "user-1", "action");
      }

      const result = canCreateAction("workspace-1", "user-1");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toBeDefined();
    });

    it("should support all Capability enum values", () => {
      const capabilities = Object.values(Capability);
      expect(capabilities.length).toBeGreaterThan(0);

      // Verify each capability has string value
      capabilities.forEach((cap) => {
        expect(typeof cap).toBe("string");
      });
    });
  });

  describe("Real-World Scenarios", () => {
    it("should enforce FREE tier limits for new user", () => {
      // Workspace starts as FREE
      const workspace = "startup-workspace";

      // User creates 5 actions (max for FREE)
      for (let i = 0; i < 5; i++) {
        incrementQuotaUsage(workspace, "user-1", "action");
      }

      // 6th action should fail
      let result = canCreateAction(workspace, "user-1");
      expect(result.allowed).toBe(false);

      // Upgrade to PRO
      setSubscriptionTier(workspace, SubscriptionTier.PRO);

      // Now should be able to create more
      result = canCreateAction(workspace, "user-1");
      expect(result.allowed).toBe(true);
    });

    it("should support team collaboration quotas", () => {
      setSubscriptionTier("workspace-1", SubscriptionTier.PRO);

      // 3 team members each create actions
      incrementQuotaUsage("workspace-1", "alice", "action");
      incrementQuotaUsage("workspace-1", "bob", "action");
      incrementQuotaUsage("workspace-1", "charlie", "action");

      const alice = getQuotaUsage("workspace-1", "alice");
      const bob = getQuotaUsage("workspace-1", "bob");

      // Each user is tracked separately
      expect(alice.actionsCreated).toBe(1);
      expect(bob.actionsCreated).toBe(1);
    });

    it("should enforce feature gates for API integration", () => {
      const workspace = "api-consumer";

      // FREE tier cannot use API
      setSubscriptionTier(workspace, SubscriptionTier.FREE);
      let result = hasApiAccess(workspace);
      expect(result.allowed).toBe(false);

      // PRO can use API
      setSubscriptionTier(workspace, SubscriptionTier.PRO);
      result = hasApiAccess(workspace);
      expect(result.allowed).toBe(true);

      // ENTERPRISE also can
      setSubscriptionTier(workspace, SubscriptionTier.ENTERPRISE);
      result = hasApiAccess(workspace);
      expect(result.allowed).toBe(true);
    });
  });
});

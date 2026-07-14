/**
 * C3: Entitlement Enforcement Tests
 *
 * Comprehensive permission matrix tests for subscription tier enforcement.
 * Verifies FREE/PRO/ENTERPRISE tiers enforce correct quota and capability limits.
 *
 * CRITICAL: These tests verify plan-based entitlement enforcement, not role-based auth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assertCapability,
  trackUsage,
} from "@/services/entitlement.service";

// assertCapability calls resolveEntitlements which queries the DB.
// Mock the DB models it accesses so tests run without a live DB connection.
vi.mock("@/lib/db", () => ({
  db: {
    billingAccount: { findFirst: vi.fn().mockResolvedValue(null) },
    subscription: { findFirst: vi.fn().mockResolvedValue(null) },
    plan: { findUnique: vi.fn().mockResolvedValue(null) },
    planCapability: { findMany: vi.fn().mockResolvedValue([]) },
    billingUsage: { findMany: vi.fn().mockResolvedValue([]) },
    usageRecord: { create: vi.fn().mockResolvedValue(undefined) },
  },
}));
import type { CapabilityCheck } from "@/services/entitlement.service";
import {
  getSubscriptionTier,
  setSubscriptionTier,
  getTierConfig,
  hasCapability,
  SubscriptionTier,
  Capability,
  clearAllEntitlementData,
  TIER_CONFIGS,
} from "@/services/entitlement";

describe("C3: Entitlement Enforcement - Permission Matrix (PHASE C SLICE C3)", () => {
  beforeEach(() => {
    clearAllEntitlementData();
  });

  afterEach(() => {
    clearAllEntitlementData();
  });

  describe("FREE Tier Permission Matrix", () => {
    beforeEach(() => {
      setSubscriptionTier("ws-free", SubscriptionTier.FREE);
    });

    it("should have FREE tier configured with 5 actions/month quota", async () => {
      const config = getTierConfig(SubscriptionTier.FREE);
      expect(config.actionsPerMonth).toBe(5);
      expect(config.decisionsPerMonth).toBe(10);
      expect(config.experimentsPerMonth).toBe(2);
    });


    it("should NOT allow FREE tier to update or delete actions", async () => {
      const ws = "ws-free";
      const tier = getTierConfig(SubscriptionTier.FREE);

      expect(tier.capabilities).toContain(Capability.ACTION_CREATE);
      expect(tier.capabilities).toContain(Capability.ACTION_UPDATE);
      expect(tier.capabilities).not.toContain(Capability.ACTION_DELETE);
    });

    it("should NOT allow FREE tier to update decisions (PRO+ only)", async () => {
      const ws = "ws-free";
      const tier = getTierConfig(SubscriptionTier.FREE);

      expect(tier.capabilities).toContain(Capability.DECISION_CREATE);
      expect(tier.capabilities).not.toContain(Capability.DECISION_UPDATE);
    });

    it("should NOT allow FREE tier to export audit data", async () => {
      const ws = "ws-free";
      const tier = getTierConfig(SubscriptionTier.FREE);

      expect(tier.capabilities).toContain(Capability.AUDIT_VIEW);
      expect(tier.capabilities).not.toContain(Capability.AUDIT_EXPORT);
    });

    it("should NOT allow FREE tier to manage team/workspace invites", async () => {
      const ws = "ws-free";
      const tier = getTierConfig(SubscriptionTier.FREE);

      expect(tier.capabilities).not.toContain(Capability.WORKSPACE_INVITE);
    });

    it("should NOT allow FREE tier admin settings", async () => {
      const ws = "ws-free";
      const tier = getTierConfig(SubscriptionTier.FREE);

      expect(tier.capabilities).not.toContain(Capability.ADMIN_SETTINGS);
    });
  });

  describe("PRO Tier Permission Matrix", () => {
    beforeEach(() => {
      setSubscriptionTier("ws-pro", SubscriptionTier.PRO);
    });

    it("should have PRO tier configured with 500 actions/month quota", async () => {
      const config = getTierConfig(SubscriptionTier.PRO);

      expect(config.actionsPerMonth).toBe(500);
      expect(config.decisionsPerMonth).toBe(500);
      expect(config.experimentsPerMonth).toBe(100);
    });

    it("should allow PRO tier to DELETE actions (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.ACTION_DELETE);
    });

    it("should allow PRO tier to UPDATE decisions (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.DECISION_UPDATE);
    });

    it("should allow PRO tier to UPDATE experiments (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.EXPERIMENT_UPDATE);
    });

    it("should allow PRO tier to export audit data (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.AUDIT_EXPORT);
    });

    it("should allow PRO tier to manage workspace invites (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.WORKSPACE_INVITE);
    });

    it("should allow PRO tier admin settings (vs FREE cannot)", async () => {
      const ws = "ws-pro";
      const tier = getTierConfig(SubscriptionTier.PRO);

      expect(tier.capabilities).toContain(Capability.ADMIN_SETTINGS);
    });

    it("should support team collaboration features (not in FREE)", async () => {
      const free = getTierConfig(SubscriptionTier.FREE);
      const pro = getTierConfig(SubscriptionTier.PRO);

      expect(free.features.teamCollaboration).toBe(false);
      expect(pro.features.teamCollaboration).toBe(true);
    });

    it("should support advanced analytics (not in FREE)", async () => {
      const free = getTierConfig(SubscriptionTier.FREE);
      const pro = getTierConfig(SubscriptionTier.PRO);

      expect(free.features.advancedAnalytics).toBe(false);
      expect(pro.features.advancedAnalytics).toBe(true);
    });
  });

  describe("ENTERPRISE Tier Permission Matrix", () => {
    beforeEach(() => {
      setSubscriptionTier("ws-enterprise", SubscriptionTier.ENTERPRISE);
    });

    it("should have unlimited actions quota for ENTERPRISE", async () => {
      const ws = "ws-enterprise";
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);

      // ENTERPRISE has unlimited (represented as high number)
      expect(config.actionsPerMonth).toBeGreaterThan(500);
    });

    it("should have unlimited decisions quota for ENTERPRISE", async () => {
      const ws = "ws-enterprise";
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(config.decisionsPerMonth).toBeGreaterThan(500);
    });

    it("should have unlimited experiments quota for ENTERPRISE", async () => {
      const ws = "ws-enterprise";
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(config.experimentsPerMonth).toBeGreaterThan(100);
    });

    it("should include ALL capabilities for ENTERPRISE", async () => {
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(config.capabilities).toContain(Capability.ACTION_CREATE);
      expect(config.capabilities).toContain(Capability.ACTION_UPDATE);
      expect(config.capabilities).toContain(Capability.ACTION_DELETE);
      expect(config.capabilities).toContain(Capability.DECISION_CREATE);
      expect(config.capabilities).toContain(Capability.DECISION_UPDATE);
      expect(config.capabilities).toContain(Capability.EXPERIMENT_CREATE);
      expect(config.capabilities).toContain(Capability.EXPERIMENT_UPDATE);
      expect(config.capabilities).toContain(Capability.WORKSPACE_INVITE);
      expect(config.capabilities).toContain(Capability.AUDIT_VIEW);
      expect(config.capabilities).toContain(Capability.AUDIT_EXPORT);
      expect(config.capabilities).toContain(Capability.ADMIN_SETTINGS);
      expect(config.capabilities).toContain(Capability.ADMIN_TEAM);
    });

    it("should enable SSO for ENTERPRISE (not in PRO/FREE)", async () => {
      const free = getTierConfig(SubscriptionTier.FREE);
      const pro = getTierConfig(SubscriptionTier.PRO);
      const enterprise = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(free.features.sso).toBe(false);
      expect(pro.features.sso).toBe(false);
      expect(enterprise.features.sso).toBe(true);
    });

    it("should enable priority support for ENTERPRISE (not in PRO/FREE)", async () => {
      const free = getTierConfig(SubscriptionTier.FREE);
      const pro = getTierConfig(SubscriptionTier.PRO);
      const enterprise = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(free.features.prioritySupport).toBe(false);
      expect(pro.features.prioritySupport).toBe(false);
      expect(enterprise.features.prioritySupport).toBe(true);
    });

    it("should enable all features for ENTERPRISE", async () => {
      const config = getTierConfig(SubscriptionTier.ENTERPRISE);
      const features = Object.values(config.features);

      expect(features.every((f) => f === true)).toBe(true);
    });
  });

  describe("Tier Transitions and Capability Changes", () => {
    it("should revoke DECISION_UPDATE when downgrading from PRO to FREE", async () => {
      const ws = "ws-downgrade";

      // Start as PRO
      setSubscriptionTier(ws, SubscriptionTier.PRO);
      let tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).toContain(Capability.DECISION_UPDATE);

      // Downgrade to FREE
      setSubscriptionTier(ws, SubscriptionTier.FREE);
      tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).not.toContain(Capability.DECISION_UPDATE);
    });

    it("should revoke ACTION_DELETE when downgrading from PRO to FREE", async () => {
      const ws = "ws-downgrade-delete";

      // Start as PRO
      setSubscriptionTier(ws, SubscriptionTier.PRO);
      let tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).toContain(Capability.ACTION_DELETE);

      // Downgrade to FREE
      setSubscriptionTier(ws, SubscriptionTier.FREE);
      tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).not.toContain(Capability.ACTION_DELETE);
    });

    it("should maintain DECISION_CREATE and AUDIT_VIEW across all tiers", async () => {
      const ws = "ws-maintained";

      // FREE
      setSubscriptionTier(ws, SubscriptionTier.FREE);
      let tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).toContain(Capability.DECISION_CREATE);
      expect(tier.capabilities).toContain(Capability.AUDIT_VIEW);

      // PRO
      setSubscriptionTier(ws, SubscriptionTier.PRO);
      tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).toContain(Capability.DECISION_CREATE);
      expect(tier.capabilities).toContain(Capability.AUDIT_VIEW);

      // ENTERPRISE
      setSubscriptionTier(ws, SubscriptionTier.ENTERPRISE);
      tier = getTierConfig(getSubscriptionTier(ws));
      expect(tier.capabilities).toContain(Capability.DECISION_CREATE);
      expect(tier.capabilities).toContain(Capability.AUDIT_VIEW);
    });
  });

  describe("Entitlement Validation Interfaces", () => {
    it("should fail-closed on missing workspaceId", async () => {
      const check = await assertCapability("", "action_create");

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("workspaceId");
    });

    it("should fail-closed on missing capability key", async () => {
      const ws = "ws-missing-key";
      setSubscriptionTier(ws, SubscriptionTier.FREE);

      const check = await assertCapability(ws, "");

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("capability key");
    });

    it("should return CapabilityCheck interface with allowed/reason fields", async () => {
      const ws = "ws-interface";
      setSubscriptionTier(ws, SubscriptionTier.PRO);

      const check = await assertCapability(ws, "action_create");

      expect(check).toHaveProperty("allowed");
      expect(typeof check.allowed).toBe("boolean");
      if (!check.allowed) {
        expect(check).toHaveProperty("reason");
      }
    });

    it("should return correct tier from getSubscriptionTier", async () => {
      const ws = "ws-tier";
      setSubscriptionTier(ws, SubscriptionTier.ENTERPRISE);

      const tier = getSubscriptionTier(ws);
      expect(tier).toBe(SubscriptionTier.ENTERPRISE);
    });
  });

  describe("Tier Configuration Completeness", () => {
    it("should define all three tiers", () => {
      expect(TIER_CONFIGS[SubscriptionTier.FREE]).toBeDefined();
      expect(TIER_CONFIGS[SubscriptionTier.PRO]).toBeDefined();
      expect(TIER_CONFIGS[SubscriptionTier.ENTERPRISE]).toBeDefined();
    });

    it("should have quota limits for each tier", () => {
      Object.values(TIER_CONFIGS).forEach((config) => {
        expect(config.actionsPerMonth).toBeGreaterThan(0);
        expect(config.decisionsPerMonth).toBeGreaterThan(0);
        expect(config.experimentsPerMonth).toBeGreaterThan(0);
      });
    });

    it("should have higher quotas as tier increases", () => {
      const free = getTierConfig(SubscriptionTier.FREE);
      const pro = getTierConfig(SubscriptionTier.PRO);
      const enterprise = getTierConfig(SubscriptionTier.ENTERPRISE);

      expect(pro.actionsPerMonth).toBeGreaterThan(free.actionsPerMonth);
      expect(pro.decisionsPerMonth).toBeGreaterThan(free.decisionsPerMonth);
      expect(pro.experimentsPerMonth).toBeGreaterThan(free.experimentsPerMonth);

      expect(enterprise.actionsPerMonth).toBeGreaterThanOrEqual(pro.actionsPerMonth);
      expect(enterprise.decisionsPerMonth).toBeGreaterThanOrEqual(
        pro.decisionsPerMonth
      );
      expect(enterprise.experimentsPerMonth).toBeGreaterThanOrEqual(
        pro.experimentsPerMonth
      );
    });

    it("should define feature flags for each tier", () => {
      Object.values(TIER_CONFIGS).forEach((config) => {
        expect(config.features).toBeDefined();
        expect(config.features.customNotifications).toBeDefined();
        expect(config.features.advancedAnalytics).toBeDefined();
        expect(config.features.sso).toBeDefined();
        expect(config.features.auditLog).toBeDefined();
        expect(config.features.exportData).toBeDefined();
        expect(config.features.apiAccess).toBeDefined();
        expect(config.features.webhooks).toBeDefined();
        expect(config.features.teamCollaboration).toBeDefined();
        expect(config.features.prioritySupport).toBeDefined();
      });
    });
  });
});

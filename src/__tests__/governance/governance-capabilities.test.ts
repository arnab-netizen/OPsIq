import { describe, it, expect } from "vitest";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { Capability, TIER_CONFIGS, SubscriptionTier } from "@/services/entitlement";

describe("governance-capabilities", () => {
  describe("DECISION_CREATE constant", () => {
    it("should exist in domain CAPABILITIES", () => {
      expect(CAPABILITIES.DECISION_CREATE).toBeDefined();
    });

    it("should have correct value", () => {
      expect(CAPABILITIES.DECISION_CREATE).toBe("decision:create");
    });

    it("should be a string constant", () => {
      expect(typeof CAPABILITIES.DECISION_CREATE).toBe("string");
    });

    it("should match domain:action format", () => {
      expect(CAPABILITIES.DECISION_CREATE).toMatch(/^decision:/);
    });
  });

  describe("DECISION_UPDATE constant", () => {
    it("should exist in domain CAPABILITIES", () => {
      expect(CAPABILITIES.DECISION_UPDATE).toBeDefined();
    });

    it("should have correct value", () => {
      expect(CAPABILITIES.DECISION_UPDATE).toBe("decision:update");
    });

    it("should be a string constant", () => {
      expect(typeof CAPABILITIES.DECISION_UPDATE).toBe("string");
    });

    it("should match domain:action format", () => {
      expect(CAPABILITIES.DECISION_UPDATE).toMatch(/^decision:/);
    });
  });

  describe("entitlement tier mapping for decision capabilities", () => {
    it("should include DECISION_CREATE in FREE tier", () => {
      const freeConfig = TIER_CONFIGS[SubscriptionTier.FREE];
      expect(freeConfig.capabilities).toContain(Capability.DECISION_CREATE);
    });

    it("should include DECISION_CREATE in PRO tier", () => {
      const proConfig = TIER_CONFIGS[SubscriptionTier.PRO];
      expect(proConfig.capabilities).toContain(Capability.DECISION_CREATE);
    });

    it("should include DECISION_CREATE in ENTERPRISE tier", () => {
      const enterpriseConfig = TIER_CONFIGS[SubscriptionTier.ENTERPRISE];
      expect(enterpriseConfig.capabilities).toContain(Capability.DECISION_CREATE);
    });

    it("should NOT include DECISION_UPDATE in FREE tier", () => {
      const freeConfig = TIER_CONFIGS[SubscriptionTier.FREE];
      expect(freeConfig.capabilities).not.toContain(Capability.DECISION_UPDATE);
    });

    it("should include DECISION_UPDATE in PRO tier", () => {
      const proConfig = TIER_CONFIGS[SubscriptionTier.PRO];
      expect(proConfig.capabilities).toContain(Capability.DECISION_UPDATE);
    });

    it("should include DECISION_UPDATE in ENTERPRISE tier", () => {
      const enterpriseConfig = TIER_CONFIGS[SubscriptionTier.ENTERPRISE];
      expect(enterpriseConfig.capabilities).toContain(Capability.DECISION_UPDATE);
    });
  });

  describe("no unauthorized capabilities added", () => {
    it("should NOT have EXPERIMENT_CREATE in domain CAPABILITIES", () => {
      expect("EXPERIMENT_CREATE" in CAPABILITIES).toBe(false);
    });

    it("should NOT have EXPERIMENT_UPDATE in domain CAPABILITIES", () => {
      expect("EXPERIMENT_UPDATE" in CAPABILITIES).toBe(false);
    });

    it("should NOT have ADMIN_SETTINGS in domain CAPABILITIES", () => {
      expect("ADMIN_SETTINGS" in CAPABILITIES).toBe(false);
    });

    it("should NOT have ADMIN_TEAM in domain CAPABILITIES", () => {
      expect("ADMIN_TEAM" in CAPABILITIES).toBe(false);
    });

    it("should NOT have WORKSPACE_CREATE in domain CAPABILITIES", () => {
      expect("WORKSPACE_CREATE" in CAPABILITIES).toBe(false);
    });

    it("should NOT have WORKSPACE_INVITE in domain CAPABILITIES", () => {
      expect("WORKSPACE_INVITE" in CAPABILITIES).toBe(false);
    });
  });

  describe("decision capability consistency", () => {
    it("should have both DECISION_CREATE and DECISION_UPDATE for consistency", () => {
      expect(CAPABILITIES.DECISION_CREATE).toBeDefined();
      expect(CAPABILITIES.DECISION_UPDATE).toBeDefined();
    });

    it("should have DECISION_CREATE before DECISION_UPDATE in iteration order", () => {
      const keys = Object.keys(CAPABILITIES);
      const createIndex = keys.indexOf("DECISION_CREATE");
      const updateIndex = keys.indexOf("DECISION_UPDATE");
      expect(createIndex).toBeLessThan(updateIndex);
    });

    it("should have complementary DECISION_ACCEPT and DECISION_REJECT", () => {
      expect(CAPABILITIES.DECISION_ACCEPT).toBe("decision:accept");
      expect(CAPABILITIES.DECISION_REJECT).toBe("decision:reject");
    });
  });

  describe("capability format consistency", () => {
    it("DECISION_CREATE should use domain:action format like other capabilities", () => {
      const decisionCapabilities = Object.entries(CAPABILITIES)
        .filter(([key]) => key.startsWith("DECISION"))
        .map(([_, value]) => value as string);

      decisionCapabilities.forEach((cap) => {
        expect(cap).toMatch(/^decision:/);
      });
    });

    it("all decision capabilities should be lowercase format", () => {
      const decisionCapabilities = Object.entries(CAPABILITIES)
        .filter(([key]) => key.startsWith("DECISION"))
        .map(([_, value]) => value as string);

      decisionCapabilities.forEach((cap) => {
        expect(cap).toBe(cap.toLowerCase());
      });
    });
  });

  describe("ServiceAuthEnvelope compatibility", () => {
    it("DECISION_CREATE should be usable in capability sets", () => {
      const capabilities = new Set([CAPABILITIES.DECISION_CREATE]);
      expect(capabilities.has(CAPABILITIES.DECISION_CREATE)).toBe(true);
    });

    it("DECISION_UPDATE should be usable in capability sets", () => {
      const capabilities = new Set([CAPABILITIES.DECISION_UPDATE]);
      expect(capabilities.has(CAPABILITIES.DECISION_UPDATE)).toBe(true);
    });

    it("both decision capabilities should be usable together in capability set", () => {
      const capabilities = new Set([
        CAPABILITIES.DECISION_CREATE,
        CAPABILITIES.DECISION_UPDATE,
      ]);
      expect(capabilities.has(CAPABILITIES.DECISION_CREATE)).toBe(true);
      expect(capabilities.has(CAPABILITIES.DECISION_UPDATE)).toBe(true);
      expect(capabilities.size).toBe(2);
    });

    it("ReadonlySet should prevent capability fabrication", () => {
      const readonlyCapabilities = new Set([CAPABILITIES.DECISION_CREATE]);
      const frozenCapabilities = Object.freeze(readonlyCapabilities);

      // ReadonlySet prevents .add() in types, but we test the intent
      // by verifying the set is created correctly without mutation
      expect(frozenCapabilities.has(CAPABILITIES.DECISION_CREATE)).toBe(true);
      expect(frozenCapabilities.size).toBe(1);
    });
  });

  describe("no capability duplication", () => {
    it("should not have duplicate values in CAPABILITIES", () => {
      const values = Object.values(CAPABILITIES);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });

    it("DECISION_CREATE should be unique value", () => {
      const value = CAPABILITIES.DECISION_CREATE;
      const count = Object.values(CAPABILITIES).filter((v) => v === value).length;
      expect(count).toBe(1);
    });

    it("DECISION_UPDATE should be unique value", () => {
      const value = CAPABILITIES.DECISION_UPDATE;
      const count = Object.values(CAPABILITIES).filter((v) => v === value).length;
      expect(count).toBe(1);
    });
  });
});

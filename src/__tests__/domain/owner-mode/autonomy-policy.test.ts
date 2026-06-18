import { describe, it, expect } from "vitest";
import {
  AUTONOMY_POLICIES,
  ACCESS_POLICIES,
  canExecuteAutonomously,
  canActExternal,
  canExecuteInternalAction,
  validateCapabilityAutonomyConstraints,
  auditRegistryAutonomyConstraints,
  getApprovalGatedCapabilities,
  getExternallyProhibitedCapabilities,
  assertPhase3Invariants,
} from "@/domain/owner-mode/autonomy-policy";
import {
  ownerModeCapabilityRegistry,
  getCapabilityByName,
  type AutonomyLevel,
  type AccessLevel,
} from "@/domain/owner-mode/capability-registry";

// ─── Autonomy policy table completeness ──────────────────────────────────────

describe("AUTONOMY_POLICIES — table completeness", () => {
  const REQUIRED_LEVELS: AutonomyLevel[] = [
    "observe_only",
    "advise_only",
    "draft_action",
    "act_with_owner_approval",
    "autonomous_action_prohibited",
  ];

  it("defines a policy for every required autonomy level", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(AUTONOMY_POLICIES[level]).toBeDefined();
    }
  });

  it("no autonomy level allows autonomous execution", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(AUTONOMY_POLICIES[level].may_execute_autonomously).toBe(false);
    }
  });

  it("no autonomy level allows external action", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(AUTONOMY_POLICIES[level].may_act_external).toBe(false);
    }
  });

  it("only act_with_owner_approval may act on owner approval", () => {
    for (const level of REQUIRED_LEVELS) {
      const expected = level === "act_with_owner_approval";
      expect(AUTONOMY_POLICIES[level].may_act_on_owner_approval).toBe(expected);
    }
  });

  it("observe_only may not write internal records", () => {
    expect(AUTONOMY_POLICIES["observe_only"].may_write_internal).toBe(false);
  });

  it("autonomous_action_prohibited denies all permissions", () => {
    const policy = AUTONOMY_POLICIES["autonomous_action_prohibited"];
    expect(policy.may_read).toBe(false);
    expect(policy.may_write_internal).toBe(false);
    expect(policy.may_draft).toBe(false);
    expect(policy.may_act_on_owner_approval).toBe(false);
    expect(policy.may_execute_autonomously).toBe(false);
    expect(policy.may_act_external).toBe(false);
  });

  it("each policy has a non-empty description", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(AUTONOMY_POLICIES[level].description.length).toBeGreaterThan(10);
    }
  });
});

// ─── Access policy table completeness ────────────────────────────────────────

describe("ACCESS_POLICIES — table completeness", () => {
  const REQUIRED_LEVELS: AccessLevel[] = [
    "read_only",
    "write_internal_tracking_only",
    "write_owner_approved_internal_action",
    "external_action_prohibited",
  ];

  it("defines a policy for every required access level", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(ACCESS_POLICIES[level]).toBeDefined();
    }
  });

  it("no access level allows external writes", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(ACCESS_POLICIES[level].may_write_external).toBe(false);
    }
  });

  it("read_only denies all writes", () => {
    const p = ACCESS_POLICIES["read_only"];
    expect(p.may_write_internal).toBe(false);
    expect(p.may_write_owner_approved).toBe(false);
    expect(p.may_write_external).toBe(false);
  });

  it("external_action_prohibited denies reads and all writes", () => {
    const p = ACCESS_POLICIES["external_action_prohibited"];
    expect(p.may_read).toBe(false);
    expect(p.may_write_internal).toBe(false);
    expect(p.may_write_owner_approved).toBe(false);
    expect(p.may_write_external).toBe(false);
  });

  it("write_owner_approved_internal_action still prohibits external writes", () => {
    expect(
      ACCESS_POLICIES["write_owner_approved_internal_action"].may_write_external
    ).toBe(false);
  });

  it("each access policy has a non-empty description", () => {
    for (const level of REQUIRED_LEVELS) {
      expect(ACCESS_POLICIES[level].description.length).toBeGreaterThan(10);
    }
  });
});

// ─── Enforcement functions: no module defaults to autonomous action ───────────

describe("canExecuteAutonomously — Phase 3 hard rule", () => {
  it("returns false for every capability in the registry", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(canExecuteAutonomously(cap)).toBe(false);
    }
  });
});

// ─── Enforcement functions: external action is prohibited ────────────────────

describe("canActExternal — Phase 3 hard rule", () => {
  it("returns false for every capability in the registry", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(canActExternal(cap)).toBe(false);
    }
  });
});

// ─── Enforcement functions: owner approval required for state transitions ─────

describe("canExecuteInternalAction — owner approval gate", () => {
  it("returns true only for act_with_owner_approval capabilities", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      const result = canExecuteInternalAction(cap);
      if (cap.autonomy_level === "act_with_owner_approval") {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    }
  });

  it("owner_decision_capture requires internal action with owner approval", () => {
    const cap = getCapabilityByName("owner_decision_capture")!;
    expect(canExecuteInternalAction(cap)).toBe(true);
  });

  it("action_tracking requires internal action with owner approval", () => {
    const cap = getCapabilityByName("action_tracking")!;
    expect(canExecuteInternalAction(cap)).toBe(true);
  });

  it("diagnosis_generation cannot execute internal action (advise_only)", () => {
    const cap = getCapabilityByName("diagnosis_generation")!;
    expect(canExecuteInternalAction(cap)).toBe(false);
  });

  it("input_quality_assessment cannot execute internal action (observe_only)", () => {
    const cap = getCapabilityByName("input_quality_assessment")!;
    expect(canExecuteInternalAction(cap)).toBe(false);
  });
});

// ─── High-impact recommendation cannot auto-execute ──────────────────────────

describe("high-impact recommendation cannot auto-execute", () => {
  it("recommendation_generation is advise_only and cannot execute", () => {
    const cap = getCapabilityByName("recommendation_generation")!;
    expect(cap.autonomy_level).toBe("advise_only");
    expect(canExecuteAutonomously(cap)).toBe(false);
    expect(canExecuteInternalAction(cap)).toBe(false);
  });

  it("recommendation_verification is advise_only and cannot execute", () => {
    const cap = getCapabilityByName("recommendation_verification")!;
    expect(cap.autonomy_level).toBe("advise_only");
    expect(canExecuteAutonomously(cap)).toBe(false);
  });

  it("no advise_only capability can auto-execute", () => {
    const adviseCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.autonomy_level === "advise_only"
    );
    expect(adviseCaps.length).toBeGreaterThan(0);
    for (const cap of adviseCaps) {
      expect(canExecuteAutonomously(cap)).toBe(false);
      expect(canActExternal(cap)).toBe(false);
    }
  });
});

// ─── Validation and audit functions ──────────────────────────────────────────

describe("validateCapabilityAutonomyConstraints", () => {
  it("returns empty array for all registered capabilities (no violations)", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      const violations = validateCapabilityAutonomyConstraints(cap);
      expect(violations).toHaveLength(0);
    }
  });

  it("detects a violation when autonomy requires approval but flag is false", () => {
    const fakeCap = {
      ...getCapabilityByName("action_tracking")!,
      owner_approval_required: false,
    };
    const violations = validateCapabilityAutonomyConstraints(fakeCap);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/owner_approval_required/);
  });
});

describe("auditRegistryAutonomyConstraints", () => {
  it("returns a map with one entry per capability", () => {
    const result = auditRegistryAutonomyConstraints();
    expect(result.size).toBe(ownerModeCapabilityRegistry.length);
  });

  it("all entries have empty violation lists (full registry is clean)", () => {
    const result = auditRegistryAutonomyConstraints();
    for (const [id, violations] of result) {
      expect(violations).toHaveLength(0);
    }
  });
});

describe("assertPhase3Invariants", () => {
  it("does not throw for the current registry", () => {
    expect(() => assertPhase3Invariants()).not.toThrow();
  });
});

// ─── Helper functions ─────────────────────────────────────────────────────────

describe("getApprovalGatedCapabilities", () => {
  it("returns only act_with_owner_approval capabilities", () => {
    const caps = getApprovalGatedCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      expect(cap.autonomy_level).toBe("act_with_owner_approval");
    }
  });

  it("includes owner_decision_capture and action_tracking", () => {
    const names = getApprovalGatedCapabilities().map((c) => c.capability_name);
    expect(names).toContain("owner_decision_capture");
    expect(names).toContain("action_tracking");
  });
});

describe("getExternallyProhibitedCapabilities", () => {
  it("returns only external_action_prohibited capabilities", () => {
    const caps = getExternallyProhibitedCapabilities();
    for (const cap of caps) {
      expect(cap.access_level).toBe("external_action_prohibited");
    }
  });
});

// ─── Cross-cutting: access level maps to exactly one mutation surface ─────────

describe("access level ↔ mutation surface mapping", () => {
  it("read_only capabilities have no write permission in any policy", () => {
    const readOnlyCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.access_level === "read_only"
    );
    expect(readOnlyCaps.length).toBeGreaterThan(0);
    for (const cap of readOnlyCaps) {
      const p = ACCESS_POLICIES[cap.access_level];
      expect(p.may_write_internal).toBe(false);
      expect(p.may_write_owner_approved).toBe(false);
      expect(p.may_write_external).toBe(false);
    }
  });

  it("write_internal_tracking_only never permits owner-approved or external writes", () => {
    const trackingCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.access_level === "write_internal_tracking_only"
    );
    expect(trackingCaps.length).toBeGreaterThan(0);
    for (const cap of trackingCaps) {
      const p = ACCESS_POLICIES[cap.access_level];
      expect(p.may_write_owner_approved).toBe(false);
      expect(p.may_write_external).toBe(false);
    }
  });

  it("write_owner_approved_internal_action never permits external writes", () => {
    const approvedCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.access_level === "write_owner_approved_internal_action"
    );
    expect(approvedCaps.length).toBeGreaterThan(0);
    for (const cap of approvedCaps) {
      const p = ACCESS_POLICIES[cap.access_level];
      expect(p.may_write_external).toBe(false);
    }
  });
});

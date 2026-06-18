import { describe, it, expect } from "vitest";
import {
  ownerModeCapabilityRegistry,
  getCapabilityById,
  getCapabilityByName,
  getOwnerApprovalRequired,
  getAiAllowedCapabilities,
  type AiProhibitedRole,
} from "@/domain/owner-mode/capability-registry";

const REQUIRED_CAPABILITY_NAMES = [
  "input_quality_assessment",
  "diagnosis_generation",
  "recommendation_generation",
  "recommendation_verification",
  "owner_decision_capture",
  "action_tracking",
  "evidence_verification",
  "outcome_tracking",
  "failure_adjudication",
  "causal_attribution",
  "reassessment_generation",
  "learning_eligibility_gate",
  "decision_memory",
  "business_timeline",
  "dashboard_summarization",
];

const ALL_PROHIBITED_ROLES: AiProhibitedRole[] = [
  "decide",
  "execute",
  "verify_evidence",
  "approve",
  "admit_learning",
  "control_status",
  "override_rules",
  "override_constraints",
  "bypass_review",
  "train_self",
  "act_external",
];

describe("ownerModeCapabilityRegistry — existence and completeness", () => {
  it("contains exactly 15 capabilities", () => {
    expect(ownerModeCapabilityRegistry).toHaveLength(15);
  });

  it("contains all 15 required capabilities by name", () => {
    const names = ownerModeCapabilityRegistry.map((c) => c.capability_name);
    for (const required of REQUIRED_CAPABILITY_NAMES) {
      expect(names).toContain(required);
    }
  });

  it("all IDs are unique", () => {
    const ids = ownerModeCapabilityRegistry.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all capability_names are unique", () => {
    const names = ownerModeCapabilityRegistry.map((c) => c.capability_name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("ownerModeCapabilityRegistry — required fields present", () => {
  for (const cap of ownerModeCapabilityRegistry) {
    it(`${cap.id} has autonomy_level defined`, () => {
      expect(cap.autonomy_level).toBeDefined();
      expect(typeof cap.autonomy_level).toBe("string");
    });

    it(`${cap.id} has risk_level defined`, () => {
      expect(cap.risk_level).toBeDefined();
      expect(typeof cap.risk_level).toBe("string");
    });

    it(`${cap.id} has ai_allowed flag`, () => {
      expect(typeof cap.ai_allowed).toBe("boolean");
    });

    it(`${cap.id} has rollback_path`, () => {
      expect(cap.rollback_path).toBeTruthy();
    });

    it(`${cap.id} has control_path`, () => {
      expect(cap.control_path).toBeTruthy();
    });

    it(`${cap.id} has description`, () => {
      expect(cap.description).toBeTruthy();
    });
  }
});

describe("ownerModeCapabilityRegistry — AI control constraints", () => {
  it("no capability defaults to autonomous action", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(cap.autonomy_level).not.toBe("autonomous_action");
      expect(cap.autonomy_level).not.toBe("fully_autonomous");
    }
  });

  it("no capability allows autonomous_action_prohibited as default autonomy", () => {
    // autonomous_action_prohibited means AI is explicitly blocked from acting — correct posture
    // We verify no capability is mis-classified as allowing external autonomous action
    for (const cap of ownerModeCapabilityRegistry) {
      const isWriteExternal = cap.access_level === "external_action_prohibited";
      if (isWriteExternal) {
        expect(cap.autonomy_level).not.toBe("autonomous_action_prohibited");
      }
    }
  });

  it("no capability marks AI as source_of_truth (ai_allowed never grants decide/execute)", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      // ai_allowed_roles must never contain decide or execute
      expect(cap.ai_allowed_roles).not.toContain("decide");
      expect(cap.ai_allowed_roles).not.toContain("execute");
    }
  });

  it("ai_prohibited_roles is non-empty for every capability", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(cap.ai_prohibited_roles.length).toBeGreaterThan(0);
    }
  });

  it("every capability prohibits all core AI control roles", () => {
    const mustProhibit: AiProhibitedRole[] = [
      "decide",
      "execute",
      "approve",
      "control_status",
      "override_rules",
      "override_constraints",
      "bypass_review",
    ];
    for (const cap of ownerModeCapabilityRegistry) {
      for (const role of mustProhibit) {
        expect(cap.ai_prohibited_roles).toContain(role);
      }
    }
  });

  it("every capability has the full ALL_PROHIBITED set in ai_prohibited_roles", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      for (const role of ALL_PROHIBITED_ROLES) {
        expect(cap.ai_prohibited_roles).toContain(role);
      }
    }
  });

  it("ai_allowed_roles is empty when ai_allowed is false", () => {
    const noAiCaps = ownerModeCapabilityRegistry.filter((c) => !c.ai_allowed);
    for (const cap of noAiCaps) {
      expect(cap.ai_allowed_roles).toHaveLength(0);
    }
  });

  it("verify_evidence is never in ai_allowed_roles (AI cannot verify evidence)", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(cap.ai_allowed_roles).not.toContain("verify_evidence");
    }
  });

  it("admit_learning is never in ai_allowed_roles (AI cannot self-admit learning)", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(cap.ai_allowed_roles).not.toContain("admit_learning");
    }
  });

  it("status transitions are not controlled by AI in any capability (control_status prohibited)", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(cap.ai_prohibited_roles).toContain("control_status");
      expect(cap.ai_allowed_roles).not.toContain("control_status");
    }
  });
});

describe("ownerModeCapabilityRegistry — owner approval and risk", () => {
  it("at least one critical-risk capability exists in the registry", () => {
    const criticalCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.risk_level === "critical"
    );
    expect(criticalCaps.length).toBeGreaterThan(0);
  });

  it("critical write-to-owner-approved capabilities require owner_approval_required = true", () => {
    const criticalOwnerWrite = ownerModeCapabilityRegistry.filter(
      (c) =>
        c.risk_level === "critical" &&
        c.access_level === "write_owner_approved_internal_action"
    );
    for (const cap of criticalOwnerWrite) {
      expect(cap.owner_approval_required).toBe(true);
    }
  });

  it("owner_decision_capture requires owner approval", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "owner_decision_capture"
    );
    expect(cap?.owner_approval_required).toBe(true);
  });

  it("learning_eligibility_gate requires owner approval", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "learning_eligibility_gate"
    );
    expect(cap?.owner_approval_required).toBe(true);
  });

  it("non-read-only capabilities have rollback_path defined", () => {
    const nonReadOnly = ownerModeCapabilityRegistry.filter(
      (c) => c.access_level !== "read_only"
    );
    for (const cap of nonReadOnly) {
      expect(cap.rollback_path.length).toBeGreaterThan(10);
    }
  });

  it("act_with_owner_approval autonomy always has owner_approval_required = true", () => {
    const actCaps = ownerModeCapabilityRegistry.filter(
      (c) => c.autonomy_level === "act_with_owner_approval"
    );
    expect(actCaps.length).toBeGreaterThan(0);
    for (const cap of actCaps) {
      expect(cap.owner_approval_required).toBe(true);
    }
  });
});

describe("ownerModeCapabilityRegistry — specific capability properties", () => {
  it("input_quality_assessment is read_only and observe_only", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "input_quality_assessment"
    );
    expect(cap?.access_level).toBe("read_only");
    expect(cap?.autonomy_level).toBe("observe_only");
  });

  it("owner_decision_capture has ai_allowed = false", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "owner_decision_capture"
    );
    expect(cap?.ai_allowed).toBe(false);
  });

  it("learning_eligibility_gate has ai_allowed = false", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "learning_eligibility_gate"
    );
    expect(cap?.ai_allowed).toBe(false);
  });

  it("dashboard_summarization is read_only", () => {
    const cap = ownerModeCapabilityRegistry.find(
      (c) => c.capability_name === "dashboard_summarization"
    );
    expect(cap?.access_level).toBe("read_only");
  });
});

describe("lookup helpers", () => {
  it("getCapabilityById returns correct capability", () => {
    const cap = getCapabilityById("CAP-001");
    expect(cap?.capability_name).toBe("input_quality_assessment");
  });

  it("getCapabilityById returns undefined for unknown ID", () => {
    expect(getCapabilityById("CAP-999")).toBeUndefined();
  });

  it("getCapabilityByName returns correct capability", () => {
    const cap = getCapabilityByName("diagnosis_generation");
    expect(cap?.id).toBe("CAP-002");
  });

  it("getCapabilityByName returns undefined for unknown name", () => {
    expect(getCapabilityByName("nonexistent")).toBeUndefined();
  });

  it("getOwnerApprovalRequired returns only approval-required capabilities", () => {
    const caps = getOwnerApprovalRequired();
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      expect(cap.owner_approval_required).toBe(true);
    }
  });

  it("getAiAllowedCapabilities returns only ai_allowed=true capabilities", () => {
    const caps = getAiAllowedCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      expect(cap.ai_allowed).toBe(true);
    }
  });

  it("all 15 IDs are findable by getCapabilityById", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(getCapabilityById(cap.id)).toBeDefined();
    }
  });

  it("all 15 names are findable by getCapabilityByName", () => {
    for (const cap of ownerModeCapabilityRegistry) {
      expect(getCapabilityByName(cap.capability_name)).toBeDefined();
    }
  });
});

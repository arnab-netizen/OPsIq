/**
 * Approval Threshold / Auto-Action Policy Engine (pure).
 *
 * Exercises the default governance policy: high-harm/irreversible actions are NEVER_AUTO, material decisions
 * require OWNER, routine work MANAGER, safe reversible work AUTO_ALLOWED, and unclear ones NEEDS_DATA; the
 * low-confidence-high-impact escalation, the "thin data never downgrades a high-harm action" rule, the
 * capability-gap hold + systemCapabilityRecommendation, ordering, workspace scoping, summary counts, and the
 * safety guarantees (no accusatory / HR-discipline prose, no hidden score, no fabricated money in prose).
 */
import { describe, it, expect } from "vitest";
import {
  buildApprovalPolicy,
  type ApprovalPolicyInput,
  type PolicyActionCandidate,
  type PolicyActionType,
} from "@/domain/owner-mode/approval-threshold-policy";

const AT = "2026-07-06T00:00:00.000Z";
const WS = "ws-1";

function candidate(over: Partial<PolicyActionCandidate> = {}): PolicyActionCandidate {
  return {
    actionKey: "k1", actionType: "DRAFT_CHECKLIST", title: "Draft a checklist", riskCategory: "OPERATIONAL",
    impactLevel: "LOW", confidence: "HIGH", evidenceComplete: true, reversible: true,
    supportingEvidenceIds: [], sourceProcessFinding: null, missingData: [], ...over,
  };
}
const input = (candidates: PolicyActionCandidate[]): ApprovalPolicyInput => ({ candidates });
const build = (c: PolicyActionCandidate[], ws = WS) => buildApprovalPolicy(input(c), ws, AT);
const only = (c: PolicyActionCandidate) => build([c]).decisions[0];

const NEVER_AUTO_TYPES: PolicyActionType[] = [
  "STAFF_TERMINATION", "PAYROLL_CHANGE", "MISCONDUCT_ACCUSATION", "DELETE_AUDIT_RECORD",
  "CONTRACT_COMMITMENT", "LOAN_COMMITMENT", "SUPPRESS_RISK", "SCALING_ON_UNVALIDATED_DEMAND",
  "LEGAL_TERMS_CHANGE", "STAFF_DISCIPLINARY_ACTION",
];
const OWNER_TYPES: PolicyActionType[] = [
  "PRICING_CHANGE", "REFUND_ABOVE_THRESHOLD", "DISCOUNT_GRANT", "B2B_CONTRACT_TERMS",
  "LARGE_SPEND", "LEGAL_MATTER_REVIEW", "REPUTATION_RESPONSE",
];
const AUTO_TYPES: PolicyActionType[] = [
  "REQUEST_MISSING_PROOF", "COLLAPSE_DUPLICATE_CLEARED_ALERTS", "DRAFT_CHECKLIST", "PROPOSE_TRAINING",
  "OPEN_REASSESSMENT", "FLAG_OVERDUE_ITEM", "COLLECT_DATA", "DRAFT_ONLY_RECOMMENDATION",
];

describe("approval-threshold-policy", () => {
  it("1. every high-harm/irreversible action is NEVER_AUTO and blocked", () => {
    for (const t of NEVER_AUTO_TYPES) {
      const d = only(candidate({ actionType: t, riskCategory: "STAFF", impactLevel: "HIGH" }));
      expect(d.approvalDecision).toBe("NEVER_AUTO");
      expect(d.blocked).toBe(true);
      expect(d.autoExecutable).toBe(false);
      expect(d.requiredApprovalLevel).toBe("OWNER");
    }
  });

  it("2. every material action requires OWNER approval and is not auto-executable", () => {
    for (const t of OWNER_TYPES) {
      const d = only(candidate({ actionType: t, riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }));
      expect(d.approvalDecision).toBe("OWNER_APPROVAL_REQUIRED");
      expect(d.autoExecutable).toBe(false);
      expect(d.blocked).toBe(false);
      expect(d.requiredApprovalLevel).toBe("OWNER");
    }
  });

  it("3. routine coaching / minor process changes require MANAGER approval", () => {
    for (const t of ["ROUTINE_COACHING", "MINOR_PROCESS_CHANGE"] as PolicyActionType[]) {
      const d = only(candidate({ actionType: t, riskCategory: "OPERATIONAL", impactLevel: "LOW" }));
      expect(d.approvalDecision).toBe("MANAGER_APPROVAL_REQUIRED");
      expect(d.requiredApprovalLevel).toBe("MANAGER");
      expect(d.autoExecutable).toBe(false);
    }
  });

  it("4. every safe, reversible, no-commitment action is AUTO_ALLOWED", () => {
    for (const t of AUTO_TYPES) {
      const d = only(candidate({ actionType: t, riskCategory: "OPERATIONAL", impactLevel: "LOW" }));
      expect(d.approvalDecision).toBe("AUTO_ALLOWED");
      expect(d.autoExecutable).toBe(true);
      expect(d.blocked).toBe(false);
      expect(d.requiredApprovalLevel).toBe("STAFF");
    }
  });

  it("5. unknown action type yields NEEDS_DATA", () => {
    const d = only(candidate({ actionType: "UNKNOWN", riskCategory: "UNKNOWN", impactLevel: "UNKNOWN" }));
    expect(d.approvalDecision).toBe("NEEDS_DATA");
    expect(d.requiredApprovalLevel).toBe("NONE");
    expect(d.missingData.length).toBeGreaterThan(0);
  });

  it("6. an unknown risk category yields NEEDS_DATA even for an otherwise-auto action", () => {
    const d = only(candidate({ actionType: "DRAFT_CHECKLIST", riskCategory: "UNKNOWN" }));
    expect(d.approvalDecision).toBe("NEEDS_DATA");
  });

  it("7. incomplete evidence yields NEEDS_DATA for a non-high-harm action", () => {
    const d = only(candidate({ actionType: "MINOR_PROCESS_CHANGE", evidenceComplete: false }));
    expect(d.approvalDecision).toBe("NEEDS_DATA");
  });

  it("8. a high-harm action stays NEVER_AUTO even with thin/incomplete data (never downgraded)", () => {
    const d = only(candidate({ actionType: "STAFF_TERMINATION", riskCategory: "UNKNOWN", impactLevel: "UNKNOWN", confidence: "NEEDS_DATA", evidenceComplete: false }));
    expect(d.approvalDecision).toBe("NEVER_AUTO");
    expect(d.blocked).toBe(true);
  });

  it("9. low confidence + high impact escalates a routine MANAGER action to OWNER", () => {
    const d = only(candidate({ actionType: "MINOR_PROCESS_CHANGE", impactLevel: "HIGH", confidence: "LOW" }));
    expect(d.approvalDecision).toBe("OWNER_APPROVAL_REQUIRED");
    expect(d.policyBasis).toBe("LOW_CONFIDENCE_HIGH_IMPACT_ESCALATION");
  });

  it("10. low confidence + high impact escalates a safe AUTO action to OWNER", () => {
    const d = only(candidate({ actionType: "DRAFT_ONLY_RECOMMENDATION", impactLevel: "HIGH", confidence: "LOW" }));
    expect(d.approvalDecision).toBe("OWNER_APPROVAL_REQUIRED");
    expect(d.autoExecutable).toBe(false);
  });

  it("11. a refund-above-threshold surfaces a capability gap + a concrete system recommendation", () => {
    const d = only(candidate({ actionType: "REFUND_ABOVE_THRESHOLD", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }));
    expect(d.capabilityGap).toBe(true);
    expect(d.missingCapabilityType).toBe("REFUND_RECONCILIATION");
    expect(d.systemCapabilityRecommendation).toBeTruthy();
    expect(d.policyBasis).toBe("CAPABILITY_GAP_HOLD");
    // The gap never turns into automation.
    expect(d.autoExecutable).toBe(false);
  });

  it("12. a pricing change flags a margin-simulation capability gap", () => {
    const d = only(candidate({ actionType: "PRICING_CHANGE", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }));
    expect(d.missingCapabilityType).toBe("MARGIN_SIMULATION");
    expect(d.capabilityGap).toBe(true);
  });

  it("13. an owner action with no capability gap has null recommendation and HIGH_RISK basis", () => {
    const d = only(candidate({ actionType: "REPUTATION_RESPONSE", riskCategory: "REPUTATION", impactLevel: "MEDIUM" }));
    expect(d.capabilityGap).toBe(false);
    expect(d.missingCapabilityType).toBeNull();
    expect(d.systemCapabilityRecommendation).toBeNull();
    expect(d.policyBasis).toBe("HIGH_RISK_OWNER_ACTION");
  });

  it("14. capabilityRecommendations are de-duplicated across decisions", () => {
    const r = build([
      candidate({ actionKey: "a", actionType: "CONTRACT_COMMITMENT", riskCategory: "LEGAL", impactLevel: "HIGH" }),
      candidate({ actionKey: "b", actionType: "B2B_CONTRACT_TERMS", riskCategory: "LEGAL", impactLevel: "HIGH" }),
    ]);
    // Both map to CONTRACT_TERMS_REGISTRY → a single de-duplicated recommendation string.
    expect(r.capabilityRecommendations.length).toBe(1);
  });

  it("15. summary counts each decision class", () => {
    const r = build([
      candidate({ actionKey: "n", actionType: "STAFF_TERMINATION", riskCategory: "STAFF", impactLevel: "HIGH" }),
      candidate({ actionKey: "o", actionType: "PRICING_CHANGE", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }),
      candidate({ actionKey: "m", actionType: "ROUTINE_COACHING", riskCategory: "OPERATIONAL", impactLevel: "LOW" }),
      candidate({ actionKey: "a", actionType: "DRAFT_CHECKLIST", riskCategory: "OPERATIONAL", impactLevel: "LOW" }),
      candidate({ actionKey: "d", actionType: "UNKNOWN", riskCategory: "UNKNOWN", impactLevel: "UNKNOWN" }),
    ]);
    expect(r.summary).toEqual({ autoAllowed: 1, managerRequired: 1, ownerRequired: 1, neverAuto: 1, needsData: 1 });
  });

  it("16. decisions are ordered most-restrictive first (NEVER_AUTO → OWNER → NEEDS_DATA → MANAGER → AUTO)", () => {
    const r = build([
      candidate({ actionKey: "a", actionType: "DRAFT_CHECKLIST" }),
      candidate({ actionKey: "m", actionType: "ROUTINE_COACHING" }),
      candidate({ actionKey: "d", actionType: "UNKNOWN", riskCategory: "UNKNOWN", impactLevel: "UNKNOWN" }),
      candidate({ actionKey: "o", actionType: "LARGE_SPEND", riskCategory: "FINANCIAL", impactLevel: "HIGH" }),
      candidate({ actionKey: "n", actionType: "DELETE_AUDIT_RECORD", riskCategory: "DATA_INTEGRITY", impactLevel: "HIGH" }),
    ]);
    expect(r.decisions.map((d) => d.approvalDecision)).toEqual([
      "NEVER_AUTO", "OWNER_APPROVAL_REQUIRED", "NEEDS_DATA", "MANAGER_APPROVAL_REQUIRED", "AUTO_ALLOWED",
    ]);
    expect(r.topDecision!.approvalDecision).toBe("NEVER_AUTO");
  });

  it("17. workspace scoping: every decision carries the workspace and cannot contaminate another", () => {
    const r = build([candidate({ actionType: "PRICING_CHANGE", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" })], "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.decisions.every((d) => d.workspaceId === "ws-2")).toBe(true);
  });

  it("18. empty input produces no decisions, a null top, and zeroed summary", () => {
    const r = build([]);
    expect(r.decisions).toHaveLength(0);
    expect(r.topDecision).toBeNull();
    expect(r.summary).toEqual({ autoAllowed: 0, managerRequired: 0, ownerRequired: 0, neverAuto: 0, needsData: 0 });
    expect(r.capabilityRecommendations).toHaveLength(0);
  });

  it("19. every decision carries a non-empty rationale and risk guardrail", () => {
    const r = build([
      candidate({ actionKey: "n", actionType: "PAYROLL_CHANGE", riskCategory: "STAFF", impactLevel: "HIGH" }),
      candidate({ actionKey: "o", actionType: "REFUND_ABOVE_THRESHOLD", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }),
      candidate({ actionKey: "a", actionType: "FLAG_OVERDUE_ITEM" }),
    ]);
    expect(r.decisions.every((d) => d.rationale.length > 10 && d.riskGuardrail.length > 10)).toBe(true);
  });

  it("20. no fabricated money figure appears in any generated rationale/guardrail/recommendation", () => {
    const r = build([
      candidate({ actionType: "LARGE_SPEND", riskCategory: "FINANCIAL", impactLevel: "HIGH" }),
      candidate({ actionKey: "b", actionType: "REFUND_ABOVE_THRESHOLD", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }),
    ]);
    for (const d of r.decisions) {
      const prose = `${d.rationale} ${d.riskGuardrail} ${d.systemCapabilityRecommendation ?? ""}`;
      expect(prose).not.toMatch(/[$£€]\s?\d/);
      expect(prose).not.toMatch(/\d+\s*(dollars|pounds|euros|rupees)/i);
    }
  });

  it("21. no accusatory / HR-discipline / negligence prose in generated text (enum identifiers aside)", () => {
    const r = build(NEVER_AUTO_TYPES.map((t, i) => candidate({ actionKey: `k${i}`, actionType: t, riskCategory: "STAFF", impactLevel: "HIGH" })));
    for (const d of r.decisions) {
      const prose = `${d.rationale} ${d.riskGuardrail} ${d.systemCapabilityRecommendation ?? ""}`.toLowerCase();
      expect(prose).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
      expect(prose).not.toMatch(/\b(fire|fired|firing|terminate|payroll|salary|discipline|disciplinary|punish|suspend)\b/);
      expect(prose).not.toMatch(/hidden\s*score/);
    }
  });

  it("22. NEVER_AUTO for a misconduct pattern is neutral: prepares context, never accuses", () => {
    const d = only(candidate({ actionType: "MISCONDUCT_ACCUSATION", riskCategory: "STAFF", impactLevel: "HIGH" }));
    expect(d.approvalDecision).toBe("NEVER_AUTO");
    expect(d.missingCapabilityType).toBe("IDENTITY_EVIDENCE_CHAIN");
    // The capability gap on a never-auto action still records the missing capability + recommendation.
    expect(d.capabilityGap).toBe(true);
    expect(d.rationale.toLowerCase()).not.toMatch(/accus|guilty|fraud/);
  });

  it("23. autoExecutable is true only for AUTO_ALLOWED and never for owner/manager/never/needs-data", () => {
    const r = build([
      candidate({ actionKey: "a", actionType: "OPEN_REASSESSMENT" }),
      candidate({ actionKey: "o", actionType: "DISCOUNT_GRANT", riskCategory: "FINANCIAL", impactLevel: "MEDIUM" }),
      candidate({ actionKey: "m", actionType: "ROUTINE_COACHING" }),
      candidate({ actionKey: "n", actionType: "LOAN_COMMITMENT", riskCategory: "FINANCIAL", impactLevel: "HIGH" }),
    ]);
    for (const d of r.decisions) {
      expect(d.autoExecutable).toBe(d.approvalDecision === "AUTO_ALLOWED");
    }
  });

  it("24. supporting evidence ids pass through unchanged and are workspace-scoped", () => {
    const d = only(candidate({ actionType: "REQUEST_MISSING_PROOF", supportingEvidenceIds: ["p1", "p2"] }));
    expect(d.supportingEvidenceIds).toEqual(["p1", "p2"]);
  });

  it("25. a NEEDS_DATA decision preserves caller-provided missingData when present", () => {
    const d = only(candidate({ actionType: "MINOR_PROCESS_CHANGE", evidenceComplete: false, missingData: ["no linked complaint/rework record"] }));
    expect(d.approvalDecision).toBe("NEEDS_DATA");
    expect(d.missingData).toEqual(["no linked complaint/rework record"]);
  });
});

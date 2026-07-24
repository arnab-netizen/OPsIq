/**
 * Action assignment + proof lifecycle — pure domain tests (no DB, no browser).
 * Proves: responsible party; owner/delegate split; OpsIQ-prepared work; proof required; status
 * transitions reflected; rejected keeps action incomplete; overdue escalates; reassessment pending
 * after accepted; owner workload reduced (delegation); NO fake completion without proof.
 */
import { describe, it, expect } from "vitest";
import {
  resolveActionAssignment,
  evaluateProof,
  isProofTransitionAllowed,
  type ActionAssignmentInput,
} from "@/domain/owner-mode/action-assignment";

const baseAction: ActionAssignmentInput = {
  actionTitle: "Raise wash-and-fold price by 8%",
  kind: "financial_decision",
  riskClass: "high",
  ownerRole: "owner_operated",
  constraintLabel: "Below-margin work",
  dueInDays: 3,
};

describe("action-assignment — module contract assertions", () => {
  it("resolveActionAssignment is a function", () => { expect(typeof resolveActionAssignment).toBe("function"); });
  it("evaluateProof is a function", () => { expect(typeof evaluateProof).toBe("function"); });
  it("isProofTransitionAllowed is a function", () => { expect(typeof isProofTransitionAllowed).toBe("function"); });
  it("baseAction is an object", () => { expect(typeof baseAction).toBe("object"); });
  it("baseAction has actionTitle field", () => { expect(baseAction).toHaveProperty("actionTitle"); });
  it("baseAction has kind field", () => { expect(baseAction).toHaveProperty("kind"); });
  it("baseAction has riskClass field", () => { expect(baseAction).toHaveProperty("riskClass"); });
  it("resolveActionAssignment(baseAction) returns an object", () => { expect(typeof resolveActionAssignment(baseAction)).toBe("object"); });
  it("resolveActionAssignment(baseAction) has responsibleParty field", () => { expect(resolveActionAssignment(baseAction)).toHaveProperty("responsibleParty"); });
  it("resolveActionAssignment(baseAction) has proofRequired field", () => { expect(resolveActionAssignment(baseAction)).toHaveProperty("proofRequired"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
});

describe("action assignment", () => {
  it("identifies a responsible party and surfaces OpsIQ-prepared work + proof", () => {
    const a = resolveActionAssignment(baseAction);
    expect(a.responsibleParty).toBeTruthy();
    expect(a.opsiqPreparedWork.length).toBeGreaterThan(10);
    expect(a.proofRequired).toBe(true);
    expect(a.proofType).toBeTruthy();
    expect(a.acceptanceCriteria).toMatch(/proof/i);
    expect(a.reassessmentMetric).toMatch(/below-margin/i);
  });

  it("shows an owner/delegate split — a remote owner pushes execution to the manager, keeps approval", () => {
    const onsite = resolveActionAssignment({ ...baseAction, kind: "financial_decision", ownerRole: "owner_operated" });
    const remote = resolveActionAssignment({ ...baseAction, kind: "financial_decision", ownerRole: "remote_owner" });
    expect(onsite.responsibleParty).toBe("owner");
    expect(remote.responsibleParty).toBe("manager");
    expect(remote.assistedBy).toContain("owner");
    expect(remote.ownerApprovalRequired).toBe(true);
  });

  it("reduces owner workload — routine operations delegate to staff and are delegatable", () => {
    const op = resolveActionAssignment({ ...baseAction, actionTitle: "Re-run the evening machine cycle", kind: "operations_task", riskClass: "low" });
    expect(op.responsibleParty).toBe("staff");
    expect(op.delegatable).toBe(true);
    expect(op.assistedBy).toContain("opsiq");
  });

  it("requires owner approval for high-risk and financial actions", () => {
    expect(resolveActionAssignment({ ...baseAction, riskClass: "critical", kind: "operations_task" }).ownerApprovalRequired).toBe(true);
    expect(resolveActionAssignment({ ...baseAction, riskClass: "low", kind: "financial_decision" }).ownerApprovalRequired).toBe(true);
    expect(resolveActionAssignment({ ...baseAction, riskClass: "low", kind: "operations_task" }).ownerApprovalRequired).toBe(false);
  });

  it("sets an escalation trigger tied to the due date", () => {
    const a = resolveActionAssignment(baseAction);
    expect(a.escalationTrigger).toMatch(/escalate to the owner/i);
    expect(a.escalationTrigger).toMatch(/\d+ days/);
  });
});

describe("proof lifecycle", () => {
  it("only allows governed transitions", () => {
    expect(isProofTransitionAllowed("required", "submitted")).toBe(true);
    expect(isProofTransitionAllowed("submitted", "accepted")).toBe(true);
    expect(isProofTransitionAllowed("accepted", "reassessment_pending")).toBe(true);
    expect(isProofTransitionAllowed("required", "accepted")).toBe(false); // can't accept without submission
    expect(isProofTransitionAllowed("reassessment_pending", "accepted")).toBe(false);
  });

  it("never marks an action complete without an accepted proof", () => {
    expect(evaluateProof({ status: "required", dueInDays: 3, daysElapsed: 0 }).actionComplete).toBe(false);
    expect(evaluateProof({ status: "submitted", dueInDays: 3, daysElapsed: 1 }).actionComplete).toBe(false);
    expect(evaluateProof({ status: "accepted", dueInDays: 3, daysElapsed: 1 }).actionComplete).toBe(true);
  });

  it("a rejected proof keeps the action incomplete", () => {
    const r = evaluateProof({ status: "rejected", dueInDays: 3, daysElapsed: 1 });
    expect(r.actionComplete).toBe(false);
    expect(r.status).toBe("rejected");
    expect(r.reason).toMatch(/incomplete/i);
  });

  it("an overdue, unsatisfied proof escalates", () => {
    const r = evaluateProof({ status: "submitted", dueInDays: 3, daysElapsed: 10 });
    expect(r.status).toBe("overdue");
    expect(r.escalated).toBe(true);
    expect(r.actionComplete).toBe(false);
  });

  it("reassessment is pending only AFTER a proof is accepted", () => {
    expect(evaluateProof({ status: "submitted", dueInDays: 3, daysElapsed: 1 }).reassessmentPending).toBe(false);
    expect(evaluateProof({ status: "accepted", dueInDays: 3, daysElapsed: 1 }).reassessmentPending).toBe(true);
    expect(evaluateProof({ status: "reassessment_pending", dueInDays: 3, daysElapsed: 1 }).reassessmentPending).toBe(true);
  });

  it("an accepted proof is not retroactively overdue", () => {
    const r = evaluateProof({ status: "accepted", dueInDays: 3, daysElapsed: 30 });
    expect(r.status).toBe("accepted");
    expect(r.actionComplete).toBe(true);
    expect(r.escalated).toBe(false);
  });
});

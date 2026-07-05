/**
 * Staff Training Assignment Engine (pure).
 *
 * Converts process/correction findings into governed, evidence-backed training/review recommendations.
 * Drives the real pipeline (findings → corrections → SOP drafts → training) and asserts the right training
 * type per finding, the checklist-change briefing, NEEDS_DATA handling, no-training on cleared/clean
 * workspaces, approval + success metric, evidence carry-through, workspace scoping, and the safety
 * guarantees (no firing/payroll/discipline, no fraud/negligence, no hidden score).
 */
import { describe, it, expect } from "vitest";
import { buildProcessCorrections } from "@/domain/owner-mode/bottleneck-correction-routing";
import { buildSopChecklistCorrections } from "@/domain/owner-mode/sop-checklist-correction-engine";
import { buildTrainingAssignments, type TrainingType } from "@/domain/owner-mode/staff-training-assignment-engine";
import type { ProcessFinding, ProcessIntelligenceAnalysis } from "@/domain/owner-mode/process-intelligence";

const AT = "2026-07-05T00:00:00.000Z";
const WS = "ws-1";

function finding(over: Partial<ProcessFinding> = {}): ProcessFinding {
  return {
    workspaceId: WS, findingType: "REWORK_LOOP", severity: "MEDIUM", confidence: "HIGH",
    affectedStage: "WORK_EXECUTION", affectedActorId: null, affectedManagerId: null,
    supportingProofIds: [], supportingOperationalEventIds: [], supportingEscalationIds: [],
    supportingAdjudicationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null,
    ownerExplanation: "explanation", recommendedCorrectiveAction: "action", expectedImpactType: "REWORK_COST",
    requiredApprovalLevel: "MANAGER", missingData: [], evaluatedAt: AT, ...over,
  };
}

function trainingFor(findings: ProcessFinding[], ws = WS) {
  const analysis: ProcessIntelligenceAnalysis = { topFinding: findings[0] ?? null, findings, evaluatedAt: AT };
  const routing = buildProcessCorrections(analysis, ws);
  const sop = buildSopChecklistCorrections(analysis, routing, ws);
  return buildTrainingAssignments(analysis, routing, sop, ws);
}

const kinds = (r: { assignments: { trainingType: TrainingType }[] }) => r.assignments.map((a) => a.trainingType);

describe("staff-training-assignment-engine", () => {
  it("1. PROOF_QUALITY_BREAKDOWN creates a PROOF_QUALITY_REVIEW for the operator", () => {
    const r = trainingFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedStage: "PROOF_SUBMISSION", affectedActorId: "op-1", supportingProofIds: ["p1"] })]);
    const t = r.assignments.find((a) => a.trainingType === "PROOF_QUALITY_REVIEW")!;
    expect(t).toBeTruthy();
    expect(t.assignedToUserId).toBe("op-1");
  });

  it("2. MANAGER_REVIEW_GAP creates a MANAGER_REVIEW_QUALITY for the reviewer", () => {
    const r = trainingFor([finding({ findingType: "MANAGER_REVIEW_GAP", severity: "HIGH", affectedStage: "MANAGER_REVIEW", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-2" })]);
    const t = r.assignments.find((a) => a.trainingType === "MANAGER_REVIEW_QUALITY")!;
    expect(t.assignedToUserId).toBe("mgr-2");
    expect(t.approvalLevel).toBe("OWNER");
  });

  it("3. ESCALATION_RESPONSE_BREAKDOWN creates an ESCALATION_RESPONSE_REVIEW", () => {
    const r = trainingFor([finding({ findingType: "ESCALATION_RESPONSE_BREAKDOWN", affectedStage: "ESCALATION_RESPONSE", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-1", supportingEscalationIds: ["e1"] })]);
    const t = r.assignments.find((a) => a.trainingType === "ESCALATION_RESPONSE_REVIEW")!;
    expect(t.assignedToUserId).toBe("mgr-1");
    expect(t.supportingEscalationIds).toEqual(["e1"]);
  });

  it("4. DELIVERY_HANDOFF_DELAY creates a DELIVERY_HANDOFF_REVIEW for the delivery team", () => {
    const r = trainingFor([finding({ findingType: "DELIVERY_HANDOFF_DELAY", severity: "HIGH", affectedStage: "DELIVERY", supportingOperationalEventIds: ["d1"] })]);
    const t = r.assignments.find((a) => a.trainingType === "DELIVERY_HANDOFF_REVIEW")!;
    expect(t.assignedRole).toBe("delivery");
    expect(t.assignedToUserId).toBeNull();
  });

  it("5. a checklist correction creates a CHECKLIST_CHANGE_BRIEFING linked to the SOP change", () => {
    const r = trainingFor([finding({ findingType: "QUALITY_FAILURE_LOOP", severity: "HIGH", affectedStage: "PROOF_REVIEW", requiredApprovalLevel: "OWNER", supportingOperationalEventIds: ["c1"] })]);
    const t = r.assignments.find((a) => a.trainingType === "CHECKLIST_CHANGE_BRIEFING");
    expect(t).toBeTruthy();
    expect(t!.relatedSopChecklistCorrectionKey).toBeTruthy();
  });

  it("6. DATA_INSUFFICIENT does not create fake staff training (NEEDS_DATA briefing only, no operator)", () => {
    const r = trainingFor([finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA", affectedStage: "NONE", expectedImpactType: "NONE", missingData: ["x"] })]);
    expect(kinds(r)).toEqual(["DATA_COLLECTION_BRIEFING"]);
    expect(r.assignments[0].status).toBe("NEEDS_DATA");
    expect(r.assignments[0].assignedToUserId).toBeNull();
  });

  it("7. a cleared false-positive (suppressed upstream → no finding) creates no active training", () => {
    const r = trainingFor([]);
    expect(r.assignments).toHaveLength(0);
    expect(r.topAssignment).toBeNull();
  });

  it("8. a confirmed / require-fresh risk (finding with adjudication ids) can create training", () => {
    const r = trainingFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1", supportingProofIds: ["p1"], supportingAdjudicationIds: ["adj-1"] })]);
    expect(kinds(r)).toContain("PROOF_QUALITY_REVIEW");
  });

  it("9-10. every finding-driven assignment includes an approval level and a success metric", () => {
    const r = trainingFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1" })]);
    expect(r.assignments.length).toBeGreaterThan(0);
    for (const a of r.assignments) {
      expect(["OWNER", "MANAGER", "STAFF"]).toContain(a.approvalLevel);
      expect(a.successMetric.length).toBeGreaterThan(5);
    }
  });

  it("11. topAssignment is a real (non-NEEDS_DATA) recommendation when a breakdown exists", () => {
    const r = trainingFor([
      finding({ findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedActorId: "op-1" }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["x"] }),
    ]);
    expect(r.topAssignment).not.toBeNull();
    expect(r.topAssignment!.status).not.toBe("NEEDS_DATA");
  });

  it("12. a clean workspace (DATA_INSUFFICIENT only) fabricates no operator training", () => {
    const r = trainingFor([finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["insufficient linked process evidence"] })]);
    expect(r.assignments.every((a) => a.status === "NEEDS_DATA" && a.assignedToUserId === null)).toBe(true);
  });

  it("13. workspace scoping: keys are prefixed and cannot contaminate another workspace", () => {
    const r = trainingFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1" })], "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.assignments.every((a) => a.workspaceId === "ws-2" && a.sourceProcessFindingKey.startsWith("ws-2:"))).toBe(true);
  });

  it("14-16. no firing/payroll/discipline, no fraud/negligence labels, no hidden score", () => {
    const r = trainingFor([
      finding({ findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedActorId: "op-1", supportingProofIds: ["p1"] }),
      finding({ findingType: "MANAGER_REVIEW_GAP", severity: "HIGH", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-2" }),
      finding({ findingType: "ESCALATION_RESPONSE_BREAKDOWN", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-1" }),
    ]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/\b(fire|fired|firing|terminate|termination|payroll|salary|docking|suspend|written up|write-up|discipline|disciplinary|punish)\b/);
    expect(json).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });
});

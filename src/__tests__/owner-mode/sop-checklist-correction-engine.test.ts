/**
 * SOP / Checklist Correction Engine (pure).
 *
 * Turns routed process corrections into governed DRAFT SOP/checklist changes. Drives the real pipeline
 * (findings → buildProcessCorrections → buildSopChecklistCorrections) and asserts: the right SOP area per
 * correction type, NEEDS_DATA handling, the training handoff placeholder (no training assignment here),
 * approval inheritance, success metrics, evidence carry-through, no-draft on empty/clean workspaces,
 * workspace scoping, and the safety guarantees (no fake financial impact, no fraud/negligence, no score).
 */
import { describe, it, expect } from "vitest";
import { buildProcessCorrections } from "@/domain/owner-mode/bottleneck-correction-routing";
import { buildSopChecklistCorrections } from "@/domain/owner-mode/sop-checklist-correction-engine";
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

function sopFor(findings: ProcessFinding[], ws = WS) {
  const analysis: ProcessIntelligenceAnalysis = { topFinding: findings[0] ?? null, findings, evaluatedAt: AT };
  const routing = buildProcessCorrections(analysis, ws);
  return buildSopChecklistCorrections(analysis, routing, ws);
}

const areas = (r: { drafts: { sopArea: string }[] }) => r.drafts.map((d) => d.sopArea);

describe("sop-checklist-correction-engine", () => {
  it("1. PROOF_QUALITY_BREAKDOWN creates a proof-requirement checklist draft", () => {
    const r = sopFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedStage: "PROOF_SUBMISSION", affectedActorId: "op-1", supportingProofIds: ["p1"], relatedConstraint: "STAFF", relatedSLO: "ANTI_GAMING_RISK" })]);
    expect(areas(r)).toContain("PROOF_REQUIREMENT_CHECKLIST");
    const d = r.drafts.find((x) => x.sopArea === "PROOF_REQUIREMENT_CHECKLIST")!;
    expect(d.correctionType).toBe("REQUIRE_FRESH_PROOF");
    expect(d.status).toBe("DRAFT");
  });

  it("2. QUALITY_FAILURE_LOOP creates a checklist and/or process-step draft", () => {
    const r = sopFor([finding({ findingType: "QUALITY_FAILURE_LOOP", severity: "HIGH", affectedStage: "PROOF_REVIEW", requiredApprovalLevel: "OWNER", supportingOperationalEventIds: ["c1"], relatedConstraint: "QUALITY", relatedSLO: "OPERATIONAL_EVENT_RESOLUTION" })]);
    expect(areas(r)).toContain("ACCEPTANCE_QUALITY_CHECKLIST");
    expect(r.drafts.some((d) => d.correctionType === "UPDATE_CHECKLIST")).toBe(true);
  });

  it("3. DELIVERY_HANDOFF_DELAY creates a delivery hand-off checklist draft", () => {
    const r = sopFor([finding({ findingType: "DELIVERY_HANDOFF_DELAY", severity: "HIGH", affectedStage: "DELIVERY", supportingOperationalEventIds: ["d1"], relatedConstraint: "DELIVERY" })]);
    // REVIEW_PROCESS_STEP at the delivery stage → the hand-off checklist area; resolve-event is not an SOP change.
    expect(areas(r)).toContain("DELIVERY_HANDOFF_CHECKLIST");
    expect(r.drafts.every((d) => d.correctionType !== "RESOLVE_OPERATIONAL_EVENT")).toBe(true);
  });

  it("4. DATA_INSUFFICIENT produces only a NEEDS_DATA draft", () => {
    const withMissing = sopFor([finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA", affectedStage: "NONE", expectedImpactType: "NONE", missingData: ["no complaint/rework data"] })]);
    expect(withMissing.drafts).toHaveLength(1);
    expect(withMissing.drafts[0].status).toBe("NEEDS_DATA");
    expect(withMissing.drafts[0].sopArea).toBe("DATA_CAPTURE_CHECKLIST");
    expect(withMissing.drafts[0].missingData).toEqual(["no complaint/rework data"]);
  });

  it("5. a training correction does not create a training assignment — only a handoff placeholder", () => {
    const r = sopFor([finding({ findingType: "STAFF_TRAINING_GAP", affectedStage: "PROOF_SUBMISSION", affectedActorId: "op-7" })]);
    const d = r.drafts.find((x) => x.correctionType === "ASSIGN_TRAINING_REVIEW");
    expect(d).toBeTruthy();
    expect(d!.sopArea).toBe("TRAINING_HANDOFF");
    expect(`${d!.proposedChangeBody} ${d!.successMetric}`.toLowerCase()).toMatch(/training/);
    // No SOP body claims to assign or complete training.
    expect(d!.proposedChangeBody.toLowerCase()).not.toMatch(/assigned to|training complete|completed training/);
  });

  it("6. approval level is owner/manager where the correction requires it", () => {
    const r = sopFor([finding({ findingType: "QUALITY_FAILURE_LOOP", requiredApprovalLevel: "OWNER", supportingOperationalEventIds: ["c1"] })]);
    const checklist = r.drafts.find((d) => d.correctionType === "UPDATE_CHECKLIST")!;
    expect(["OWNER", "MANAGER"]).toContain(checklist.approvalLevel);
    expect(checklist.managerApprovalRequired).toBe(true);
    // owner-gated corrections keep ownerApprovalRequired true.
    const anyOwner = r.drafts.some((d) => d.ownerApprovalRequired && d.approvalLevel === "OWNER");
    expect(anyOwner).toBe(true);
  });

  it("7. every draft carries a non-empty success metric", () => {
    const r = sopFor([finding({ findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] })]);
    expect(r.drafts.length).toBeGreaterThan(0);
    expect(r.drafts.every((d) => d.successMetric.length > 5)).toBe(true);
  });

  it("8. supporting evidence ids are carried through from the correction", () => {
    const r = sopFor([finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1", supportingProofIds: ["p1", "p2"] })]);
    const d = r.drafts.find((x) => x.correctionType === "REQUIRE_FRESH_PROOF")!;
    expect(d.supportingProofIds).toEqual(["p1", "p2"]);
  });

  it("9. a cleared/dismissed finding (suppressed upstream → no finding) produces no active SOP draft", () => {
    // A cleared adjudication suppresses the top signal upstream, so the analysis has no active breakdown.
    // Modeled here as an empty findings set → no drafts at all (only DATA_INSUFFICIENT would yield NEEDS_DATA).
    const r = sopFor([]);
    expect(r.drafts).toHaveLength(0);
    expect(r.topDraft).toBeNull();
  });

  it("10. a clean workspace (DATA_INSUFFICIENT only) fabricates no real SOP change", () => {
    const r = sopFor([finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["insufficient linked process evidence"] })]);
    expect(r.drafts.every((d) => d.status === "NEEDS_DATA")).toBe(true);
    expect(r.drafts.every((d) => d.sopArea === "DATA_CAPTURE_CHECKLIST" || d.sopArea === "NONE")).toBe(true);
  });

  it("11. workspace scoping: keys and ids are prefixed with the workspace and cannot contaminate another", () => {
    const r = sopFor([finding({ findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] })], "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.drafts.every((d) => d.workspaceId === "ws-2" && d.sourceProcessFindingKey.startsWith("ws-2:") && d.sourceCorrectionKey.startsWith("ws-2:"))).toBe(true);
  });

  it("12-14. no fake financial impact, no fraud/negligence labels, no hidden score", () => {
    const r = sopFor([
      finding({ findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] }),
      finding({ findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedActorId: "op-1", supportingProofIds: ["p1"] }),
    ]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/"expectedimpact":\s*\d/);
    // No fabricated currency amount in any draft field.
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("15. drafts are ordered by correction priority with NEEDS_DATA last; topDraft is a real change when present", () => {
    const r = sopFor([
      finding({ findingType: "QUALITY_FAILURE_LOOP", severity: "HIGH", requiredApprovalLevel: "OWNER", supportingOperationalEventIds: ["c1"] }),
      finding({ findingType: "REWORK_LOOP", severity: "MEDIUM", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["x"] }),
    ]);
    // Real SOP drafts come before the NEEDS_DATA data-capture draft.
    const lastReal = r.drafts.findIndex((d) => d.status === "NEEDS_DATA");
    if (lastReal >= 0) {
      expect(r.drafts.slice(lastReal).every((d) => d.status === "NEEDS_DATA")).toBe(true);
    }
    expect(r.topDraft).not.toBeNull();
    expect(r.topDraft!.status).not.toBe("NEEDS_DATA");
  });
});

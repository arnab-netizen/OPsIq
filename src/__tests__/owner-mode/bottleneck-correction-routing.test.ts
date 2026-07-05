/**
 * Bottleneck → Correction Routing (pure).
 *
 * Turns Process Intelligence findings into proposed, trackable correction actions. Exercises the routing
 * rule for every finding type, all nine correction types, the secondary-correction guards (no event-
 * resolution without events; no person-coaching without a person), the approval escalation rule (a
 * correction can only strengthen the gate, never weaken it), the governance guarantees (every real
 * correction is PROPOSED and not auto-executable; owner approval is never hidden), deterministic ids,
 * ordering/priority, workspace propagation, and the no-fabricated-target / no-accusatory-language safety.
 */
import { describe, it, expect } from "vitest";
import { buildProcessCorrections, type CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";
import type { ProcessFinding, ProcessIntelligenceAnalysis } from "@/domain/owner-mode/process-intelligence";

const AT = "2026-07-05T00:00:00.000Z";
const WS = "ws-1";

function finding(over: Partial<ProcessFinding> = {}): ProcessFinding {
  return {
    workspaceId: WS,
    findingType: "REWORK_LOOP",
    severity: "MEDIUM",
    confidence: "HIGH",
    affectedStage: "WORK_EXECUTION",
    affectedActorId: null,
    affectedManagerId: null,
    supportingProofIds: [],
    supportingOperationalEventIds: [],
    supportingEscalationIds: [],
    supportingAdjudicationIds: [],
    relatedProfitLeak: null,
    relatedConstraint: null,
    relatedSLO: null,
    ownerExplanation: "explanation",
    recommendedCorrectiveAction: "action",
    expectedImpactType: "REWORK_COST",
    requiredApprovalLevel: "MANAGER",
    missingData: [],
    evaluatedAt: AT,
    ...over,
  };
}

function analysis(findings: ProcessFinding[]): ProcessIntelligenceAnalysis {
  return { topFinding: findings[0] ?? null, findings, evaluatedAt: AT };
}

const types = (r: { corrections: { correctionType: CorrectionType }[] }): CorrectionType[] =>
  r.corrections.map((c) => c.correctionType);

describe("bottleneck-correction-routing", () => {
  it("1. REWORK_LOOP routes to review-step + fresh-proof + (with events) resolve-event", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"],
    })]), WS);
    expect(types(r)).toEqual(["REVIEW_PROCESS_STEP", "REQUIRE_FRESH_PROOF", "RESOLVE_OPERATIONAL_EVENT"]);
    expect(r.topCorrection?.correctionType).toBe("REVIEW_PROCESS_STEP");
    expect(r.corrections.every((c) => c.targetActorId === "op-2")).toBe(true);
  });

  it("2. QUALITY_FAILURE_LOOP routes to update-checklist + escalate-to-owner (owner approval)", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "QUALITY_FAILURE_LOOP", affectedStage: "PROOF_REVIEW", requiredApprovalLevel: "OWNER",
      supportingOperationalEventIds: ["c1"], expectedImpactType: "COMPLAINT_RISK",
    })]), WS);
    expect(types(r)).toContain("UPDATE_CHECKLIST");
    const owner = r.corrections.find((c) => c.correctionType === "ESCALATE_TO_OWNER")!;
    expect(owner.requiresOwnerApproval).toBe(true);
    expect(owner.requiredApprovalLevel).toBe("OWNER");
  });

  it("3. DELIVERY_HANDOFF_DELAY resolves the overdue events first", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "DELIVERY_HANDOFF_DELAY", severity: "HIGH", affectedStage: "DELIVERY",
      supportingOperationalEventIds: ["d1"], expectedImpactType: "CASH_DELAY",
    })]), WS);
    expect(r.topCorrection?.correctionType).toBe("RESOLVE_OPERATIONAL_EVENT");
    expect(types(r)).toContain("REVIEW_PROCESS_STEP");
  });

  it("4. REVIEW_BOTTLENECK routes to a single review-process-step correction", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "REVIEW_BOTTLENECK", severity: "HIGH", affectedStage: "PROOF_REVIEW",
    })]), WS);
    expect(types(r)).toEqual(["REVIEW_PROCESS_STEP"]);
  });

  it("5. OWNER_APPROVAL_BOTTLENECK escalates to owner and requires owner approval", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "OWNER_APPROVAL_BOTTLENECK", affectedStage: "OWNER_APPROVAL", requiredApprovalLevel: "OWNER",
      affectedActorId: "op-9", expectedImpactType: "OWNER_TIME",
    })]), WS);
    expect(r.topCorrection?.correctionType).toBe("ESCALATE_TO_OWNER");
    expect(r.topCorrection?.requiresOwnerApproval).toBe(true);
    // actor present → the secondary review-step is emitted
    expect(types(r)).toContain("REVIEW_PROCESS_STEP");
  });

  it("6. PROOF_QUALITY_BREAKDOWN requires fresh proof + (with actor) training review", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "PROOF_QUALITY_BREAKDOWN", severity: "HIGH", affectedStage: "PROOF_SUBMISSION",
      affectedActorId: "op-1", supportingProofIds: ["p1", "p2"], expectedImpactType: "QUALITY_RISK",
    })]), WS);
    expect(types(r)).toEqual(["REQUIRE_FRESH_PROOF", "ASSIGN_TRAINING_REVIEW"]);
    expect(r.corrections.every((c) => c.supportingProofIds.length === 2)).toBe(true);
    expect(r.corrections[0].supportingProofIds).toEqual(["p1", "p2"]);
  });

  it("7. ESCALATION_RESPONSE_BREAKDOWN escalates to owner + (with manager) to manager", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "ESCALATION_RESPONSE_BREAKDOWN", affectedStage: "ESCALATION_RESPONSE",
      requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-1", supportingEscalationIds: ["esc-1"],
      expectedImpactType: "TRUST_RISK",
    })]), WS);
    expect(types(r)).toEqual(["ESCALATE_TO_OWNER", "ESCALATE_TO_MANAGER"]);
    expect(r.corrections.every((c) => c.targetManagerId === "mgr-1")).toBe(true);
    expect(r.corrections[0].supportingEscalationIds).toEqual(["esc-1"]);
  });

  it("8. STAFF_TRAINING_GAP routes to a single training-review correction", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "STAFF_TRAINING_GAP", affectedStage: "PROOF_SUBMISSION", affectedActorId: "op-7",
      expectedImpactType: "QUALITY_RISK",
    })]), WS);
    expect(types(r)).toEqual(["ASSIGN_TRAINING_REVIEW"]);
    expect(r.topCorrection?.targetActorId).toBe("op-7");
  });

  it("9. MANAGER_REVIEW_GAP routes to review-step + owner sign-off", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "MANAGER_REVIEW_GAP", severity: "HIGH", affectedStage: "MANAGER_REVIEW",
      requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-2",
    })]), WS);
    expect(types(r)).toEqual(["REVIEW_PROCESS_STEP", "ESCALATE_TO_OWNER"]);
  });

  it("10. DATA_INSUFFICIENT routes to COLLECT_MISSING_DATA (with missing data) else NO_ACTION", () => {
    const withMissing = buildProcessCorrections(analysis([finding({
      findingType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA", affectedStage: "NONE",
      expectedImpactType: "NONE", missingData: ["no complaint/rework data"],
    })]), WS);
    expect(types(withMissing)).toEqual(["COLLECT_MISSING_DATA"]);

    const noMissing = buildProcessCorrections(analysis([finding({
      findingType: "DATA_INSUFFICIENT", severity: "LOW", confidence: "NEEDS_DATA", affectedStage: "NONE",
      expectedImpactType: "NONE", missingData: [],
    })]), WS);
    expect(types(noMissing)).toEqual(["NO_ACTION_DATA_INSUFFICIENT"]);
  });

  it("11. governance: only the NO_ACTION no-op is auto-executable; every real correction is PROPOSED", () => {
    const r = buildProcessCorrections(analysis([
      finding({ findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: [] }),
    ]), WS);
    for (const c of r.corrections) {
      expect(c.status).toBe("PROPOSED");
      expect(c.autoExecutable).toBe(c.correctionType === "NO_ACTION_DATA_INSUFFICIENT");
      expect(c.requiresOwnerApproval).toBe(c.requiredApprovalLevel === "OWNER");
    }
  });

  it("12. approval can only escalate: a STAFF-level finding still gets a MANAGER floor for a review step", () => {
    const r = buildProcessCorrections(analysis([finding({
      findingType: "REVIEW_BOTTLENECK", requiredApprovalLevel: "STAFF", affectedStage: "PROOF_REVIEW",
    })]), WS);
    // REVIEW_PROCESS_STEP floor is MANAGER → the gate is raised, never dropped to STAFF.
    expect(r.corrections[0].requiredApprovalLevel).toBe("MANAGER");
  });

  it("13. secondary guards: no event-resolution without events, no coaching without a person", () => {
    const noEvents = buildProcessCorrections(analysis([finding({
      findingType: "REWORK_LOOP", affectedActorId: null, supportingOperationalEventIds: [],
    })]), WS);
    expect(types(noEvents)).not.toContain("RESOLVE_OPERATIONAL_EVENT");

    const noActor = buildProcessCorrections(analysis([finding({
      findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: null,
    })]), WS);
    expect(types(noActor)).not.toContain("ASSIGN_TRAINING_REVIEW");
    expect(noActor.corrections.every((c) => c.targetActorId === null)).toBe(true); // never fabricated
  });

  it("14. ordering, priority, deterministic ids, workspace isolation + no accusatory language", () => {
    const a = analysis([
      finding({ findingType: "REWORK_LOOP", severity: "MEDIUM", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] }),
      finding({ findingType: "MANAGER_REVIEW_GAP", severity: "HIGH", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-2" }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["x"] }),
    ]);
    const r = buildProcessCorrections(a, WS);
    // HIGH-severity corrections rank above MEDIUM; DATA_INSUFFICIENT (LOW) sorts last.
    expect(r.corrections[0].severity).toBe("HIGH");
    expect(r.corrections[r.corrections.length - 1].sourceFindingType).toBe("DATA_INSUFFICIENT");
    // priorityRank is 1..n contiguous; topCorrection is rank 1.
    expect(r.corrections.map((c) => c.priorityRank)).toEqual(r.corrections.map((_, i) => i + 1));
    expect(r.topCorrection?.priorityRank).toBe(1);
    // deterministic + workspace-scoped id; re-running yields identical ids.
    const r2 = buildProcessCorrections(a, WS);
    expect(r.corrections.map((c) => c.correctionId)).toEqual(r2.corrections.map((c) => c.correctionId));
    expect(r.corrections.every((c) => c.correctionId.startsWith(`${WS}:`) && c.workspaceId === WS)).toBe(true);
    // no fraud/negligence/pseudo-psychology wording in any owner-facing text.
    const text = r.corrections.map((c) => `${c.title} ${c.instruction} ${c.rationale}`).join(" ").toLowerCase();
    expect(text).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
  });

  it("15. every nine correction types is reachable across the routing rules", () => {
    const all = new Set<CorrectionType>();
    const findings: ProcessFinding[] = [
      finding({ findingType: "REWORK_LOOP", affectedActorId: "op-2", supportingOperationalEventIds: ["e1"] }),
      finding({ findingType: "QUALITY_FAILURE_LOOP", requiredApprovalLevel: "OWNER", supportingOperationalEventIds: ["c1"] }),
      finding({ findingType: "PROOF_QUALITY_BREAKDOWN", affectedActorId: "op-1" }),
      finding({ findingType: "ESCALATION_RESPONSE_BREAKDOWN", requiredApprovalLevel: "OWNER", affectedManagerId: "mgr-1" }),
      finding({ findingType: "REVIEW_BOTTLENECK" }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: ["x"] }),
      finding({ findingType: "DATA_INSUFFICIENT", severity: "LOW", affectedStage: "NONE", missingData: [] }),
    ];
    for (const f of findings) buildProcessCorrections(analysis([f]), WS).corrections.forEach((c) => all.add(c.correctionType));
    const NINE: CorrectionType[] = [
      "REQUIRE_FRESH_PROOF", "UPDATE_CHECKLIST", "REVIEW_PROCESS_STEP", "ASSIGN_TRAINING_REVIEW",
      "ESCALATE_TO_MANAGER", "ESCALATE_TO_OWNER", "RESOLVE_OPERATIONAL_EVENT", "COLLECT_MISSING_DATA",
      "NO_ACTION_DATA_INSUFFICIENT",
    ];
    for (const t of NINE) expect(all.has(t)).toBe(true);
  });
});

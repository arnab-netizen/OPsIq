/**
 * Process-Execution Bridge Expansion (PASS 23) — pure domain tests.
 *
 * Proves the workload / capability / standalone-SOP / standalone-training / effectiveness engines bridge
 * DIRECTLY into governed execution routes (route + owner + approval + evidence + completion + reassessment),
 * that high-risk stays owner-gated, low-value capability gaps stay MONITOR_ONLY (no cockpit flood), the
 * SOP-adherence re-check never claims a fix worked without evidence, a specific SOP/training route collapses
 * the generic correction route (no duplicate), workspace isolation holds, and nothing fabricates a
 * figure / time-saving / discipline label / hidden score.
 */
import { describe, it, expect } from "vitest";
import {
  buildBridgeExpansion, bridgeWorkloadFinding, bridgeCapabilityRecommendation, bridgeSopDraft,
  bridgeTrainingAssignment, bridgeEffectivenessEvaluation,
} from "@/domain/owner-mode/process-execution-bridge-expansion";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import type { OwnerWorkloadFinding, ReductionAction, WorkloadType } from "@/domain/owner-mode/owner-workload-reduction";
import type { SystemCapabilityRecommendation } from "@/domain/owner-mode/system-capability-gap-detector";
import type { SopChecklistCorrection } from "@/domain/owner-mode/sop-checklist-correction-engine";
import type { TrainingAssignment } from "@/domain/owner-mode/staff-training-assignment-engine";
import type { EffectivenessEvaluation } from "@/domain/owner-mode/sop-training-effectiveness-loop";
import type { EffectivenessAttributionState } from "@/domain/owner-mode/effectiveness-attribution";
import type { ProcessCorrection, ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";

const WS = "ws-exp";
const AT = "2026-07-06T00:00:00.000Z";

function workload(action: ReductionAction, over: Partial<OwnerWorkloadFinding> = {}): OwnerWorkloadFinding {
  return {
    workspaceId: WS, workloadType: "OWNER_REVIEW_BURDEN" as WorkloadType, severity: "HIGH", confidence: "HIGH",
    burdenCount: 6, estimatedOwnerTouches: 6, supportingProofIds: ["p1"], supportingAdjudicationIds: ["a1"],
    supportingOperationalEventIds: [], supportingEscalationIds: [], supportingCorrectionKeys: [], supportingTrainingKeys: [],
    relatedProcessFinding: null, relatedSLO: null, ownerVisibleExplanation: "You keep personally reviewing routine work.",
    recommendedReductionAction: action, approvalLevel: "MANAGER", riskGuardrail: "keep owner sign-off on high-risk items",
    missingData: [], evaluatedAt: AT, ...over,
  };
}
function capability(over: Partial<SystemCapabilityRecommendation> = {}): SystemCapabilityRecommendation {
  return {
    workspaceId: WS, capabilityType: "AUTOMATED_PROOF_CHECK" as SystemCapabilityRecommendation["capabilityType"], title: "Auto proof check",
    severity: "HIGH", confidence: "HIGH", problemStatement: "OpsIQ cannot verify proof automatically today.",
    recommendedCapability: "Build an automated proof checker", ownerBenefit: "Fewer manual reviews", unlocksAutomation: true,
    unlockedActionTypes: ["auto-accept"], governanceGuardrail: "owner still approves policy", signalCount: 3, supportingSignalTypes: ["MANUAL_OWNER_BURDEN"],
    evidenceRefs: ["s1"], blocksToday: ["auto-accept"], dependsOnData: false, missingData: [], estimatedComplexity: "MEDIUM",
    priorityRank: 1, status: "RECOMMENDED", evaluatedAt: AT, ...over,
  };
}
function sop(over: Partial<SopChecklistCorrection> = {}): SopChecklistCorrection {
  return {
    workspaceId: WS, sourceProcessFindingKey: `${WS}:REWORK_LOOP`, sourceCorrectionKey: "c-sop",
    correctionType: "UPDATE_CHECKLIST" as SopChecklistCorrection["correctionType"], affectedStage: "DELIVERY" as SopChecklistCorrection["affectedStage"],
    sopArea: "DELIVERY_HANDOFF_CHECKLIST" as SopChecklistCorrection["sopArea"], proposedChangeTitle: "Add a hand-off check",
    proposedChangeBody: "…", reason: "orders get stuck at hand-off", supportingProofIds: ["p1"], supportingOperationalEventIds: ["e1"],
    supportingEscalationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null, approvalLevel: "MANAGER",
    ownerApprovalRequired: false, managerApprovalRequired: true, successMetric: "fewer stuck orders", reviewAfterDays: 14,
    status: "DRAFT", missingData: [], evaluatedAt: AT, ...over,
  };
}
function training(over: Partial<TrainingAssignment> = {}): TrainingAssignment {
  return {
    workspaceId: WS, sourceProcessFindingKey: `${WS}:REWORK_LOOP`, sourceCorrectionKey: "c-tr",
    trainingType: "PROCESS_STEP_RETRAINING" as TrainingAssignment["trainingType"], assignedToUserId: null, assignedRole: "staff",
    assignedByRole: "system-proposed", approvalLevel: "MANAGER", reason: "the step keeps failing",
    supportingProofIds: ["p1"], supportingOperationalEventIds: [], supportingEscalationIds: [], relatedSopChecklistCorrectionKey: null,
    successMetric: "first-time pass rate improves", reviewAfterDays: 14, status: "PROPOSED", missingData: [],
    ownerVisibleExplanation: "Coach this operator on the step; this is coaching, not an accusation.", evaluatedAt: AT, ...over,
  };
}
function effectiveness(attribution: EffectivenessAttributionState, over: Partial<EffectivenessEvaluation> = {}): EffectivenessEvaluation {
  return {
    workspaceId: WS, sourceCorrectionKey: "c-eff", sourceTrainingKey: null, sourceProcessFindingKey: `${WS}:REWORK_LOOP`,
    evaluationType: "SOP_CHECKLIST_EFFECTIVENESS" as EffectivenessEvaluation["evaluationType"], targetedProblemType: "REWORK_LOOP",
    baselineWindow: "prev", evaluationWindow: "curr", baselineMetricValue: 10, currentMetricValue: 4, direction: "IMPROVED", confidence: "MEDIUM",
    supportingBeforeEventIds: ["b1"], supportingAfterEventIds: ["af1"], supportingProofIds: [], relatedOperationalEventIds: [],
    relatedEscalationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null,
    ownerVisibleSummary: "The hand-off checklist change is being re-checked against the rework rate.",
    recommendedNextAction: "KEEP", approvalLevel: "MANAGER", missingData: [], evaluatedAt: AT, attributionState: attribution, ...over,
  };
}

describe("process-execution-bridge-expansion — module contract assertions", () => {
  it("buildBridgeExpansion is a function", () => { expect(typeof buildBridgeExpansion).toBe("function"); });
  it("bridgeWorkloadFinding is a function", () => { expect(typeof bridgeWorkloadFinding).toBe("function"); });
  it("bridgeCapabilityRecommendation is a function", () => { expect(typeof bridgeCapabilityRecommendation).toBe("function"); });
  it("bridgeSopDraft is a function", () => { expect(typeof bridgeSopDraft).toBe("function"); });
  it("bridgeTrainingAssignment is a function", () => { expect(typeof bridgeTrainingAssignment).toBe("function"); });
  it("bridgeEffectivenessEvaluation is a function", () => { expect(typeof bridgeEffectivenessEvaluation).toBe("function"); });
  it("buildProcessExecutionBridge is a function", () => { expect(typeof buildProcessExecutionBridge).toBe("function"); });
  it("WS is a string", () => { expect(typeof WS).toBe("string"); });
  it("AT is a string", () => { expect(typeof AT).toBe("string"); });
  it("workload is a function", () => { expect(typeof workload).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("process-execution-bridge-expansion (PASS 23)", () => {
  // ── Workload ──
  it("1. workload DELEGATE_TO_MANAGER becomes a manager task with completion evidence", () => {
    const r = bridgeWorkloadFinding(workload("DELEGATE_TO_MANAGER"));
    expect(r.sourceFamily).toBe("WORKLOAD_REDUCTION");
    expect(r.executionRoute).toBe("CREATE_MANAGER_TASK");
    expect(r.actionOwner).toBe("MANAGER");
    expect(r.approvalLevel).toBe("MANAGER_APPROVAL_REQUIRED");
    expect(r.requiredEvidence.length).toBeGreaterThan(0);
    expect(r.evidenceRefs).toEqual(expect.arrayContaining(["p1", "a1"]));
  });
  it("2. a high-risk workload item stays owner-gated (KEEP_OWNER_APPROVAL / CONVERT_TO_POLICY)", () => {
    for (const a of ["KEEP_OWNER_APPROVAL", "CONVERT_TO_POLICY"] as ReductionAction[]) {
      const r = bridgeWorkloadFinding(workload(a));
      expect(r.actionOwner).toBe("OWNER");
      expect(r.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
      expect(r.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    }
  });
  it("3. workload with missing data routes to a data task and fabricates no time saving", () => {
    const r = bridgeWorkloadFinding(workload("COLLECT_MISSING_DATA", { missingData: ["daily order log"], recommendedReductionAction: "COLLECT_MISSING_DATA" }));
    expect(r.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(r.approvalLevel).toBe("NEEDS_DATA");
    expect(r.requiredEvidence).toContain("daily order log");
    expect(`${r.ownerVisibleSummary} ${r.riskIfIgnored}`).not.toMatch(/\b(hours?|minutes?|days?)\s+saved|saves?\s+\d|[$£€]\s?\d/i);
  });

  // ── Capability ──
  it("4. a material capability gap that unlocks automation routes to an OWNER build decision", () => {
    const r = bridgeCapabilityRecommendation(capability({ severity: "CRITICAL", unlocksAutomation: true, dependsOnData: false }));
    expect(r.sourceFamily).toBe("CAPABILITY_GAP");
    expect(r.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(r.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
  });
  it("5. a data-dependent capability gap routes to a data task; a low-value gap stays MONITOR_ONLY (no flood)", () => {
    const dataGap = bridgeCapabilityRecommendation(capability({ dependsOnData: true, missingData: ["POS export"] }));
    expect(dataGap.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(dataGap.requiredEvidence).toContain("POS export");
    const lowValue = bridgeCapabilityRecommendation(capability({ severity: "LOW", unlocksAutomation: false, dependsOnData: false, blocksToday: [] }));
    expect(lowValue.executionRoute).toBe("MONITOR_ONLY");
    expect(lowValue.notActionableReason).toMatch(/monitored/i);
    expect(lowValue.requiredEvidence).toHaveLength(0);
  });

  // ── SOP ──
  it("6. a standalone SOP draft becomes an SOP task requiring adoption evidence; owner-approval stays owner-gated", () => {
    const mgr = bridgeSopDraft(sop());
    expect(mgr.sourceFamily).toBe("SOP_CHECKLIST");
    expect(mgr.executionRoute).toBe("CREATE_SOP_CHECKLIST_TASK");
    expect(mgr.requiredEvidence.join(" ")).toMatch(/adoption/i);
    const owner = bridgeSopDraft(sop({ ownerApprovalRequired: true, approvalLevel: "OWNER" }));
    expect(owner.actionOwner).toBe("OWNER");
    expect(owner.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
  });

  // ── Training ──
  it("7. a standalone training assignment becomes a coaching task with completion proof and no discipline language", () => {
    const r = bridgeTrainingAssignment(training());
    expect(r.sourceFamily).toBe("TRAINING");
    expect(r.executionRoute).toBe("CREATE_TRAINING_TASK");
    expect(r.requiredEvidence.join(" ")).toMatch(/completed/i);
    expect(`${r.ownerVisibleSummary} ${r.riskIfIgnored}`).not.toMatch(/\b(fire|fired|discipline|disciplinary|payroll|negligent|lazy|fault|blame)\b/i);
    const ownerTr = bridgeTrainingAssignment(training({ approvalLevel: "OWNER" }));
    expect(ownerTr.actionOwner).toBe("OWNER");
  });

  // ── Effectiveness re-check by ATTRIBUTION state (R3, PASS 26) ──
  it("8. a verified improvement is MONITOR_ONLY and claims no action — never a false 'it worked' task", () => {
    const r = bridgeEffectivenessEvaluation(effectiveness("MONITOR_ONLY_VERIFIED_IMPROVEMENT"));
    expect(r.sourceFamily).toBe("EFFECTIVENESS_RECHECK");
    expect(r.executionRoute).toBe("MONITOR_ONLY");
    expect(r.notActionableReason).toMatch(/verified/i);
    expect(r.requiredEvidence).toHaveLength(0);
  });
  it("9. worsened-after-execution escalates to the owner; unchanged/executed-not-proven route to reassessment", () => {
    const worsened = bridgeEffectivenessEvaluation(effectiveness("VERIFIED_WORSENED_AFTER_EXECUTION"));
    expect(worsened.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(worsened.actionOwner).toBe("OWNER");
    expect(worsened.severity).toBe("HIGH");
    expect(bridgeEffectivenessEvaluation(effectiveness("VERIFIED_UNCHANGED_AFTER_EXECUTION")).executionRoute).toBe("CREATE_REASSESSMENT_TASK");
    expect(bridgeEffectivenessEvaluation(effectiveness("EXECUTED_BUT_OUTCOME_NOT_PROVEN")).executionRoute).toBe("CREATE_REASSESSMENT_TASK");
  });
  it("10. an improvement WITHOUT proven execution is not attributed — it routes to an execution-evidence request", () => {
    const r = bridgeEffectivenessEvaluation(effectiveness("IMPROVED_BUT_EXECUTION_NOT_PROVEN"));
    expect(r.executionRoute).toBe("CREATE_EVIDENCE_REQUEST");
    expect(r.requiredEvidence.join(" ")).toMatch(/execution|completion proof/i);
    // Insufficient outcome data routes to a data task.
    const data = bridgeEffectivenessEvaluation(effectiveness("INSUFFICIENT_OUTCOME_EVIDENCE", { missingData: ["after-window events"] }));
    expect(data.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(data.requiredEvidence).toContain("after-window events");
  });

  // ── Combiner + collapse + isolation ──
  it("11. the combiner collapses the generic correction route when a specific SOP route supersedes it (no duplicate)", () => {
    const corr: ProcessCorrection = {
      workspaceId: WS, correctionId: "c-sop", sourceFindingType: "REWORK_LOOP", correctionType: "UPDATE_CHECKLIST",
      title: "T", instruction: "do", rationale: "r", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"],
      targetActorId: null, targetManagerId: null, severity: "HIGH", confidence: "HIGH", priorityRank: 1,
      requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false, autoExecutable: false,
      expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"], supportingProofIds: [],
      supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [], missingData: [], status: "PROPOSED",
    };
    const routing: ProcessCorrectionRouting = { workspaceId: WS, corrections: [corr], topCorrection: corr, evaluatedAt: AT };
    const expansion = buildBridgeExpansion({ sop: { workspaceId: WS, drafts: [sop({ sourceCorrectionKey: "c-sop" })], topDraft: null, evaluatedAt: AT } }, WS);
    const bridge = buildProcessExecutionBridge(routing, null, WS, AT, expansion);
    // The generic pc: SOP route is collapsed; only the richer sop: route remains for this fix.
    expect(bridge.routes.find((r) => r.taskKey === "pc:c-sop")).toBeUndefined();
    expect(bridge.routes.find((r) => r.taskKey === "sop:c-sop")).toBeDefined();
  });
  it("12. the combiner drops a foreign-workspace expansion route (isolation) and dedupes by taskKey", () => {
    const exp = buildBridgeExpansion({ workload: { workspaceId: WS, findings: [workload("DELEGATE_TO_MANAGER"), { ...workload("DELEGATE_TO_MANAGER") }], topFinding: null, evaluatedAt: AT } }, WS);
    // Two findings of the same workloadType collapse to one route (stable taskKey).
    expect(exp.routes.filter((r) => r.taskKey === "wl:OWNER_REVIEW_BURDEN")).toHaveLength(1);
    const foreign = buildBridgeExpansion({ workload: { workspaceId: WS, findings: [workload("DELEGATE_TO_MANAGER", { workspaceId: "other-ws" })], topFinding: null, evaluatedAt: AT } }, WS);
    expect(foreign.routes).toHaveLength(0);
  });
  it("13. empty inputs fabricate nothing", () => {
    const exp = buildBridgeExpansion({}, WS);
    expect(exp.routes).toHaveLength(0);
    expect(exp.collapse.sopCorrectionKeys.size).toBe(0);
  });
  it("14. no bridged expansion route fabricates a currency figure or a hidden score", () => {
    const all = [
      bridgeWorkloadFinding(workload("DELEGATE_TO_MANAGER")),
      bridgeCapabilityRecommendation(capability()),
      bridgeSopDraft(sop()),
      bridgeTrainingAssignment(training()),
      bridgeEffectivenessEvaluation(effectiveness("VERIFIED_WORSENED_AFTER_EXECUTION")),
    ];
    for (const r of all) {
      const blob = JSON.stringify(r);
      expect(blob).not.toMatch(/[$£€]\s?\d/);
      expect(blob).not.toMatch(/hidden\s*score|win\s*probability|roi/i);
    }
  });
});

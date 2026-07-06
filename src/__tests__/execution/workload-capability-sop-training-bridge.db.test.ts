/**
 * Workload / Capability / Standalone-SOP-Training / Complaint Bridge Expansion — real-business DB simulation
 * (PASS 23). Requires TEST_WITH_DB=true.
 *
 * Proves against real Postgres that the five newly-bridged engines (workload, capability, standalone SOP,
 * standalone training, effectiveness re-check) plus the complaint/rework correction route materialise as
 * governed ProcessExecutionTask rows and obey every guardrail end to end: high-risk stays owner-approval,
 * completion is evidence-gated, a verified (IMPROVED) re-check is monitor-only and cannot be "completed" to
 * fake effectiveness, a low-value capability gap stays monitor-only (no cockpit flood), the cockpit still
 * yields a single top action, workspace isolation holds, and a clean workspace fabricates nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import { buildBridgeExpansion, type BridgeExpansionInputs } from "@/domain/owner-mode/process-execution-bridge-expansion";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";
import type { OwnerWorkloadFinding, ReductionAction, WorkloadType } from "@/domain/owner-mode/owner-workload-reduction";
import type { SystemCapabilityRecommendation } from "@/domain/owner-mode/system-capability-gap-detector";
import type { SopChecklistCorrection } from "@/domain/owner-mode/sop-checklist-correction-engine";
import type { TrainingAssignment } from "@/domain/owner-mode/staff-training-assignment-engine";
import type { EffectivenessEvaluation } from "@/domain/owner-mode/sop-training-effectiveness-loop";
import type { EffectivenessAttributionState } from "@/domain/owner-mode/effectiveness-attribution";

const owner = randomUUID(), mgr = randomUUID();
const wsL = randomUUID(), wsClean = randomUUID(), bizL = randomUUID();
const AT = "2026-07-06T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

function correction(id: string, type: CorrectionType, over: Partial<ProcessCorrection> = {}): ProcessCorrection {
  return {
    workspaceId: wsL, correctionId: id, sourceFindingType: "QUALITY_FAILURE_LOOP", correctionType: type, title: "Fix", instruction: "do it",
    rationale: "a repeat customer complaint keeps recurring", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"],
    targetActorId: null, targetManagerId: null, severity: "CRITICAL", confidence: "HIGH", priorityRank: 1,
    requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false, autoExecutable: false,
    expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"], supportingProofIds: ["p1"],
    supportingOperationalEventIds: ["ev-complaint"], supportingEscalationIds: [], supportingAdjudicationIds: [], missingData: [], status: "PROPOSED", ...over,
  };
}
function workload(action: ReductionAction, wt: WorkloadType, over: Partial<OwnerWorkloadFinding> = {}): OwnerWorkloadFinding {
  return {
    workspaceId: wsL, workloadType: wt, severity: "HIGH", confidence: "HIGH", burdenCount: 6, estimatedOwnerTouches: 6,
    supportingProofIds: ["p1"], supportingAdjudicationIds: ["a1"], supportingOperationalEventIds: [], supportingEscalationIds: [],
    supportingCorrectionKeys: [], supportingTrainingKeys: [], relatedProcessFinding: null, relatedSLO: null,
    ownerVisibleExplanation: "You keep personally handling routine work.", recommendedReductionAction: action,
    approvalLevel: "MANAGER", riskGuardrail: "keep owner sign-off on high-risk items", missingData: [], evaluatedAt: AT, ...over,
  };
}
function capability(capType: string, over: Partial<SystemCapabilityRecommendation> = {}): SystemCapabilityRecommendation {
  return {
    workspaceId: wsL, capabilityType: capType as SystemCapabilityRecommendation["capabilityType"], title: "Cap", severity: "HIGH",
    confidence: "HIGH", problemStatement: "OpsIQ cannot do X today.", recommendedCapability: "Build X", ownerBenefit: "less manual work",
    unlocksAutomation: false, unlockedActionTypes: [], governanceGuardrail: "owner approves policy", signalCount: 2,
    supportingSignalTypes: ["MANUAL_OWNER_BURDEN"], evidenceRefs: ["s1"], blocksToday: [], dependsOnData: false, missingData: [],
    estimatedComplexity: "MEDIUM", priorityRank: 1, status: "RECOMMENDED", evaluatedAt: AT, ...over,
  };
}
function sop(key: string, over: Partial<SopChecklistCorrection> = {}): SopChecklistCorrection {
  return {
    workspaceId: wsL, sourceProcessFindingKey: `${wsL}:REWORK_LOOP`, sourceCorrectionKey: key,
    correctionType: "UPDATE_CHECKLIST" as SopChecklistCorrection["correctionType"], affectedStage: "DELIVERY" as SopChecklistCorrection["affectedStage"],
    sopArea: "DELIVERY_HANDOFF_CHECKLIST" as SopChecklistCorrection["sopArea"], proposedChangeTitle: "Add a hand-off check",
    proposedChangeBody: "…", reason: "orders get stuck", supportingProofIds: ["p1"], supportingOperationalEventIds: ["e1"],
    supportingEscalationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null, approvalLevel: "MANAGER",
    ownerApprovalRequired: false, managerApprovalRequired: true, successMetric: "fewer stuck orders", reviewAfterDays: 14,
    status: "DRAFT", missingData: [], evaluatedAt: AT, ...over,
  };
}
function training(key: string, over: Partial<TrainingAssignment> = {}): TrainingAssignment {
  return {
    workspaceId: wsL, sourceProcessFindingKey: `${wsL}:REWORK_LOOP`, sourceCorrectionKey: key,
    trainingType: "PROCESS_STEP_RETRAINING" as TrainingAssignment["trainingType"], assignedToUserId: null, assignedRole: "staff",
    assignedByRole: "system-proposed", approvalLevel: "MANAGER", reason: "the step keeps failing", supportingProofIds: ["p1"],
    supportingOperationalEventIds: [], supportingEscalationIds: [], relatedSopChecklistCorrectionKey: null,
    successMetric: "first-time pass improves", reviewAfterDays: 14, status: "PROPOSED", missingData: [],
    ownerVisibleExplanation: "Coach this operator on the step; coaching, not an accusation.", evaluatedAt: AT, ...over,
  };
}
function effectiveness(key: string, attribution: EffectivenessAttributionState, over: Partial<EffectivenessEvaluation> = {}): EffectivenessEvaluation {
  return {
    workspaceId: wsL, sourceCorrectionKey: key, sourceTrainingKey: null, sourceProcessFindingKey: `${wsL}:REWORK_LOOP`,
    evaluationType: "SOP_CHECKLIST_EFFECTIVENESS" as EffectivenessEvaluation["evaluationType"], targetedProblemType: "REWORK_LOOP",
    baselineWindow: "prev", evaluationWindow: "curr", baselineMetricValue: 10, currentMetricValue: 4, direction: "IMPROVED", confidence: "MEDIUM",
    supportingBeforeEventIds: ["b1"], supportingAfterEventIds: ["af1"], supportingProofIds: [], relatedOperationalEventIds: [],
    relatedEscalationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null,
    ownerVisibleSummary: "The hand-off change is being re-checked against the rework rate.", recommendedNextAction: "KEEP",
    approvalLevel: "MANAGER", missingData: [], evaluatedAt: AT, attributionState: attribution, ...over,
  };
}

function fullAnalysis() {
  // Complaint/rework flows through the correction router: an owner-escalation (reputation risk) + a
  // reassessment route (resolve the complaint events).
  const routing: ProcessCorrectionRouting = {
    workspaceId: wsL, evaluatedAt: AT, topCorrection: null,
    corrections: [
      correction("c-owner", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true }),
      correction("c-reassess", "RESOLVE_OPERATIONAL_EVENT", { severity: "HIGH" }),
    ],
  };
  const expansionInputs: BridgeExpansionInputs = {
    workload: { workspaceId: wsL, topFinding: null, evaluatedAt: AT, findings: [
      workload("DELEGATE_TO_MANAGER", "OWNER_REVIEW_BURDEN"),
      workload("KEEP_OWNER_APPROVAL", "CORRECTION_APPROVAL_BACKLOG", { severity: "CRITICAL" }),
    ] },
    capability: { workspaceId: wsL, topRecommendation: null, summary: { total: 2, critical: 0, high: 1, unlocksAutomation: 0 }, evaluatedAt: AT, recommendations: [
      capability("MISSING_OPERATIONAL_DATA", { dependsOnData: true, missingData: ["daily order log"] }),
      capability("NICE_TO_HAVE", { severity: "LOW", unlocksAutomation: false, dependsOnData: false, blocksToday: [] }),
    ] },
    sop: { workspaceId: wsL, topDraft: null, evaluatedAt: AT, drafts: [sop("c-sopstandalone")] },
    training: { workspaceId: wsL, topAssignment: null, evaluatedAt: AT, assignments: [training("c-trstandalone")] },
    effectiveness: { workspaceId: wsL, topEvaluation: null, evaluatedAt: AT, evaluations: [
      effectiveness("c-effgood", "MONITOR_ONLY_VERIFIED_IMPROVEMENT"),
      effectiveness("c-effbad", "VERIFIED_WORSENED_AFTER_EXECUTION"),
    ] },
  };
  const expansion = buildBridgeExpansion(expansionInputs, wsL);
  return buildProcessExecutionBridge(routing, null, wsL, AT, expansion);
}

const task = async (ws: string, key: string) => (await getPersistedProcessTasks(ws, deps)).find((t) => t.taskKey === key);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Workload/Capability/SOP-Training/Complaint bridge expansion (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `wc-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `wc-${mgr}@laundry.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const id of [wsL, wsClean]) await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `wc-${id.slice(0, 8)}`, createdBy: owner } });
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date() } });
    await persistProcessExecutionRoutes(wsL, fullAnalysis(), owner, deps);
  });
  afterAll(async () => {
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr] } } });
  });

  it("1. a workload finding persists as a safe delegation task (manager, evidence-gated completion)", async () => {
    const t = await task(wsL, "wl:OWNER_REVIEW_BURDEN");
    expect(t).toBeTruthy();
    expect(t!.sourceFamily).toBe("WORKLOAD_REDUCTION");
    expect(t!.executionRoute).toBe("CREATE_MANAGER_TASK");
    expect(t!.approvalLevel).toBe("MANAGER_APPROVAL_REQUIRED");
  });

  it("2. a data-dependent capability gap persists as a data task; a low-value gap stays MONITOR_ONLY (no flood)", async () => {
    const dataGap = await task(wsL, "cap:MISSING_OPERATIONAL_DATA");
    expect(dataGap!.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(dataGap!.requiredEvidence).toContain("daily order log");
    const lowValue = await task(wsL, "cap:NICE_TO_HAVE");
    expect(lowValue!.executionRoute).toBe("MONITOR_ONLY");
  });

  it("3. a standalone SOP gap persists as an SOP task requiring adoption evidence", async () => {
    const t = await task(wsL, "sop:c-sopstandalone");
    expect(t!.executionRoute).toBe("CREATE_SOP_CHECKLIST_TASK");
    expect(t!.requiredEvidence.join(" ")).toMatch(/adoption/i);
  });

  it("4. a standalone training gap persists as a coaching assignment", async () => {
    const t = await task(wsL, "tr:c-trstandalone:PROCESS_STEP_RETRAINING");
    expect(t!.executionRoute).toBe("CREATE_TRAINING_TASK");
    expect(t!.sourceFamily).toBe("TRAINING");
  });

  it("5. a complaint/rework correction persists a reassessment route and an owner-escalation route", async () => {
    const reassess = await task(wsL, "pc:c-reassess");
    expect(reassess!.executionRoute).toBe("CREATE_REASSESSMENT_TASK");
    const escalate = await task(wsL, "pc:c-owner");
    expect(escalate!.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
  });

  it("6. high-risk items require owner approval: KEEP_OWNER_APPROVAL + owner-escalation are owner-only", async () => {
    const keep = await task(wsL, "wl:CORRECTION_APPROVAL_BACKLOG");
    expect(keep!.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
    // A non-owner cannot approve the owner-controlled escalation; the owner can.
    const asMgr = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-owner", action: "APPROVE" }, deps);
    expect(asMgr.ok).toBe(false);
    const asOwner = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "APPROVE" }, deps);
    expect(asOwner.ok).toBe(true);
  });

  it("7. completion requires evidence on a bridged workload task", async () => {
    const noEv = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "wl:OWNER_REVIEW_BURDEN", action: "COMPLETE", evidenceRefs: [] }, deps);
    expect(noEv.ok).toBe(false);
    const withEv = await applyProcessExecutionAction({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: "wl:OWNER_REVIEW_BURDEN", action: "COMPLETE", evidenceRefs: ["delegated to the shift lead"], outcomeNotes: "done" }, deps);
    expect(withEv.ok).toBe(true);
  });

  it("8. the SOP-adherence re-check never fakes effectiveness: an IMPROVED re-check is monitor-only and not completable", async () => {
    const good = await task(wsL, "eff:c-effgood");
    expect(good!.executionRoute).toBe("MONITOR_ONLY");
    const complete = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "eff:c-effgood", action: "COMPLETE", evidenceRefs: ["x"] }, deps);
    expect(complete.ok).toBe(false); // monitor-only cannot be "completed" to claim it worked
    // A worsened-after-execution re-check is an actionable owner escalation (the fix failed).
    const bad = await task(wsL, "eff:c-effbad");
    expect(bad!.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
  });

  it("9. the cockpit still yields a single top actionable route (no owner overload)", () => {
    const analysis = fullAnalysis();
    expect(analysis.topRoute).not.toBeNull();
    expect(analysis.topRoute!.executionRoute).not.toBe("MONITOR_ONLY");
    expect(analysis.summary.total).toBe(analysis.routes.length);
    expect(analysis.summary.total).toBeGreaterThan(1); // many routes exist, but only one leads
  });

  it("10. workspace isolation: a foreign-workspace analysis persists nothing under a clean workspace", async () => {
    const foreign = await persistProcessExecutionRoutes(wsClean, fullAnalysis(), owner, deps); // analysis is scoped to wsL
    expect(foreign.created).toBe(0);
    expect(await getPersistedProcessTasks(wsClean, deps)).toHaveLength(0);
  });

  it("11. a clean workspace fabricates nothing", () => {
    const empty = buildBridgeExpansion({}, wsClean);
    expect(empty.routes).toHaveLength(0);
    const bridge = buildProcessExecutionBridge(null, null, wsClean, AT, empty);
    expect(bridge.routes).toHaveLength(0);
    expect(bridge.topRoute).toBeNull();
  });
});

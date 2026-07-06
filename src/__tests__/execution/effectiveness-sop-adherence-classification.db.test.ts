/**
 * Effectiveness / SOP-adherence classification hardening — real-business DB simulation (PASS 26).
 * Requires TEST_WITH_DB=true.
 *
 * Proves against real Postgres that effectiveness attribution is driven by the PERSISTED execution state and
 * can never overstate a fix: a correction is only "verified improved" when its task is COMPLETED with evidence
 * AND the outcome improved afterwards; an improvement without execution evidence is NOT attributed; execution
 * without a post-execution measurement routes to a reassessment; a worsened post-execution outcome escalates;
 * SOP adopted is distinct from SOP followed; training completed is distinct from effective; a monitor-only
 * verified improvement is persisted but NOT completable; isolation holds; a clean workspace fabricates nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import { buildBridgeExpansion } from "@/domain/owner-mode/process-execution-bridge-expansion";
import { buildEffectivenessEvaluations, type EffectivenessInputItem } from "@/domain/owner-mode/sop-training-effectiveness-loop";
import {
  correctionExecutionStateFromTask, classifySopAdherence, classifyTrainingEffectiveness,
} from "@/domain/owner-mode/effectiveness-attribution";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID(), mgr = randomUUID();
const wsL = randomUUID(), wsClean = randomUUID(), bizL = randomUUID();
const AT = "2026-07-06T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

function correction(id: string, type: CorrectionType, over: Partial<ProcessCorrection> = {}): ProcessCorrection {
  return {
    workspaceId: wsL, correctionId: id, sourceFindingType: "REWORK_LOOP", correctionType: type, title: "Fix", instruction: "do it",
    rationale: "risk", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"], targetActorId: null, targetManagerId: null,
    severity: "HIGH", confidence: "HIGH", priorityRank: 1, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false,
    autoExecutable: false, expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"],
    supportingProofIds: ["p1"], supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [],
    missingData: [], status: "PROPOSED", ...over,
  };
}
const task = async (ws: string, key: string) => (await getPersistedProcessTasks(ws, deps)).find((t) => t.taskKey === key);

/** Build an effectiveness item whose executionState comes from the persisted correction task. */
async function effItemFromTask(correctionId: string, metric: { base: number | null; cur: number | null; windowElapsed: boolean; minDataMet: boolean }): Promise<EffectivenessInputItem> {
  const t = await task(wsL, `pc:${correctionId}`);
  const executionState = correctionExecutionStateFromTask(t ? { status: t.status, evidenceCount: t.evidenceRefs.length, hasOutcomeNote: !!(t.notes && t.notes.trim()) } : null);
  const executed = executionState === "EXECUTED_WITH_EVIDENCE" || executionState === "EXECUTED_WITH_WEAK_EVIDENCE";
  return {
    kind: "CORRECTION", sourceCorrectionKey: correctionId, sourceTrainingKey: null, sourceProcessFindingKey: `${wsL}:REWORK_LOOP`,
    targetedProblemType: "REWORK_EVENTS", active: executed, executionState, windowElapsed: metric.windowElapsed, minDataMet: metric.minDataMet,
    baselineMetricValue: metric.base, currentMetricValue: metric.cur, baselineWindow: "prev", evaluationWindow: "curr",
    supportingBeforeEventIds: ["b1"], supportingAfterEventIds: ["af1"], supportingProofIds: [], relatedOperationalEventIds: [],
    relatedEscalationIds: [], relatedProfitLeak: null, relatedConstraint: null, relatedSLO: null, approvalLevel: "MANAGER", missingData: [],
  };
}
const attribution = async (correctionId: string, metric: Parameters<typeof effItemFromTask>[1]) =>
  buildEffectivenessEvaluations([await effItemFromTask(correctionId, metric)], wsL, AT).evaluations[0].attributionState;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Effectiveness / SOP-adherence classification hardening", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `eff-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `eff-${mgr}@laundry.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const id of [wsL, wsClean]) await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `eff-${id.slice(0, 8)}`, createdBy: owner } });
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Biz", businessType: "laundry", updatedAt: new Date() } });
    // Persist four correction tasks; drive them to the states each scenario needs.
    const routing: ProcessCorrectionRouting = {
      workspaceId: wsL, evaluatedAt: AT, topCorrection: null,
      corrections: [correction("c-verified", "REVIEW_PROCESS_STEP"), correction("c-notexec", "REVIEW_PROCESS_STEP"),
        correction("c-noout", "REVIEW_PROCESS_STEP"), correction("c-worse", "REVIEW_PROCESS_STEP")],
    };
    await persistProcessExecutionRoutes(wsL, buildProcessExecutionBridge(routing, null, wsL, AT), owner, deps);
    // c-verified, c-noout, c-worse → completed WITH evidence; c-notexec stays PROPOSED (never executed).
    for (const k of ["c-verified", "c-noout", "c-worse"]) {
      await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: `pc:${k}`, action: "START" }, deps);
      await applyProcessExecutionAction({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: `pc:${k}`, action: "COMPLETE", evidenceRefs: ["done with proof"], outcomeNotes: "carried out" }, deps);
    }
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

  it("1. a proposed (never-executed) correction cannot report improved effectiveness", async () => {
    const a = await attribution("c-notexec", { base: 10, cur: 4, windowElapsed: true, minDataMet: true });
    expect(a).toBe("IMPROVED_BUT_EXECUTION_NOT_PROVEN"); // improved metric, NO execution → not attributed
  });

  it("2. an executed correction WITHOUT a post-execution measurement → EXECUTED_BUT_OUTCOME_NOT_PROVEN", async () => {
    const a = await attribution("c-noout", { base: null, cur: 4, windowElapsed: false, minDataMet: false });
    expect(a).toBe("EXECUTED_BUT_OUTCOME_NOT_PROVEN");
  });

  it("3. an executed correction WITH an improved reassessment → verified monitor-only improvement", async () => {
    const a = await attribution("c-verified", { base: 10, cur: 4, windowElapsed: true, minDataMet: true });
    expect(a).toBe("MONITOR_ONLY_VERIFIED_IMPROVEMENT");
  });

  it("4. an improved outcome without execution evidence is NOT attributed to the correction", async () => {
    const a = await attribution("c-notexec", { base: 10, cur: 4, windowElapsed: true, minDataMet: true });
    expect(a).toBe("IMPROVED_BUT_EXECUTION_NOT_PROVEN");
  });

  it("5. a worsened post-execution outcome escalates to an owner follow-up route (persisted)", async () => {
    const evalr = buildEffectivenessEvaluations([await effItemFromTask("c-worse", { base: 4, cur: 10, windowElapsed: true, minDataMet: true })], wsL, AT);
    expect(evalr.evaluations[0].attributionState).toBe("VERIFIED_WORSENED_AFTER_EXECUTION");
    const expansion = buildBridgeExpansion({ effectiveness: evalr }, wsL);
    await persistProcessExecutionRoutes(wsL, buildProcessExecutionBridge(null, null, wsL, AT, expansion), owner, deps);
    const effTask = await task(wsL, "eff:c-worse");
    expect(effTask!.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(effTask!.approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("6. a monitor-only verified improvement is persisted but NOT completable (cannot be 'completed' to fake success)", async () => {
    const evalr = buildEffectivenessEvaluations([await effItemFromTask("c-verified", { base: 10, cur: 4, windowElapsed: true, minDataMet: true })], wsL, AT);
    const expansion = buildBridgeExpansion({ effectiveness: evalr }, wsL);
    await persistProcessExecutionRoutes(wsL, buildProcessExecutionBridge(null, null, wsL, AT, expansion), owner, deps);
    const effTask = await task(wsL, "eff:c-verified");
    expect(effTask!.executionRoute).toBe("MONITOR_ONLY");
    const complete = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "eff:c-verified", action: "COMPLETE", evidenceRefs: ["x"] }, deps);
    expect(complete.ok).toBe(false);
    if (!complete.ok) expect(complete.code).toBe("NEVER_AUTO");
  });

  it("7. SOP adopted with evidence but no adherence re-check → NEEDS_RECHECK; with a re-check → verified", async () => {
    const t = await task(wsL, "pc:c-verified");
    const es = correctionExecutionStateFromTask({ status: t!.status, evidenceCount: t!.evidenceRefs.length });
    expect(classifySopAdherence({ executionState: es, adherenceOutcome: "INSUFFICIENT_DATA", hasPostAdoptionCheck: false }).state).toBe("NEEDS_RECHECK");
    expect(classifySopAdherence({ executionState: es, adherenceOutcome: "IMPROVED", hasPostAdoptionCheck: true }).state).toBe("SOP_ADHERENCE_VERIFIED");
  });

  it("8. training completed with evidence but no reassessment → NEEDS_RECHECK", async () => {
    const t = await task(wsL, "pc:c-verified");
    const es = correctionExecutionStateFromTask({ status: t!.status, evidenceCount: t!.evidenceRefs.length });
    expect(classifyTrainingEffectiveness({ executionState: es, postTrainingOutcome: "INSUFFICIENT_DATA", hasPostTrainingCheck: false }).state).toBe("NEEDS_RECHECK");
  });

  it("9. training completed with a worsened post-training outcome → follow-up training route", async () => {
    const t = await task(wsL, "pc:c-verified");
    const es = correctionExecutionStateFromTask({ status: t!.status, evidenceCount: t!.evidenceRefs.length });
    const r = classifyTrainingEffectiveness({ executionState: es, postTrainingOutcome: "WORSENED", hasPostTrainingCheck: true });
    expect(r.state).toBe("POST_TRAINING_WORSENED");
    expect(r.route).toBe("CREATE_TRAINING_TASK");
  });

  it("10. an executed-but-not-yet-measured correction routes its bridge to a reassessment task", async () => {
    const evalr = buildEffectivenessEvaluations([await effItemFromTask("c-noout", { base: null, cur: 4, windowElapsed: false, minDataMet: false })], wsL, AT);
    const expansion = buildBridgeExpansion({ effectiveness: evalr }, wsL);
    await persistProcessExecutionRoutes(wsL, buildProcessExecutionBridge(null, null, wsL, AT, expansion), owner, deps);
    expect((await task(wsL, "eff:c-noout"))!.executionRoute).toBe("CREATE_REASSESSMENT_TASK");
  });

  it("11. workspace isolation: an effectiveness route persisted under wsL never appears in a clean workspace", async () => {
    expect(await getPersistedProcessTasks(wsClean, deps)).toHaveLength(0);
    expect((await getPersistedProcessTasks(wsL, deps)).some((t) => t.taskKey.startsWith("eff:"))).toBe(true);
  });

  it("12. a clean workspace fabricates no effectiveness route or reassessment", async () => {
    const empty = buildBridgeExpansion({}, wsClean);
    expect(empty.routes).toHaveLength(0);
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
  });
});

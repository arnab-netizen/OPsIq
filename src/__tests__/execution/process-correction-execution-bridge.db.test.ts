/**
 * Process-Correction Execution Bridge — real-business DB simulation (PASS 20). Requires TEST_WITH_DB=true.
 *
 * Proves the persisted governed loop end to end against real Postgres: cockpit findings become
 * ProcessExecutionTask rows (correction / SOP / training / reassessment / missing-data / owner-approval),
 * duplicates collapse, a task cannot complete without evidence, an owner-approval task cannot be completed by
 * a non-owner, completing a correction opens a governed reassessment, a clean workspace fabricates nothing,
 * and workspace isolation holds.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, completeProcessTask, type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";
import type { CashProfitProtectionAnalysis, CashProfitSignal } from "@/domain/owner-mode/cash-profit-protection";

const owner = randomUUID(), mgr = randomUUID();
const wsL = randomUUID(), wsClean = randomUUID(), bizL = randomUUID();
const AT = "2026-07-06T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

function correction(ws: string, over: Partial<ProcessCorrection> & { correctionType: CorrectionType }): ProcessCorrection {
  return {
    workspaceId: ws, correctionId: `c-${over.correctionType}`, sourceFindingType: "REWORK_LOOP",
    correctionType: over.correctionType, title: "Fix", instruction: "do the thing", rationale: "risk if ignored",
    affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"], targetActorId: null, targetManagerId: null,
    severity: "HIGH", confidence: "HIGH", priorityRank: 1, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false,
    autoExecutable: false, expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"],
    supportingProofIds: ["p1"], supportingOperationalEventIds: ["e1"], supportingEscalationIds: [], supportingAdjudicationIds: [],
    missingData: [], status: "PROPOSED", ...over,
  };
}
function routing(ws: string, corrections: ProcessCorrection[]): ProcessCorrectionRouting {
  return { workspaceId: ws, corrections, topCorrection: corrections[0] ?? null, evaluatedAt: AT };
}
function cashSignal(ws: string, over: Partial<CashProfitSignal> & { signalType: CashProfitSignal["signalType"] }): CashProfitSignal {
  return {
    workspaceId: ws, signalType: over.signalType, category: "DATA", severity: "LOW", confidence: "NEEDS_DATA",
    title: "Data", ownerExplanation: "capture data", protectiveAction: "CAPTURE_UNIT_ECONOMICS", approvalLevel: "MANAGER",
    requiresOwnerReview: false, riskGuardrail: "g", observedCount: 0, metricType: null, metricValue: null, metricThreshold: null,
    thresholdBreached: false, directionOnly: false, supportingProofIds: [], supportingOperationalEventIds: [],
    supportingFinancialSnapshotIds: [], relatedProcessFinding: null, missingData: ["per-job cost"], evaluatedAt: AT, ...over,
  };
}
function cash(ws: string, signals: CashProfitSignal[]): CashProfitProtectionAnalysis {
  return { workspaceId: ws, signals, topSignal: signals[0] ?? null, summary: { total: signals.length, critical: 0, high: 0, ownerReviewRequired: 0 }, evaluatedAt: AT };
}

function analysisFor(ws: string) {
  return buildProcessExecutionBridge(
    routing(ws, [
      correction(ws, { correctionType: "REVIEW_PROCESS_STEP", correctionId: "c-review" }),
      correction(ws, { correctionType: "UPDATE_CHECKLIST", correctionId: "c-sop" }),
      correction(ws, { correctionType: "ASSIGN_TRAINING_REVIEW", correctionId: "c-train" }),
      correction(ws, { correctionType: "RESOLVE_OPERATIONAL_EVENT", correctionId: "c-reassess" }),
      correction(ws, { correctionType: "ESCALATE_TO_OWNER", correctionId: "c-owner", requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, severity: "CRITICAL" }),
    ]),
    cash(ws, [cashSignal(ws, { signalType: "MISSING_UNIT_ECONOMICS" })]),
    ws, AT,
  );
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Process-Correction Execution Bridge (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `peb-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `peb-${mgr}@laundry.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const id of [wsL, wsClean]) await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `peb-${id.slice(0, 8)}`, createdBy: owner } });
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date() } });
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

  it("persists governed routes (correction/SOP/training/reassessment/owner-approval/missing-data) and dedupes on re-persist", async () => {
    const a = analysisFor(wsL);
    const r1 = await persistProcessExecutionRoutes(wsL, a, owner, deps);
    expect(r1.created).toBe(6);
    const rows = await getPersistedProcessTasks(wsL, deps);
    expect(rows).toHaveLength(6);
    const byKey = Object.fromEntries(rows.map((t) => [t.taskKey, t]));
    expect(byKey["pc:c-review"].executionRoute).toBe("CREATE_CORRECTION_TASK");
    expect(byKey["pc:c-sop"].executionRoute).toBe("CREATE_SOP_CHECKLIST_TASK");
    expect(byKey["pc:c-train"].executionRoute).toBe("CREATE_TRAINING_TASK");
    expect(byKey["pc:c-reassess"].executionRoute).toBe("CREATE_REASSESSMENT_TASK");
    expect(byKey["pc:c-owner"].executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
    expect(byKey["pc:c-owner"].approvalLevel).toBe("OWNER_APPROVAL_REQUIRED");
    expect(byKey["cp:MISSING_UNIT_ECONOMICS"].executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    // Re-persist identical analysis → all deduped, no new rows.
    const r2 = await persistProcessExecutionRoutes(wsL, a, owner, deps);
    expect(r2.created).toBe(0);
    expect(r2.deduped).toBe(6);
    expect(await getPersistedProcessTasks(wsL, deps)).toHaveLength(6);
  });

  it("a task cannot complete without required evidence", async () => {
    const res = await completeProcessTask({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-review", evidenceRefs: [] }, deps);
    expect(res.ok).toBe(false);
    const rows = await getPersistedProcessTasks(wsL, deps);
    expect(rows.find((t) => t.taskKey === "pc:c-review")!.status).toBe("PROPOSED");
  });

  it("an owner-approval task cannot be completed by a non-owner, but can by the owner", async () => {
    const asMgr = await completeProcessTask({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-owner", evidenceRefs: ["decision memo"] }, deps);
    expect(asMgr.ok).toBe(false);
    const asOwner = await completeProcessTask({ workspaceId: wsL, businessId: bizL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", evidenceRefs: ["decision memo"], outcomeNotes: "approved" }, deps);
    expect(asOwner.ok).toBe(true);
    expect((await getPersistedProcessTasks(wsL, deps)).find((t) => t.taskKey === "pc:c-owner")!.status).toBe("COMPLETED");
  });

  it("completing a correction with evidence opens a governed reassessment (did the fix work?)", async () => {
    const before = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL } });
    const res = await completeProcessTask({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-review", evidenceRefs: ["fixed the press step"], outcomeNotes: "root cause fixed" }, deps);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.reassessmentId).not.toBeNull();
    const after = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL } });
    expect(after).toBe(before + 1);
    const row = (await getPersistedProcessTasks(wsL, deps)).find((t) => t.taskKey === "pc:c-review")!;
    expect(row.status).toBe("COMPLETED");
    expect(row.reassessmentId).not.toBeNull();
  });

  it("a clean workspace fabricates no tasks, and isolation never persists another workspace's routes", async () => {
    // The analysis is scoped to wsL; persisting it under wsClean must skip every foreign route.
    const foreign = await persistProcessExecutionRoutes(wsClean, analysisFor(wsL), owner, deps);
    expect(foreign.created).toBe(0);
    expect(await getPersistedProcessTasks(wsClean, deps)).toHaveLength(0);
  });
});

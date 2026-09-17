/**
 * Interactive Process-Execution Affordances — real-business DB simulation (PASS 22). Requires TEST_WITH_DB=true.
 *
 * Proves the governed interactive loop against real Postgres: tasks created from the bridge, START/APPROVE/
 * REJECT/DELEGATE/SUBMIT_EVIDENCE/COMPLETE/MARK_BLOCKED/REQUEST_MISSING_DATA/REQUEST_REASSESSMENT, with
 * fail-closed guardrails (owner-only approval, no unsafe delegate, evidence-gated completion, terminal +
 * cross-workspace rejection), an audit event on every transition, a completion-triggered reassessment,
 * workspace isolation, and a clean workspace that fabricates nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge, type BridgedExecutionRoute, type ProcessExecutionBridgeAnalysis } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID(), mgr = randomUUID();
const wsL = randomUUID(), wsClean = randomUUID(), bizL = randomUUID();
const AT = "2026-07-06T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

function correction(ws: string, id: string, type: CorrectionType, over: Partial<ProcessCorrection> = {}): ProcessCorrection {
  return {
    workspaceId: ws, correctionId: id, sourceFindingType: "REWORK_LOOP", correctionType: type, title: "Fix", instruction: "do it",
    rationale: "risk", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"], targetActorId: null, targetManagerId: null,
    severity: "HIGH", confidence: "HIGH", priorityRank: 1, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false,
    autoExecutable: false, expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"],
    supportingProofIds: ["p1"], supportingOperationalEventIds: [], supportingEscalationIds: [], supportingAdjudicationIds: [],
    missingData: [], status: "PROPOSED", ...over,
  };
}
function analysis(ws: string) {
  const routing: ProcessCorrectionRouting = {
    workspaceId: ws, evaluatedAt: AT, topCorrection: null,
    corrections: [
      correction(ws, "c-mgr", "REVIEW_PROCESS_STEP"),
      correction(ws, "c-owner", "ESCALATE_TO_OWNER", { requiredApprovalLevel: "OWNER", requiresOwnerApproval: true, severity: "CRITICAL" }),
    ],
  };
  return buildProcessExecutionBridge(routing, null, ws, AT);
}
const status = async (ws: string, key: string) => (await getPersistedProcessTasks(ws, deps)).find((t) => t.taskKey === key);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Interactive Process-Execution Affordances (laundry)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `aff-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `aff-${mgr}@laundry.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const id of [wsL, wsClean]) await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `aff-${id.slice(0, 8)}`, createdBy: owner } });
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date() } });
    await persistProcessExecutionRoutes(wsL, analysis(wsL), owner, deps);
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

  it("START moves a manager task to IN_PROGRESS and writes an audit event", async () => {
    const before = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "owner.process_execution_task_transitioned" } });
    const r = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-mgr", action: "START" }, deps);
    expect(r.ok).toBe(true);
    expect((await status(wsL, "pc:c-mgr"))!.status).toBe("IN_PROGRESS");
    expect(await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "owner.process_execution_task_transitioned" } })).toBe(before + 1);
  });

  it("an owner-approval task cannot be approved by a non-owner, but can by the owner", async () => {
    const asMgr = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-owner", action: "APPROVE" }, deps);
    expect(asMgr.ok).toBe(false);
    const asOwner = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "APPROVE" }, deps);
    expect(asOwner.ok).toBe(true);
    expect((await status(wsL, "pc:c-owner"))!.status).toBe("APPROVED");
  });

  it("an owner-approval task cannot be delegated; a manager task can be delegated to STAFF", async () => {
    const delOwner = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "DELEGATE", delegateToRole: "STAFF" }, deps);
    expect(delOwner.ok).toBe(false);
    const delMgr = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-mgr", action: "DELEGATE", delegateToRole: "STAFF" }, deps);
    expect(delMgr.ok).toBe(true);
    expect((await status(wsL, "pc:c-mgr"))!.actionOwner).toBe("STAFF");
  });

  it("REJECT requires a reason and records it (owner-controlled task, owner only)", async () => {
    const noReason = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "REJECT" }, deps);
    expect(noReason.ok).toBe(false);
    const rejMgr = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-owner", action: "REJECT", reason: "not needed" }, deps);
    expect(rejMgr.ok).toBe(false); // non-owner can't reject an owner-controlled task
    const rej = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "REJECT", reason: "duplicate of an existing fix" }, deps);
    expect(rej.ok).toBe(true);
    const t = await status(wsL, "pc:c-owner");
    expect(t!.status).toBe("REJECTED");
    expect(t!.notes).toMatch(/duplicate/i);
  });

  it("a terminal (rejected) task refuses further action", async () => {
    const r = await applyProcessExecutionAction({ workspaceId: wsL, actorId: owner, actorRole: "owner", taskKey: "pc:c-owner", action: "START" }, deps);
    expect(r.ok).toBe(false);
  });

  it("COMPLETE requires evidence; with evidence it completes and opens a governed reassessment", async () => {
    const noEv = await applyProcessExecutionAction({ workspaceId: wsL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-mgr", action: "COMPLETE", evidenceRefs: [] }, deps);
    expect(noEv.ok).toBe(false);
    const before = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL } });
    const done = await applyProcessExecutionAction({ workspaceId: wsL, businessId: bizL, actorId: mgr, actorRole: "manager", taskKey: "pc:c-mgr", action: "COMPLETE", evidenceRefs: ["fixed the press step"], outcomeNotes: "root cause fixed" }, deps);
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.reassessmentId).not.toBeNull();
    expect((await status(wsL, "pc:c-mgr"))!.status).toBe("COMPLETED");
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsL } })).toBe(before + 1);
  });

  it("a foreign-workspace task fails closed", async () => {
    const r = await applyProcessExecutionAction({ workspaceId: wsClean, actorId: owner, actorRole: "owner", taskKey: "pc:c-mgr", action: "START" }, deps);
    expect(r.ok).toBe(false);
    expect(await getPersistedProcessTasks(wsClean, deps)).toHaveLength(0);
  });
});

// ── Additional guardrails: the remaining interactive transitions on their own fresh tasks ────────────────
const wsB = randomUUID(), bizB = randomUUID(), bizB2 = randomUUID(), ownerB = randomUUID();
const wsForeign = randomUUID(), bizForeign = randomUUID(), ownerForeign = randomUUID();
function route(ws: string, key: string, over: Partial<BridgedExecutionRoute>): BridgedExecutionRoute {
  return {
    workspaceId: ws, taskKey: key, sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: key.replace("pc:", ""),
    executionRoute: "CREATE_MANAGER_TASK", actionOwner: "MANAGER", approvalLevel: "MANAGER_APPROVAL_REQUIRED",
    requiredEvidence: ["evidence the correction was carried out"], completionCriteria: "The manager completes the correction and records the result.",
    reassessmentTrigger: "Re-evaluate at the next owner review.", riskIfIgnored: "the breakdown compounds if left",
    ownerVisibleSummary: "Fix the manager task", notActionableReason: null, evidenceRefs: [], severity: "HIGH", priorityRank: 1,
    status: "PROPOSED", ...over,
  };
}
function manualAnalysis(ws: string): ProcessExecutionBridgeAnalysis {
  const routes = [
    route(ws, "pc:mgr2", {}),
    route(ws, "pc:corr", { executionRoute: "CREATE_CORRECTION_TASK", ownerVisibleSummary: "Fix the correction" }),
    route(ws, "pc:blk", { executionRoute: "BLOCK_UNSAFE_ACTION", approvalLevel: "NEVER_AUTO", actionOwner: "OWNER", ownerVisibleSummary: "Blocked unsafe action", severity: "CRITICAL" }),
    // Business-scoped task (businessId stamped, unlike the workspace-level rows above) used by the
    // REQUEST_REASSESSMENT businessId guardrail tests (PR H) -- needed to exercise the task/business
    // mismatch guard, which only fires when the task itself carries a businessId.
    route(ws, "pc:bizscoped", { businessId: bizB, ownerVisibleSummary: "Fix the business-scoped correction" }),
  ];
  return { workspaceId: ws, routes, topRoute: routes[0], summary: { total: 4, ownerApproval: 0, managerStaff: 3, dataTasks: 0, monitorOnly: 0 }, evaluatedAt: AT };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Interactive Process-Execution Affordances — additional guardrails", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: ownerB, email: `affb-${ownerB}@laundry.test`, name: "Owner B", isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsB, name: `WS ${wsB.slice(0, 8)}`, slug: `affb-${wsB.slice(0, 8)}`, createdBy: ownerB } });
    await db.clientAccount.create({ data: { id: wsB, workspaceId: wsB, name: "Sparkle Laundry B Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizB, workspaceId: wsB, name: "Sparkle Laundry B", businessType: "laundry", updatedAt: new Date() } });
    // A second, legitimate business in the SAME workspace -- valid on its own, but not the one
    // "pc:bizscoped" belongs to. Used to prove the task/business mismatch guard (PR H).
    await db.ownerBusiness.create({ data: { id: bizB2, workspaceId: wsB, name: "Sparkle Laundry B — Second Location", businessType: "laundry", updatedAt: new Date() } });
    // A wholly separate workspace + business -- used to prove a foreign/spoofed businessId from
    // another workspace is rejected (PR H).
    await db.user.create({ data: { id: ownerForeign, email: `affb-foreign-${ownerForeign}@laundry.test`, name: "Owner Foreign", isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsForeign, name: `WS ${wsForeign.slice(0, 8)}`, slug: `affb-foreign-${wsForeign.slice(0, 8)}`, createdBy: ownerForeign } });
    await db.clientAccount.create({ data: { id: wsForeign, workspaceId: wsForeign, name: "Foreign Client", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizForeign, workspaceId: wsForeign, name: "Foreign Business", businessType: "laundry", updatedAt: new Date() } });
    await persistProcessExecutionRoutes(wsB, manualAnalysis(wsB), ownerB, deps);
  });
  afterAll(async () => {
    await db.processExecutionTask.deleteMany({ where: { workspaceId: wsB } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: [wsB, wsForeign] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsB, wsForeign] } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: [bizB, bizB2, bizForeign] } } });
    await db.clientAccount.deleteMany({ where: { id: { in: [wsB, wsForeign] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsB, wsForeign] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerB, ownerForeign] } } });
  });

  it("an unsafe / NEVER_AUTO route stays blocked: it cannot be started, approved, or delegated", async () => {
    const start = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:blk", action: "START" }, deps);
    expect(start.ok).toBe(false);
    const approve = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:blk", action: "APPROVE" }, deps);
    expect(approve.ok).toBe(false);
    const delegate = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:blk", action: "DELEGATE", delegateToRole: "MANAGER" }, deps);
    expect(delegate.ok).toBe(false);
    expect((await status(wsB, "pc:blk"))!.status).toBe("PROPOSED");
  });

  it("MARK_BLOCKED needs a reason, sets BLOCKED with a note + audit, and a blocked task can be re-started", async () => {
    const noReason = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "MARK_BLOCKED" }, deps);
    expect(noReason.ok).toBe(false);
    const before = await db.auditEvent.count({ where: { workspaceId: wsB, eventName: "owner.process_execution_task_transitioned" } });
    const blocked = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "MARK_BLOCKED", reason: "waiting on the supplier part" }, deps);
    expect(blocked.ok).toBe(true);
    const t = await status(wsB, "pc:mgr2");
    expect(t!.status).toBe("BLOCKED");
    expect(t!.notes).toMatch(/supplier part/i);
    expect(await db.auditEvent.count({ where: { workspaceId: wsB, eventName: "owner.process_execution_task_transitioned" } })).toBe(before + 1);
    const restart = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "START" }, deps);
    expect(restart.ok).toBe(true);
    expect((await status(wsB, "pc:mgr2"))!.status).toBe("IN_PROGRESS");
  });

  it("REQUEST_MISSING_DATA parks the task at NEEDS_DATA", async () => {
    const r = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "REQUEST_MISSING_DATA" }, deps);
    expect(r.ok).toBe(true);
    expect((await status(wsB, "pc:mgr2"))!.status).toBe("NEEDS_DATA");
  });

  it("SUBMIT_EVIDENCE requires evidence, appends it, and moves a fresh task into progress", async () => {
    const empty = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "SUBMIT_EVIDENCE", evidenceRefs: [] }, deps);
    expect(empty.ok).toBe(false);
    const r = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "SUBMIT_EVIDENCE", evidenceRefs: ["photo-of-fix"] }, deps);
    expect(r.ok).toBe(true);
    const t = await status(wsB, "pc:corr");
    expect(t!.status).toBe("IN_PROGRESS");
    expect(t!.evidenceRefs).toContain("photo-of-fix");
  });

  it("DELEGATE moves a manager task to a named STAFF owner and writes an audit event", async () => {
    const before = await db.auditEvent.count({ where: { workspaceId: wsB, eventName: "owner.process_execution_task_transitioned" } });
    const r = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "DELEGATE", delegateToRole: "STAFF" }, deps);
    expect(r.ok).toBe(true);
    expect((await status(wsB, "pc:corr"))!.actionOwner).toBe("STAFF");
    expect(await db.auditEvent.count({ where: { workspaceId: wsB, eventName: "owner.process_execution_task_transitioned" } })).toBe(before + 1);
  });

  it("COMPLETE is idempotent: a second completion is refused and the reassessment is opened exactly once", async () => {
    const first = await applyProcessExecutionAction({ workspaceId: wsB, businessId: bizB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "COMPLETE", evidenceRefs: ["signed-off"], outcomeNotes: "resolved" }, deps);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.reassessmentId).not.toBeNull();
    const reassessCount = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } });
    const second = await applyProcessExecutionAction({ workspaceId: wsB, businessId: bizB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "COMPLETE", evidenceRefs: ["signed-off-again"], outcomeNotes: "resolved" }, deps);
    expect(second.ok).toBe(false);
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } })).toBe(reassessCount);
    expect((await status(wsB, "pc:corr"))!.status).toBe("COMPLETED");
  });

  it("re-materialising the bridge never clobbers an owner-advanced task (a delegate survives re-persist)", async () => {
    // pc:mgr2 was delegated/blocked/parked earlier; ensure a fresh delegate then a re-persist keeps it.
    const del = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "DELEGATE", delegateToRole: "STAFF" }, deps);
    // pc:mgr2 is at NEEDS_DATA from an earlier test; delegate only works from PROPOSED/IN_PROGRESS, so start first if needed.
    if (!del.ok) {
      await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "START" }, deps);
      await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:mgr2", action: "DELEGATE", delegateToRole: "STAFF" }, deps);
    }
    const advanced = await status(wsB, "pc:mgr2");
    expect(advanced!.actionOwner).toBe("STAFF");
    // Re-derive + re-persist the ORIGINAL analysis (actionOwner MANAGER); the owner-advanced row must be untouched.
    await persistProcessExecutionRoutes(wsB, manualAnalysis(wsB), ownerB, deps);
    const after = await status(wsB, "pc:mgr2");
    expect(after!.actionOwner).toBe("STAFF");
    expect(after!.status).toBe(advanced!.status);
  });

  it("REQUEST_REASSESSMENT re-opens the question on a completed task (needs a businessId)", async () => {
    // This is exactly the failure a real owner hit before PR H: OwnerCockpitPage's onAction()
    // never sent businessId for REQUEST_REASSESSMENT, so every real click reproduced this
    // `noBiz` branch (MISSING_INPUT/400) and no reassessment was ever created.
    const noBiz = await applyProcessExecutionAction({ workspaceId: wsB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "REQUEST_REASSESSMENT" }, deps);
    expect(noBiz.ok).toBe(false);
    expect((noBiz as { code?: string }).code).toBe("MISSING_INPUT");
    const before = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } });
    const r = await applyProcessExecutionAction({ workspaceId: wsB, businessId: bizB, actorId: ownerB, actorRole: "owner", taskKey: "pc:corr", action: "REQUEST_REASSESSMENT", reason: "the breakdown came back" }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reassessmentId).not.toBeNull();
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } })).toBe(before + 1);
    if (!r.ok) return;
    // The row actually persists with the supplied businessId (not null, not some other business).
    const row = await db.ownerReassessmentEvent.findUnique({ where: { id: r.reassessmentId! } });
    expect(row?.businessId).toBe(bizB);
    expect(row?.trigger).toBe("owner_dispute");
    expect(row?.workspaceId).toBe(wsB);
    // The correct audit event is emitted for the reassessment creation, in the same transaction.
    const audit = await db.auditEvent.findFirst({
      where: { workspaceId: wsB, eventName: "owner.reassessment_created", entityId: r.reassessmentId! },
    });
    expect(audit).not.toBeNull();
    expect((audit?.payload as { businessId?: string } | null)?.businessId).toBe(bizB);
  });

  it("rejects a foreign businessId (a different workspace's business) — WRONG_WORKSPACE, no reassessment created", async () => {
    const before = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } });
    const r = await applyProcessExecutionAction(
      { workspaceId: wsB, businessId: bizForeign, actorId: ownerB, actorRole: "owner", taskKey: "pc:bizscoped", action: "REQUEST_REASSESSMENT" },
      deps,
    );
    expect(r.ok).toBe(false);
    expect((r as { code?: string }).code).toBe("WRONG_WORKSPACE");
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } })).toBe(before);
  });

  it("rejects a mismatched task/business pairing — a real, in-workspace business that is not this task's own business", async () => {
    // bizB2 is a genuine business in wsB (passes businessInWorkspace), but "pc:bizscoped" belongs
    // to bizB, not bizB2 -- defense-in-depth must still reject this as not-found.
    const before = await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } });
    const r = await applyProcessExecutionAction(
      { workspaceId: wsB, businessId: bizB2, actorId: ownerB, actorRole: "owner", taskKey: "pc:bizscoped", action: "REQUEST_REASSESSMENT" },
      deps,
    );
    expect(r.ok).toBe(false);
    expect((r as { code?: string }).code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(await db.ownerReassessmentEvent.count({ where: { workspaceId: wsB } })).toBe(before);
    // The correct (matching) businessId still succeeds on the same task.
    const ok = await applyProcessExecutionAction(
      { workspaceId: wsB, businessId: bizB, actorId: ownerB, actorRole: "owner", taskKey: "pc:bizscoped", action: "REQUEST_REASSESSMENT" },
      deps,
    );
    expect(ok.ok).toBe(true);
  });
});

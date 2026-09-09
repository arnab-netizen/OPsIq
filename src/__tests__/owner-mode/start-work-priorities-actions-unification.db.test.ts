/**
 * [db] Start Work -> Priorities -> Actions unification — controlled-beta P0 regression proof.
 *
 * Root cause this closes: Home's "Start Work" persists a ProcessExecutionTask row (status ->
 * IN_PROGRESS). Priorities already read the SAME row via getOwnerNowView().processExecution.topRoute
 * but hardcoded the action label "Go to Home to start this" regardless of status, so an already-
 * started item still read as un-started. Actions (/owner/tasks) read only DelegatedTask -- a
 * completely different model -- so an owner-started ProcessExecutionTask never appeared there at
 * all ("No tasks delegated yet" even after Start Work). Separately, every taskKey format in this
 * domain (pc:/cp:/wl:/cap:/sop:/tr:/eff:) had no business dimension, so two businesses in one
 * workspace with the same finding type would collide on the same persisted row. This test drives
 * the REAL service functions and a real database throughout -- no client-only mocked state.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/start-work-priorities-actions-unification.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import type { CashProfitProtectionAnalysis, CashProfitSignal } from "@/domain/owner-mode/cash-profit-protection";
import {
  persistProcessExecutionRoutes,
  applyProcessExecutionAction,
  getPersistedProcessTasks,
} from "@/services/owner-mode/process-execution-bridge.service";
import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-09-09T00:00:00Z");
const minDeps = { db: prisma as unknown as GuidanceDeps["db"], uuid: () => randomUUID(), now: () => NOW.getTime() } satisfies Partial<GuidanceDeps> as unknown as GuidanceDeps;

const actorId = randomUUID();
const ws = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID(); // same workspace as bizA
const bizC = randomUUID(); // different workspace entirely

function missingUnitEconomicsSignal(workspaceId: string): CashProfitSignal {
  return {
    workspaceId,
    signalType: "MISSING_UNIT_ECONOMICS",
    category: "DATA",
    severity: "MEDIUM",
    confidence: "NEEDS_DATA",
    title: "Add the missing operational data to routine capture",
    ownerExplanation: "OpsIQ cannot support a profit figure without real unit-economics inputs.",
    protectiveAction: "CAPTURE_UNIT_ECONOMICS",
    approvalLevel: "STAFF",
    requiresOwnerReview: false,
    riskGuardrail: "OpsIQ will not estimate a profit figure it cannot support — capture the missing data and the protection sharpens.",
    observedCount: 1,
    metricType: null,
    metricValue: null,
    metricThreshold: null,
    thresholdBreached: false,
    directionOnly: true,
    supportingProofIds: [],
    supportingOperationalEventIds: [],
    supportingFinancialSnapshotIds: [],
    relatedProcessFinding: null,
    missingData: ["unit cost per job"],
    evaluatedAt: NOW.toISOString(),
  };
}

function cashProfitAnalysis(workspaceId: string): CashProfitProtectionAnalysis {
  const signal = missingUnitEconomicsSignal(workspaceId);
  return {
    workspaceId,
    signals: [signal],
    topSignal: signal,
    summary: { total: 1, critical: 0, high: 0, ownerReviewRequired: 0 },
    evaluatedAt: NOW.toISOString(),
  };
}

async function seedBusiness(workspaceId: string, businessId: string, name: string) {
  await db.ownerBusiness.create({
    data: { id: businessId, workspaceId, name, businessType: "laundry_dry_cleaning", currency: "INR", createdBy: actorId },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Start Work -> Priorities -> Actions unification", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `swp-unify-${actorId}@test.local`, name: "SWP Unify Test", isActive: true, updatedAt: NOW },
    });
    for (const [id, label, w] of [[ws, "primary", ws], [wsB, "other", wsB]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `SWP Unify WS ${label} ${id.slice(0, 8)}`, slug: `swp-unify-${label}-${id.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
      });
      void w;
    }
    await seedBusiness(ws, bizA, "SWP Unify Business A");
    await seedBusiness(ws, bizB, "SWP Unify Business B");
    await seedBusiness(wsB, bizC, "SWP Unify Business C (other workspace)");
  });

  afterAll(async () => {
    await db.processExecutionTaskProgress.deleteMany({ where: { workspaceId: { in: [ws, wsB] } } });
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: [ws, wsB] } } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [ws, wsB] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [ws, wsB] } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [ws, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [ws, wsB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] A. the recommendation appears as an actionable, startable route for Business A", async () => {
    const analysis = buildProcessExecutionBridge(null, cashProfitAnalysis(ws), ws, NOW.toISOString(), null, bizA);
    expect(analysis.topRoute).not.toBeNull();
    expect(analysis.topRoute!.taskKey).toBe(`cp:${bizA}:MISSING_UNIT_ECONOMICS`);
    expect(analysis.topRoute!.canStart).toBe(true);
    expect(analysis.topRoute!.businessId).toBe(bizA);

    const persisted = await persistProcessExecutionRoutes(ws, analysis, actorId);
    expect(persisted.created).toBe(1);
  });

  it("[db] B+C. Start Work succeeds and the canonical execution row exists exactly once", async () => {
    const taskKey = `cp:${bizA}:MISSING_UNIT_ECONOMICS`;
    const result = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey, action: "START", businessId: bizA,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe("IN_PROGRESS");

    const rows = await db.processExecutionTask.findMany({ where: { workspaceId: ws, taskKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("IN_PROGRESS");
    expect(rows[0].workStartedAt).not.toBeNull();
    expect(rows[0].businessId).toBe(bizA);
  });

  it("[db] D+E. Home and Priorities (the same getOwnerNowView topRoute) both report started/in-progress, and canStart is false", async () => {
    // Exercise the REAL, live getOwnerNowView pipeline end-to-end -- not a re-injection of the
    // synthetic analysis from test A. A near-empty workspace's own live process-correction/
    // expansion engines organically produce SOME actionable, workspace-scoped route (typically a
    // data-insufficiency-driven one); this proves the status-annotation join in
    // buildBusinessOperatingSystem/buildProcessExecutionBridge's caller (owner-now-view.service.ts)
    // -- the exact mechanism Home, Priorities, and Actions all read -- correctly threads a
    // persisted status back onto whatever the live topRoute actually is.
    const before = await getOwnerNowView(ws, bizA, minDeps);
    const liveTopRoute = before.processExecution?.topRoute;
    expect(liveTopRoute).toBeTruthy();
    expect(liveTopRoute!.status).toBe("PROPOSED");
    expect(liveTopRoute!.canStart).toBe(true);

    // Mirrors exactly what POST /api/owner/process-execution does before applying an action:
    // materialise the freshly-computed live routes as real ProcessExecutionTask rows first.
    await persistProcessExecutionRoutes(ws, before.processExecution!, actorId);

    const started = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey: liveTopRoute!.taskKey, action: "START", businessId: bizA,
    });
    expect(started.ok).toBe(true);

    const after = await getOwnerNowView(ws, bizA, minDeps);
    const sameRoute = after.processExecution!.routes.find((r) => r.taskKey === liveTopRoute!.taskKey);
    expect(sameRoute).toBeDefined();
    // D: Home's own state.
    expect(sameRoute!.status).toBe("IN_PROGRESS");
    // E: this is the exact field Priorities' action-label branch (owner/priorities/page.tsx) reads
    // to decide between "Go to Home to start this" and "In progress — continue on Home". False here
    // proves Priorities no longer renders the stale "start this" label for an already-started item.
    expect(sameRoute!.canStart).toBe(false);
  });

  it("[db] F. Actions (the persisted-task read path) lists the started item", async () => {
    const persisted = await getPersistedProcessTasks(ws);
    const match = persisted.find((t) => t.status === "IN_PROGRESS" && t.workStartedAt !== null);
    expect(match).toBeDefined();
  });

  it("[db] G. refresh / read-again preserves state", async () => {
    const view1 = await getOwnerNowView(ws, bizA, minDeps);
    const view2 = await getOwnerNowView(ws, bizA, minDeps);
    // The item started in test D+E (the live, workspace-scoped route) is IN_PROGRESS on repeated
    // reads -- proves the persisted status survives a fresh view computation, not just a cached one.
    const r1 = view1.processExecution!.routes.find((r) => r.status === "IN_PROGRESS");
    const r2 = view2.processExecution!.routes.find((r) => r.status === "IN_PROGRESS");
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.taskKey).toBe(r2!.taskKey);
    const rows = await db.processExecutionTask.findMany({ where: { workspaceId: ws, taskKey: r1!.taskKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("IN_PROGRESS");
  });

  it("[db] H. a duplicate START does not create a duplicate action (rejected, not silently re-created)", async () => {
    const taskKey = `cp:${bizA}:MISSING_UNIT_ECONOMICS`;
    const second = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey, action: "START", businessId: bizA,
    });
    // Already IN_PROGRESS is not a startable status -- refused, not a silent success that would
    // suggest a second row was created.
    expect(second.ok).toBe(false);
    const rows = await db.processExecutionTask.findMany({ where: { workspaceId: ws, taskKey } });
    expect(rows).toHaveLength(1);
  });

  it("[db] I. Complete transitions the same canonical item (evidence-gated)", async () => {
    const taskKey = `cp:${bizA}:MISSING_UNIT_ECONOMICS`;
    const result = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey, action: "COMPLETE", businessId: bizA,
      evidenceRefs: ["captured unit cost per job for the affected line"],
    });
    expect(result.ok).toBe(true);
    const rows = await db.processExecutionTask.findMany({ where: { workspaceId: ws, taskKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("COMPLETED");
    expect(rows[0].completedByUserId).toBe(actorId);
  });

  it("[db] J. Business A's action does not appear under Business B (same workspace, same signal type)", async () => {
    // Business B independently has the SAME signal type -- before the businessId-embedded taskKey
    // fix, this would have upserted into and read the SAME row as Business A's (now-completed) task.
    const analysisB = buildProcessExecutionBridge(null, cashProfitAnalysis(ws), ws, NOW.toISOString(), null, bizB);
    expect(analysisB.topRoute!.taskKey).toBe(`cp:${bizB}:MISSING_UNIT_ECONOMICS`);
    expect(analysisB.topRoute!.taskKey).not.toBe(`cp:${bizA}:MISSING_UNIT_ECONOMICS`);

    const persistedB = await persistProcessExecutionRoutes(ws, analysisB, actorId);
    expect(persistedB.created).toBe(1); // a genuinely new row, not deduped against Business A's

    // Business B's own row is a genuinely separate, fresh PROPOSED row -- never Business A's
    // (now-completed) one, despite both being triggered by the identical signal type.
    const rowA = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: `cp:${bizA}:MISSING_UNIT_ECONOMICS` } });
    const rowB = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: `cp:${bizB}:MISSING_UNIT_ECONOMICS` } });
    expect(rowA!.id).not.toBe(rowB!.id);
    expect(rowA!.status).toBe("COMPLETED");
    expect(rowA!.businessId).toBe(bizA);
    expect(rowB!.status).toBe("PROPOSED");
    expect(rowB!.businessId).toBe(bizB);

    // Starting Business B's own task from Business B's own view works normally -- proves this
    // isn't merely "not the same row" but a genuinely independent, actionable lifecycle.
    const startB = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey: `cp:${bizB}:MISSING_UNIT_ECONOMICS`, action: "START", businessId: bizB,
    });
    expect(startB.ok).toBe(true);
    const rowBAfter = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: `cp:${bizB}:MISSING_UNIT_ECONOMICS` } });
    expect(rowBAfter!.status).toBe("IN_PROGRESS");
    // Business A's row is completely unaffected by Business B's independent Start Work.
    const rowAAfter = await db.processExecutionTask.findFirst({ where: { workspaceId: ws, taskKey: `cp:${bizA}:MISSING_UNIT_ECONOMICS` } });
    expect(rowAAfter!.status).toBe("COMPLETED");

    // Acting on Business A's exact taskKey while claiming to be Business B is refused, not
    // silently allowed to touch Business A's row.
    const crossAttempt = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey: `cp:${bizA}:MISSING_UNIT_ECONOMICS`, action: "START", businessId: bizB,
    });
    expect(crossAttempt.ok).toBe(false);
    if (!crossAttempt.ok) expect(crossAttempt.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("[db] K. Workspace A's action does not appear in Workspace B", async () => {
    const analysisC = buildProcessExecutionBridge(null, cashProfitAnalysis(wsB), wsB, NOW.toISOString(), null, bizC);
    await persistProcessExecutionRoutes(wsB, analysisC, actorId);

    const rowsInWsB = await db.processExecutionTask.findMany({ where: { workspaceId: wsB } });
    expect(rowsInWsB.every((r) => r.taskKey !== `cp:${bizA}:MISSING_UNIT_ECONOMICS` && r.taskKey !== `cp:${bizB}:MISSING_UNIT_ECONOMICS`)).toBe(true);

    const rowsInWsA = await db.processExecutionTask.findMany({ where: { workspaceId: ws } });
    expect(rowsInWsA.every((r) => r.taskKey !== `cp:${bizC}:MISSING_UNIT_ECONOMICS`)).toBe(true);

    // Acting on workspace B's task while authenticated against workspace A is refused (existing,
    // pre-this-fix workspace isolation -- verified still holds).
    const crossWorkspace = await applyProcessExecutionAction({
      workspaceId: ws, actorId, actorRole: "owner", taskKey: `cp:${bizC}:MISSING_UNIT_ECONOMICS`, action: "START", businessId: bizA,
    });
    expect(crossWorkspace.ok).toBe(false);
  });
});

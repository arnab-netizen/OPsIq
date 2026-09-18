/**
 * Fresh cockpit priority execution-route materialisation — REAL route + REAL Postgres.
 * `[db]`-gated (TEST_WITH_DB=true).
 *
 * LIVE-PROVEN FAILURE (production): a freshly-surfaced cockpit "Top Priority" (a governed
 * PROCESS_CORRECTION/CASH_PROFIT bridge route the owner has never acted on before, so no
 * `ProcessExecutionTask` row exists for it yet) could be visible and clickable in the UI, but
 * START/COMPLETE always returned HTTP 400 `NOT_FOUND_OR_FORBIDDEN`. The SAME task became
 * actionable only after REQUEST_REASSESSMENT (which happens to send `businessId`), which
 * implicitly caused the row to be created.
 *
 * ROOT CAUSE: POST /api/owner/process-execution's server-authoritative materialisation step
 * re-derives the bridge via `getOwnerNowView(workspaceId, input.businessId ?? null)` before
 * persisting/looking up the task. Most actions (START/APPROVE/REJECT/DELEGATE/SUBMIT_EVIDENCE/
 * COMPLETE/MARK_BLOCKED/REQUEST_MISSING_DATA/ACKNOWLEDGE/RECORD_PROGRESS) never carry
 * `input.businessId` — by design, since the actual task lookup is taskKey+workspaceId only (see
 * cockpit/page.tsx's onAction doc comment). But PROCESS_CORRECTION (`pc:`) and CASH_PROFIT (`cp:`)
 * taskKeys embed the businessId directly (`cp:<businessId>:<signalType>`), so re-deriving with
 * businessId=null computed a route set for a DIFFERENT (unscoped) taskKey than the one the cockpit
 * actually displayed — the exact task the owner saw was therefore never materialised, and the
 * subsequent taskKey lookup in applyProcessExecutionAction always failed NOT_FOUND_OR_FORBIDDEN.
 * REQUEST_REASSESSMENT/RECORD_OUTCOME/VERIFY_OUTCOME are the only actions that DO send businessId,
 * which is why acting via one of those "fixed" a task for every action afterward.
 *
 * FIX: the route now recovers the businessId a taskKey was minted for via
 * `parseBusinessIdFromTaskKey` (process-execution-bridge.ts) whenever the client didn't supply one,
 * and uses THAT for the materialisation re-derivation only — `applyProcessExecutionAction`'s own
 * `businessId` input, task lookup, and every existing guardrail are completely unchanged.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/process-execution-fresh-priority-materialisation.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

let testActorIdForMock = randomUUID();
let testWorkspaceIdForMock = randomUUID();

// Same auth-bypass pattern as process-execution-record-outcome-route.db.test.ts /
// pricing-tiers-real-route.db.test.ts: @/services/auth is mocked so the REAL
// canonical-route-enforcement.ts auth-state-build + evaluate + handler + error-classification logic
// all run for real against a real workspace membership row.
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getSession: vi.fn(async () => ({
    user: { id: testActorIdForMock, email: "test@example.com", name: "Test User", isActive: true },
    sessionId: "test-session",
    expiresAt: new Date(Date.now() + 86400000),
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: testActorIdForMock,
      roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
  getPolicyContext: vi.fn(async () => ({
    userId: testActorIdForMock,
    roles: [{ role: "admin_or_portfolio_manager", scope: "workspace", scopeId: testWorkspaceIdForMock }],
    engagementMemberships: [],
  })),
}));

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/owner/process-execution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const NOW = new Date();

/** A real CRITICAL cash-safety condition for a business — enough real activity that
 *  cashProfitProtection (and therefore processExecution) gets computed at all, deterministically
 *  producing a CASH_SAFETY_RISK signal (CRITICAL) bridged to CREATE_OWNER_APPROVAL_TASK, plus the
 *  always-fires MISSING_UNIT_ECONOMICS / PROFIT_DATA_INSUFFICIENT data-gap signals. Mirrors the
 *  proven fixture in cockpit-business-scoping.db.test.ts. */
async function seedCriticalCashState(workspaceId: string, businessId: string): Promise<void> {
  const snapshotId = randomUUID();
  await db.ownerCashflowSnapshot.create({
    data: {
      id: snapshotId, workspaceId, businessId,
      periodStart: new Date(NOW.getTime() - 30 * 86400000), periodEnd: NOW, currency: "INR",
      cashInHand: 500, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 80000,
      dataConfidenceScore: 0.9, missingCriticalData: [],
    },
  });
  await db.ownerCashflowCycle.create({
    data: {
      id: randomUUID(), workspaceId, businessId, snapshotId,
      sequenceNumber: 1, status: "active",
      healthScore: 0.05, dangerScore: 0.98, opportunityScore: 0.0,
      dataConfidenceScore: 0.9, cashflowState: "CRITICAL", generatedAt: NOW,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] POST /api/owner/process-execution — fresh cockpit priority materialisation, REAL route + REAL Postgres",
  () => {
    let workspaceId: string;
    let foreignWorkspaceId: string;
    let actorId: string;
    let businessId: string;
    let businessBId: string;

    beforeEach(async () => {
      actorId = randomUUID();
      workspaceId = randomUUID();
      foreignWorkspaceId = randomUUID();
      testActorIdForMock = actorId;
      testWorkspaceIdForMock = workspaceId;

      await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "WS Fresh Priority", slug: `ws-fp-${workspaceId.substring(0, 8)}` } });
      await db.workspace.create({ data: { id: foreignWorkspaceId, name: "WS Foreign", slug: `ws-fp-foreign-${foreignWorkspaceId.substring(0, 8)}` } });
      // FK anchor for OwnerReassessmentEvent.workspaceId (see process-execution-bridge.service.ts /
      // reassessment-event.service.ts -- OwnerReassessmentEvent.workspace references ClientAccount,
      // not Workspace, exactly like OwnerActionOutcome's own quirk in
      // process-execution-record-outcome-route.db.test.ts). Without this, REQUEST_REASSESSMENT's
      // createReassessmentEvent() insert violates its FK constraint and the route 500s.
      await db.clientAccount.create({ data: { id: workspaceId, name: "WS Fresh Priority (client anchor)", status: "active", visibility: "internal", updatedAt: new Date() } });
      await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });

      const bizA = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: "Business A", businessType: "generic_local_service", createdBy: actorId },
      });
      businessId = bizA.id;
      const bizB = await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId, name: "Business B", businessType: "generic_local_service", createdBy: actorId },
      });
      businessBId = bizB.id;

      await seedCriticalCashState(workspaceId, businessId);
    });

    afterEach(async () => {
      // OwnerActionOutcome.workspaceId FKs to ClientAccount (same quirk as OwnerReassessmentEvent
      // above) -- the RECORD_OUTCOME regression test below creates one, and it must be deleted
      // before clientAccount.deleteMany or the FK constraint rejects the delete.
      await db.ownerActionOutcome.deleteMany({ where: { workspaceId } });
      await db.processExecutionTask.deleteMany({ where: { workspaceId } });
      await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId } });
      await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId } });
      await db.ownerCashflowCycle.deleteMany({ where: { workspaceId } });
      await db.ownerCashflowSnapshot.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.ownerBusiness.deleteMany({ where: { workspaceId } });
      await db.workspaceMembership.deleteMany({ where: { userId: actorId } });
      await db.clientAccount.deleteMany({ where: { id: workspaceId } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
      await db.user.deleteMany({ where: { id: actorId } });
    });

    it("1+3+4. fresh priority, zero persisted task: cockpit-visible taskKey === server-materialised taskKey; START -> 200; correct business persisted", async () => {
      // Obtain the exact taskKey the cockpit's own now-view read would show (restrictExecutionToAttributableBusiness:
      // true, exactly as the cockpit sends it — a no-op for CASH_PROFIT either way, but matching the real caller).
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution?.topRoute;
      expect(top).toBeTruthy();
      expect(top!.sourceFamily).toBe("CASH_PROFIT");
      expect(top!.taskKey).toBe(`cp:${businessId}:${top!.sourceFindingKey}`);

      // Confirm nothing is persisted yet — this is a genuinely fresh, never-materialised finding.
      const before = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top!.taskKey } });
      expect(before).toBeNull();

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const response = await POST(makePostRequest({ taskKey: top!.taskKey, action: "START" }), { params: Promise.resolve({}) });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.status).toBe("IN_PROGRESS");

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top!.taskKey } });
      expect(row).not.toBeNull();
      expect(row!.taskKey).toBe(top!.taskKey); // exact taskKey equality (item 3)
      expect(row!.businessId).toBe(businessId); // correct business persisted (item 4)
      expect(row!.status).toBe("IN_PROGRESS");
    });

    it("2. fresh priority, zero persisted task: COMPLETE with valid evidence -> not TASK_NOT_FOUND", async () => {
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution!.topRoute!;
      expect(await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top.taskKey } })).toBeNull();

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const response = await POST(
        makePostRequest({ taskKey: top.taskKey, action: "COMPLETE", evidenceRefs: ["confirmed cash position with the bookkeeper"] }),
        { params: Promise.resolve({}) },
      );
      const body = await response.json();
      expect(response.status).not.toBe(400);
      expect(body.code).not.toBe("NOT_FOUND_OR_FORBIDDEN");
      expect(response.status).toBe(200);
      expect(body.status).toBe("COMPLETED");

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top.taskKey } });
      expect(row?.status).toBe("COMPLETED");
    });

    it("5. multi-business: business A's fresh priority never materialises (or leaks) under business B", async () => {
      const viewA = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const topA = viewA.processExecution!.topRoute!;

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const response = await POST(makePostRequest({ taskKey: topA.taskKey, action: "START" }), { params: Promise.resolve({}) });
      expect(response.status).toBe(200);

      const rowA = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: topA.taskKey } });
      expect(rowA?.businessId).toBe(businessId);

      // Business B has no cash data of its own — it must never inherit or duplicate business A's row,
      // and no row for B's own (nonexistent) CASH_SAFETY_RISK finding should appear.
      const rowsForB = await db.processExecutionTask.findMany({ where: { workspaceId, businessId: businessBId } });
      expect(rowsForB).toHaveLength(0);
      const wrongKeyForB = `cp:${businessBId}:CASH_SAFETY_RISK`;
      expect(await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: wrongKeyForB } })).toBeNull();
    });

    it("8. REQUEST_REASSESSMENT still works on a freshly-materialised task", async () => {
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution!.topRoute!;

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const startRes = await POST(makePostRequest({ taskKey: top.taskKey, action: "START" }), { params: Promise.resolve({}) });
      expect(startRes.status).toBe(200);

      const reassessRes = await POST(
        makePostRequest({ taskKey: top.taskKey, action: "REQUEST_REASSESSMENT", businessId, reason: "Owner disputes this finding" }),
        { params: Promise.resolve({}) },
      );
      expect(reassessRes.status).toBe(200);
      const reassessBody = await reassessRes.json();
      expect(reassessBody.reassessmentId).toEqual(expect.any(String));

      const event = await db.ownerReassessmentEvent.findUnique({ where: { id: reassessBody.reassessmentId } });
      expect(event?.businessId).toBe(businessId);
      expect(event?.workspaceId).toBe(workspaceId);
    });

    it("9. existing task: idempotent materialisation — no duplicate rows across repeated actions", async () => {
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution!.topRoute!;

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const r1 = await POST(makePostRequest({ taskKey: top.taskKey, action: "START" }), { params: Promise.resolve({}) });
      expect(r1.status).toBe(200);

      // A second, independent request against the same fresh taskKey (e.g. ACKNOWLEDGE) re-runs the
      // exact same materialisation step — it must never create a second row for this taskKey.
      const r2 = await POST(makePostRequest({ taskKey: top.taskKey, action: "ACKNOWLEDGE" }), { params: Promise.resolve({}) });
      expect(r2.status).toBe(200);

      const rows = await db.processExecutionTask.findMany({ where: { workspaceId, taskKey: top.taskKey } });
      expect(rows).toHaveLength(1);
    });

    it("10. terminal/completed task: no destructive re-materialisation after COMPLETE", async () => {
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution!.topRoute!;

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const completeRes = await POST(
        makePostRequest({ taskKey: top.taskKey, action: "COMPLETE", evidenceRefs: ["confirmed with bookkeeper"] }),
        { params: Promise.resolve({}) },
      );
      expect(completeRes.status).toBe(200);

      // A further action against the now-COMPLETED task must not silently re-sync/reset it back to
      // PROPOSED via the materialisation step — persistProcessExecutionRoutes' own
      // `existing.status !== "PROPOSED"` guard must still hold end to end through this route.
      const startAgain = await POST(makePostRequest({ taskKey: top.taskKey, action: "START" }), { params: Promise.resolve({}) });
      expect(startAgain.status).toBe(400);
      const startAgainBody = await startAgain.json();
      expect(startAgainBody.code).toBe("INVALID_TRANSITION");

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top.taskKey } });
      expect(row?.status).toBe("COMPLETED");
    });

    it("11. workspace isolation: a fresh taskKey from workspace A cannot be started under workspace B's session", async () => {
      const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
      const top = cockpitView.processExecution!.topRoute!;

      // Swap the mocked session to a DIFFERENT workspace the same actor is not scoped to here.
      const otherActorId = randomUUID();
      await db.user.create({ data: { id: otherActorId, email: `${otherActorId}@example.com`, updatedAt: new Date() } });
      await db.workspaceMembership.create({ data: { userId: otherActorId, workspaceId: foreignWorkspaceId, role: "admin", isActive: true } });
      testActorIdForMock = otherActorId;
      testWorkspaceIdForMock = foreignWorkspaceId;

      const { POST } = await import("@/app/api/owner/process-execution/route");
      const response = await POST(makePostRequest({ taskKey: top.taskKey, action: "START" }), { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

      expect(await db.processExecutionTask.findFirst({ where: { workspaceId: foreignWorkspaceId, taskKey: top.taskKey } })).toBeNull();
      expect(await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top.taskKey } })).toBeNull();

      // Delete audit_events before the user row -- the same fkey-ordering fixture bug fixed
      // elsewhere in this repo (see #501's D1 test): the route's own materialisation step can write
      // an OWNER_PROCESS_EXECUTION_TASK_UPSERTED audit event for (workspaceId, actorId) on a POST,
      // and audit_events_actor_id_fkey rejects deleting a User row one still references.
      await db.auditEvent.deleteMany({ where: { actorId: otherActorId } });
      await db.workspaceMembership.deleteMany({ where: { userId: otherActorId } });
      await db.user.deleteMany({ where: { id: otherActorId } });
    });

    // ── HOSTILE SAFETY CORRECTION: businessId conflict guard (FINAL LIVE P1 REMEDIATION addendum) ──
    //
    // The materialisation fix above (`input.businessId ?? parseBusinessIdFromTaskKey(taskKey)`) let a
    // client-supplied businessId WIN over a pc:/cp: taskKey's own embedded businessId. Because
    // cash/profit protection always emits MISSING_UNIT_ECONOMICS/PROFIT_DATA_INSUFFICIENT data-gap
    // routes for a business even with zero real financial data, a crafted request
    // (taskKey scoped to business A, businessId claiming business B) could make
    // getOwnerNowView/persistProcessExecutionRoutes actually PERSIST business B's own execution
    // routes as a real ProcessExecutionTask row — a genuine same-workspace cross-business
    // materialisation side effect — before applyProcessExecutionAction's later taskKey lookup ever
    // ran (and regardless of whether that later lookup ultimately rejected the action). The embedded
    // businessId is now authoritative: a conflicting explicit businessId is rejected BEFORE any
    // materialisation, and a businessId (embedded or explicit) that doesn't belong to this workspace
    // is rejected the same way.
    describe("[db] businessId conflict guard — real Postgres side-effect proof", () => {
      it("cp:A + businessId=B is rejected and creates ZERO rows for business B (RED before the guard, GREEN after)", async () => {
        const viewA = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
        const topA = viewA.processExecution!.topRoute!;
        expect(topA.taskKey).toBe(`cp:${businessId}:${topA.sourceFindingKey}`);

        expect(await db.processExecutionTask.findMany({ where: { workspaceId, businessId: businessBId } })).toHaveLength(0);

        const { POST } = await import("@/app/api/owner/process-execution/route");
        const response = await POST(
          makePostRequest({ taskKey: topA.taskKey, action: "VERIFY_OUTCOME", businessId: businessBId }),
          { params: Promise.resolve({}) },
        );
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

        // The real-Postgres proof: no side-effect row was ever created for the conflicting business,
        // whatever the eventual action outcome. Pre-fix, this failed here (rows WERE created for B).
        const rowsForB = await db.processExecutionTask.findMany({ where: { workspaceId, businessId: businessBId } });
        expect(rowsForB).toHaveLength(0);
        // The original, targeted task (business A) must also remain untouched/unmaterialised by this
        // rejected request — the guard fires before ANY materialisation, not just B's.
        expect(await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: topA.taskKey } })).toBeNull();
      });

      it("pc:A (crafted) + businessId=B is rejected before any materialisation — zero rows for B", async () => {
        const craftedTaskKey = `pc:${businessId}:some-correction-id`;

        const { POST } = await import("@/app/api/owner/process-execution/route");
        const response = await POST(
          makePostRequest({ taskKey: craftedTaskKey, action: "RECORD_OUTCOME", businessId: businessBId, outcomeStatus: "worked" }),
          { params: Promise.resolve({}) },
        );
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

        expect(await db.processExecutionTask.findMany({ where: { workspaceId, businessId: businessBId } })).toHaveLength(0);
      });

      it("a taskKey embedding a genuinely foreign (different-workspace) business is rejected — no cross-workspace materialisation", async () => {
        const foreignBusiness = await db.ownerBusiness.create({
          data: { id: randomUUID(), workspaceId: foreignWorkspaceId, name: "Foreign Business", businessType: "generic_local_service", createdBy: actorId },
        });
        const craftedTaskKey = `cp:${foreignBusiness.id}:CASH_SAFETY_RISK`;

        const { POST } = await import("@/app/api/owner/process-execution/route");
        const response = await POST(
          makePostRequest({ taskKey: craftedTaskKey, action: "START" }),
          { params: Promise.resolve({}) },
        );
        const body = await response.json();
        // Governed rejection, never a 500/raw error, and never a 200 materialising foreign data.
        expect(response.status).toBe(400);
        expect(body.code).toBe("NOT_FOUND_OR_FORBIDDEN");

        expect(await db.processExecutionTask.findMany({ where: { workspaceId, businessId: foreignBusiness.id } })).toHaveLength(0);
        expect(await db.processExecutionTask.findFirst({ where: { taskKey: craftedTaskKey } })).toBeNull();

        await db.ownerBusiness.deleteMany({ where: { id: foreignBusiness.id } });
      });

      it("non-business-scoped key + legitimate explicit businessId: existing behavior preserved (not rejected by the new guard)", async () => {
        // "wl:" (WORKLOAD_REDUCTION) never embeds a businessId in its taskKey, so the conflict guard
        // must never fire for it — a genuinely nonexistent workload taskKey still fails, but for the
        // pre-existing reason (task not found), never for the NEW conflict-guard reason.
        const craftedTaskKey = "wl:some-workload-key-that-does-not-exist";

        const { POST } = await import("@/app/api/owner/process-execution/route");
        const response = await POST(
          makePostRequest({ taskKey: craftedTaskKey, action: "RECORD_OUTCOME", businessId, outcomeStatus: "worked" }),
          { params: Promise.resolve({}) },
        );
        expect(response.status).toBe(400);
        // Still a lookup failure at applyProcessExecutionAction (real behavior, unchanged) — proves
        // the request reached materialisation/lookup instead of being rejected up front by the guard.
        const body = await response.json();
        expect(body.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      });

      it("matching explicit businessId (RECORD_OUTCOME) on a freshly-materialised task: regression green", async () => {
        const cockpitView = await getOwnerNowView(workspaceId, businessId, undefined, actorId, { restrictExecutionToAttributableBusiness: true });
        const top = cockpitView.processExecution!.topRoute!;

        const { POST } = await import("@/app/api/owner/process-execution/route");
        const completeRes = await POST(
          makePostRequest({ taskKey: top.taskKey, action: "COMPLETE", evidenceRefs: ["confirmed with bookkeeper"] }),
          { params: Promise.resolve({}) },
        );
        expect(completeRes.status).toBe(200);

        const outcomeRes = await POST(
          makePostRequest({ taskKey: top.taskKey, action: "RECORD_OUTCOME", businessId, outcomeStatus: "worked" }),
          { params: Promise.resolve({}) },
        );
        expect(outcomeRes.status).toBe(200);
        const outcomeBody = await outcomeRes.json();
        expect(outcomeBody.outcomeId).toEqual(expect.any(String));

        const row = await db.processExecutionTask.findFirst({ where: { workspaceId, taskKey: top.taskKey } });
        expect(row?.status).toBe("OUTCOME_RECORDED");
        expect(row?.businessId).toBe(businessId);
      });
    });
  },
);

/**
 * Cockpit business-scoping contamination — regression proof (controlled-beta fix, D-cockpit).
 * `[db]`-gated (TEST_WITH_DB=true).
 *
 * LIVE EVIDENCE (production, reproduced across three real businesses named ZZ-TEST-FIELD-SERVICE,
 * Trinity Services, ZZ-TEST-SANDBOX): on /owner/cockpit, switching the selected business correctly
 * changed the finance diagnosis, but the "Top Priority" and "Execution Lifecycle" widgets stayed stuck
 * showing ZZ-TEST-FIELD-SERVICE's data regardless of which business was selected.
 *
 * ROOT CAUSE: `processCorrections` / the PASS23 workload-capability-SOP-training-effectiveness
 * expansion families are derived, directly or indirectly, from a WORKSPACE-WIDE proof scan
 * (`deps.db.proof.findMany({ where: { workspaceId } })` in owner-now-view.service.ts) that carries no
 * per-business attribution at all — `ProcessIntelligenceAnalysis` has no `businessId` field anywhere.
 * `buildProcessExecutionBridge`'s `businessId` argument only STAMPS the currently-active business onto
 * a PROCESS_CORRECTION/expansion route's `businessId`/`taskKey` for persistence identity; it does not
 * prove the underlying evidence is actually about that business. In a workspace with more than one real
 * business this makes the "Top Priority" bridge (`processExecution.topRoute`) and the "Execution
 * lifecycle" widget (`executionLifecycle`, read from persisted `ProcessExecutionTask` rows) show
 * workspace-wide content under whichever business happens to be selected. Only CASH_PROFIT (arbitrated
 * per-business cash/finance state) and STARTUP_MODE (always stamped from the owning
 * OwnerStartupSession.businessId) are genuinely, verifiably attributable per business.
 *
 * FIX (opt-in, cockpit-only — see GetOwnerNowViewOptions' doc comment in owner-now-view.service.ts):
 * `getOwnerNowView(..., { restrictExecutionToAttributableBusiness: true })` — sent ONLY by the Owner
 * Cockpit page's now-view fetch — excludes PROCESS_CORRECTION/expansion-family content from
 * `processExecution` and `executionLifecycle` whenever a `businessId` is supplied AND the workspace
 * holds MORE THAN ONE real business (hasExactlyOneRealBusiness — the SAME precedented pattern this file
 * already uses for BusinessRiskEntry). A single-business workspace, or any caller that omits the option
 * (/owner/priorities, /owner/process-intelligence, /owner/now, the process-execution POST route's
 * server-authoritative re-derivation), is byte-for-byte unaffected.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/cockpit-business-scoping.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView, queryExecutionLifecycle, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;
const minDeps = { db: prisma as unknown as GuidanceDeps["db"], uuid: () => randomUUID(), now: () => Date.now() } satisfies Partial<GuidanceDeps> as unknown as GuidanceDeps;

const actor = randomUUID();

async function seedTask(workspaceId: string, taskKey: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  await db.processExecutionTask.create({
    data: {
      id, workspaceId, businessId: null, taskKey,
      sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "cockpit-scoping-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK", actionOwner: "OWNER", approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "PROPOSED", requiredEvidence: [], evidenceRefs: [],
      completionCriteria: "Owner records decision.", reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.", ownerVisibleSummary: "Cockpit business-scoping test task",
      severity: "HIGH", priorityRank: 1, isFixtureRecord: false, updatedAt: new Date(),
      ...over,
    },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Cockpit business-scoping contamination fix (D-cockpit)", () => {
  describe("queryExecutionLifecycle — suppressUnattributableFamilies mechanics", () => {
    const ws = randomUUID();
    const bizA = randomUUID();
    const bizB = randomUUID();
    const bizC = randomUUID(); // "selected" but has no tasks of its own — proves no bleed-through

    let taskCashA: string, taskCashB: string, taskCorrectionA: string, taskWorkloadNull: string, taskStartupA: string;

    beforeAll(async () => {
      await db.user.create({ data: { id: actor, email: `cockpit-scope-${actor}@laundry.test`, name: "Cockpit Scoping Owner", isActive: true, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: ws, name: "Cockpit Scoping WS", slug: `cockpit-scope-ws-${ws.slice(0, 8)}`, createdBy: actor } });
      await db.ownerBusiness.create({ data: { id: bizA, workspaceId: ws, name: "ZZ-TEST-FIELD-SERVICE", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizB, workspaceId: ws, name: "Trinity Services", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizC, workspaceId: ws, name: "ZZ-TEST-SANDBOX", businessType: "laundry", updatedAt: new Date() } });

      taskCashA = await seedTask(ws, `cp:${bizA}:cash-a`, { businessId: bizA, sourceFamily: "CASH_PROFIT" });
      taskCashB = await seedTask(ws, `cp:${bizB}:cash-b`, { businessId: bizB, sourceFamily: "CASH_PROFIT" });
      // Stamped with bizA (the business active when it was computed) but its content is really
      // workspace-wide gaming/credibility-derived evidence — the exact misattribution this fix closes.
      taskCorrectionA = await seedTask(ws, `pc:${bizA}:contaminated-finding`, { businessId: bizA, sourceFamily: "PROCESS_CORRECTION" });
      taskWorkloadNull = await seedTask(ws, `wl:workspace-level`, { businessId: null, sourceFamily: "WORKLOAD_REDUCTION" });
      taskStartupA = await seedTask(ws, `startup:${bizA}`, { businessId: bizA, sourceFamily: "STARTUP_MODE" });
    });

    afterAll(async () => {
      await db.processExecutionTask.deleteMany({ where: { workspaceId: ws } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.ownerBusiness.deleteMany({ where: { id: { in: [bizA, bizB, bizC] } } });
      await db.workspace.deleteMany({ where: { id: ws } });
      await db.user.delete({ where: { id: actor } });
    });

    it("suppress=false (default/unchanged): business A's read still shows ALL its stamped families — no regression for callers that don't opt in", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizA);
      const allKeys = new Set(lifecycle!.requiresDecision.map((i) => i.taskKey));
      expect(allKeys.has(`cp:${bizA}:cash-a`)).toBe(true);
      expect(allKeys.has(`pc:${bizA}:contaminated-finding`)).toBe(true);
      expect(allKeys.has(`wl:workspace-level`)).toBe(true);
    });

    it("suppress=true: business A selected shows A's CASH_PROFIT + STARTUP_MODE, NOT the workspace-wide PROCESS_CORRECTION/WORKLOAD_REDUCTION content", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizA, true);
      const keys = new Set(lifecycle!.requiresDecision.map((i) => i.taskKey));
      expect(keys.has(`cp:${bizA}:cash-a`)).toBe(true);
      expect(keys.has(`startup:${bizA}`)).toBe(true);
      expect(keys.has(`pc:${bizA}:contaminated-finding`)).toBe(false);
      expect(keys.has(`wl:workspace-level`)).toBe(false);
    });

    it("suppress=true: business B selected shows ONLY B's own CASH_PROFIT — not A's cash task, not A's contaminated correction, not the workspace-level task", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizB, true);
      const keys = new Set(lifecycle!.requiresDecision.map((i) => i.taskKey));
      expect(keys.has(`cp:${bizB}:cash-b`)).toBe(true);
      expect(keys.has(`cp:${bizA}:cash-a`)).toBe(false);
      expect(keys.has(`pc:${bizA}:contaminated-finding`)).toBe(false);
      expect(keys.has(`wl:workspace-level`)).toBe(false);
    });

    it("suppress=true: business C (no tasks of its own) shows NOTHING — no residual A/B data bleeds into an unrelated business's view", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizC, true);
      const total = lifecycle!.requiresDecision.length + lifecycle!.inExecution.length + lifecycle!.awaitingVerification.length + lifecycle!.recentlyVerified.length;
      expect(total).toBe(0);
    });

    it("suppress=true: switching A -> B -> A returns exactly each business's own attributable rows every time (reload / back-forward correctness)", async () => {
      const readA1 = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizA, true);
      expect(readA1!.requiresDecision.some((i) => i.taskKey === `cp:${bizA}:cash-a`)).toBe(true);
      expect(readA1!.requiresDecision.some((i) => i.taskKey === `cp:${bizB}:cash-b`)).toBe(false);

      const readB = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizB, true);
      expect(readB!.requiresDecision.some((i) => i.taskKey === `cp:${bizB}:cash-b`)).toBe(true);
      expect(readB!.requiresDecision.some((i) => i.taskKey === `cp:${bizA}:cash-a`)).toBe(false);

      const readA2 = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizA, true);
      expect(readA2!.requiresDecision.some((i) => i.taskKey === `cp:${bizA}:cash-a`)).toBe(true);
      expect(readA2!.requiresDecision.some((i) => i.taskKey === `cp:${bizB}:cash-b`)).toBe(false);
    });

    it("a workspace-level read (businessId=null) is entirely unaffected by the suppress flag — untouched path", async () => {
      const lifecycle = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], null, true);
      const keys = new Set(lifecycle!.requiresDecision.map((i) => i.taskKey));
      expect(keys.has(`cp:${bizA}:cash-a`)).toBe(true);
      expect(keys.has(`pc:${bizA}:contaminated-finding`)).toBe(true);
      expect(keys.has(`wl:workspace-level`)).toBe(true);
    });

    void taskCashA; void taskCashB; void taskCorrectionA; void taskWorkloadNull; void taskStartupA;
  });

  describe("getOwnerNowView — ambiguity gate integration (hasExactlyOneRealBusiness) and cross-workspace isolation", () => {
    const wsMulti = randomUUID();   // 2 real businesses — ambiguous
    const wsSingle = randomUUID();  // exactly 1 real business — unambiguous, must be unaffected
    const wsOther = randomUUID();   // separate workspace entirely — isolation check
    const bizM1 = randomUUID();
    const bizM2 = randomUUID();
    const bizSingle = randomUUID();
    const bizOther = randomUUID();

    let taskMultiCorrection: string;
    let taskSingleCorrection: string;
    let taskOther: string;

    beforeAll(async () => {
      await db.workspace.create({ data: { id: wsMulti, name: "Cockpit Ambiguity Multi", slug: `cockpit-amb-multi-${wsMulti.slice(0, 8)}`, createdBy: actor } });
      await db.workspace.create({ data: { id: wsSingle, name: "Cockpit Ambiguity Single", slug: `cockpit-amb-single-${wsSingle.slice(0, 8)}`, createdBy: actor } });
      await db.workspace.create({ data: { id: wsOther, name: "Cockpit Ambiguity Other WS", slug: `cockpit-amb-other-${wsOther.slice(0, 8)}`, createdBy: actor } });
      await db.ownerBusiness.create({ data: { id: bizM1, workspaceId: wsMulti, name: "Multi Biz 1", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizM2, workspaceId: wsMulti, name: "Multi Biz 2", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizSingle, workspaceId: wsSingle, name: "Single Biz", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizOther, workspaceId: wsOther, name: "Other WS Biz", businessType: "laundry", updatedAt: new Date() } });

      taskMultiCorrection = await seedTask(wsMulti, `pc:${bizM1}:multi-contaminated`, { businessId: bizM1, sourceFamily: "PROCESS_CORRECTION" });
      taskSingleCorrection = await seedTask(wsSingle, `pc:${bizSingle}:single-finding`, { businessId: bizSingle, sourceFamily: "PROCESS_CORRECTION" });
      taskOther = await seedTask(wsOther, `pc:${bizOther}:other-ws-finding`, { businessId: bizOther, sourceFamily: "PROCESS_CORRECTION" });
    });

    afterAll(async () => {
      const all = [wsMulti, wsSingle, wsOther];
      await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
      await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: all } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
      await db.ownerBusiness.deleteMany({ where: { id: { in: [bizM1, bizM2, bizSingle, bizOther] } } });
      await db.workspace.deleteMany({ where: { id: { in: all } } });
    });

    it("multi-business workspace + opt-in: a PROCESS_CORRECTION task stamped with the selected business is EXCLUDED from executionLifecycle (ambiguous attribution)", async () => {
      const result = await getOwnerNowView(wsMulti, bizM1, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const allTaskKeys = [
        ...(result.executionLifecycle?.requiresDecision ?? []),
        ...(result.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(allTaskKeys).not.toContain(`pc:${bizM1}:multi-contaminated`);
      void taskMultiCorrection;
    });

    it("multi-business workspace WITHOUT opting in: the same task is still shown — default now-view payload (used by /owner/priorities, /owner/now, /owner/process-intelligence, and the process-execution POST route) is completely unchanged", async () => {
      const result = await getOwnerNowView(wsMulti, bizM1, minDeps);
      const allTaskKeys = [
        ...(result.executionLifecycle?.requiresDecision ?? []),
        ...(result.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(allTaskKeys).toContain(`pc:${bizM1}:multi-contaminated`);
    });

    it("single-business workspace + opt-in: unambiguous by definition — the PROCESS_CORRECTION task is still shown (no regression for the common case)", async () => {
      const result = await getOwnerNowView(wsSingle, bizSingle, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const allTaskKeys = [
        ...(result.executionLifecycle?.requiresDecision ?? []),
        ...(result.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(allTaskKeys).toContain(`pc:${bizSingle}:single-finding`);
      void taskSingleCorrection;
    });

    it("cross-workspace isolation holds: wsMulti's opt-in read never returns wsOther's task, and wsOther's own read (still 1 business, unambiguous) sees its own task", async () => {
      const multiResult = await getOwnerNowView(wsMulti, bizM1, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const multiKeys = [
        ...(multiResult.executionLifecycle?.requiresDecision ?? []),
        ...(multiResult.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(multiKeys).not.toContain(`pc:${bizOther}:other-ws-finding`);

      const otherResult = await getOwnerNowView(wsOther, bizOther, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const otherKeys = [
        ...(otherResult.executionLifecycle?.requiresDecision ?? []),
        ...(otherResult.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(otherKeys).toContain(`pc:${bizOther}:other-ws-finding`);
      void taskOther;
    });

    it("no active business (businessId=null) is untouched by the opt-in flag — the option only ever applies when a business is actually selected", async () => {
      const result = await getOwnerNowView(wsMulti, null, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const allTaskKeys = [
        ...(result.executionLifecycle?.requiresDecision ?? []),
        ...(result.executionLifecycle?.inExecution ?? []),
      ].map((i) => i.taskKey);
      expect(allTaskKeys).toContain(`pc:${bizM1}:multi-contaminated`);
    });
  });

  describe("getOwnerNowView — genuinely attributable CASH_PROFIT content survives suppression and stays business-scoped", () => {
    const ws = randomUUID();
    const bizA = randomUUID();
    const bizB = randomUUID();
    const NOW = new Date("2026-09-11T00:00:00Z");
    const PERIOD_START = new Date(NOW.getTime() - 30 * 86_400_000);

    beforeAll(async () => {
      await db.workspace.create({ data: { id: ws, name: "Cockpit Cash Attribution WS", slug: `cockpit-cash-attr-${ws.slice(0, 8)}`, createdBy: actor } });
      await db.ownerBusiness.create({ data: { id: bizA, workspaceId: ws, name: "Cash Attribution A (CRITICAL)", businessType: "laundry", updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: bizB, workspaceId: ws, name: "Cash Attribution B (no data)", businessType: "laundry", updatedAt: new Date() } });

      const cfSnapshotId = randomUUID();
      await db.ownerCashflowSnapshot.create({
        data: {
          id: cfSnapshotId, workspaceId: ws, businessId: bizA,
          periodStart: PERIOD_START, periodEnd: NOW, currency: "INR",
          cashInHand: 500, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 80000,
          dataConfidenceScore: 0.9, missingCriticalData: [],
        },
      });
      await db.ownerCashflowCycle.create({
        data: {
          id: randomUUID(), workspaceId: ws, businessId: bizA, snapshotId: cfSnapshotId,
          sequenceNumber: 1, status: "active",
          healthScore: 0.05, dangerScore: 0.98, opportunityScore: 0.0,
          dataConfidenceScore: 0.9, cashflowState: "CRITICAL", generatedAt: NOW,
        },
      });
    });

    afterAll(async () => {
      await db.processExecutionTask.deleteMany({ where: { workspaceId: ws } });
      await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
      await db.ownerCashflowCycle.deleteMany({ where: { workspaceId: ws } });
      await db.ownerCashflowSnapshot.deleteMany({ where: { workspaceId: ws } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.ownerBusiness.deleteMany({ where: { id: { in: [bizA, bizB] } } });
      await db.workspace.deleteMany({ where: { id: ws } });
    });

    it("business A (CRITICAL cash state) gets its own CASH_PROFIT priority even with the ambiguity restriction on", async () => {
      const result = await getOwnerNowView(ws, bizA, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      expect(result.processExecution).not.toBeNull();
      const cashRoutes = result.processExecution!.routes.filter((r) => r.sourceFamily === "CASH_PROFIT");
      expect(cashRoutes.length).toBeGreaterThan(0);
      expect(cashRoutes.every((r) => r.businessId === bizA)).toBe(true);
    });

    it("business B (no cash data of its own) does NOT inherit business A's CASH_PROFIT priority", async () => {
      const result = await getOwnerNowView(ws, bizB, minDeps, undefined, { restrictExecutionToAttributableBusiness: true });
      const cashRoutesForB = (result.processExecution?.routes ?? []).filter((r) => r.sourceFamily === "CASH_PROFIT" && r.businessId === bizA);
      expect(cashRoutesForB).toHaveLength(0);
    });
  });
});

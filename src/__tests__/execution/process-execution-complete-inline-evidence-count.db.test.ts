/**
 * COMPLETE with INLINE evidence, single call, no prior SUBMIT_EVIDENCE — evidence-COUNT boundary,
 * REAL Postgres. `[db]`-gated (TEST_WITH_DB=true).
 *
 * LIVE AUDIT REPORT this proves/disproves: "inline evidence provided directly inside a COMPLETE
 * action on a process-execution task returns HTTP 400, but doing a separate SUBMIT_EVIDENCE call
 * first, then a bare COMPLETE afterward, succeeds with 200." The audit flagged this as possibly
 * contradicting PR #497's "Complete + evidence contract mismatch" fix (see
 * complete-cumulative-evidence.test.ts and process-correction-execution-bridge.db.test.ts's own
 * "[DB completion-persistence]" tests, which prove the cumulative-evidence union works when evidence
 * arrives split across a SUBMIT_EVIDENCE call then a separate COMPLETE call).
 *
 * What NEITHER of those existing test files directly proves against a real persisted row is the
 * SINGLE-CALL case the audit actually describes: COMPLETE, in one call, with N distinct inline
 * evidenceRefs and NO prior SUBMIT_EVIDENCE at all, where the task's real `requiredEvidence.length`
 * (N) is provably 1 in one scenario and provably 2 in another — and the exact boundary where N-1
 * inline items still correctly reject.
 *
 * MECHANISM UNDER TEST (completeProcessTask, applyProcessExecutionAction, process-execution-bridge.service.ts):
 *   const combinedEvidenceRefs = Array.from(new Set([...task.evidenceRefs, ...evidenceRefs]));
 *   if (EVIDENCE_REQUIRED_ROUTES.has(route)) {
 *     const minRequired = task.requiredEvidence.length > 0 ? task.requiredEvidence.length : 1;
 *     if (combinedEvidenceRefs.length < minRequired) return EVIDENCE_REQUIRED (400);
 *   }
 * A freshly-created/re-synced task always persists `evidenceRefs: []` (routeToData(), same file) —
 * never seeded from the route's own supporting-proof `evidenceRefs` — so on a fresh task with no
 * prior SUBMIT_EVIDENCE, `combinedEvidenceRefs` is exactly this call's own deduplicated evidenceRefs.
 * Whether inline COMPLETE succeeds is therefore governed ENTIRELY by whether the caller supplied at
 * least `requiredEvidence.length` distinct items — nothing about "inline vs. two-step" is
 * special-cased anywhere in this function.
 *
 * SCENARIO A — CASH_PROFIT / CASH_SAFETY_RISK -> CREATE_OWNER_APPROVAL_TASK, requiredEvidence.length
 * === 1 (bridgeCashSignal: requiredEvidence: ["the financial figures behind this protective action"]
 * for any non-data-gap signal — see process-execution-bridge.ts).
 * SCENARIO B — PROCESS_CORRECTION / UPDATE_CHECKLIST -> CREATE_SOP_CHECKLIST_TASK,
 * requiredEvidence.length === 2 (bridgeCorrection: requiredEvidence: ["the drafted SOP/checklist
 * change", "owner approval before adoption"] — see process-execution-bridge.ts's
 * CORRECTION_ROUTE/requiredEvidence construction).
 *
 * Each test creates its OWN fresh OwnerBusiness and persists BOTH scenarios' routes scoped to it.
 * PROCESS_CORRECTION/CASH_PROFIT taskKeys embed the businessId directly (`pc:<businessId>:<key>`,
 * `cp:<businessId>:<signalType>` — see process-execution-bridge.ts), so a fresh businessId per test
 * guarantees a genuinely fresh (PROPOSED, zero-evidence) task and complete independence between
 * tests regardless of execution order — no test can dedupe against, or be polluted by, another
 * test's completed task.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/process-execution-complete-inline-evidence-count.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, completeProcessTask, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "@/domain/owner-mode/bottleneck-correction-routing";
import type { CashProfitProtectionAnalysis, CashProfitSignal } from "@/domain/owner-mode/cash-profit-protection";

const owner = randomUUID(), mgr = randomUUID();
const workspaceId = randomUUID();
const AT = "2026-09-18T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

function correction(over: Partial<ProcessCorrection> & { correctionType: CorrectionType }): ProcessCorrection {
  return {
    workspaceId, correctionId: "c-sop-inline", sourceFindingType: "REWORK_LOOP",
    correctionType: over.correctionType, title: "Update the checklist", instruction: "draft and adopt the change",
    rationale: "the checklist is missing a required step", affectedStage: "DELIVERY" as ProcessCorrection["affectedStage"],
    targetActorId: null, targetManagerId: null,
    severity: "HIGH", confidence: "HIGH", priorityRank: 1, requiredApprovalLevel: "MANAGER", requiresOwnerApproval: false,
    autoExecutable: false, expectedImpactType: "QUALITY" as ProcessCorrection["expectedImpactType"],
    supportingProofIds: ["p1"], supportingOperationalEventIds: ["e1"], supportingEscalationIds: [], supportingAdjudicationIds: [],
    missingData: [], status: "PROPOSED", ...over,
  };
}
function routing(corrections: ProcessCorrection[]): ProcessCorrectionRouting {
  return { workspaceId, corrections, topCorrection: corrections[0] ?? null, evaluatedAt: AT };
}
function cashSignal(over: Partial<CashProfitSignal> & { signalType: CashProfitSignal["signalType"] }): CashProfitSignal {
  return {
    workspaceId, signalType: over.signalType, category: "CASH", severity: "CRITICAL", confidence: "HIGH",
    title: "Cash runway is short", ownerExplanation: "protect cash now", protectiveAction: "PROTECT_CASH_RUNWAY",
    approvalLevel: "OWNER", requiresOwnerReview: true, riskGuardrail: "material, owner-gated",
    observedCount: 1, metricType: "CASH_RUNWAY_DAYS", metricValue: 5, metricThreshold: 30,
    thresholdBreached: true, directionOnly: false, supportingProofIds: [], supportingOperationalEventIds: [],
    supportingFinancialSnapshotIds: [], relatedProcessFinding: null, missingData: [], evaluatedAt: AT, ...over,
  };
}
function cash(signals: CashProfitSignal[]): CashProfitProtectionAnalysis {
  return { workspaceId, signals, topSignal: signals[0] ?? null, summary: { total: signals.length, critical: 1, high: 0, ownerReviewRequired: 1 }, evaluatedAt: AT };
}

/**
 * Creates a fresh OwnerBusiness, then builds + persists BOTH scenarios' routes scoped to it via the
 * real domain bridge (buildProcessExecutionBridge) and the real persistence service
 * (persistProcessExecutionRoutes) against real Postgres. Returns the exact taskKeys the caller must
 * use, plus the fresh businessId. Guaranteed a clean create (never a dedupe) because the business is
 * brand new.
 */
async function freshScenarios(): Promise<{ businessId: string; n1TaskKey: string; n2TaskKey: string }> {
  const biz = await db.ownerBusiness.create({
    data: { id: randomUUID(), workspaceId, name: "Inline Evidence Co", businessType: "generic_local_service", createdBy: owner },
  });
  const scopedBusinessId = biz.id;

  const analysis = buildProcessExecutionBridge(
    routing([correction({ correctionType: "UPDATE_CHECKLIST" })]),
    cash([cashSignal({ signalType: "CASH_SAFETY_RISK" })]),
    workspaceId, AT, null, scopedBusinessId,
  );
  const n1 = analysis.routes.find((r) => r.sourceFamily === "CASH_PROFIT")!;
  const n2 = analysis.routes.find((r) => r.sourceFamily === "PROCESS_CORRECTION")!;
  expect(n1.executionRoute).toBe("CREATE_OWNER_APPROVAL_TASK");
  expect(n2.executionRoute).toBe("CREATE_SOP_CHECKLIST_TASK");

  const result = await persistProcessExecutionRoutes(workspaceId, analysis, owner, deps);
  expect(result.created).toBe(2); // always a clean create — this business has never been persisted before
  expect(result.deduped).toBe(0);

  return { businessId: scopedBusinessId, n1TaskKey: n1.taskKey, n2TaskKey: n2.taskKey };
}

/** Owner-approval work is approval-first: approve and start it before COMPLETE is reachable. */
async function approveAndStart(workspaceId: string, taskKey: string, actorId: string, businessId: string) {
  for (const action of ["APPROVE", "START"] as const) {
    const r = await applyProcessExecutionAction({ workspaceId, businessId, actorId, actorRole: "owner", taskKey, action }, deps);
    expect(r.ok).toBe(true);
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] COMPLETE with inline evidence, single call, no prior SUBMIT_EVIDENCE — evidence-count boundary (live audit reproduction)",
  () => {
    beforeAll(async () => {
      await db.user.create({ data: { id: owner, email: `pei-${owner}@example.com`, name: "Owner", isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: mgr, email: `pei-${mgr}@example.com`, name: "Mgr", isActive: true, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "WS Inline Evidence", slug: `pei-ws-${workspaceId.slice(0, 8)}`, createdBy: owner } });
      // FK anchor: OwnerReassessmentEvent.workspaceId references ClientAccount, not Workspace
      // (same quirk documented in process-execution-fresh-priority-materialisation.db.test.ts).
      await db.clientAccount.create({ data: { id: workspaceId, name: "WS Inline Evidence (client anchor)", status: "active", visibility: "internal", updatedAt: new Date() } });
    });

    afterAll(async () => {
      await db.processExecutionTask.deleteMany({ where: { workspaceId } });
      await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.ownerBusiness.deleteMany({ where: { workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: [owner, mgr] } } });
    });

    it("SCENARIO A (N=1, CASH_SAFETY_RISK): task.requiredEvidence.length is exactly 1, fresh evidenceRefs is []", async () => {
      const { n1TaskKey } = await freshScenarios();
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n1TaskKey)!;
      expect(row.requiredEvidence).toHaveLength(1);
      expect(row.requiredEvidence).toEqual(["the financial figures behind this protective action"]);
      expect(row.evidenceRefs).toEqual([]); // never seeded from the route's own supporting-proof evidenceRefs
    });

    it("SCENARIO A (N=1): a bare COMPLETE (N-1=0 inline items) is correctly rejected EVIDENCE_REQUIRED/400", async () => {
      const { businessId, n1TaskKey } = await freshScenarios();
      await approveAndStart(workspaceId, n1TaskKey, owner, businessId);
      const res = await completeProcessTask(
        { workspaceId, businessId, actorId: owner, actorRole: "owner", taskKey: n1TaskKey, evidenceRefs: [] },
        deps,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("EVIDENCE_REQUIRED");
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n1TaskKey)!;
      expect(row.status).not.toBe("COMPLETED");
    });

    it("SCENARIO A (N=1): COMPLETE with exactly 1 inline evidenceRef, in the SAME call, NO prior SUBMIT_EVIDENCE -> 200", async () => {
      const { businessId, n1TaskKey } = await freshScenarios();
      // Sanity: no SUBMIT_EVIDENCE call precedes this — task.evidenceRefs is still [] going in.
      await approveAndStart(workspaceId, n1TaskKey, owner, businessId);
      const before = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n1TaskKey)!;
      expect(before.evidenceRefs).toEqual([]);

      const res = await completeProcessTask(
        { workspaceId, businessId, actorId: owner, actorRole: "owner", taskKey: n1TaskKey,
          evidenceRefs: ["confirmed cash runway with the bookkeeper"] },
        deps,
      );
      expect(res.ok).toBe(true);
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n1TaskKey)!;
      expect(row.status).toBe("COMPLETED");
      expect(row.evidenceRefs).toEqual(["confirmed cash runway with the bookkeeper"]);
    });

    it("SCENARIO B (N=2, CREATE_SOP_CHECKLIST_TASK via UPDATE_CHECKLIST): task.requiredEvidence.length is exactly 2, fresh evidenceRefs is []", async () => {
      const { n2TaskKey } = await freshScenarios();
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n2TaskKey)!;
      expect(row.requiredEvidence).toHaveLength(2);
      expect(row.requiredEvidence).toEqual(["the drafted SOP/checklist change", "owner approval before adoption"]);
      expect(row.evidenceRefs).toEqual([]); // never seeded from supportingProofIds/supportingOperationalEventIds
    });

    it("SCENARIO B (N=2): COMPLETE with only 1 of 2 required items inline (N-1), NO prior SUBMIT_EVIDENCE -> correctly rejected EVIDENCE_REQUIRED/400 (the live-audit-reported case)", async () => {
      const { businessId, n2TaskKey } = await freshScenarios();
      const before = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n2TaskKey)!;
      expect(before.evidenceRefs).toEqual([]);

      const res = await completeProcessTask(
        { workspaceId, businessId, actorId: mgr, actorRole: "manager", taskKey: n2TaskKey,
          evidenceRefs: ["drafted checklist v3"] }, // only 1 of the 2 required items, supplied inline
        deps,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("EVIDENCE_REQUIRED");
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n2TaskKey)!;
      expect(row.status).not.toBe("COMPLETED");
      // No partial mutation: the single supplied item must not be silently persisted on a rejected COMPLETE.
      expect(row.evidenceRefs).toEqual([]);
    });

    it("SCENARIO B (N=2): COMPLETE with exactly 2 distinct inline evidenceRefs, in the SAME call, NO prior SUBMIT_EVIDENCE -> 200 (proves N-matching inline evidence is never rejected)", async () => {
      const { businessId, n2TaskKey } = await freshScenarios();
      const before = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n2TaskKey)!;
      expect(before.evidenceRefs).toEqual([]);

      const res = await completeProcessTask(
        { workspaceId, businessId, actorId: mgr, actorRole: "manager", taskKey: n2TaskKey,
          evidenceRefs: ["drafted checklist v3", "owner approved adoption on 2026-09-18"] },
        deps,
      );
      expect(res.ok).toBe(true);
      const row = (await getPersistedProcessTasks(workspaceId, deps)).find((t) => t.taskKey === n2TaskKey)!;
      expect(row.status).toBe("COMPLETED");
      expect(row.evidenceRefs).toEqual(["drafted checklist v3", "owner approved adoption on 2026-09-18"]);
    });
  },
);

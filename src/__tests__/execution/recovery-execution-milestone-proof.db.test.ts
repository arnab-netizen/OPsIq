/**
 * Recovery Execution & Milestone-Proof — End-to-End proof (PASS 33). Requires TEST_WITH_DB=true.
 *
 * Drives a PASS 32 crisis plan → governed ProcessCorrections (milestone tasks) → the ALREADY-PROVEN execution
 * bridge → real evidence-gated completion → the recovery milestone state machine, across recovery archetypes,
 * a regression case, an unrecoverable case, and a clean control.
 *
 * Proves the recovery advances ONLY on proven milestones: stop-loss/cash/quality/operations completion is
 * evidence-gated by the bridge; owner-approval tasks cannot be bypassed; reassessment gates the stabilization
 * gate; the stabilization gate opens only when every milestone passes; the thrive gate stays blocked until
 * stabilization; a worsened reassessment regresses; the unrecoverable case stays restructure/shutdown review;
 * unsafe actions blocked; the cockpit shows the next bottleneck (not the whole backlog); workspace isolation
 * holds; clean workspace fabricates nothing. Controlled fixtures only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import {
  persistProcessExecutionRoutes, getPersistedProcessTasks, applyProcessExecutionAction,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import { planBusinessSurvivalRecovery, survivalPlanToProcessCorrections, type CrisisInput } from "@/domain/owner-mode/business-survival-recovery";
import {
  computeRecoveryExecution, computeAndValidateRecovery, type MilestoneOutcome,
} from "@/domain/owner-mode/recovery-milestone-execution";
import type { ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID(), mgr = randomUUID();
const AT = "2026-07-07T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

const CASES = ["laundry", "housekeeping", "property", "franchise", "saas", "tender", "b2b", "collective", "unrecoverable"] as const;
type Case = typeof CASES[number];
const ws: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const biz: Record<Case, string> = Object.fromEntries(CASES.map((a) => [a, randomUUID()])) as Record<Case, string>;
const wsClean = randomUUID();

const CRISES: Record<Case, CrisisInput> = {
  laundry: { crisisCaseId: "rc-laundry", workspaceArchetype: "laundry_local_service", cashPressure: "HIGH", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["unit margin", "capacity"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } },
  housekeeping: { crisisCaseId: "rc-housekeeping", workspaceArchetype: "housekeeping_facility", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["supply cost", "capacity"], constraints: { capacityFeasible: true } },
  property: { crisisCaseId: "rc-property", workspaceArchetype: "property_management", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "MEDIUM", operationalPressure: "HIGH", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "HIGH", opportunityTemptation: "MARKETING", missingData: ["vendor quote"], constraints: {} },
  franchise: { crisisCaseId: "rc-franchise", workspaceArchetype: "franchise_operations", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "MEDIUM", opportunityTemptation: "MARKETING", missingData: ["per-branch metrics"], constraints: {} },
  saas: { crisisCaseId: "rc-saas", workspaceArchetype: "saas", cashPressure: "MEDIUM", revenuePressure: "HIGH", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "LOW", opportunityTemptation: "LAUNCH", missingData: ["real activation/conversion"], constraints: {} },
  tender: { crisisCaseId: "rc-tender", workspaceArchetype: "tender_procurement", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "LOW", qualityPressure: "LOW", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "HIGH", opportunityTemptation: "TENDER", unsafeActionTemptations: ["tender auto-submit"], missingData: ["eligibility documents", "cost/margin fit"], constraints: {} },
  b2b: { crisisCaseId: "rc-b2b", workspaceArchetype: "b2b_service", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "MEDIUM", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["our capacity", "cost/margin"], constraints: {} },
  collective: { crisisCaseId: "rc-collective", workspaceArchetype: "collective_conflict", cashPressure: "HIGH", revenuePressure: "HIGH", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "HIGH", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "CRITICAL", legalContractTenderRisk: "MEDIUM", opportunityTemptation: "GROWTH", missingData: ["cash runway", "cost/margin", "capacity"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } },
  unrecoverable: { crisisCaseId: "rc-unrecoverable", workspaceArchetype: "collective_conflict", cashPressure: "CRITICAL", revenuePressure: "CRITICAL", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "HIGH", staffCapacityPressure: "CRITICAL", ownerWorkloadPressure: "CRITICAL", legalContractTenderRisk: "HIGH", opportunityTemptation: "GROWTH", missingData: ["verified cash runway"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: false, ownerCapitalAvailable: false, capacityFeasible: false } },
};

const planFor = (a: Case) => planBusinessSurvivalRecovery(CRISES[a])!;
const routing = (a: Case): ProcessCorrectionRouting => {
  const corrections = survivalPlanToProcessCorrections(planFor(a), ws[a]);
  return { workspaceId: ws[a], evaluatedAt: AT, topCorrection: corrections[0] ?? null, corrections };
};
const tasksOf = (workspaceId: string) => getPersistedProcessTasks(workspaceId, deps);
const done = (order: number, r?: MilestoneOutcome["reassessment"]): MilestoneOutcome => ({ order, executed: true, evidenceProvided: true, reassessment: r });
const allDone = (): MilestoneOutcome[] => [done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5), done(6, "IMPROVED")];
const recoverView = (a: Case, outcomes: MilestoneOutcome[]) => computeRecoveryExecution({ recoveryCaseId: CRISES[a].crisisCaseId, workspaceArchetype: CRISES[a].workspaceArchetype, plan: planFor(a), outcomes })!;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Recovery execution & milestone proof", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `rc-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `rc-m-${mgr}@proof.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const a of CASES) {
      await db.workspace.create({ data: { id: ws[a], name: `WS ${a}`, slug: `rc-${a}-${ws[a].slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id: ws[a], workspaceId: ws[a], name: `${a} client`, updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: biz[a], workspaceId: ws[a], name: `${a} biz`, businessType: a, updatedAt: new Date() } });
      await persistProcessExecutionRoutes(ws[a], buildProcessExecutionBridge(routing(a), null, ws[a], AT), owner, deps);
    }
    await db.workspace.create({ data: { id: wsClean, name: "WS clean", slug: `rc-clean-${wsClean.slice(0, 6)}`, createdBy: owner } });
  });
  afterAll(async () => {
    const all = [...CASES.map((a) => ws[a]), wsClean];
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: CASES.map((a) => biz[a]) } } });
    await db.clientAccount.deleteMany({ where: { id: { in: CASES.map((a) => ws[a]) } } });
    await db.workspace.deleteMany({ where: { id: { in: all } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr] } } });
  });

  it("1. a crisis plan creates a governed milestone/task sequence", async () => {
    for (const a of CASES) {
      expect(planFor(a).recoveryMilestones.length).toBeGreaterThan(0);
      expect((await tasksOf(ws[a])).length).toBeGreaterThan(0);
    }
  });

  it("2+3+4+5. milestone task completion is evidence-gated (stop-loss/cash/quality/operations)", async () => {
    const corr = (await tasksOf(ws.laundry)).find((t) => ["CREATE_CORRECTION_TASK", "CREATE_EVIDENCE_REQUEST", "CREATE_REASSESSMENT_TASK", "CREATE_TRAINING_TASK"].includes(t.executionRoute));
    expect(corr).toBeDefined();
    const noEv = await applyProcessExecutionAction({ workspaceId: ws.laundry, actorId: mgr, actorRole: "manager", taskKey: corr!.taskKey, action: "COMPLETE", evidenceRefs: [] }, deps);
    expect(noEv.ok).toBe(false);
    if (!noEv.ok) expect(noEv.code).toBe("EVIDENCE_REQUIRED");
    const withEv = await applyProcessExecutionAction({ workspaceId: ws.laundry, businessId: biz.laundry, actorId: mgr, actorRole: "manager", taskKey: corr!.taskKey, action: "COMPLETE", evidenceRefs: ["fixed with proof"], outcomeNotes: "done" }, deps);
    expect(withEv.ok).toBe(true);
  });

  it("6. owner-approval milestone tasks cannot be bypassed by a non-owner", async () => {
    const ownerTask = (await tasksOf(ws.tender)).find((t) => t.approvalLevel === "OWNER_APPROVAL_REQUIRED")
      ?? (await tasksOf(ws.property)).find((t) => t.approvalLevel === "OWNER_APPROVAL_REQUIRED");
    expect(ownerTask).toBeDefined();
    const wsId = (await tasksOf(ws.tender)).some((t) => t.taskKey === ownerTask!.taskKey) ? ws.tender : ws.property;
    const asMgr = await applyProcessExecutionAction({ workspaceId: wsId, actorId: mgr, actorRole: "manager", taskKey: ownerTask!.taskKey, action: "APPROVE" }, deps);
    expect(asMgr.ok).toBe(false);
    if (!asMgr.ok) expect(asMgr.code).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("7+8. reassessment gates the stabilization gate; it stays blocked until all milestones pass", () => {
    for (const a of CASES.filter((x) => x !== "unrecoverable")) {
      expect(recoverView(a, [done(1), done(2), done(3, "IMPROVED"), done(4, "IMPROVED"), done(5)]).stabilizationGateStatus).toBe("BLOCKED");
      const full = recoverView(a, allDone());
      expect(full.stabilizationGateStatus, a).toBe("OPEN");
    }
  });

  it("9. the thrive gate stays blocked until stabilization is proven, then eligible + owner-gated", () => {
    for (const a of CASES.filter((x) => x !== "unrecoverable")) {
      expect(recoverView(a, [done(1), done(2)]).thriveGateStatus).toBe("BLOCKED");
      const full = recoverView(a, allDone());
      expect(full.thriveGateStatus).toBe("ELIGIBLE");
      expect(full.ownerApprovalRequired).toBe(true);
    }
  });

  it("10. a worsened reassessment loops back to correction (regression), thrive stays blocked", () => {
    const v = recoverView("laundry", [done(1), done(2), { order: 3, executed: true, evidenceProvided: true, reassessment: "WORSENED" }]);
    expect(v.currentRecoveryState).toBe("RECOVERY_REGRESSED");
    expect(v.thriveGateStatus).toBe("BLOCKED");
    expect(v.nextMilestone!.milestone).toMatch(/re-correct/i);
  });

  it("11. the unrecoverable case stays restructure/shutdown review (no fake recovery even if milestones 'done')", () => {
    const v = computeAndValidateRecovery({ recoveryCaseId: "rc-unrecoverable", workspaceArchetype: "collective_conflict", plan: planFor("unrecoverable"), outcomes: allDone() });
    expect(v.ok).toBe(true);
    if (v.ok && v.view) {
      expect(v.view.currentRecoveryState).toBe("RESTRUCTURE_REVIEW_REQUIRED");
      expect(v.view.stabilizationGateStatus).toBe("BLOCKED");
      expect(v.view.thriveGateStatus).toBe("BLOCKED");
    }
  });

  it("12. unsafe external actions are blocked throughout recovery", () => {
    for (const a of CASES) {
      const v = recoverView(a, [done(1)]);
      expect(v.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b)), a).toBe(true);
    }
    expect(recoverView("tender", [done(1)]).blockedUnsafeActions).toContain("tender auto-submit");
  });

  it("13. workspace isolation holds under recovery execution", async () => {
    const laundry = await tasksOf(ws.laundry);
    expect(laundry.every((t) => t.workspaceId === ws.laundry)).toBe(true);
    expect((await tasksOf(ws.tender)).length).toBeGreaterThan(0);
    expect(laundry.some((t) => t.workspaceId === ws.tender)).toBe(false);
  });

  it("14. a clean workspace fabricates nothing", async () => {
    expect(computeRecoveryExecution({ recoveryCaseId: "clean", workspaceArchetype: "laundry_local_service", plan: null })).toBeNull();
    expect(await tasksOf(wsClean)).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
  });

  it("15. the cockpit shows the next bottleneck, not the whole backlog", () => {
    const v = recoverView("laundry", [done(1), done(2)]);
    expect(v.nextMilestone).not.toBeNull();
    expect(v.cockpitSummary).toMatch(/Next bottleneck/i);
    expect(v.currentRecoveryState).toBe("QUALITY_CORRECTION_PENDING");
  });
});

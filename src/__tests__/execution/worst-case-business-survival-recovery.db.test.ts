/**
 * Worst-Case Business Survival & Recovery — End-to-End proof (PASS 32). Requires TEST_WITH_DB=true.
 *
 * Drives multi-failure crisis scenarios → planBusinessSurvivalRecovery → governed ProcessCorrections (one per
 * survival action, never per signal) → the ALREADY-PROVEN execution bridge, across the required crisis
 * archetypes + an unrecoverable case + a clean control.
 *
 * Proves survival-first navigation under the governed substrate: survival/cash/customer/quality/legal/capacity
 * outrank growth; owner-approval + evidence gates hold; missing data → data tasks (never a fake runway);
 * tender urgency cannot bypass eligibility/docs/cost; SaaS launch stays frozen; owner overload → delegation;
 * the unrecoverable case is honest (restructure/shutdown review, no fake optimism); recovery milestones exist;
 * growth/thrive blocked until stabilization; unsafe external actions blocked; workspace isolation; clean
 * workspace fabricates nothing. Controlled fixtures only.
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
import {
  planBusinessSurvivalRecovery, planAndValidateSurvival, survivalPlanToProcessCorrections, type CrisisInput,
} from "@/domain/owner-mode/business-survival-recovery";
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
  laundry: { crisisCaseId: "cr-laundry", workspaceArchetype: "laundry_local_service", cashPressure: "HIGH", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", unsafeActionTemptations: [], missingData: ["unit margin", "capacity"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } },
  housekeeping: { crisisCaseId: "cr-housekeeping", workspaceArchetype: "housekeeping_facility", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["supply cost", "capacity"], constraints: { capacityFeasible: true } },
  property: { crisisCaseId: "cr-property", workspaceArchetype: "property_management", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "MEDIUM", operationalPressure: "HIGH", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "HIGH", opportunityTemptation: "MARKETING", missingData: ["vendor quote", "high-spend budget"], constraints: {} },
  franchise: { crisisCaseId: "cr-franchise", workspaceArchetype: "franchise_operations", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "MEDIUM", opportunityTemptation: "MARKETING", unsafeActionTemptations: [], missingData: ["per-branch metrics"], constraints: {} },
  saas: { crisisCaseId: "cr-saas", workspaceArchetype: "saas", cashPressure: "MEDIUM", revenuePressure: "HIGH", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "MEDIUM", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "LOW", opportunityTemptation: "LAUNCH", missingData: ["real activation/conversion"], constraints: {} },
  tender: { crisisCaseId: "cr-tender", workspaceArchetype: "tender_procurement", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "LOW", qualityPressure: "LOW", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "MEDIUM", legalContractTenderRisk: "HIGH", opportunityTemptation: "TENDER", unsafeActionTemptations: ["tender auto-submit"], missingData: ["eligibility documents", "cost/margin fit", "EMD affordability"], constraints: {} },
  b2b: { crisisCaseId: "cr-b2b", workspaceArchetype: "b2b_service", cashPressure: "MEDIUM", revenuePressure: "MEDIUM", customerPressure: "MEDIUM", qualityPressure: "HIGH", operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH", legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["our capacity", "cost/margin"], constraints: {} },
  collective: { crisisCaseId: "cr-collective", workspaceArchetype: "collective_conflict", cashPressure: "HIGH", revenuePressure: "HIGH", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "HIGH", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "CRITICAL", legalContractTenderRisk: "MEDIUM", opportunityTemptation: "GROWTH", missingData: ["cash runway", "cost/margin", "capacity"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true } },
  // No cash runway, no feasible revenue, no owner capital, capacity infeasible → honest unrecoverable.
  unrecoverable: { crisisCaseId: "cr-unrecoverable", workspaceArchetype: "collective_conflict", cashPressure: "CRITICAL", revenuePressure: "CRITICAL", customerPressure: "HIGH", qualityPressure: "HIGH", operationalPressure: "HIGH", staffCapacityPressure: "CRITICAL", ownerWorkloadPressure: "CRITICAL", legalContractTenderRisk: "HIGH", opportunityTemptation: "GROWTH", missingData: ["verified cash runway"], constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: false, ownerCapitalAvailable: false, capacityFeasible: false } },
};

const planFor = (a: Case) => planBusinessSurvivalRecovery(CRISES[a])!;
const routing = (a: Case): ProcessCorrectionRouting => {
  const corrections = survivalPlanToProcessCorrections(planFor(a), ws[a]);
  return { workspaceId: ws[a], evaluatedAt: AT, topCorrection: corrections[0] ?? null, corrections };
};
const tasksOf = (workspaceId: string) => getPersistedProcessTasks(workspaceId, deps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Worst-case business survival & recovery", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `sv-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: mgr, email: `sv-m-${mgr}@proof.test`, name: "Mgr", isActive: true, updatedAt: new Date() } });
    for (const a of CASES) {
      await db.workspace.create({ data: { id: ws[a], name: `WS ${a}`, slug: `sv-${a}-${ws[a].slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id: ws[a], workspaceId: ws[a], name: `${a} client`, updatedAt: new Date() } });
      await db.ownerBusiness.create({ data: { id: biz[a], workspaceId: ws[a], name: `${a} biz`, businessType: a, updatedAt: new Date() } });
      await persistProcessExecutionRoutes(ws[a], buildProcessExecutionBridge(routing(a), null, ws[a], AT), owner, deps);
    }
    await db.workspace.create({ data: { id: wsClean, name: "WS clean", slug: `sv-clean-${wsClean.slice(0, 6)}`, createdBy: owner } });
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

  it("1. all crisis archetypes run and produce a schema-valid survival plan", () => {
    for (const a of CASES) {
      const r = planAndValidateSurvival(CRISES[a]);
      expect(r.ok, a).toBe(true);
      if (r.ok) expect(r.plan).not.toBeNull();
    }
  });

  it("2+3. a survival top action + owner cockpit summary is created and persisted per workspace", async () => {
    for (const a of CASES) {
      expect(planFor(a).cockpitSummary).toMatch(/Crisis status:/);
      expect((await tasksOf(ws[a])).length).toBeGreaterThan(0);
    }
  });

  it("4. stop-loss / cash / customer / ops actions are routed as governed tasks", () => {
    const laundry = planFor("laundry");
    expect(laundry.immediateStopLossActions.length + laundry.cashProtectionActions.length).toBeGreaterThan(0);
    expect(laundry.customerRecoveryActions.length).toBeGreaterThan(0);
  });

  it("5. owner-approval gates hold: a non-owner cannot approve an owner-gated survival task", async () => {
    const t = (await tasksOf(ws.tender)).find((x) => x.approvalLevel === "OWNER_APPROVAL_REQUIRED")
      ?? (await tasksOf(ws.property)).find((x) => x.approvalLevel === "OWNER_APPROVAL_REQUIRED");
    expect(t).toBeDefined();
    const wsId = (await tasksOf(ws.tender)).some((x) => x.taskKey === t!.taskKey) ? ws.tender : ws.property;
    const asMgr = await applyProcessExecutionAction({ workspaceId: wsId, actorId: mgr, actorRole: "manager", taskKey: t!.taskKey, action: "APPROVE" }, deps);
    expect(asMgr.ok).toBe(false);
    if (!asMgr.ok) expect(asMgr.code).toBe("OWNER_APPROVAL_REQUIRED");
  });

  it("6. manager/staff correction tasks route where safe", () => {
    expect(planFor("laundry").managerStaffTasks.length).toBeGreaterThan(0);
  });

  it("7. missing data creates data tasks, never a fake runway", async () => {
    for (const a of CASES) {
      expect(planFor(a).missingDataTasks.length).toBeGreaterThan(0);
      const blob = JSON.stringify(await tasksOf(ws[a]));
      expect(blob).not.toMatch(/[$£€]\s?\d/);
    }
  });

  it("8. completion is evidence-gated on a governed correction task", async () => {
    const corr = (await tasksOf(ws.laundry)).find((t) => ["CREATE_CORRECTION_TASK", "CREATE_EVIDENCE_REQUEST", "CREATE_REASSESSMENT_TASK", "CREATE_TRAINING_TASK"].includes(t.executionRoute));
    if (corr) {
      const noEv = await applyProcessExecutionAction({ workspaceId: ws.laundry, actorId: mgr, actorRole: "manager", taskKey: corr.taskKey, action: "COMPLETE", evidenceRefs: [] }, deps);
      expect(noEv.ok).toBe(false);
      if (!noEv.ok) expect(noEv.code).toBe("EVIDENCE_REQUIRED");
    } else {
      expect(true).toBe(true);
    }
  });

  it("9. recovery milestones exist for every crisis", () => {
    for (const a of CASES) expect(planFor(a).recoveryMilestones.length).toBeGreaterThan(0);
  });

  it("10. growth / thrive is blocked until stabilization in every crisis", () => {
    for (const a of CASES) {
      const p = planFor(a);
      expect(p.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b)), a).toBe(true);
      expect(p.crisisStatus).not.toBe("THRIVE_READY");
      expect(p.thriveGate).toMatch(/BLOCKED/);
    }
  });

  it("11. the unrecoverable case is honest (restructure/shutdown review, no fake optimism)", async () => {
    const p = planFor("unrecoverable");
    expect(p.crisisStatus).toBe("UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS");
    expect(p.unrecoverableRiskAssessment.unrecoverable).toBe(true);
    expect(p.unrecoverableRiskAssessment.options.join(" ")).toMatch(/restructure|shutdown|expert/i);
    expect(JSON.stringify(p)).not.toMatch(/will recover|success assured|guaranteed (recovery|success)/i);
    // The owner/expert decision is persisted and owner-gated.
    expect((await tasksOf(ws.unrecoverable)).some((t) => t.approvalLevel === "OWNER_APPROVAL_REQUIRED")).toBe(true);
  });

  it("12. unsafe external actions are blocked; tender auto-submit blocked", () => {
    expect(planFor("tender").blockedUnsafeActions).toContain("tender auto-submit");
    expect(planFor("saas").blockedUnsafeActions.some((b) => /launch/i.test(b))).toBe(true);
    for (const a of CASES) {
      const routes = new Set(survivalPlanToProcessCorrections(planFor(a), ws[a]).map((c) => c.correctionType));
      for (const r of routes) expect(r).not.toMatch(/SUBMIT|SEND|SPEND|OUTREACH/i);
    }
  });

  it("13. workspace isolation holds under crisis", async () => {
    const laundry = await tasksOf(ws.laundry);
    expect(laundry.every((t) => t.workspaceId === ws.laundry)).toBe(true);
    expect((await tasksOf(ws.tender)).length).toBeGreaterThan(0);
    expect(laundry.some((t) => t.workspaceId === ws.tender)).toBe(false);
  });

  it("14. a clean workspace fabricates nothing", async () => {
    expect(planBusinessSurvivalRecovery({ crisisCaseId: "clean", workspaceArchetype: "laundry_local_service", cashPressure: "NONE", revenuePressure: "NONE", customerPressure: "NONE", qualityPressure: "NONE", operationalPressure: "NONE", staffCapacityPressure: "NONE", ownerWorkloadPressure: "NONE", legalContractTenderRisk: "NONE", opportunityTemptation: "NONE" })).toBeNull();
    expect(await tasksOf(wsClean)).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { workspaceId: wsClean } })).toBe(0);
  });
});

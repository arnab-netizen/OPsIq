/**
 * Owner Recovery Status read — End-to-End DB proof (PASS 37). Requires TEST_WITH_DB=true.
 *
 * Proves the READ-ONLY recovery-status service runs against a real Postgres, is workspace-scoped, and
 * fabricates nothing: a clean workspace reads NONE (no fake recovery); the response validates fail-closed
 * and always carries the no-guarantee statement + blocked unsafe actions; no money/ROI/win-probability is
 * emitted; and one workspace's persisted execution tasks never leak into another workspace's read
 * (isolation). The crisis → stabilization/thrive/regression/unrecoverable gate matrix is proven
 * deterministically by the pure unit suite (owner-recovery-status.test.ts); this DB test proves the real
 * read path + isolation + no-fabrication, which is what requires a database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerRecoveryStatus } from "@/services/owner-mode/owner-recovery-status.service";
import { ownerRecoveryStatusSchema } from "@/domain/owner-mode/owner-recovery-status";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import { persistProcessExecutionRoutes, type ProcessBridgeDb, type ProcessBridgeDeps } from "@/services/owner-mode/process-execution-bridge.service";
import { survivalPlanToProcessCorrections, planBusinessSurvivalRecovery, type CrisisInput } from "@/domain/owner-mode/business-survival-recovery";
import type { ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";

const owner = randomUUID();
const wsA = randomUUID(), wsB = randomUUID();
const bizA = randomUUID();
const AT = "2026-07-07T00:00:00.000Z";
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

const crisisA: CrisisInput = {
  crisisCaseId: "rc-a", workspaceArchetype: "laundry_local_service",
  cashPressure: "HIGH", revenuePressure: "MEDIUM", customerPressure: "HIGH", qualityPressure: "HIGH",
  operationalPressure: "MEDIUM", staffCapacityPressure: "HIGH", ownerWorkloadPressure: "HIGH",
  legalContractTenderRisk: "LOW", opportunityTemptation: "B2B", missingData: ["unit margin", "capacity"],
  constraints: { cashRunwayKnown: false, feasibleNearTermRevenue: true, ownerCapitalAvailable: true, capacityFeasible: true },
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner recovery status read", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `rs-o-${owner}@proof.test`, name: "Owner", isActive: true, updatedAt: new Date() } });
    for (const [id, label] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.create({ data: { id, name: `WS ${label}`, slug: `rs-${label}-${id.slice(0, 6)}`, createdBy: owner } });
      await db.clientAccount.create({ data: { id, workspaceId: id, name: `${label} client`, updatedAt: new Date() } });
    }
    await db.ownerBusiness.create({ data: { id: bizA, workspaceId: wsA, name: "A biz", businessType: "laundry", updatedAt: new Date() } });
    // Seed WS-A with persisted governed execution tasks (workspace-scoped) — used to prove isolation.
    const corrections = survivalPlanToProcessCorrections(planBusinessSurvivalRecovery(crisisA)!, wsA);
    const routing: ProcessCorrectionRouting = { workspaceId: wsA, evaluatedAt: AT, topCorrection: corrections[0] ?? null, corrections };
    await persistProcessExecutionRoutes(wsA, buildProcessExecutionBridge(routing, null, wsA, AT), owner, deps);
  });
  afterAll(async () => {
    const all = [wsA, wsB];
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerReassessmentEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: all } } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: [bizA] } } });
    await db.clientAccount.deleteMany({ where: { id: { in: all } } });
    await db.workspace.deleteMany({ where: { id: { in: all } } });
    await db.user.deleteMany({ where: { id: { in: [owner] } } });
  });

  it("1. reads a workspace's recovery status from real data and validates fail-closed", async () => {
    const r = await getOwnerRecoveryStatus(wsA, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ownerRecoveryStatusSchema.safeParse(r.status).success).toBe(true);
  });

  it("2. a clean workspace (no crisis signals) reads NONE — no fabricated recovery", async () => {
    const r = await getOwnerRecoveryStatus(wsB, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status.recoveryStatus).toBe("NONE");
      expect(r.status.completedMilestones).toEqual([]);
      expect(r.status.nextMilestone).toBeNull();
    }
  });

  it("3. every response carries the no-guarantee statement + blocked unsafe actions", async () => {
    for (const ws of [wsA, wsB]) {
      const r = await getOwnerRecoveryStatus(ws, null);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.status.noGuaranteeStatement).toMatch(/not guaranteed/i);
        expect(r.status.blockedUnsafeActions.length).toBeGreaterThan(0);
        expect(r.status.thriveGate).toBe("BLOCKED");
      }
    }
  });

  it("4. no fake money / profit / ROI / win-probability in the response", async () => {
    const r = await getOwnerRecoveryStatus(wsA, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const blob = JSON.stringify(r.status);
      expect(blob).not.toMatch(/[$£€]\s?\d|\b\d+(\.\d+)?\s?%|\broi\b|win probability|guaranteed (recovery|success|profit)/i);
    }
  });

  it("5. workspace isolation: WS-A's persisted tasks never appear in WS-B's read", async () => {
    const persisted = await db.processExecutionTask.findMany({ where: { workspaceId: wsA } });
    expect(persisted.length).toBeGreaterThan(0); // WS-A really has tasks
    const r = await getOwnerRecoveryStatus(wsB, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status.linkedProcessExecutionTaskIds).toEqual([]); // WS-B sees none of WS-A's tasks
  });

  it("6. stabilization/thrive gates never open from this read-only path without proven outcomes", async () => {
    for (const ws of [wsA, wsB]) {
      const r = await getOwnerRecoveryStatus(ws, null);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.status.stabilizationGate).toBe("BLOCKED");
        expect(r.status.thriveGate).toBe("BLOCKED");
        expect(r.status.recoveryStatus).not.toBe("THRIVE_GATE_ELIGIBLE");
        expect(r.status.recoveryStatus).not.toBe("STABILIZATION_PROVEN");
      }
    }
  });
});

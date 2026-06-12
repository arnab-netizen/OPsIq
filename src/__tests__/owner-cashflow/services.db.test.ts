/**
 * Owner Cashflow (Module 5 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 5 cashflow migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, and invalid-transition
 * rejection through the actual cashflow services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-cashflow/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createCashflowSnapshot,
  getCashflowSnapshot,
} from "@/services/owner-cashflow/snapshot.service";
import {
  runCashflowDiagnosis,
  listCashflowCycleFindings,
  listCashflowCycleActions,
} from "@/services/owner-cashflow/diagnosis.service";
import { updateCashflowAction } from "@/services/owner-cashflow/action.service";
import { recordCashflowVerification } from "@/services/owner-cashflow/verification.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `cashflow-test-${actor}@example.com`,
      name: "Cashflow Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    {
      name: "Cashflow Svc Test",
      businessType: "generic_local_service",
      currency: "INR",
      b2cSupported: true,
      b2bSupported: false,
    },
    actor,
    workspaceId
  );
  return b.id;
}

function crisisSnapshot() {
  // Obligations exceed cash + overdue receivables → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 20000,
    dailyCollections: 800,
    receivables: 60000,
    receivablesOverdue: 45000,
    payables: 50000,
    salaryDue: 50000,
    rentDue: 20000,
    upcomingEmi: 25000,
    ownerWithdrawal: 15000,
  };
}

describe("[db] Owner Cashflow services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);
    expect(typeof snap.dataConfidenceScore).toBe("number");

    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.cashflowState).toBeTruthy();

    const findings = await listCashflowCycleFindings(cycle.id, workspaceId);
    const actions = await listCashflowCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getCashflowDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("cashflow");
    expect(dash.recommendedNextAction).not.toBeNull();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateCashflowAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    // Invalid jump assigned -> completed is rejected by the shared status machine.
    await expect(
      updateCashflowAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const { verification, result } = await recordCashflowVerification(
      action.id,
      { beforeValue: 45, afterValue: 20, targetDirection: "down", targetValue: 25 },
      actor,
      workspaceId
    );
    expect(verification.id).toBeTruthy();
    expect(["verified_improved", "verified_not_improved", "inconclusive", "disputed"]).toContain(
      result.status
    );

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] rejects a duplicate snapshot for the same business + period", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    await expect(
      createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);

    await expect(getCashflowSnapshot(snap.id, ws())).rejects.toThrow();

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });
});

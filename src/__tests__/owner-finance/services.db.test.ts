/**
 * Owner Finance (Module 2 Slice 6) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 2 finance migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, and invalid-transition
 * rejection through the actual finance services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot, getFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import {
  runFinanceDiagnosis,
  listFinanceCycleFindings,
  listFinanceCycleActions,
} from "@/services/owner-finance/diagnosis.service";
import { updateFinanceAction } from "@/services/owner-finance/action.service";
import { recordFinanceVerification } from "@/services/owner-finance/verification.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `finance-test-${actor}@example.com`, name: "Finance Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Finance Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function leakySnapshot() {
  // Poor metrics → guarantees findings + actions (discount leakage + low margin).
  return {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    currency: "INR",
    revenue: 100000,
    fixedCosts: 40000,
    variableCosts: 40000,
    discountAmount: 15000,
    cashOnHand: 50000,
  };
}

describe("[db] Owner Finance services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);
    expect(typeof snap.dataConfidenceScore).toBe("number");

    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.domainScore ?? cycle.survivalState).toBeTruthy();

    const findings = await listFinanceCycleFindings(cycle.id, workspaceId);
    const actions = await listFinanceCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("finance");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    // Invalid jump assigned -> completed is rejected by the shared status machine.
    await expect(
      updateFinanceAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const { verification, result } = await recordFinanceVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );
    expect(verification.id).toBeTruthy();
    expect(["verified_improved", "verified_not_improved", "inconclusive", "disputed"]).toContain(result.status);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);

    await expect(getFinancialSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});

/**
 * Owner Sales (Module 3 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 3 sales migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, duplicate-period
 * rejection, and invalid-transition rejection through the actual sales services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-sales/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSalesSnapshot, getSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import {
  runSalesDiagnosis,
  listSalesCycleFindings,
  listSalesCycleActions,
} from "@/services/owner-sales/diagnosis.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { recordSalesVerification } from "@/services/owner-sales/verification.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `sales-test-${actor}@example.com`,
      name: "Sales Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Sales Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function distressSnapshot() {
  // Collapsed conversion + churn + complaints → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    leads: 1000,
    qualifiedLeads: 400,
    orders: 30,
    revenue: 60000,
    newCustomers: 12,
    repeatCustomers: 3,
    lostCustomers: 25,
    complaints: 6,
    discountAmount: 18000,
    refundAmount: 6000,
    b2bRevenue: 10000,
    b2cRevenue: 50000,
    b2bPipelineValue: 6000,
  };
}

describe("[db] Owner Sales services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);
    expect(typeof snap.dataConfidenceScore).toBe("number");

    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.salesState).toBeTruthy();

    const findings = await listSalesCycleFindings(cycle.id, workspaceId);
    const actions = await listSalesCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getSalesDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("sales");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    await expect(
      updateSalesAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const { verification, result } = await recordSalesVerification(
      action.id,
      { beforeValue: 3, afterValue: 12, targetDirection: "up", targetValue: 10 },
      actor,
      workspaceId
    );
    expect(verification.id).toBeTruthy();
    expect(["verified_improved", "verified_not_improved", "inconclusive", "disputed"]).toContain(result.status);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects a duplicate snapshot for the same business + period", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    await expect(
      createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);

    await expect(getSalesSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});

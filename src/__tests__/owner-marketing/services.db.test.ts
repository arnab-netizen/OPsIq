/**
 * Owner Marketing (Module 6 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 6 marketing migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, duplicate-period
 * rejection, and invalid-transition rejection through the actual services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-marketing/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createMarketingSnapshot,
  getMarketingSnapshot,
} from "@/services/owner-marketing/snapshot.service";
import {
  runMarketingDiagnosis,
  listMarketingCycleFindings,
  listMarketingCycleActions,
} from "@/services/owner-marketing/diagnosis.service";
import { updateMarketingAction } from "@/services/owner-marketing/action.service";
import { recordMarketingVerification } from "@/services/owner-marketing/verification.service";
import { getMarketingDashboard } from "@/services/owner-marketing/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `marketing-test-${actor}@example.com`,
      name: "Marketing Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Mkt Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function wastingSnapshot() {
  // Negative ROI + near-zero conversion + no follow-up → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    marketingSpend: 100000,
    revenue: 30000,
    leads: 200,
    inquiries: 150,
    orders: 4,
    newCustomers: 4,
    paidLeads: 180,
    organicLeads: 20,
    campaignsRun: 10,
    campaignsWithFollowup: 2,
    contentPosted: 2,
    couponsRedeemed: 1,
    referrals: 0,
    walkIns: 5,
  };
}

describe("[db] Owner Marketing services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);

    const cycle = await runMarketingDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.marketingState).toBeTruthy();

    const findings = await listMarketingCycleFindings(cycle.id, workspaceId);
    const actions = await listMarketingCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getMarketingDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("marketing");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId);
    const cycle = await runMarketingDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateMarketingAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    await expect(
      updateMarketingAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId);
    const cycle = await runMarketingDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const { verification, result } = await recordMarketingVerification(
      action.id,
      { beforeValue: 2, afterValue: 25, targetDirection: "up", targetValue: 20 },
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
    await createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId);
    await expect(
      createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createMarketingSnapshot(businessId, wastingSnapshot(), actor, workspaceId);

    await expect(getMarketingSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});

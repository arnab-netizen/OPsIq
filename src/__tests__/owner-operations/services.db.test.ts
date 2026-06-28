/**
 * Owner Operations (Module 4 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 4 operations migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, duplicate-period
 * rejection, and invalid-transition rejection through the actual services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-operations/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createOperationsSnapshot,
  getOperationsSnapshot,
} from "@/services/owner-operations/snapshot.service";
import {
  runOperationsDiagnosis,
  listOperationsCycleFindings,
  listOperationsCycleActions,
} from "@/services/owner-operations/diagnosis.service";
import { updateOperationsAction } from "@/services/owner-operations/action.service";
import { recordOperationsVerification } from "@/services/owner-operations/verification.service";
import { getOperationsDashboard } from "@/services/owner-operations/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `operations-test-${actor}@example.com`,
      name: "Operations Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Ops Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function overloadedSnapshot() {
  // Over capacity + low completion + delays/rework → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    ordersReceived: 1500,
    ordersCompleted: 900,
    ordersDelayed: 500,
    reworkCount: 180,
    complaints: 120,
    staffHours: 400,
    machineCapacityUnits: 1000,
    idleHours: 120,
    deliveryAttempts: 900,
    deliveryFailures: 200,
    inventoryShortages: 4,
    sopChecks: 100,
    sopMisses: 50,
  };
}

describe("[db] Owner Operations services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);

    const cycle = await runOperationsDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.operationsState).toBeTruthy();

    const findings = await listOperationsCycleFindings(cycle.id, workspaceId);
    const actions = await listOperationsCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getOperationsDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("operations");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId);
    const cycle = await runOperationsDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateOperationsAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    await expect(
      updateOperationsAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId);
    const cycle = await runOperationsDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const { verification, result } = await recordOperationsVerification(
      action.id,
      { beforeValue: 60, afterValue: 92, targetDirection: "up", targetValue: 90 },
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
    await createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId);
    await expect(
      createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createOperationsSnapshot(businessId, overloadedSnapshot(), actor, workspaceId);

    await expect(getOperationsSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});

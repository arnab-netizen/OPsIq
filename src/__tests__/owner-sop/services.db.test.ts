/**
 * Owner SOP (Module 7 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 7 sop migration applied. Proves snapshot/diagnosis/findings/actions/
 * verification persistence, workspace isolation, duplicate-period rejection, and
 * invalid-transition rejection through the actual services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-sop/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createSopSnapshot,
  getSopSnapshot,
} from "@/services/owner-sop/snapshot.service";
import {
  runSopDiagnosis,
  listSopCycleFindings,
  listSopCycleActions,
} from "@/services/owner-sop/diagnosis.service";
import { updateSopAction } from "@/services/owner-sop/action.service";
import { recordSopVerification } from "@/services/owner-sop/verification.service";
import { getSopDashboard } from "@/services/owner-sop/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `sop-test-${actor}@example.com`,
      name: "SOP Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "SOP Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function breakdownSnapshot() {
  // Low completion/verification + overdue + repeated failures → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    actionsAssigned: 100,
    actionsCompleted: 50,
    actionsVerified: 10,
    actionsOverdue: 40,
    actionsDisputed: 8,
    actionsReassigned: 30,
    repeatedFailures: 30,
    proofRequired: 40,
    proofProvided: 10,
    recurringProcesses: 20,
    documentedSops: 5,
  };
}

describe("[db] Owner SOP services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);

    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.executionState).toBeTruthy();

    const findings = await listSopCycleFindings(cycle.id, workspaceId);
    const actions = await listSopCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getSopDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("sop");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateSopAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    await expect(
      updateSopAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateSopAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateSopAction(action.id, { status: "in_progress" }, actor, workspaceId);

    const { verification, result } = await recordSopVerification(
      action.id,
      { beforeValue: 50, afterValue: 92, targetDirection: "up", targetValue: 90 },
      actor,
      workspaceId
    );
    expect(verification.id).toBeTruthy();
    expect(["verified_improved", "verified_not_improved", "inconclusive", "disputed"]).toContain(result.status);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects recording an outcome for an action whose work has not started (BIV-09)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await expect(
      recordSopVerification(action.id, { beforeValue: 1, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
    ).rejects.toThrow(/Start this action before recording its outcome/);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] records baseline provenance: blank before uses the measured value; a different owner value is kept as OWNER_REPORTED (BIV-10)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await updateSopAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateSopAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const row = await db.ownerSopAction.findFirst({ where: { id: action.id }, include: { finding: true } });
    const measured =
      row?.finding && row.finding.sourceMetric === row.verificationMetric && row.finding.sourceValue !== null
        ? row.finding.sourceValue
        : null;
    if (measured === null) {
      await expect(
        recordSopVerification(action.id, { beforeValue: null, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
      ).rejects.toThrow(/before \(baseline\) value/);
    } else {
      const measuredRun = await recordSopVerification(action.id, { beforeValue: null, afterValue: measured, targetDirection: "up" }, actor, workspaceId);
      expect(measuredRun.verification.beforeValue).toBe(measured);
      expect(measuredRun.verification.baselineSource).toBe("MEASURED");
    }
    const reported = (measured ?? 0) + 50;
    const ownerRun = await recordSopVerification(action.id, { beforeValue: reported, afterValue: 1, targetDirection: "up" }, actor, workspaceId);
    expect(ownerRun.verification.beforeValue).toBe(reported);
    expect(ownerRun.verification.baselineSource).toBe("OWNER_REPORTED");
    expect(ownerRun.verification.measuredBeforeValue).toBe(measured);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects a duplicate snapshot for the same business + period", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);
    await expect(
      createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, breakdownSnapshot(), actor, workspaceId);

    await expect(getSopSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});

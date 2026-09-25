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

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateFinanceAction(action.id, { status: "in_progress" }, actor, workspaceId);

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

  it("[db] rejects recording an outcome for an action whose work has not started (BIV-09)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await expect(
      recordFinanceVerification(action.id, { beforeValue: 1, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
    ).rejects.toThrow(/Start this action before recording its outcome/);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] records baseline provenance: blank before uses the measured value; a different owner value is kept as OWNER_REPORTED (BIV-10)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateFinanceAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const row = await db.ownerFinanceAction.findFirst({ where: { id: action.id }, include: { finding: true } });
    const measured =
      row?.finding && row.finding.sourceMetric === row.verificationMetric && row.finding.sourceValue !== null
        ? row.finding.sourceValue
        : null;
    if (measured === null) {
      await expect(
        recordFinanceVerification(action.id, { beforeValue: null, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
      ).rejects.toThrow(/before \(baseline\) value/);
    } else {
      const measuredRun = await recordFinanceVerification(action.id, { beforeValue: null, afterValue: measured, targetDirection: "up" }, actor, workspaceId);
      expect(measuredRun.verification.beforeValue).toBe(measured);
      expect(measuredRun.verification.baselineSource).toBe("MEASURED");
    }
    const reported = (measured ?? 0) + 50;
    const ownerRun = await recordFinanceVerification(action.id, { beforeValue: reported, afterValue: 1, targetDirection: "up" }, actor, workspaceId);
    expect(ownerRun.verification.beforeValue).toBe(reported);
    expect(ownerRun.verification.baselineSource).toBe("OWNER_REPORTED");
    expect(ownerRun.verification.measuredBeforeValue).toBe(measured);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);

    await expect(getFinancialSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });

  // ---------------------------------------------------------------------
  // Run #6 forensic reproduction: completing an action deterministically
  // triggers an automatic re-diagnosis (action.service.ts's "On action
  // completion ... trigger re-diagnosis from latest snapshot"), which
  // creates a NEW OwnerFinanceCycle whose fresh "proposed" actions become
  // the dashboard's `latestCycle`. A live-production acceptance test that
  // re-reads the dashboard/action-list after completing an action will
  // observe a DIFFERENT (new) action, not a reversion of the original one
  // -- the original action's own row is untouched and stays "completed"
  // permanently. This is not a bug: it is the documented, intentional
  // "route into governed re-evaluation of ... recommendation and action
  // priority" behavior this codebase is built around. Proven here end to
  // end against real Postgres, not just by reading the source.
  // ---------------------------------------------------------------------
  it("[db] completing an action stays completed on its own row even though a new latest cycle is created", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle1 = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle1.actions[0];
    expect(action.status).toBe("proposed");

    await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateFinanceAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const completed = await updateFinanceAction(
      action.id,
      { status: "completed", completionNotes: "hostile-test completion", completionEvidence: ["ref"] },
      actor,
      workspaceId
    );
    expect(completed.status).toBe("completed");

    // The original action's OWN row is permanently "completed" -- fetching
    // it directly (the same call the fixed Playwright test uses) never
    // shows a reversion, regardless of what the dashboard now shows.
    const reread = await db.ownerFinanceAction.findUnique({ where: { id: action.id } });
    expect(reread?.status).toBe("completed");
    expect(reread?.completedAt).not.toBeNull();

    // A NEW cycle was created automatically -- the deterministic mechanism
    // behind the apparent "reversion to proposed."
    const allCycles = await db.ownerFinanceCycle.findMany({
      where: { businessId, workspaceId },
      orderBy: { sequenceNumber: "asc" },
      include: { actions: true },
    });
    expect(allCycles.length).toBe(2);
    expect(allCycles[0].id).toBe(cycle1.id);
    const cycle2 = allCycles[1];
    expect(cycle2.sequenceNumber).toBe(cycle1.sequenceNumber + 1);
    expect(cycle2.actions.length).toBeGreaterThan(0);
    // Every action in the fresh cycle starts "proposed" -- including,
    // deterministically, one with the same title/priority as the just-
    // completed action, since the re-diagnosis ran against the SAME
    // unchanged snapshot. This is exactly what a `.first()`-by-priority
    // locator would observe as an apparent "reversion."
    for (const a of cycle2.actions) expect(a.status).toBe("proposed");
    const regenerated = cycle2.actions.find((a) => a.title === action.title);
    expect(regenerated, "re-diagnosis on unchanged data regenerates the same finding/action").toBeTruthy();
    expect(regenerated!.id).not.toBe(action.id); // a DIFFERENT row, not the same one reset

    // The dashboard now shows cycle #2 as "latest" -- confirming the exact
    // mechanism a UI/Playwright test would observe after completing.
    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.latestCycle?.id).toBe(cycle2.id);
    expect(dash.latestCycle?.actions[0]?.status).toBe("proposed");

    await teardownOwnerBusiness(businessId);
  });
});

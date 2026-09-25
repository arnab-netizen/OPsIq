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
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
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

function distressedButActionableSnapshot() {
  // Deliberately distressed enough to guarantee findings + actions (high overdue
  // receivables, payables/owner-withdrawal pressure), but stays at cashflowState
  // AT_RISK, not CRITICAL/INSOLVENT_RISK -- unlike crisisSnapshot() above.
  //
  // This matters here specifically: cashflow is a FINANCE_SENSITIVE domain in
  // owner-action-gate.service.ts's DOMAIN_SENSITIVITY map, and
  // enforceOwnerActionGates() blocks material transitions (in_progress/completed)
  // for FINANCE_SENSITIVE domains once the business's cashflowState reaches
  // CRITICAL or INSOLVENT_RISK (evaluateCashSafetyGate's UNSAFE_FOR_SPEND
  // threshold). crisisSnapshot() deliberately reaches INSOLVENT_RISK, which is
  // correct for the diagnosis/verification tests above (they never transition
  // past "assigned"/"proposed") but would make the reassessment tests below --
  // which walk a real action through assigned→in_progress→completed -- fail on
  // the pre-existing, correct, intentional safety gate, not on the reassessment
  // fix under test. Confirmed via direct computation (diagnoseCashflowSnapshot)
  // before writing these tests, not assumed.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    cashInHand: 50000,
    dailyCollections: 2000,
    receivables: 40000,
    receivablesOverdue: 30000,
    payables: 15000,
    salaryDue: 10000,
    rentDue: 8000,
    upcomingEmi: 3000,
    ownerWithdrawal: 10000,
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

    await teardownOwnerBusiness(businessId);
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

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, distressedButActionableSnapshot(), actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateCashflowAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateCashflowAction(action.id, { status: "in_progress" }, actor, workspaceId);

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

    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects recording an outcome for an action whose work has not started (BIV-09)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await expect(
      recordCashflowVerification(action.id, { beforeValue: 1, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
    ).rejects.toThrow(/Start this action before recording its outcome/);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] records baseline provenance: blank before uses the measured value; a different owner value is kept as OWNER_REPORTED (BIV-10)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, distressedButActionableSnapshot(), actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await updateCashflowAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateCashflowAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const row = await db.ownerCashflowAction.findFirst({ where: { id: action.id }, include: { finding: true } });
    const measured =
      row?.finding && row.finding.sourceMetric === row.verificationMetric && row.finding.sourceValue !== null
        ? row.finding.sourceValue
        : null;
    if (measured === null) {
      await expect(
        recordCashflowVerification(action.id, { beforeValue: null, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
      ).rejects.toThrow(/before \(baseline\) value/);
    } else {
      const measuredRun = await recordCashflowVerification(action.id, { beforeValue: null, afterValue: measured, targetDirection: "up" }, actor, workspaceId);
      expect(measuredRun.verification.beforeValue).toBe(measured);
      expect(measuredRun.verification.baselineSource).toBe("MEASURED");
    }
    const reported = (measured ?? 0) + 50;
    const ownerRun = await recordCashflowVerification(action.id, { beforeValue: reported, afterValue: 1, targetDirection: "up" }, actor, workspaceId);
    expect(ownerRun.verification.beforeValue).toBe(reported);
    expect(ownerRun.verification.baselineSource).toBe("OWNER_REPORTED");
    expect(ownerRun.verification.measuredBeforeValue).toBe(measured);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects a duplicate snapshot for the same business + period", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);
    await expect(
      createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, crisisSnapshot(), actor, workspaceId);

    await expect(getCashflowSnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });

  // ---------------------------------------------------------------------
  // GAP-CASHFLOW-01: found during the full-domain-acceptance investigation
  // -- unlike finance/sales/operations/sop/strategy/marketing, cashflow's
  // action.service.ts/verification.service.ts never triggered re-diagnosis
  // on action completion or verified success. Cashflow was the only
  // remaining domain missing this mechanism entirely (confirmed against
  // audit-events.ts: OWNER_CASHFLOW_ACTION_COMPLETED and
  // OWNER_CASHFLOW_REASSESSMENT_TRIGGERED did not exist before this fix,
  // while every sibling domain already had the full set). Same class of
  // gap as Marketing (PR #339); Cashflow's own model/snapshot semantics
  // (OwnerCashflowSnapshot/OwnerCashflowCycle, "down"-direction targets)
  // were verified directly from source before writing this fix, not
  // assumed from Marketing's code.
  // ---------------------------------------------------------------------
  it("[db] completing an action triggers re-diagnosis, creating a new latest cycle", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, distressedButActionableSnapshot(), actor, workspaceId);
    const cycle1 = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle1.actions[0];
    expect(action.status).toBe("proposed");

    await updateCashflowAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateCashflowAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const completed = await updateCashflowAction(
      action.id,
      { status: "completed", completionNotes: "hostile-test completion", completionEvidence: ["ref"] },
      actor,
      workspaceId
    );
    expect(completed.status).toBe("completed");

    // The original action's own row is permanently "completed".
    const reread = await db.ownerCashflowAction.findUnique({ where: { id: action.id } });
    expect(reread?.status).toBe("completed");
    expect(reread?.completedAt).not.toBeNull();

    // A NEW cycle was created automatically by the newly-added re-diagnosis
    // trigger -- this is the mechanism that was missing before this fix.
    const allCycles = await db.ownerCashflowCycle.findMany({
      where: { businessId, workspaceId },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(allCycles.length).toBe(2);
    expect(allCycles[0].id).toBe(cycle1.id);
    expect(allCycles[1].sequenceNumber).toBe(cycle1.sequenceNumber + 1);

    const dash = await getCashflowDashboard(workspaceId, businessId);
    expect(dash.latestCycle?.id).toBe(allCycles[1].id);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] a verified-improved outcome triggers re-diagnosis, creating a new latest cycle", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createCashflowSnapshot(businessId, distressedButActionableSnapshot(), actor, workspaceId);
    const cycle1 = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle1.actions[0];

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateCashflowAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateCashflowAction(action.id, { status: "in_progress" }, actor, workspaceId);

    const { result } = await recordCashflowVerification(
      action.id,
      { beforeValue: 45, afterValue: 20, targetDirection: "down", targetValue: 25 },
      actor,
      workspaceId
    );
    expect(result.reachedTarget).toBe(true);

    const allCycles = await db.ownerCashflowCycle.findMany({
      where: { businessId, workspaceId },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(allCycles.length).toBe(2);
    expect(allCycles[1].sequenceNumber).toBe(cycle1.sequenceNumber + 1);

    await teardownOwnerBusiness(businessId);
  });
});

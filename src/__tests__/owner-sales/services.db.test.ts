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

  // Controlled-beta business-context-integrity closure (server fallback safety, section 6): with
  // TWO real businesses in the workspace and no explicit businessId, getSalesDashboard() must fail
  // closed (selectedBusinessId: null) rather than silently guessing businesses[0] -- the exact
  // server-side mechanism that let Sales/Trust/Execution pages render the wrong business's
  // intelligence when their frontend omitted businessId (now separately fixed) and, defense in
  // depth, whenever ANY caller omits it. Mirrors the same exactly-one-business rule already used by
  // hasExactlyOneRealBusiness() and cockpit-finance-priority.service.ts.
  it("[db] with 2 real businesses and no requestedBusinessId, fails closed (selectedBusinessId null) rather than picking businesses[0]", async () => {
    const workspaceId = ws();
    const businessA = await newBusiness(workspaceId);
    const businessB = await newBusiness(workspaceId);

    const dash = await getSalesDashboard(workspaceId);
    expect(dash.selectedBusinessId).toBeNull();
    expect(dash.hasData).toBe(false);
    expect(dash.businesses.map((b: { id: string }) => b.id).sort()).toEqual([businessA, businessB].sort());

    await teardownOwnerBusiness(businessA);
    await teardownOwnerBusiness(businessB);
  });

  it("[db] with exactly 1 real business and no requestedBusinessId, still auto-selects it (unambiguous — no regression)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const dash = await getSalesDashboard(workspaceId);
    expect(dash.selectedBusinessId).toBe(businessId);

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

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateSalesAction(action.id, { status: "in_progress" }, actor, workspaceId);

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

  it("[db] rejects recording an outcome for an action whose work has not started (BIV-09)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await expect(
      recordSalesVerification(action.id, { beforeValue: 1, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
    ).rejects.toThrow(/Start this action before recording its outcome/);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] records baseline provenance: blank before uses the measured value; a different owner value is kept as OWNER_REPORTED (BIV-10)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateSalesAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const row = await db.ownerSalesAction.findFirst({ where: { id: action.id }, include: { finding: true } });
    const measured =
      row?.finding && row.finding.sourceMetric === row.verificationMetric && row.finding.sourceValue !== null
        ? row.finding.sourceValue
        : null;
    if (measured === null) {
      await expect(
        recordSalesVerification(action.id, { beforeValue: null, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
      ).rejects.toThrow(/before \(baseline\) value/);
    } else {
      const measuredRun = await recordSalesVerification(action.id, { beforeValue: null, afterValue: measured, targetDirection: "up" }, actor, workspaceId);
      expect(measuredRun.verification.beforeValue).toBe(measured);
      expect(measuredRun.verification.baselineSource).toBe("MEASURED");
    }
    const reported = (measured ?? 0) + 50;
    const ownerRun = await recordSalesVerification(action.id, { beforeValue: reported, afterValue: 1, targetDirection: "up" }, actor, workspaceId);
    expect(ownerRun.verification.beforeValue).toBe(reported);
    expect(ownerRun.verification.baselineSource).toBe("OWNER_REPORTED");
    expect(ownerRun.verification.measuredBeforeValue).toBe(measured);
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

  // ---------------------------------------------------------------------
  // Full-domain-acceptance expansion, proactive proof: owner-sales'
  // action.service.ts mirrors owner-finance/action.service.ts's "On action
  // completion ... trigger re-diagnosis from latest snapshot" mechanism
  // (confirmed by source investigation before writing
  // tests/production/21-sales-acceptance.spec.ts). Completing an action
  // deterministically creates a NEW OwnerSalesCycle whose fresh "proposed"
  // actions become the dashboard's latestCycle -- a live-production
  // acceptance test that re-reads the dashboard/action-list after
  // completing an action would observe a DIFFERENT (new) action, not a
  // reversion of the original one, exactly as workflow run #32568877293
  // ("run #6") found for the equivalent Finance mechanism. Proven here end
  // to end against real Postgres BEFORE writing the acceptance test (which
  // verifies Complete/Verify by exact action id from the start, rather
  // than repeating that forensic investigation for a second domain).
  // ---------------------------------------------------------------------
  it("[db] completing an action stays completed on its own row even though a new latest cycle is created", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle1 = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle1.actions[0];
    expect(action.status).toBe("proposed");

    await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateSalesAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const completed = await updateSalesAction(
      action.id,
      { status: "completed", completionNotes: "hostile-test completion", completionEvidence: ["ref"] },
      actor,
      workspaceId
    );
    expect(completed.status).toBe("completed");

    // The original action's OWN row is permanently "completed" -- fetching
    // it directly (the same call the acceptance test uses) never shows a
    // reversion, regardless of what the dashboard now shows.
    const reread = await db.ownerSalesAction.findUnique({ where: { id: action.id } });
    expect(reread?.status).toBe("completed");
    expect(reread?.completedAt).not.toBeNull();

    // A NEW cycle was created automatically -- the deterministic mechanism
    // behind the apparent "reversion to proposed."
    const allCycles = await db.ownerSalesCycle.findMany({
      where: { businessId, workspaceId },
      orderBy: { sequenceNumber: "asc" },
      include: { actions: true },
    });
    expect(allCycles.length).toBe(2);
    expect(allCycles[0].id).toBe(cycle1.id);
    const cycle2 = allCycles[1];
    expect(cycle2.sequenceNumber).toBe(cycle1.sequenceNumber + 1);
    expect(cycle2.actions.length).toBeGreaterThan(0);
    for (const a of cycle2.actions) expect(a.status).toBe("proposed");
    const regenerated = cycle2.actions.find((a) => a.title === action.title);
    expect(regenerated, "re-diagnosis on unchanged data regenerates the same finding/action").toBeTruthy();
    expect(regenerated!.id).not.toBe(action.id); // a DIFFERENT row, not the same one reset

    // The dashboard now shows cycle #2 as "latest" -- confirming the exact
    // mechanism a UI/Playwright test would observe after completing.
    const dash = await getSalesDashboard(workspaceId, businessId);
    expect(dash.latestCycle?.id).toBe(cycle2.id);
    expect(dash.latestCycle?.actions[0]?.status).toBe("proposed");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] re-diagnosis carries an engaged action forward (re-prioritised) instead of duplicating it; untouched proposals are regenerated (BIV-12)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle1 = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const inFlight = cycle1.actions[0];
    await updateSalesAction(inFlight.id, { status: "assigned" }, actor, workspaceId);
    await updateSalesAction(inFlight.id, { status: "in_progress" }, actor, workspaceId);
    // Simulate a stale ranking so re-evaluation is observable.
    await db.ownerSalesAction.update({ where: { id: inFlight.id }, data: { priorityScore: 1 } });

    const cycle2 = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const sameIntent = (a: { findingCode: string; recommendationCode: string }) =>
      a.findingCode === inFlight.findingCode && a.recommendationCode === inFlight.recommendationCode;
    // The engaged action is re-attached to cycle 2 (no duplicate); untouched proposals are regenerated.
    const cycle2Rows = await db.ownerSalesAction.findMany({ where: { cycleId: cycle2.id } });
    expect(cycle2Rows.filter(sameIntent)).toHaveLength(1);
    expect(cycle2Rows.find(sameIntent)!.id).toBe(inFlight.id);
    expect(cycle2Rows).toHaveLength(cycle1.actions.length);
    // The carried action's priority was re-evaluated against the new diagnosis.
    const reevaluated = await db.ownerSalesAction.findFirst({ where: { id: inFlight.id } });
    expect(reevaluated!.priorityScore).toBe(inFlight.priorityScore);
    expect(reevaluated!.status).toBe("in_progress");
    // The original finding (baseline measured before the work started) is kept, so the
    // measured baseline does not drift with later diagnoses.
    expect(reevaluated!.findingId).toBe(inFlight.findingId);

    const dash = await getSalesDashboard(workspaceId, businessId);
    const listed = dash.latestCycle!.actions.find((a: { id: string }) => a.id === inFlight.id) as
      | { status: string; cycleId: string; carriedFromCycleSequence?: number }
      | undefined;
    expect(listed?.status).toBe("in_progress");
    expect(listed?.cycleId).toBe(cycle2.id);
    expect(listed?.carriedFromCycleSequence).toBeUndefined();
    // Untouched cycle-1 proposals are superseded by cycle 2's, not listed twice.
    expect(dash.latestCycle!.actions).toHaveLength(cycle1.actions.length);
    expect(dash.recommendedNextAction).not.toBeNull();
    // Every surface reading the latest cycle agrees: Home sees the in-flight action too.
    const { getOwnerHome } = await import("@/services/owner-home/home.service");
    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.summary!.requiredActions.some((a) => a.status === "in_progress" && a.findingCode === inFlight.findingCode)).toBe(true);
    // The re-attachment is audited.
    const audit = await db.auditEvent.findFirst({ where: { entityId: inFlight.id, eventName: "owner.sales_action_updated", workspaceId }, orderBy: { occurredAt: "desc" } });
    expect((audit!.payload as { reason?: string }).reason).toBe("carried_forward_by_diagnosis");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] an engaged action whose finding the latest diagnosis no longer raises stays visible but is flagged not current (BIV-12)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, distressSnapshot(), actor, workspaceId);
    const cycle1 = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    const discount = cycle1.actions.find((a: { findingCode: string }) => a.findingCode.includes("DISCOUNT"));
    expect(discount).toBeTruthy();
    await updateSalesAction(discount!.id, { status: "assigned" }, actor, workspaceId);

    // Next period: no discounting at all, so no discount finding is raised.
    const healthier = { ...distressSnapshot(), periodStart: "2026-06-01", periodEnd: "2026-06-30", discountAmount: 0 };
    const snap2 = await createSalesSnapshot(businessId, healthier, actor, workspaceId);
    const cycle2 = await runSalesDiagnosis(businessId, snap2.id, actor, workspaceId);
    expect(cycle2.findings.some((f: { code: string }) => f.code === discount!.findingCode)).toBe(false);

    const dash = await getSalesDashboard(workspaceId, businessId);
    const listed = dash.latestCycle!.actions.find((a: { id: string }) => a.id === discount!.id) as
      | { status: string; stillFlaggedByLatestDiagnosis?: boolean }
      | undefined;
    expect(listed?.status).toBe("assigned");
    expect(listed?.stillFlaggedByLatestDiagnosis).toBe(false);

    const { getOwnerHome } = await import("@/services/owner-home/home.service");
    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.summary!.requiredActions.some((a) => a.title === discount!.title && a.findingCode === discount!.findingCode)).toBe(false);

    await teardownOwnerBusiness(businessId);
  });
});


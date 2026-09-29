/**
 * R10 P1-1 — before-fix proof for the Finance dashboard's diagnosis-target resolver
 * (getFinanceDashboard: diagnosisTargetSnapshot / diagnosisTargetReason / latestSnapshotDiagnosis
 * .dependenciesChanged in src/services/owner-finance/dashboard.service.ts).
 *
 * `[db]`-gated — TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r10-p1-1-finance-diagnosis-target.db.test.ts
 *
 * The bug this proves fixed: the pre-fix priority was
 *   diagnosisTargetSnapshot = inProgressSnapshot ?? latestSnapshot ?? null
 * (in-progress/provisional evidence outranking a completed, current effective snapshot — and an
 * amended replacement snapshot never being offered for diagnosis at all). The fix flips the
 * priority to `latestSnapshot ?? inProgressSnapshot ?? null` and adds real dependency tracking
 * (ownerCashflowSnapshot bank-balance enrichment, confirmed cash_debt intake) so a stale-but-
 * already-diagnosed snapshot is flagged for re-run without claiming the snapshot itself is new
 * data.
 *
 * This same file is copied onto a worktree at 14c36b12167320359de6a837bdf8a4b56bfd2310 and run
 * there to confirm cases 1 and 2 genuinely FAIL on that SHA (the old priority order), and PASS on
 * the current tree.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `p1-1-test-${actor}@example.com`, name: "P1-1 Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "P1-1 Diagnosis Target Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function completedSnapshotInput(periodEnd: Date, periodStart: Date) {
  return {
    periodStart: iso(periodStart), periodEnd: iso(periodEnd), currency: "INR",
    revenue: 200000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 5000, cashOnHand: 60000,
  };
}

describe("[db] R10 P1-1: getFinanceDashboard diagnosis-target resolver — 5-case matrix", () => {
  it("[db] Case 1: completed effective snapshot + newer in-progress → completed wins (never demoted to provisional)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const completed = await createFinancialSnapshot(
      businessId, completedSnapshotInput(new Date(Date.now() - 10 * DAY), new Date(Date.now() - 40 * DAY)), actor, workspaceId
    );
    await createFinancialSnapshot(
      businessId,
      { ...completedSnapshotInput(new Date(Date.now() + 20 * DAY), new Date(Date.now() - 5 * DAY)) },
      actor, workspaceId
    ); // in-progress: periodEnd in the future

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(completed.id);
    expect(dash.diagnosisTargetReason).toBe("completed");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case 2: amended completed snapshot awaiting its own diagnosis + provisional evidence → the amended replacement wins", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    // The original is missing cashOnHand (a real data-confidence gap); the amendment SUPPLIES it — a
    // genuinely different missing-data profile between the two, so the assertion below actually
    // distinguishes "reads the amended replacement" from "reads the stale, last-diagnosed original"
    // (a bug reading the wrong snapshot would otherwise pass vacuously if both had the same gaps).
    const fullInput = completedSnapshotInput(new Date(Date.now() - 10 * DAY), new Date(Date.now() - 40 * DAY));
    const withoutCashOnHand = { ...fullInput, cashOnHand: undefined };
    const original = await createFinancialSnapshot(businessId, withoutCashOnHand, actor, workspaceId);
    expect(original.missingCriticalData).toContain("cashOnHand");
    await runFinanceDiagnosis(businessId, original.id, actor, workspaceId);
    const { snapshot: amended } = await amendFinancialSnapshot(original.id, { revenue: 250000, cashOnHand: 60000 }, actor, workspaceId);
    expect((amended as { missingCriticalData?: string[] })?.missingCriticalData ?? []).not.toContain("cashOnHand");
    await createFinancialSnapshot(
      businessId, completedSnapshotInput(new Date(Date.now() + 20 * DAY), new Date(Date.now() - 5 * DAY)), actor, workspaceId
    ); // provisional, present alongside the amendment

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(amended!.id);
    expect(dash.diagnosisTargetReason).toBe("amended");
    // The amended replacement has never itself been diagnosed:
    expect(dash.latestSnapshotDiagnosis).toBeNull();
    // Hostile-review fix: missingCriticalData must reflect the AMENDED replacement (the actual
    // diagnosis target) — never the old diagnosis's superseded snapshot (latestCycle.snapshot), which
    // is STILL missing cashOnHand.
    expect(original.missingCriticalData).not.toEqual((amended as { missingCriticalData?: string[] })?.missingCriticalData ?? []);
    expect(dash.missingCriticalData).toEqual((amended as { missingCriticalData?: string[] })?.missingCriticalData ?? []);
    expect(dash.missingCriticalData).not.toContain("cashOnHand");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case 3a: a dependency (Cashflow bank-balance enrichment) newer than the last diagnosis flags a re-run, without claiming new snapshot data", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const periodEnd = new Date(Date.now() - 10 * DAY);
    const snap = await createFinancialSnapshot(businessId, completedSnapshotInput(periodEnd, new Date(Date.now() - 40 * DAY)), actor, workspaceId);
    await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    // A cashflow enrichment for a period ending AT-OR-BEFORE the finance snapshot's periodEnd (the
    // dependency check's own `lte: snapshotEnd` filter) and within its 45-day freshness window,
    // created AFTER the diagnosis ran:
    await createCashflowSnapshot(
      businessId,
      { periodStart: iso(new Date(Date.now() - 42 * DAY)), periodEnd: iso(new Date(Date.now() - 12 * DAY)), currency: "INR", cashInHand: 30000 },
      actor, workspaceId
    );

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(snap.id);
    expect(dash.diagnosisTargetReason).toBe("completed"); // the snapshot itself is not new
    expect(dash.latestSnapshotDiagnosis?.current).toBe(true); // still the current diagnosis of this snapshot
    expect(dash.latestSnapshotDiagnosis?.dependenciesChanged).toBe(true); // but a dependency moved — re-run recommended

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case 3b: a confirmed cash_debt intake newer than the last diagnosis also flags a re-run (debt fields left blank on the snapshot)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const periodEnd = new Date(Date.now() - 10 * DAY);
    // totalDebtOutstanding/debtPayments are left unset (undefined) on this fixture, so they persist
    // null — the exact condition that makes the cash_debt intake dependency check eligible.
    const snap = await createFinancialSnapshot(businessId, completedSnapshotInput(periodEnd, new Date(Date.now() - 40 * DAY)), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    await db.ownerDataIntake.create({
      data: {
        id: randomUUID(), workspaceId, businessId, source: "manual", targetDomain: "cash_debt",
        rowCount: 1, validationStatus: "valid", normalizationStatus: "normalized",
        mappedFields: {}, unmappedColumns: [], records: [], errorReport: [],
        ownerConfirmed: true, confirmedAt: new Date(cycle.createdAt.getTime() + 60_000), confirmedBy: actor,
      },
    });

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.latestSnapshotDiagnosis?.dependenciesChanged).toBe(true);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case 4: provisional-only evidence (no completed snapshot at all) → provisional target with an honest reason", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const inProgress = await createFinancialSnapshot(
      businessId, completedSnapshotInput(new Date(Date.now() + 15 * DAY), new Date(Date.now() - 5 * DAY)), actor, workspaceId
    );

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(inProgress.id);
    expect(dash.diagnosisTargetReason).toBe("provisional");
    expect(dash.hasData).toBe(false); // no completed evidence yet

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case 5: already diagnosed, nothing dependency-relevant changed → no re-run signal, but explicit re-run remains possible", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(
      businessId, completedSnapshotInput(new Date(Date.now() - 10 * DAY), new Date(Date.now() - 40 * DAY)), actor, workspaceId
    );
    await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(snap.id);
    expect(dash.diagnosisTargetReason).toBe("completed");
    expect(dash.latestSnapshotDiagnosis?.current).toBe(true);
    expect(dash.latestSnapshotDiagnosis?.dependenciesChanged).toBe(false); // never falsely claims new data
    // (The page itself always offers a re-run regardless of `current` — see the P2-5 fix in the
    // domain pages; this service-level assertion only proves no re-run is falsely SIGNALLED here.)

    await teardownOwnerBusiness(businessId);
  });
});

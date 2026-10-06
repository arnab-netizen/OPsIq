/**
 * F1 investigation — Finance snapshot → diagnosis path at a frozen `now` of 2026-10-06.
 *
 * `[db]`-gated: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/f1-snapshot-diagnosis-target.db.test.ts
 * Characterization of CURRENT behaviour only (no production code is changed by this file). Mirrors the
 * production smoke on "Acceptance Check 561" and adds the fresh-owner controls.
 *
 * The page's diagnosis button posts `dashboard.diagnosisTargetSnapshot.id` (finance/page.tsx runDiagnosis);
 * the route hands that id to runFinanceDiagnosis. The first-read path (QuickFinancialPicture →
 * runQuickStart) posts the id of the snapshot it just created. Both are exercised here.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { runQuickStart, type QuickStartApi } from "@/lib/owner-quick-start";
import { ConflictError } from "@/infra/errors";

const actor = randomUUID();
const NOW = new Date("2026-10-06T10:00:00.000Z");

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `f1-test-${actor}@example.com`, name: "F1 Test", isActive: true, updatedAt: new Date() },
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "F1 Target Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

const SEP = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR", revenue: 120000, fixedCosts: 70000, variableCosts: 30000, cashOnHand: 40000 };
const AUG = { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "INR", revenue: 90000, fixedCosts: 60000, variableCosts: 20000, cashOnHand: 25000 };
const OCT = { periodStart: "2026-10-01", periodEnd: "2026-10-31", currency: "INR", revenue: 20000, fixedCosts: 8000, cashOnHand: 5000, receivables: 0 };

describe("[db] F1: Finance snapshot → diagnosis target at frozen now 2026-10-06", () => {
  it("[db] Case A: completed Sep (diagnosed) + new provisional Oct → Sep stays target; Oct is surfaced only as inProgressSnapshot", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    const sep = await createFinancialSnapshot(businessId, SEP, actor, workspaceId);
    const cycle1 = await runFinanceDiagnosis(businessId, sep.id, actor, workspaceId);
    expect(cycle1.snapshotId).toBe(sep.id);

    const oct = await createFinancialSnapshot(businessId, OCT, actor, workspaceId);

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.latestSnapshot?.id).toBe(sep.id);
    expect(dash.inProgressSnapshot?.id).toBe(oct.id);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(sep.id);
    expect(dash.diagnosisTargetReason).toBe("completed");
    // The period state the page's notice reads describes the TARGET (Sep → completed), so the
    // in-progress notice does not render while the owner has just saved October.
    expect(dash.latestSnapshotPeriodState).toBe("completed");

    // The page's button posts diagnosisTargetSnapshot.id → the new cycle is on September.
    const cycle2 = await runFinanceDiagnosis(businessId, dash.diagnosisTargetSnapshot.id, actor, workspaceId);
    expect(cycle2.snapshotId).toBe(sep.id);
    expect(cycle2.sequenceNumber).toBe(2);
    expect(await db.ownerFinanceCycle.count({ where: { businessId, snapshotId: oct.id } })).toBe(0);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case B: Sep completed, then Aug inserted later → Sep remains current effective evidence (period beats insertion time)", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    const sep = await createFinancialSnapshot(businessId, SEP, actor, workspaceId);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000)); // Aug is inserted strictly later
    const aug = await createFinancialSnapshot(businessId, AUG, actor, workspaceId);
    expect(aug.createdAt.getTime()).toBeGreaterThan(sep.createdAt.getTime());

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.latestSnapshot?.id).toBe(sep.id);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(sep.id);
    expect(dash.diagnosisTargetReason).toBe("completed");
    expect(dash.inProgressSnapshot).toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case C: fresh business + only current-period Oct (production first-read path) → Oct is the provisional target, diagnosed, persisted, honestly labelled", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId } })).toBe(0);
    expect(await db.ownerFinanceCycle.count({ where: { businessId } })).toBe(0);

    // Production-equivalent first-read path: QuickFinancialPicture → runQuickStart → snapshots POST then diagnoses POST,
    // each route being a thin wrapper over these same services.
    const api: QuickStartApi = async (path, init) => {
      const body = JSON.parse(init.body);
      if (path.endsWith("/snapshots")) return createFinancialSnapshot(businessId, body, actor, workspaceId);
      return runFinanceDiagnosis(businessId, body.snapshotId, actor, workspaceId);
    };
    const result = await runQuickStart({ api, businessId, payload: { ...OCT } as never });
    expect(result.status).toBe("diagnosed");

    const oct = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { businessId } });
    const cycle = await db.ownerFinanceCycle.findFirstOrThrow({ where: { businessId } });
    expect(cycle.snapshotId).toBe(oct.id);
    expect(result.status === "diagnosed" && result.snapshotId).toBe(oct.id);

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.latestSnapshot).toBeNull();
    expect(dash.inProgressSnapshot?.id).toBe(oct.id);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(oct.id);
    expect(dash.diagnosisTargetReason).toBe("provisional");
    expect(dash.latestSnapshotPeriodState).toBe("provisional");
    expect(dash.latestSnapshotDiagnosis?.current).toBe(true);
    // A provisional-only cycle is never "the current cycle": the page renders the provisional empty state
    // (DiagnosisEmptyState inProgressDiagnosis + InProgressPeriodNotice), not a completed reading.
    expect(dash.hasData).toBe(false);
    expect(dash.latestCycle).toBeNull();

    // Dashboard-driven diagnosis (the "Diagnose current period (provisional)" button) also uses Oct.
    const again = await runFinanceDiagnosis(businessId, dash.diagnosisTargetSnapshot.id, actor, workspaceId);
    expect(again.snapshotId).toBe(oct.id);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case D: fresh business + one completed Sep → first diagnosis uses exactly that snapshot", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    const sep = await createFinancialSnapshot(businessId, SEP, actor, workspaceId);
    const dash0 = await getFinanceDashboard(workspaceId, businessId);
    expect(dash0.diagnosisTargetSnapshot?.id).toBe(sep.id);
    expect(dash0.diagnosisTargetReason).toBe("completed");

    const cycle = await runFinanceDiagnosis(businessId, dash0.diagnosisTargetSnapshot.id, actor, workspaceId);
    expect(cycle.snapshotId).toBe(sep.id);

    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.latestCycle?.snapshotId).toBe(sep.id);
    expect(dash.latestSnapshotPeriodState).toBe("completed");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Case E: same-period duplicate → ConflictError (409) from the service; no second row", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await createFinancialSnapshot(businessId, AUG, actor, workspaceId);
    await expect(createFinancialSnapshot(businessId, AUG, actor, workspaceId)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId } })).toBe(1);

    await teardownOwnerBusiness(businessId);
  });
});

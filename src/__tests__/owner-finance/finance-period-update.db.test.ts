/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * N1 — a saved period with revenue UNKNOWN can be completed later, through the governed amendment (`[db]`-gated).
 *
 * ROOT CAUSE (trace, not a missing backend): the amendment route, schema and service already existed and are append-only
 * (the old row is kept and stamped superseded; the new row is the current-effective version). The owner could not reach them:
 * Money's only form is "add a period", a duplicate POST answered a generic 409 that the form flattened into "couldn't save",
 * and no screen listed a saved period with an update action. These tests prove the SERVICE contract the new UI relies on,
 * end to end: create → duplicate conflict (with the existing id) → amend → history kept → corrected version is current →
 * diagnosis, Home evidence and Goals all read the corrected version → stale / cross-tenant amendments are refused.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/finance-period-update.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { amendFinancialSnapshot, createFinancialSnapshot, listFinancialSnapshots } from "@/services/owner-finance/snapshot.service";
import { FinanceConflictError } from "@/services/owner-finance/finance-conflict";
import { FINANCE_CONFLICT_CODES } from "@/domain/owner-finance/snapshot-conflict";
import { currentEffectiveFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { listFinanceCycleFindings, runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { loadOwnerSpineEvidence } from "@/services/owner-home/owner-candidate-builder";
import { computeGoalTrajectoryView, createGoal } from "@/services/owner-strategy/goal.service";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { getOwnerOnboardingState } from "@/services/owner-mode/owner-onboarding.service";
import { firstReadStatement } from "@/domain/owner-finance/first-read-statement";
import { financialSnapshotAmendSchema, financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";

const actor = randomUUID();
const workspaces: string[] = [];
const businesses: string[] = [];
const SEPT = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };
const future = (days: number) => new Date(Date.now() + days * 86_400_000);

async function biz(currency = "INR") {
  const workspaceId = randomUUID();
  workspaces.push(workspaceId);
  const b = await createBusiness({ name: "Period Update", businessType: "generic_local_service", currency, b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  businesses.push(b.id as string);
  return { workspaceId, businessId: b.id as string };
}

const create = (t: { workspaceId: string; businessId: string }, body: Record<string, unknown>) =>
  createFinancialSnapshot(t.businessId, financialSnapshotCreateSchema.parse({ currency: "INR", ...SEPT, evidenceQuality: "ACTUAL", ...body }), actor, t.workspaceId);
const amend = (t: { workspaceId: string }, id: string, body: Record<string, unknown>) =>
  amendFinancialSnapshot(id, financialSnapshotAmendSchema.parse({ amendmentReason: "Owner completed figures that were not known when the period was first saved", ...body }), actor, t.workspaceId);
const rowOf = (id: string) => db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] N1 — complete a saved period later through the governed amendment", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `n1-${actor}@example.com`, name: "N1", isActive: true, updatedAt: new Date() } });
  });
  afterAll(async () => {
    await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaces } } });
    for (const id of businesses) await teardownOwnerBusiness(id).catch(() => undefined);
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
  });

  it("1-4: revenue UNKNOWN is saved; the same period is then completed by an amendment (no duplicate-period conflict on the amend path)", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000 });
    expect(v1.revenue).toBeNull(); // UNKNOWN, not 0

    const { snapshot: v2, previousSnapshotId } = await amend(t, v1.id, { revenue: 80_000 });
    expect(previousSnapshotId).toBe(v1.id);
    expect(v2!.revenue).toBe(80_000);
    expect(v2!.version).toBe(2);
    expect(v2!.fixedCosts).toBe(40_000); // unrelated figure survives
    expect(v2!.variableCosts).toBe(30_000);
    expect(v2!.cashOnHand).toBe(20_000);
    expect(v2!.amendmentReason).toMatch(/completed figures/);
  });

  it("5: a duplicate create is refused with a machine code and the EXISTING snapshot's id (what lets the owner be offered the update)", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 1 });
    const err = await create(t, { fixedCosts: 2, revenue: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(FinanceConflictError);
    expect(err).toBeInstanceOf(ConflictError); // existing 409 contract preserved
    expect((err as FinanceConflictError).responseBody).toMatchObject({ code: FINANCE_CONFLICT_CODES.PERIOD_EXISTS, snapshotId: v1.id });
    // after the amendment the CURRENT version's id is reported, not the superseded one
    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 9 });
    const err2 = await create(t, { fixedCosts: 3 }).catch((e) => e);
    expect((err2 as FinanceConflictError).responseBody).toMatchObject({ snapshotId: v2!.id });
  });

  it("6: the old version is preserved as history, byte-for-byte, and is stamped superseded (the only mutation to it)", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000, notes: "first save" });
    const before = await rowOf(v1.id);
    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 80_000 });
    const after = await rowOf(v1.id);
    expect(after.supersededById).toBe(v2!.id);
    const stable = (r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "supersededById" && k !== "updatedAt"));
    const restBefore = stable(before);
    const restAfter = stable(after);
    expect(restAfter).toEqual(restBefore);
    expect(after.revenue).toBeNull(); // history still shows revenue was UNKNOWN then
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(2);
  });

  it("7: the corrected version is the current-effective evidence — one current snapshot per period, never two", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 40_000 });
    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 80_000 });
    const current = await db.ownerFinancialSnapshot.findMany(currentEffectiveFinancialSnapshotQuery(t, undefined, new Date("2026-10-17T00:00:00Z")));
    expect(current.map((r: any) => r.id)).toEqual([v2!.id]);
    const listed = await listFinancialSnapshots(t.businessId, t.workspaceId);
    expect(listed.map((r: any) => r.id)).toEqual([v2!.id]);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId, supersededById: null } })).toBe(1);
  });

  it("8-9: the dashboard says the figures were corrected, and a diagnosis of the new version reads the corrected figures", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000 });
    await runFinanceDiagnosis(t.businessId, v1.id, actor, t.workspaceId);
    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 100_000 });

    const dash = await getFinanceDashboard(t.workspaceId, t.businessId);
    expect(dash.latestSnapshot?.id).toBe(v2!.id);
    expect(dash.diagnosisTargetSnapshot?.id).toBe(v2!.id);
    expect(dash.diagnosisTargetReason).toBe("amended"); // → "Re-run Finance diagnosis on corrected figures"

    const cycle = await runFinanceDiagnosis(t.businessId, v2!.id, actor, t.workspaceId);
    const cycleRow = await db.ownerFinanceCycle.findFirstOrThrow({ where: { id: (cycle as any).id ?? (cycle as any).cycle?.id } });
    expect(cycleRow.snapshotId).toBe(v2!.id);
    const findings = await listFinanceCycleFindings(cycleRow.id, t.workspaceId);
    expect(findings.length).toBeGreaterThan(0);
    // revenue is no longer a missing critical input of the diagnosed snapshot
    expect(JSON.stringify((await rowOf(v2!.id)).missingCriticalData)).not.toMatch(/revenue/);
    expect(JSON.stringify((await rowOf(v1.id)).missingCriticalData)).toMatch(/revenue/); // history still records why it was incomplete
  });

  it("10 (Home): the owner spine's finance evidence is the corrected snapshot once it is diagnosed", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000 });
    await runFinanceDiagnosis(t.businessId, v1.id, actor, t.workspaceId);
    const now = new Date("2026-10-17T00:00:00Z");
    const beforeAmend = await loadOwnerSpineEvidence(t.workspaceId, t.businessId, now);
    expect(beforeAmend.finance?.snapshot?.id).toBe(v1.id);

    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 100_000 });
    await runFinanceDiagnosis(t.businessId, v2!.id, actor, t.workspaceId);
    const afterAmend = await loadOwnerSpineEvidence(t.workspaceId, t.businessId, now);
    expect(afterAmend.finance?.snapshot?.id).toBe(v2!.id);
    expect(afterAmend.finance?.snapshot?.supersededById ?? null).toBeNull();
  });

  it("10 (Goals): a Net Profit goal counts the corrected period — the UNKNOWN cost half becomes known and the period starts to count", async () => {
    const t = await biz();
    const months = [5, 6, 7];
    const ids: string[] = [];
    for (const m of months) {
      const start = `2026-${String(m + 1).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10);
      const s = await createFinancialSnapshot(t.businessId, financialSnapshotCreateSchema.parse({ currency: "INR", periodStart: start, periodEnd: end, evidenceQuality: "ACTUAL", revenue: 80_000, fixedCosts: 20_000, ...(m === 7 ? {} : { variableCosts: 35_000 }) }), actor, t.workspaceId);
      ids.push(s.id);
    }
    const goalId = await createGoal({ workspaceId: t.workspaceId, actorId: actor, businessId: t.businessId, targetType: "PROFIT", targetAmount: 100_000, targetDate: future(365) });
    const goal = await db.ownerGoal.findUniqueOrThrow({ where: { id: goalId } });
    const view = () => computeGoalTrajectoryView({ ...(goal as object), targetDate: goal.targetDate } as never);

    // the period with an UNKNOWN cost half is saved but is not a usable profit period (never treated as zero cost)…
    expect((await view()).trajectory.confidenceRationale).toMatch(/only 2 period\(s\) with data/);
    await amend(t, ids[2], { variableCosts: 35_000 });
    // …and once the owner supplies it through the amendment, the corrected current version counts — exactly once
    const after = await view();
    expect(after.trajectory.confidenceRationale).not.toMatch(/period\(s\) with data/);
    expect(after.dataWindow?.periods).toBe(3);
    expect(after.trajectory.currentValue).toBe(25_000);
  });

  it("11-14: known → UNKNOWN, UNKNOWN → known, an explicit zero is known, and an unrelated figure survives", async () => {
    const t = await biz();
    const v1 = await create(t, { revenue: 80_000, fixedCosts: 40_000, cashOnHand: 20_000, marketingSpend: 777 });
    const { snapshot: v2 } = await amend(t, v1.id, { cashOnHand: null, variableCosts: 0 });
    expect(v2!.cashOnHand).toBeNull(); // known → UNKNOWN (null, not 0)
    expect(v2!.variableCosts).toBe(0); // UNKNOWN → an explicit, KNOWN zero
    expect(v2!.revenue).toBe(80_000);
    expect(v2!.marketingSpend).toBe(777);
    const { snapshot: v3 } = await amend(t, v2!.id, { cashOnHand: 5_000 }); // UNKNOWN → known again
    expect(v3!.cashOnHand).toBe(5_000);
    expect(v3!.variableCosts).toBe(0);
    expect(v3!.marketingSpend).toBe(777);
    // the audit event records which figures were returned to UNKNOWN
    const event = await db.auditEvent.findFirst({ where: { entityId: v2!.id, actorId: actor }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(event?.payload)).toMatch(/clearedFields/);
    expect(JSON.stringify(event?.payload)).toMatch(/cashOnHand/);
  });

  it("15-18 (D9): leakage components amend independently — isolation, known→UNKNOWN, UNKNOWN→known, explicit zero", async () => {
    const t = await biz();
    const v1 = await create(t, { revenue: 100_000, fixedCosts: 40_000, variableCosts: 30_000, discountAmount: 3_000, refundAmount: 1_000, reworkCost: 2_000, complaintCost: 3_000 });
    expect([v1.refundAmount, v1.reworkCost, v1.complaintCost]).toEqual([1_000, 2_000, 3_000]);

    const { snapshot: v2 } = await amend(t, v1.id, { reworkCost: null }); // known → UNKNOWN, the others untouched
    expect([v2!.refundAmount, v2!.reworkCost, v2!.complaintCost]).toEqual([1_000, null, 3_000]);
    expect(v2!.refundReworkCost).toBe(4_000); // compatibility aggregate = sum of the KNOWN components

    const { snapshot: v3 } = await amend(t, v2!.id, { reworkCost: 500 }); // UNKNOWN → known
    expect([v3!.refundAmount, v3!.reworkCost, v3!.complaintCost]).toEqual([1_000, 500, 3_000]);

    const { snapshot: v4 } = await amend(t, v3!.id, { complaintCost: 0 }); // explicit zero ≠ UNKNOWN
    expect([v4!.refundAmount, v4!.reworkCost, v4!.complaintCost]).toEqual([1_000, 500, 0]);
    expect(v4!.complaintCost).not.toBeNull();

    const { snapshot: v5 } = await amend(t, v4!.id, { revenue: 110_000 }); // an unrelated amendment leaves all three as recorded
    expect([v5!.refundAmount, v5!.reworkCost, v5!.complaintCost]).toEqual([1_000, 500, 0]);
    expect(v5!.leakageCompVersion).toBe(1);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(5); // a full history, nothing overwritten
  });

  it("19: a stale amendment (the version was already replaced) is refused with a machine code, and changes nothing", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 1 });
    const { snapshot: v2 } = await amend(t, v1.id, { revenue: 10 });
    const err = await amend(t, v1.id, { revenue: 999 }).catch((e) => e);
    expect(err).toBeInstanceOf(FinanceConflictError);
    expect((err as FinanceConflictError).responseBody).toMatchObject({ code: FINANCE_CONFLICT_CODES.SUPERSEDED, currentSnapshotId: v2!.id });
    expect((await rowOf(v2!.id)).revenue).toBe(10);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(2);
  });

  it("19: two simultaneous amendments of the same version serialise — exactly one wins, the chain never branches", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 1 });
    const results = await Promise.allSettled([amend(t, v1.id, { revenue: 10 }), amend(t, v1.id, { revenue: 20 })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(FinanceConflictError);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId, supersededById: null } })).toBe(1);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(2);
  });

  it("20: another tenant cannot amend this snapshot — it reads as not found and nothing changes", async () => {
    const a = await biz();
    const b = await biz();
    const v1 = await create(a, { fixedCosts: 1 });
    const err = await amend(b, v1.id, { revenue: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: a.businessId } })).toBe(1);
    expect((await rowOf(v1.id)).supersededById).toBeNull();
    expect((await rowOf(v1.id)).revenue).toBeNull();
  });

  it("an amendment that would introduce a contradiction is refused with field errors (nothing is written)", async () => {
    const t = await biz();
    const v1 = await create(t, { fixedCosts: 1_000, rent: 500 });
    const err = await amend(t, v1.id, { salaryPayroll: 900 }).catch((e) => e);
    expect(err?.details?.fieldErrors?.[0]?.path).toBe("fixedCosts");
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: t.businessId } })).toBe(1);
  });

  it("N2 (service): the first-read answer carries the period of the snapshot it rests on, so My Business can name it — and cash UNKNOWN stays UNKNOWN", async () => {
    const t = await biz();
    await create(t, { revenue: 80_000, fixedCosts: 40_000 }); // September 2026, cash not entered
    const state = await getOwnerOnboardingState({ db: db as never, workspaceId: t.workspaceId, businessId: t.businessId, now: new Date("2026-10-17T00:00:00Z") });
    expect(state.firstRead).toMatchObject({ sufficient: true, revenueKnown: true, costKnown: true, cashKnown: false, basis: "completed" });
    expect(state.firstRead.period?.start.slice(0, 10)).toBe("2026-09-01");
    expect(state.firstRead.period?.end.slice(0, 10)).toBe("2026-09-30");
    const s = firstReadStatement(state.firstRead);
    expect(s.given).toBe("You have given OpsIQ revenue and a cost figure for September 2026.");
    expect(s.notGiven).toMatch(/Cash in hand is not entered/);
  });

  it("N8 (service): costs and cash saved with revenue UNKNOWN are reported as saved-but-incomplete, never as nothing", async () => {
    const t = await biz();
    await create(t, { fixedCosts: 40_000, cashOnHand: 5_000 });
    const state = await getOwnerOnboardingState({ db: db as never, workspaceId: t.workspaceId, businessId: t.businessId, now: new Date("2026-10-17T00:00:00Z") });
    expect(state.canRunFirstDiagnosis).toBe(false);
    expect(state.firstRead).toMatchObject({ sufficient: false, revenueKnown: false, costKnown: true, cashKnown: true, basis: "completed", missing: ["revenue"] });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * "Improve this recommendation" resolved by EXISTING STATE, a read that goes stale when the bank balance it depends on
 * changes, and the head/sufficiency agreement — DB-backed proof (`[db]`, local throwaway Postgres).
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-first-run/improve-target.db.test.ts
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { db } from "@/lib/db";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createCashflowSnapshot, amendCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import {
  createFirstBusiness,
  getFirstMoneyRead,
  getFirstRunContext,
  getNextQuestionView,
  requestImprovement,
} from "@/services/owner-first-run/first-run.service";
import { resolveImproveTarget } from "@/services/owner-first-run/improve-target.service";
import { acceptFirstResultAction, correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
import { firstRunEvidence } from "@/services/owner-first-run/first-run-evidence.reader";
import { loadFirstReadSufficiency } from "@/services/owner-mode/owner-onboarding.service";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import { buildImproveOutcome } from "@/domain/owner-first-run/improve-target";
import { READ_STALE_MESSAGE } from "@/domain/owner-first-run/read-staleness";
import { humanizeMetricKey } from "@/lib/metric-label";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function makeTenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@improve.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Harbour Laundry", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  return { workspaceId, userId };
}
type Tenant = Awaited<ReturnType<typeof makeTenant>>;

/** The previous calendar month (a COMPLETED period) and the one before it. */
function months() {
  const now = new Date();
  const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const lastStart = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth(), 1));
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thisEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return {
    last: { periodStart: iso(lastStart), periodEnd: iso(lastEnd) },
    current: { periodStart: iso(thisStart), periodEnd: iso(thisEnd) },
    next: { periodStart: iso(nextStart), periodEnd: iso(nextEnd) },
    lastEnd,
  };
}
const M = months();

const figures = (over: Record<string, unknown> = {}) => ({ ...M.last, currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, ...over });

async function setUp(t: Tenant, over: Record<string, unknown> = {}) {
  const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
  const snap: any = await createFinancialSnapshot(business.id, figures({ evidenceQuality: "GOOD_ESTIMATE", ...over }) as any, t.userId, t.workspaceId);
  await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
  return { business, snap };
}
const cash = (t: Tenant, businessId: string, over: Record<string, unknown> = {}) =>
  createCashflowSnapshot(businessId, { ...M.last, currency: "GBP", ...over } as any, t.userId, t.workspaceId);
const rerun = (t: Tenant, businessId: string, snapshotId: string) => runFinanceDiagnosis(businessId, snapshotId, t.userId, t.workspaceId);
const stamp = (r: { updatedAt: Date }) => r.updatedAt.toISOString();
async function acceptNow(t: Tenant, businessId: string, key: string) {
  const v = await getFirstMoneyRead(t.workspaceId, businessId);
  return acceptFirstResultAction(t.workspaceId, t.userId, businessId, key, v.cycleId);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("[db] a read goes stale when the bank balance it depends on changes", () => {
  it("[db] after a balance is ADDED for the read's period: stale (with the reason), Accept refused with READ_STALE; after 'Update my read' it is current and acceptable", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    await sleep(20);
    const fresh = await getFirstRunContext(t.workspaceId);
    expect(fresh.diagnosisStale).toBe(false);
    expect(fresh.staleReason).toBeNull();

    await cash(t, business.id, { bankBalance: 3000 });
    const stale = await getFirstRunContext(t.workspaceId);
    expect(stale.diagnosisStale).toBe(true);
    expect(stale.staleReason).toBe("CASH_POSITION_CHANGED");
    expect(stale.currentSnapshotId).toBe(snap.id); // the figures are the same; only the balance moved
    expect((await getFirstMoneyRead(t.workspaceId, business.id)).staleReason).toBe("CASH_POSITION_CHANGED");

    const refused = await acceptNow(t, business.id, "accept-key-0001").catch((e) => e);
    expect(refused).toBeInstanceOf(ConflictError);
    expect((refused as ConflictError).message).toBe(READ_STALE_MESSAGE);
    expect((refused as ConflictError).details).toMatchObject({ code: "READ_STALE" });
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(0);

    await sleep(20);
    await rerun(t, business.id, snap.id);
    const current = await getFirstRunContext(t.workspaceId);
    expect(current.diagnosisStale).toBe(false);
    expect((await getFirstMoneyRead(t.workspaceId, business.id)).staleReason).toBeNull();
    await expect(acceptNow(t, business.id, "accept-key-0002")).resolves.toMatchObject({ replayed: false });
  });

  it("[db] after a recorded balance is EDITED: stale again, Accept refused; after the update it is current", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    const row: any = await cash(t, business.id, { bankBalance: 3000 });
    await sleep(20);
    await rerun(t, business.id, snap.id);
    expect((await getFirstRunContext(t.workspaceId)).diagnosisStale).toBe(false);

    await sleep(20);
    await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 50, confirmReplace: true }, t.userId, t.workspaceId);
    const ctx = await getFirstRunContext(t.workspaceId);
    expect(ctx.staleReason).toBe("CASH_POSITION_CHANGED");
    await expect(acceptNow(t, business.id, "accept-key-0003")).rejects.toMatchObject({ message: READ_STALE_MESSAGE });

    await sleep(20);
    await rerun(t, business.id, snap.id);
    expect((await getFirstRunContext(t.workspaceId)).diagnosisStale).toBe(false);
    await expect(acceptNow(t, business.id, "accept-key-0004")).resolves.toMatchObject({ replayed: false });
  });

  it("[db] a balance the read cannot use (a LATER period) does not stale it", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    await sleep(20);
    await cash(t, business.id, { ...M.next, bankBalance: 777 });
    expect((await getFirstRunContext(t.workspaceId)).diagnosisStale).toBe(false);
    await expect(acceptNow(t, business.id, "accept-key-0005")).resolves.toMatchObject({ replayed: false });
  });

  it("[db] the cycle is stamped with when its evidence started being gathered, so a balance written while it runs still flags it", async () => {
    const t = await makeTenant();
    const { snap } = await setUp(t);
    const cycle: any = await db.ownerFinanceCycle.findFirst({ where: { snapshotId: snap.id }, orderBy: { createdAt: "desc" } });
    // generatedAt is when the evidence started being gathered (never later than the cycle row itself).
    expect(cycle.generatedAt.getTime()).toBeLessThanOrEqual(cycle.createdAt.getTime());
  });

  it("[db] compare-at-write: a balance committed by another connection while Accept waits makes Accept fail READ_STALE, and no decision is recorded", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    await sleep(20);
    const view = await getFirstMoneyRead(t.workspaceId, business.id); // the read on screen (still current)
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    try {
      await other.query("BEGIN");
      await other.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`owner_cash_position:${business.id}`]);
      let settled = false;
      const pending = acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-key-0006", view.cycleId).then(
        () => { settled = true; return "accepted" as const; },
        (e) => { settled = true; return e as unknown; }
      );
      await sleep(500);
      expect(settled, "Accept must wait for the in-flight balance change").toBe(false);
      await other.query(
        `INSERT INTO owner_cashflow_snapshots (id, workspace_id, business_id, period_start, period_end, currency, bank_balance, data_confidence_score, missing_critical_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'GBP', 4000, 50, '[]'::jsonb, now(), now())`,
        [randomUUID(), t.workspaceId, business.id, M.last.periodStart, M.last.periodEnd]
      );
      await other.query("COMMIT");
      const outcome = await pending;
      expect(outcome).toBeInstanceOf(ConflictError);
      expect((outcome as ConflictError).message).toBe(READ_STALE_MESSAGE);
    } finally {
      await other.end();
    }
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(0);
  });
});

describe("[db] the read's head snapshot and first-read sufficiency cannot disagree", () => {
  async function sufficiencyOf(t: Tenant, businessId: string) {
    const deps = { db: db as any, workspaceId: t.workspaceId, businessId, now: new Date() };
    return loadFirstReadSufficiency(deps, await prefetchOwnerDomainRows(deps));
  }
  it("[db] completed period insufficient + in-progress period sufficient: sufficiency rests on the in-progress snapshot, so the read is about THAT snapshot", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const completed: any = await createFinancialSnapshot(business.id, { ...M.last, currency: "GBP", revenue: 9000 } as any, t.userId, t.workspaceId); // no cost, no cash
    const provisional: any = await createFinancialSnapshot(business.id, figures({ ...M.current }) as any, t.userId, t.workspaceId);
    const suff = await sufficiencyOf(t, business.id);
    expect(suff.sufficient).toBe(true);
    expect(suff.basis).toBe("provisional");
    const ev = await firstRunEvidence(t.workspaceId, business.id);
    expect(ev.headSnapshotId).toBe(provisional.id);
    expect(ev.headSnapshotId).not.toBe(completed.id);
    expect((await getFirstRunContext(t.workspaceId)).currentSnapshotId).toBe(provisional.id);
  });
  it("[db] a sufficient completed snapshot stays the head even when an in-progress one exists", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const completed: any = await createFinancialSnapshot(business.id, figures() as any, t.userId, t.workspaceId);
    await createFinancialSnapshot(business.id, figures({ ...M.current }) as any, t.userId, t.workspaceId);
    expect((await sufficiencyOf(t, business.id)).basis).toBe("completed");
    expect((await firstRunEvidence(t.workspaceId, business.id)).headSnapshotId).toBe(completed.id);
  });
  it("[db] nothing sufficient: the head is the completed snapshot the owner can see and fix (unchanged behaviour)", async () => {
    const t = await makeTenant();
    const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    const completed: any = await createFinancialSnapshot(business.id, { ...M.last, currency: "GBP", revenue: 9000 } as any, t.userId, t.workspaceId);
    await createFinancialSnapshot(business.id, { ...M.current, currency: "GBP", revenue: 100 } as any, t.userId, t.workspaceId);
    expect((await sufficiencyOf(t, business.id)).sufficient).toBe(false);
    expect((await firstRunEvidence(t.workspaceId, business.id)).headSnapshotId).toBe(completed.id);
  });
});

describe("[db] Improve resolves by existing state (server-authoritative)", () => {
  it("[db] no balance anywhere → ADD, dated to the read's period, with the return marker", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    expect(target.kind).toBe("ADD");
    expect(target.actionLabel).toBe("Add this");
    expect(target.href).toBe(`/owner/cashflow?periodStart=${M.last.periodStart}&periodEnd=${M.last.periodEnd}&returnTo=first-run`);
  });

  it("[db] a Cashflow entry already exists for the read's period (balance blank) → EDIT_CASHFLOW 'add to the existing entry', never a second add", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const row: any = await cash(t, business.id, { cashInHand: 200 });
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    expect(target).toMatchObject({ kind: "EDIT_CASHFLOW", snapshotId: row.id, updatedAt: stamp(row), hasValue: false, actionLabel: "Add this", href: `/owner/cashflow?edit=${row.id}&returnTo=first-run` });
    expect(target.currentValues).toEqual([{ field: "bankBalance", label: "Bank balance", value: null }, { field: "cashInHand", label: "Cash in hand", value: 200 }]);
    // And the duplicate create the old add form would have attempted is exactly what the machine answer points back to.
    await expect(cash(t, business.id, { bankBalance: 5 })).rejects.toMatchObject({ body: { code: "CASHFLOW_PERIOD_EXISTS", snapshotId: row.id } });
  });

  it("[db] a balance is already used → EDIT_CASHFLOW 'Edit this' with the CURRENT value; an earlier fresh period's row is the one edited", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const earlier = new Date(M.lastEnd.getTime() - 20 * DAY);
    const row: any = await cash(t, business.id, { periodStart: iso(new Date(earlier.getTime() - 25 * DAY)), periodEnd: iso(earlier), bankBalance: 1234 });
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    // cash_debt asks cash → bank → debt: cash in hand and the balance are known, so the debt figures are what is missing.
    expect(target.kind).toBe("EDIT_FINANCE");
    expect(target.currentValues.map((v: any) => v.field)).toEqual(["loanEmiDebtPayments", "totalDebtOutstanding"]);
    expect(target.hasValue).toBe(false);
    expect(row.id).toBeTruthy();
  });

  it("[db] a recorded balance too old for the freshness window cannot count → ADD a new entry for the read's period", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const old = new Date(M.lastEnd.getTime() - 120 * DAY);
    await cash(t, business.id, { periodStart: iso(new Date(old.getTime() - 25 * DAY)), periodEnd: iso(old), bankBalance: 999 });
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    expect(target.kind).toBe("ADD");
  });

  it("[db] finance-backed evidence lives on the read's own Finance entry → EDIT_FINANCE: 'Edit this' with the current value when recorded, 'Add this' when blank", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    const revenue: any = await resolveImproveTarget(t.workspaceId, business.id, "revenue_sales");
    expect(revenue).toMatchObject({ kind: "EDIT_FINANCE", snapshotId: snap.id, hasValue: true, actionLabel: "Edit this", href: "/owner/first-run?correct=revenue_sales", currency: "GBP" });
    expect(revenue.currentValues).toEqual([{ field: "revenue", label: "Revenue", value: 12000 }]);
    const payroll: any = await resolveImproveTarget(t.workspaceId, business.id, "payroll");
    expect(payroll).toMatchObject({ kind: "EDIT_FINANCE", hasValue: false, actionLabel: "Add this" });
    expect(payroll.currentValues).toEqual([{ field: "salaryPayroll", label: "Payroll / staff cost", value: null }]);
    const fixed: any = await resolveImproveTarget(t.workspaceId, business.id, "fixed_costs");
    expect(fixed.currentValues.map((v: any) => [v.field, v.value])).toEqual([["fixedCosts", 7000], ["rent", null], ["utilities", null]]);
    // The target follows the CURRENT head after a correction (the amendment is the new head).
    const corrected = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "x", salaryPayroll: 3000 } as any);
    const after: any = await resolveImproveTarget(t.workspaceId, business.id, "payroll");
    expect(after).toMatchObject({ kind: "EDIT_FINANCE", snapshotId: corrected.newSnapshotId, hasValue: true, actionLabel: "Edit this" });
    expect(after.currentValues[0].value).toBe(3000);
  });

  it("[db] evidence the money read does not use → NOT_USED_BY_READ (saving allowed, said plainly)", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "inventory_stock");
    expect(target).toMatchObject({ kind: "NOT_USED_BY_READ", reason: "CATEGORY_NOT_READ", actionLabel: "Add it anyway" });
    expect(target.explanation).toMatch(/saved, but your first money read doesn't use it/i);
    expect(target.addHref).toMatch(/returnTo=first-run/);
  });

  it("[db] a balance saved for a period the read does NOT use → NOT_USED_BY_READ naming both periods, with the way that does count", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    await requestImprovement(t.workspaceId, t.userId, business.id, "cash_debt");
    await sleep(20);
    await cash(t, business.id, { ...M.next, bankBalance: 900 }); // the owner used the form's default period, not the read's
    const target: any = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    expect(target.kind).toBe("NOT_USED_BY_READ");
    expect(target.reason).toBe("PERIOD_MISMATCH");
    expect(target.explanation).toMatch(/^Saved, but this read doesn't use it, because it covers .+ and your read covers .+\.$/);
    expect(target.next).toMatchObject({ kind: "ADD", href: `/owner/cashflow?periodStart=${M.last.periodStart}&periodEnd=${M.last.periodEnd}&returnTo=first-run` });
  });

  it("[db] requestImprovement returns the same server answer the screen is told to follow; the next-question view carries it", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t);
    const asked = await requestImprovement(t.workspaceId, t.userId, business.id, "payroll");
    expect(asked.target).toEqual(await resolveImproveTarget(t.workspaceId, business.id, "payroll"));
    const q = await getNextQuestionView(t.workspaceId, business.id);
    if (!q.result.done) {
      expect(q.target).toEqual(await resolveImproveTarget(t.workspaceId, business.id, q.result.question.category));
      expect(q.inputActionLabel).toBe(q.target?.actionLabel);
    }
  });

  it("[db] the read's own bank-balance link is the server's answer too: the existing entry when there is one, else a dated add", async () => {
    const t = await makeTenant();
    const { business } = await setUp(t, { evidenceQuality: "ACTUAL" }); // records-quality evidence is what asks for the bank balance
    const before = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(before.read.sharpenBy?.href).toBe(`/owner/cashflow?periodStart=${M.last.periodStart}&periodEnd=${M.last.periodEnd}&returnTo=first-run`);
    const row: any = await cash(t, business.id, { cashInHand: 200 });
    await rerun(t, business.id, (await firstRunEvidence(t.workspaceId, business.id)).headSnapshotId!);
    const after = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(after.read.sharpenBy?.href).toBe(`/owner/cashflow?edit=${row.id}&returnTo=first-run`);
  });

  it("[db] refuses without a read, for an unknown category, and across tenants", async () => {
    const t = await makeTenant();
    const other = await makeTenant();
    const { business: fresh } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "laundry_local_service", currency: "gbp" });
    await expect(resolveImproveTarget(t.workspaceId, fresh.id, "payroll")).rejects.toBeInstanceOf(ValidationError); // no read yet
    const { business } = await setUp(other);
    await expect(resolveImproveTarget(other.workspaceId, business.id, "wizardry")).rejects.toBeInstanceOf(ValidationError);
    await expect(resolveImproveTarget(t.workspaceId, business.id, "payroll")).rejects.toBeInstanceOf(NotFoundError); // someone else's business
  });
});

describe("[db] the Correct flow does not mint versions that change nothing", () => {
  it("[db] restating what is already recorded is refused and writes nothing", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    const before = await db.ownerFinancialSnapshot.count({ where: { businessId: business.id } });
    await expect(
      correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "same", revenue: 12000, evidenceQuality: "GOOD_ESTIMATE" } as any)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.ownerFinancialSnapshot.count({ where: { businessId: business.id } })).toBe(before);
    // A real change still goes through.
    await expect(correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "real", revenue: 12001 } as any)).resolves.toMatchObject({ diagnosisFailed: false });
  });
});

describe("[db] what the owner is told after coming back", () => {
  const tokens = (v: Awaited<ReturnType<typeof getFirstMoneyRead>>) => ({
    noticed: v.read.noticed, recommendedAction: v.read.recommendedAction, confidenceTier: v.read.confidenceTier, evidenceQuality: v.read.evidenceQuality,
    missingEvidence: v.read.missingEvidence, sharpenBy: v.read.sharpenBy?.title ?? null, cautions: v.read.cautions,
  });
  const summaryOf = (tk: ReturnType<typeof tokens>, category: string) => ({ ...tk, questionLabel: "Cash and debt", category, missingEvidence: [...tk.missingEvidence], cautions: [...tk.cautions] });

  it("[db] a balance that DOES change the read: the summary says what changed (and it is the read's own tokens)", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t, { evidenceQuality: "ACTUAL" });
    const before = await getFirstMoneyRead(t.workspaceId, business.id);
    expect(before.read.cautions.join(" ")).toMatch(/cash position isn't fully known/);
    await requestImprovement(t.workspaceId, t.userId, business.id, "cash_debt");
    await sleep(20);
    await cash(t, business.id, { bankBalance: 3000 });
    await sleep(20);
    await rerun(t, business.id, snap.id);
    const after = await getFirstMoneyRead(t.workspaceId, business.id);
    const target = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    const outcome = buildImproveOutcome({ questionLabel: "Cash and debt", before: summaryOf(tokens(before), "cash_debt"), after: tokens(after), target, humanize: humanizeMetricKey });
    expect(outcome.kind).toBe("CHANGED");
    expect(outcome.lines.join("\n")).toMatch(/No longer a caution: .*cash position isn't fully known/);
  });

  it("[db] nothing relevant changed (the owner saved nothing): 'Nothing changed in your read' — never an improvement claim", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    const before = await getFirstMoneyRead(t.workspaceId, business.id);
    await sleep(20);
    await rerun(t, business.id, snap.id);
    const after = await getFirstMoneyRead(t.workspaceId, business.id);
    const target = await resolveImproveTarget(t.workspaceId, business.id, "payroll");
    const outcome = buildImproveOutcome({ questionLabel: "Payroll", before: summaryOf(tokens(before), "payroll"), after: tokens(after), target, humanize: humanizeMetricKey });
    expect(outcome.kind).toBe("UNCHANGED");
    expect(outcome.headline).toBe("Nothing changed in your read");
    expect(outcome.lines.join(" ")).not.toMatch(/improv|latest information/i);
  });

  it("[db] a balance saved for a period the read ignores: the read is unchanged and the summary says it was saved but NOT used, with both periods", async () => {
    const t = await makeTenant();
    const { business, snap } = await setUp(t);
    const before = await getFirstMoneyRead(t.workspaceId, business.id);
    await requestImprovement(t.workspaceId, t.userId, business.id, "cash_debt");
    await sleep(20);
    await cash(t, business.id, { ...M.next, bankBalance: 900 });
    expect((await getFirstRunContext(t.workspaceId)).diagnosisStale).toBe(false); // it cannot affect the read, so the read is not even stale
    await sleep(20);
    await rerun(t, business.id, snap.id);
    const after = await getFirstMoneyRead(t.workspaceId, business.id);
    const target = await resolveImproveTarget(t.workspaceId, business.id, "cash_debt");
    const outcome = buildImproveOutcome({ questionLabel: "Cash and debt", before: summaryOf(tokens(before), "cash_debt"), after: tokens(after), target, humanize: humanizeMetricKey });
    expect(outcome.kind).toBe("NOT_USED");
    expect(outcome.headline).toBe("Saved, but this read doesn't use it");
    expect(outcome.lines.join(" ")).toMatch(/because it covers .+ and your read covers .+/);
  });
});

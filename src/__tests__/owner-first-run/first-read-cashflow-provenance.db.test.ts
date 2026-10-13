/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * The first read says where its bank balance came from when the runway rests on a Cashflow entry (which records no source,
 * as-of date or reliability), without ever changing the confidence it reports.
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-first-run/first-read-cashflow-provenance.db.test.ts
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { amendCashflowSnapshot, createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { createFirstBusiness, getFirstMoneyRead } from "@/services/owner-first-run/first-run.service";

const MARK = "comes from a Cashflow entry";

const period = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

async function readFor(opts: { quality?: "ACTUAL" | "GOOD_ESTIMATE"; cashflow?: { bankBalance?: number; periodOffsetDays?: number } }) {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@prov.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Prov Co", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
  const p = period();
  const snap: any = await createFinancialSnapshot(
    business.id,
    { ...p, currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, ...(opts.quality ? { evidenceQuality: opts.quality } : {}) } as any,
    userId, workspaceId,
  );
  let cash: any = null;
  if (opts.cashflow) {
    cash = await createCashflowSnapshot(business.id, { ...p, currency: "GBP", cashInHand: 1500, bankBalance: opts.cashflow.bankBalance } as any, userId, workspaceId);
  }
  await runFinanceDiagnosis(business.id, snap.id, userId, workspaceId);
  return { workspaceId, userId, businessId: business.id, cash, p };
}

describe("[db] first read: Cashflow bank balance provenance", () => {
  it("[db] a usable Cashflow bank balance adds the caution (as-of date = the entry's period end), whatever the evidence label, and leaves confidence alone", async () => {
    const without = await readFor({ quality: "ACTUAL" });
    const withBank = await readFor({ quality: "ACTUAL", cashflow: { bankBalance: 90000 } });
    const a: any = await getFirstMoneyRead(without.workspaceId, without.businessId);
    const b: any = await getFirstMoneyRead(withBank.workspaceId, withBank.businessId);
    expect(a.read.cautions.join(" ")).not.toContain(MARK);
    const asOf = new Date(withBank.p.periodEnd + "T00:00:00Z");
    const expected = `${asOf.getUTCDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][asOf.getUTCMonth()]} ${asOf.getUTCFullYear()}`;
    expect(b.read.cautions).toContain(`Your bank balance (as of ${expected}) comes from a Cashflow entry. OpsIQ doesn't grade how reliable it is, so the cash runway rests partly on your own figure.`);
    // Evidence-quality label is Finance's and unchanged ("From my records").
    expect(b.read.evidenceQuality).toBe("ACTUAL");
  });
  it("[db] legacy NULL evidence quality gets the same caution next to its own 'not stated' wording", async () => {
    const r = await readFor({ cashflow: { bankBalance: 4000 } });
    const v: any = await getFirstMoneyRead(r.workspaceId, r.businessId);
    expect(v.read.evidenceQuality).toBeNull();
    expect(v.read.cautions.join(" ")).toContain(MARK);
    expect(v.read.cautions.join(" ")).toMatch(/doesn't know how reliable these numbers are/);
  });
  it("[db] an entry with no bank balance (cash in hand only) adds no caution", async () => {
    const r = await readFor({ quality: "ACTUAL", cashflow: {} });
    const v: any = await getFirstMoneyRead(r.workspaceId, r.businessId);
    expect(v.read.cautions.join(" ")).not.toContain(MARK);
  });
  it("[db] a stale read (balance edited after it was made) is withdrawn and describes no balance it did not use", async () => {
    const r = await readFor({ quality: "ACTUAL", cashflow: { bankBalance: 90000 } });
    const before: any = await getFirstMoneyRead(r.workspaceId, r.businessId);
    expect(before.read.cautions.join(" ")).toContain(MARK);
    await amendCashflowSnapshot(r.cash.id, { expectedUpdatedAt: r.cash.updatedAt.toISOString(), bankBalance: 120000, confirmReplace: true } as any, r.userId, r.workspaceId);
    const stale: any = await getFirstMoneyRead(r.workspaceId, r.businessId);
    expect(stale.staleReason).toBe("CASH_POSITION_CHANGED");
    expect(stale.read.cautions.join(" ")).not.toContain(MARK);
    await runFinanceDiagnosis(r.businessId, (await db.ownerFinanceCycle.findFirst({ where: { businessId: r.businessId }, orderBy: { sequenceNumber: "desc" } }) as any).snapshotId, r.userId, r.workspaceId);
    const fresh: any = await getFirstMoneyRead(r.workspaceId, r.businessId);
    expect(fresh.staleReason ?? null).toBeNull();
    expect(fresh.read.cautions.join(" ")).toContain(MARK);
  });
});
